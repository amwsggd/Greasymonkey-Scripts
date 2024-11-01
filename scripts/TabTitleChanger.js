// ==UserScript==
// @name         Minimal Tab Title Changer
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  更隐蔽的标签页标题修改器
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function createTitleChanger(initialX, initialY) {
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: ${initialY}px;
            left: ${initialX}px;
            z-index: 999999;
            display: flex;
            gap: 1px;
            background: transparent;
            padding: 1px;
            border-radius: 2px;
            font-family: Arial, sans-serif;
            user-select: none;
            transition: all 0.3s;
            font-size: 11px;
            opacity: 0.01;
        `;

        // 创建按钮的函数
        function createButton(symbol, title, className = '') {
            const btn = document.createElement('button');
            btn.innerHTML = symbol;
            btn.title = title;
            btn.className = className;
            btn.style.cssText = `
                background: #333;
                color: #999;
                border: none;
                padding: 1px 3px;
                border-radius: 2px;
                cursor: pointer;
                min-width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s;
                font-size: 16px;
            `;
            return btn;
        }

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = `
            display: flex;
            gap: 1px;
            transition: all 0.3s;
        `;

        const editBtn = createButton('✎', '修改标题 (Ctrl+Shift+T)');
        const resetBtn = createButton('✕', '取消修改');
        const setDefaultBtn = createButton('⚑', '设为默认位置');
        const dragHandle = createButton('⋮', '拖动');

        const originalTitle = document.title;

        // 编辑按钮
        editBtn.onclick = () => {
            let newTitle = prompt('输入新标题:', document.title);
            if (newTitle !== null && newTitle.trim() !== '') {
                document.title = newTitle;
                GM_setValue('customTitle_' + window.location.href, newTitle);
            }
        };

        // 重置按钮
        resetBtn.onclick = () => {
            document.title = originalTitle;
            GM_setValue('customTitle_' + window.location.href, '');
            observer.disconnect();
        };

        // 设置默认位置按钮
        setDefaultBtn.onclick = () => {
            if (confirm('将当前位置设为所有网站的默认位置？')) {
                GM_setValue('defaultPosX', container.offsetLeft);
                GM_setValue('defaultPosY', container.offsetTop);
                setDefaultBtn.style.color = '#4CAF50';
                setTimeout(() => {
                    setDefaultBtn.style.color = '#999';
                }, 1000);
            }
        };

        // 鼠标悬停效果
        container.addEventListener('mouseover', () => {
            container.style.opacity = '1';
            container.style.background = 'rgba(0, 0, 0, 0.1)';
            btnGroup.querySelectorAll('button').forEach(btn => {
                btn.style.color = '#fff';
            });
        });

        container.addEventListener('mouseout', () => {
            container.style.opacity = '0.01';
            container.style.background = 'transparent';
            btnGroup.querySelectorAll('button').forEach(btn => {
                btn.style.color = '#999';
            });
        });

        // 拖拽功能
        let isDragging = false;
        let startX, startY;

        dragHandle.onmousedown = startDragging;
        document.onmousemove = drag;
        document.onmouseup = stopDragging;

        function startDragging(e) {
            isDragging = true;
            startX = e.clientX - container.offsetLeft;
            startY = e.clientY - container.offsetTop;
            container.style.opacity = '1';
        }

        function drag(e) {
            if (!isDragging) return;

            let newX = e.clientX - startX;
            let newY = e.clientY - startY;

            newX = Math.min(Math.max(0, newX), window.innerWidth - container.offsetWidth);
            newY = Math.min(Math.max(0, newY), window.innerHeight - container.offsetHeight);

            container.style.left = newX + 'px';
            container.style.top = newY + 'px';

            // 保存当前网站的位置
            GM_setValue('sitePosX_' + window.location.hostname, newX);
            GM_setValue('sitePosY_' + window.location.hostname, newY);
        }

        function stopDragging() {
            if (!isDragging) return;
            isDragging = false;
        }

        // 标题观察器
        const observer = new MutationObserver(() => {
            let savedTitle = GM_getValue('customTitle_' + window.location.href);
            if (savedTitle && document.title !== savedTitle) {
                document.title = savedTitle;
            }
        });

        observer.observe(document.querySelector('head > title'), {
            subtree: true,
            characterData: true,
            childList: true
        });

        // 快捷键
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                editBtn.click();
            }
        });

        // 组装界面
        btnGroup.appendChild(dragHandle);
        btnGroup.appendChild(editBtn);
        btnGroup.appendChild(resetBtn);
        btnGroup.appendChild(setDefaultBtn);
        container.appendChild(btnGroup);
        document.body.appendChild(container);

        // 应用保存的标题
        let savedTitle = GM_getValue('customTitle_' + window.location.href);
        if (savedTitle) {
            document.title = savedTitle;
        }

        return container;
    }

    // 初始化
    function initScript() {
        // 优先使用当前网站保存的位置，如果没有则使用默认位置
        const posX = GM_getValue('sitePosX_' + window.location.hostname,
                               GM_getValue('defaultPosX', window.innerWidth - 100));
        const posY = GM_getValue('sitePosY_' + window.location.hostname,
                               GM_getValue('defaultPosY', 20));

        createTitleChanger(posX, posY);
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        initScript();
    }
})();