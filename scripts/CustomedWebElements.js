// ==UserScript==
// @name         网页元素自定义工具
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自定义网页元素位置、大小、显示状态的工具
// @author       Claude
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // 状态管理
    const state = {
        isEditing: false,           // 是否处于编辑模式
        currentMode: null,          // 当前操作模式
        previewElement: null,       // 预览高亮的元素
        operatingElement: null,     // 正在操作的元素
        isOperating: false,         // 是否正在进行具体操作
        originalStyles: new Map(),
        mouseOffset: { x: 0, y: 0 },
        toolbarPosition: null       // 保存工具栏位置
    };

    // 创建工具栏
    function createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = 'element-customizer-toolbar';
        toolbar.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 5px;
            padding: 5px;
            display: flex;
            gap: 5px;
            z-index: 999999;
            transition: all 0.3s;
            white-space: nowrap;
            max-width: 100vw;
            box-sizing: border-box;
            opacity: 0.03;
        `;

        // 创建拖动手柄
        const dragHandle = document.createElement('div');
        dragHandle.innerHTML = '⋮';
        dragHandle.title = '拖动工具栏';
        dragHandle.style.cssText = `
            color: white;
            cursor: move;
            padding: 5px;
            font-size: 16px;
            display: flex;
            align-items: center;
            opacity: 0.7;
            transition: opacity 0.3s;
        `;

        const buttons = [
            { icon: '🎯', title: '开始/完成', action: toggleEditMode },
            { icon: '✋', title: '移动元素', action: () => setMode('move') },
            { icon: '↔️', title: '调整大小', action: () => setMode('resize') },
            { icon: '👻', title: '隐藏元素', action: () => setMode('hide') },
            { icon: '↺', title: '撤销更改', action: resetPage },
            { icon: '📍', title: '设置工具栏初始位置', action: setInitialToolbarPosition }
        ];

        // 添加拖动手柄
        toolbar.appendChild(dragHandle);

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.innerHTML = btn.icon;
            button.title = btn.title;
            button.style.cssText = `
                background: none;
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                padding: 5px;
                opacity: 0.7;
                transition: opacity 0.3s;
                min-width: 24px;
                text-align: center;
            `;
            button.addEventListener('mouseover', () => button.style.opacity = '1');
            button.addEventListener('mouseout', () => button.style.opacity = '0.7');
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.action();
            });
            toolbar.appendChild(button);
        });

        // 工具栏透明度控制
        toolbar.addEventListener('mouseenter', () => {
            toolbar.style.opacity = '1';
        });
        toolbar.addEventListener('mouseleave', () => {
            toolbar.style.opacity = '0.03';
        });

        // 工具栏拖动功能
        let isDraggingToolbar = false;
        let toolbarOffset = { x: 0, y: 0 };

        dragHandle.addEventListener('mousedown', (e) => {
            isDraggingToolbar = true;
            toolbarOffset = {
                x: e.clientX - toolbar.offsetLeft,
                y: e.clientY - toolbar.offsetTop
            };
            e.preventDefault(); // 防止文本选择
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingToolbar) {
                const newLeft = e.clientX - toolbarOffset.x;
                const newTop = e.clientY - toolbarOffset.y;

                // 确保工具栏不会超出视窗边界
                const maxX = window.innerWidth - toolbar.offsetWidth;
                const maxY = window.innerHeight - toolbar.offsetHeight;

                toolbar.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
                toolbar.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
                toolbar.style.right = 'auto';

                // 更新工具栏位置状态
                state.toolbarPosition = {
                    left: toolbar.style.left,
                    top: toolbar.style.top
                };
            }
        });

        document.addEventListener('mouseup', () => {
            isDraggingToolbar = false;
        });

        // 如果有保存的位置，应用它
        if (state.toolbarPosition) {
            toolbar.style.left = state.toolbarPosition.left;
            toolbar.style.top = state.toolbarPosition.top;
            toolbar.style.right = 'auto';
        }

        document.body.appendChild(toolbar);
        return toolbar;
    }

    // 设置工具栏初始位置
    function setInitialToolbarPosition() {
        const toolbar = document.getElementById('element-customizer-toolbar');
        if (toolbar) {
            state.toolbarPosition = {
                left: toolbar.style.left,
                top: toolbar.style.top
            };
            GM_setValue('toolbar-position', state.toolbarPosition);
        }
    }

    // 获取元素的唯一标识符
    function getElementPath(element) {
        const path = [];
        while (element && element.tagName) {
            let selector = element.tagName.toLowerCase();
            if (element.id) {
                selector += '#' + element.id;
            } else if (element.className) {
                selector += '.' + Array.from(element.classList).join('.');
            }
            const siblings = element.parentNode ? Array.from(element.parentNode.children) : [];
            const index = siblings.indexOf(element);
            if (index > -1) {
                selector += `:nth-child(${index + 1})`;
            }
            path.unshift(selector);
            element = element.parentNode;
        }
        return path.join(' > ');
    }

    // 保存元素样式
    function saveElementStyle(element, styles) {
        const storage = GM_getValue(getStorageKey(), {});
        const elementPath = getElementPath(element);
        storage[elementPath] = styles;
        GM_setValue(getStorageKey(), storage);
    }

    // 高亮预览元素
    function highlightElement(element) {
        if (state.previewElement) {
            state.previewElement.style.outline = '';
        }
        if (element && element !== state.operatingElement) {
            element.style.outline = '2px dashed blue';
            state.previewElement = element;
        }
    }

    // 切换编辑模式
    function toggleEditMode() {
        state.isEditing = !state.isEditing;
        document.body.style.cursor = state.isEditing ? 'crosshair' : '';

        if (state.isEditing) {
            // 进入编辑模式
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('click', handleClick, true);
        } else {
            // 退出编辑模式
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('click', handleClick, true);
            if (state.previewElement) {
                state.previewElement.style.outline = '';
                state.previewElement = null;
            }
            if (state.operatingElement) {
                state.operatingElement.style.outline = '';
                state.operatingElement = null;
            }
            state.isOperating = false;
            stopAllOperations();
        }
    }

    // 处理鼠标移动
    function handleMouseMove(e) {
        // 忽略工具栏上的移动
        if (e.target.closest('#element-customizer-toolbar')) {
            highlightElement(null);
            return;
        }

        if (!state.isEditing) return;

        if (state.isOperating && state.operatingElement) {
            // 正在操作元素时，执行相应的操作
            switch (state.currentMode) {
                case 'move':
                    handleDrag(e);
                    break;
                case 'resize':
                    handleResize(e);
                    break;
            }
        } else {
            // 未操作时，显示预览高亮
            highlightElement(e.target);
        }
    }

    // 处理点击
    function handleClick(e) {
        if (!state.isEditing || e.target.closest('#element-customizer-toolbar')) return;

        e.preventDefault();
        e.stopPropagation();

        if (!state.isOperating) {
            // 开始操作
            startOperation(e.target);
        } else {
            // 结束操作
            finishOperation();
        }
    }

    // 开始操作
    function startOperation(element) {
        state.operatingElement = element;
        state.isOperating = true;
        element.style.outline = '2px solid red';

        // 保存原始样式
        if (!state.originalStyles.has(element)) {
            state.originalStyles.set(element, {
                position: element.style.position,
                left: element.style.left,
                top: element.style.top,
                width: element.style.width,
                height: element.style.height,
                visibility: element.style.visibility
            });
        }

        switch (state.currentMode) {
            case 'move':
                startDragging(element);
                break;
            case 'resize':
                startResizing(element);
                break;
            case 'hide':
                element.style.visibility = 'hidden';
                saveElementStyle(element, { visibility: 'hidden' });
                finishOperation();
                break;
        }
    }

    // 开始拖动
    function startDragging(element) {
        const computedStyle = window.getComputedStyle(element);
        // 保存初始位置
        const rect = element.getBoundingClientRect();

        if (computedStyle.position === 'static') {
            element.style.position = 'relative';
            element.style.left = '0px';
            element.style.top = '0px';
        } else if (!element.style.left || !element.style.top) {
            // 如果元素已经是相对定位但没有设置位置
            element.style.left = (rect.left - element.offsetParent.getBoundingClientRect().left) + 'px';
            element.style.top = (rect.top - element.offsetParent.getBoundingClientRect().top) + 'px';
        }

        // 更新鼠标偏移量
        state.mouseOffset = {
            x: event.clientX - parseFloat(element.style.left),
            y: event.clientY - parseFloat(element.style.top)
        };
    }

    // 处理拖动
    function handleDrag(e) {
        if (!state.operatingElement || !state.isOperating) return;

        const element = state.operatingElement;
        const newLeft = e.clientX - state.mouseOffset.x;
        const newTop = e.clientY - state.mouseOffset.y;

        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
    }

    // 开始调整大小
    function startResizing(element) {
        const computedStyle = window.getComputedStyle(element);

        // 设置初始大小
        element.style.width = computedStyle.width;
        element.style.height = computedStyle.height;

        state.initialSize = {
            width: parseFloat(computedStyle.width),
            height: parseFloat(computedStyle.height)
        };

        state.initialMouse = {
            x: event.clientX,
            y: event.clientY
        };
    }

    // 处理调整大小
    function handleResize(e) {
        if (!state.operatingElement || !state.isOperating) return;

        const element = state.operatingElement;
        const deltaX = e.clientX - state.initialMouse.x;
        const deltaY = e.clientY - state.initialMouse.y;

        // 确保不会调整到小于最小尺寸
        const newWidth = Math.max(20, state.initialSize.width + deltaX);
        const newHeight = Math.max(20, state.initialSize.height + deltaY);

        element.style.width = newWidth + 'px';
        element.style.height = newHeight + 'px';
    }

    // 停止所有操作
    function stopAllOperations() {
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mousemove', handleResize);
    }

    // 完成操作
    function finishOperation() {
        if (state.operatingElement) {
            const element = state.operatingElement;

            // 保存当前样式
            const currentStyles = {
                position: element.style.position,
                left: element.style.left,
                top: element.style.top,
                width: element.style.width,
                height: element.style.height,
                visibility: element.style.visibility
            };
            saveElementStyle(element, currentStyles);

            // 清理状态
            element.style.outline = '';
            state.operatingElement = null;
            state.isOperating = false;
        }
    }

    // 根据URL前缀获取存储键
    function getStorageKey() {
        const urlPattern = window.location.origin;
        return `element-customizer-${urlPattern}`;
    }

    // 加载已保存的样式
    function loadSavedStyles() {
        const storage = GM_getValue(getStorageKey(), {});
        Object.entries(storage).forEach(([selector, styles]) => {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    Object.assign(element.style, styles);
                }
            } catch (e) {
                console.error('Failed to apply saved styles:', e);
            }
        });
    }

    // 重置页面
    function resetPage() {
        if (confirm('确定要重置所有更改吗？')) {
            GM_deleteValue(getStorageKey());
            location.reload();
        }
    }

    // 设置操作模式
    function setMode(mode) {
        state.currentMode = mode;
        if (state.previewElement) {
            state.previewElement.style.outline = '';
            state.previewElement = null;
        }
    }

    // 初始化
    function init() {
        // 加载保存的工具栏位置
        state.toolbarPosition = GM_getValue('toolbar-position', null);
        createToolbar();
        loadSavedStyles();
    }

    // 启动脚本
    init();
})();