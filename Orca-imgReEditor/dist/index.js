// ===================== 虎鲸笔记图片编辑插件 (本地整合版) =====================
// 版本：1.2.0 (按照最终版修正了编辑按钮逻辑)
// 描述：一个完全离线、功能完整的图片标注与涂鸦编辑插件
// 依赖：需提前下载 fabric.min.js 并放置在插件同目录
// ===================================================================

(function() {
    'use strict';

    // ---------- 全局变量 ----------
    let fabricCanvas = null;
    let editModal = null;
    let currentBlockId = '';
    let originalImageBase64 = '';
    let isEditorOpen = false;

    // ---------- 配置 ----------
    const CONFIG = {
        fabricPath: 'file:///C:/Users/ASUS/Documents/orca/plugins/fabric.min.js', // 本地 fabric 文件路径
        brushColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF'],
        defaultBrushSize: 3
    };

    // ---------- 核心：加载本地 Fabric.js ----------
    function loadFabricJS() {
        return new Promise((resolve, reject) => {
            if (window.fabric) {
                console.log('✅ Fabric.js 已加载');
                return resolve();
            }

            console.log('🔄 正在从本地加载 Fabric.js...');
            const script = document.createElement('script');
            script.src = CONFIG.fabricPath;
            script.async = true;

            script.onload = () => {
                console.log('✅ Fabric.js 加载成功，版本:', fabric.version);
                resolve();
            };

            script.onerror = (err) => {
                console.error('❌ Fabric.js 加载失败:', err);
                reject(new Error(`无法加载本地 Fabric.js 文件。请确保 ${CONFIG.fabricPath} 文件存在。`));
            };

            document.head.appendChild(script);
        });
    }

    // ---------- 工具函数：获取图片数据 ----------
    async function getImageData(blockId) {
        try {
            // 方法1: 从虎鲸API获取
            if (window.orca?.api?.block?.getBlock) {
                const block = await window.orca.api.block.getBlock(blockId);
                const imgUrl = block?.attrs?.imageUrl || block?.attrs?.url;
                if (imgUrl) return await urlToBase64(imgUrl);
            }

            // 方法2: 从DOM元素获取
            const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
            const imgEl = blockEl?.querySelector('img');
            if (imgEl?.src) {
                return await urlToBase64(imgEl.src);
            }

            throw new Error('未找到图片数据');
        } catch (error) {
            console.error('获取图片数据失败:', error);
            throw new Error(`无法获取图片: ${error.message}`);
        }
    }

    // ---------- 工具函数：URL转Base64 ----------
    function urlToBase64(url) {
        return new Promise((resolve, reject) => {
            if (url.startsWith('data:')) {
                resolve(url);
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    reject(new Error('Canvas转换失败'));
                }
            };

            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
    }

    // ---------- 向图片块添加编辑按钮 (已按照您的要求修改) ----------
    function addEditButtons() {
        const toolbars = document.querySelectorAll('.orca-image-toolbar');
        toolbars.forEach(toolbar => {
            // 检查是否已添加过按钮
            if (toolbar.querySelector('.orca-edit-btn')) return;

            const editBtn = document.createElement('button');
            editBtn.className = 'orca-edit-btn';
            editBtn.innerText = '编辑';
            editBtn.style.cssText = `
                margin-left: 8px; padding: 4px 8px; border: none;
                border-radius: 4px; background: #f5f7fa; cursor: pointer;
                font-size: 12px; height: 28px; line-height: 1;
                display: inline-block;
            `;
            editBtn.onmouseover = () => editBtn.style.background = '#e8f4ff';
            editBtn.onmouseout = () => editBtn.style.background = '#f5f7fa';

            editBtn.addEventListener('click', async () => {
                const blockEl = toolbar.closest('[data-block-id]');
                currentBlockId = blockEl.getAttribute('data-block-id');
                
                try {
                    // 先加载fabric.js
                    await loadFabricJS();
                    
                    // 获取图片URL（转Base64）
                    const currentImageUrl = await getImageData(currentBlockId);
                    console.log('🔍 图片数据已获取');
                    
                    // 打开编辑窗口
                    openEditWindow(currentImageUrl);
                } catch (err) {
                    alert(`❌ 初始化失败：${err.message}`);
                    console.error(err);
                }
            });

            toolbar.appendChild(editBtn);
        });
        console.log('✅ 编辑按钮已添加（最终版逻辑）');
    }

    // ---------- 主函数：创建编辑器界面 ----------
    function openEditWindow(imageBase64) {
        if (editModal) document.body.removeChild(editModal);
        if (isEditorOpen) return;
        
        isEditorOpen = true;
        originalImageBase64 = imageBase64;

        // 遮罩层
        const mask = document.createElement('div');
        mask.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.85);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // 编辑窗口
        const modal = document.createElement('div');
        modal.className = 'orca-image-editor-modal';
        modal.innerHTML = `
            <div class="editor-container">
                <!-- 标题栏 -->
                <div class="editor-header">
                    <h3>🎨 图片编辑器</h3>
                    <button class="btn-close">×</button>
                </div>

                <!-- 工具栏 -->
                <div class="editor-toolbar">
                    <div class="tool-group">
                        <button class="tool-btn active" data-tool="select" title="选择工具">
                            <span>🖱️</span> 选择
                        </button>
                        <button class="tool-btn" data-tool="pen" title="画笔">
                            <span>✏️</span> 画笔
                        </button>
                        <button class="tool-btn" data-tool="rect" title="矩形">
                            <span>⬜</span> 矩形
                        </button>
                        <button class="tool-btn" data-tool="text" title="文字">
                            <span>🔤</span> 文字
                        </button>
                        <button class="tool-btn" data-tool="eraser" title="橡皮擦">
                            <span>🧽</span> 橡皮
                        </button>
                    </div>

                    <div class="tool-group">
                        <div class="color-picker">
                            ${CONFIG.brushColors.map(color => `
                                <button class="color-option ${color === '#FF0000' ? 'active' : ''}" 
                                        style="background-color: ${color}" 
                                        data-color="${color}" 
                                        title="${color}"></button>
                            `).join('')}
                        </div>
                        <div class="brush-control">
                            <span>大小:</span>
                            <input type="range" class="brush-slider" min="1" max="50" value="${CONFIG.defaultBrushSize}">
                            <span class="brush-size">${CONFIG.defaultBrushSize}px</span>
                        </div>
                        <button class="btn-clear">清空标注</button>
                    </div>
                </div>

                <!-- 画布区域 -->
                <div class="editor-canvas-container">
                    <div class="canvas-wrapper">
                        <canvas id="fabric-canvas"></canvas>
                    </div>
                    <div class="canvas-hint">提示：右键可以删除选中的对象</div>
                </div>

                <!-- 操作栏 -->
                <div class="editor-actions">
                    <button class="btn-cancel">取消</button>
                    <button class="btn-save">💾 保存修改</button>
                </div>
            </div>
        `;

        mask.appendChild(modal);
        document.body.appendChild(mask);
        editModal = mask;

        // 应用样式
        applyStyles();
        // 初始化画布
        initCanvas(imageBase64);
        // 绑定事件
        bindEditorEvents();
    }

    // ---------- 应用CSS样式 ----------
    function applyStyles() {
        const styleId = 'orca-image-editor-styles';
        if (document.getElementById(styleId)) return;

        const styles = `
            .orca-image-editor-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.85);
                z-index: 99999;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .editor-container {
                width: 95%;
                max-width: 1200px;
                max-height: 90vh;
                background: #ffffff;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }

            .editor-header {
                padding: 16px 24px;
                background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .editor-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }

            .btn-close {
                background: none;
                border: none;
                color: white;
                font-size: 28px;
                cursor: pointer;
                line-height: 1;
                padding: 0;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .btn-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .editor-toolbar {
                padding: 12px 24px;
                border-bottom: 1px solid #eee;
                display: flex;
                flex-wrap: wrap;
                gap: 16px;
                align-items: center;
                background: #f8f9fa;
            }

            .tool-group {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: wrap;
            }

            .tool-btn {
                padding: 8px 16px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: white;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .tool-btn:hover {
                border-color: #1677ff;
                background: #f0f7ff;
            }

            .tool-btn.active {
                background: #e6f4ff;
                border-color: #1677ff;
                color: #1677ff;
            }

            .color-picker {
                display: flex;
                gap: 6px;
            }

            .color-option {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 2px solid transparent;
                cursor: pointer;
            }

            .color-option:hover {
                transform: scale(1.1);
            }

            .color-option.active {
                border-color: #333;
                box-shadow: 0 0 0 2px white, 0 0 0 4px #333;
            }

            .brush-control {
                display: flex;
                align-items: center;
                gap: 8px;
                background: white;
                padding: 6px 12px;
                border-radius: 8px;
                border: 1px solid #ddd;
            }

            .brush-slider {
                width: 100px;
            }

            .brush-size {
                min-width: 40px;
                font-size: 14px;
                color: #666;
            }

            .btn-clear {
                padding: 8px 16px;
                background: #fff2f0;
                border: 1px solid #ffccc7;
                color: #d4380d;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
            }

            .btn-clear:hover {
                background: #ffccc7;
            }

            .editor-canvas-container {
                flex: 1;
                padding: 20px;
                overflow: auto;
                background: #f5f5f5;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 400px;
            }

            .canvas-wrapper {
                background: white;
                border-radius: 8px;
                padding: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                max-width: 100%;
                overflow: auto;
            }

            #fabric-canvas {
                display: block;
                border-radius: 4px;
            }

            .canvas-hint {
                margin-top: 12px;
                font-size: 13px;
                color: #888;
                text-align: center;
            }

            .editor-actions {
                padding: 20px 24px;
                border-top: 1px solid #eee;
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }

            .btn-cancel, .btn-save {
                padding: 10px 24px;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
            }

            .btn-cancel {
                background: white;
                border: 1px solid #ddd;
                color: #666;
            }

            .btn-cancel:hover {
                background: #f5f5f5;
                border-color: #ccc;
            }

            .btn-save {
                background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
                border: none;
                color: white;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .btn-save:hover {
                opacity: 0.9;
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // ---------- 初始化画布 ----------
    async function initCanvas(imageBase64) {
        const container = editModal.querySelector('.canvas-wrapper');
        container.innerHTML = '<div style="padding: 40px; color: #666; text-align: center;">正在加载图片...</div>';

        try {
            await new Promise(resolve => setTimeout(resolve, 50));

            const canvasEl = document.createElement('canvas');
            canvasEl.id = 'fabric-canvas';
            container.innerHTML = '';
            container.appendChild(canvasEl);

            // 销毁旧画布
            if (fabricCanvas) {
                fabricCanvas.dispose();
            }

            // 创建新画布
            fabricCanvas = new fabric.Canvas('fabric-canvas', {
                backgroundColor: '#ffffff',
                preserveObjectStacking: true
            });

            // 加载图片
            await new Promise((resolve, reject) => {
                fabric.Image.fromURL(imageBase64, (img) => {
                    if (!img) {
                        reject(new Error('图片加载失败'));
                        return;
                    }

                    // 计算画布尺寸
                    const containerWidth = container.clientWidth - 40;
                    const containerHeight = 500;

                    const scale = Math.min(
                        containerWidth / img.width,
                        containerHeight / img.height,
                        1
                    );

                    img.scale(scale);
                    fabricCanvas.setWidth(img.width * scale);
                    fabricCanvas.setHeight(img.height * scale);

                    fabricCanvas.add(img);
                    img.selectable = false;
                    img.evented = false;

                    fabricCanvas.renderAll();
                    resolve();
                }, { crossOrigin: 'anonymous' });
            });

            // 绑定右键删除事件
            fabricCanvas.on('mouse:down', (options) => {
                if (options.e.button === 2 && options.target) {
                    fabricCanvas.remove(options.target);
                    fabricCanvas.renderAll();
                    options.e.preventDefault();
                }
            });

            // 默认工具：选择
            setActiveTool('select');

            console.log('✅ 画布初始化完成');

        } catch (error) {
            container.innerHTML = `<div style="color: #ff4d4f; padding: 40px; text-align: center;">
                <p>❌ 画布初始化失败</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>`;
            throw error;
        }
    }

    // ---------- 设置活动工具 ----------
    function setActiveTool(tool) {
        if (!fabricCanvas) return;

        // 重置画布状态
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = true;
        fabricCanvas.defaultCursor = 'default';
        fabricCanvas.off('mouse:down');
        fabricCanvas.off('mouse:move');
        fabricCanvas.off('mouse:up');

        const color = editModal.querySelector('.color-option.active')?.dataset.color || '#FF0000';
        const brushSize = parseInt(editModal.querySelector('.brush-slider').value);

        switch (tool) {
            case 'select':
                fabricCanvas.selection = true;
                break;

            case 'pen':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = brushSize;
                fabricCanvas.freeDrawingBrush.color = color;
                break;

            case 'rect':
                let rect, isDrawing = false;
                fabricCanvas.on('mouse:down', (options) => {
                    if (options.target) return;
                    isDrawing = true;
                    const pointer = fabricCanvas.getPointer(options.e);
                    rect = new fabric.Rect({
                        left: pointer.x,
                        top: pointer.y,
                        width: 0,
                        height: 0,
                        fill: 'transparent',
                        stroke: color,
                        strokeWidth: brushSize / 2
                    });
                    fabricCanvas.add(rect);
                });

                fabricCanvas.on('mouse:move', (options) => {
                    if (!isDrawing) return;
                    const pointer = fabricCanvas.getPointer(options.e);
                    rect.set({
                        width: Math.abs(pointer.x - rect.left),
                        height: Math.abs(pointer.y - rect.top)
                    });
                    fabricCanvas.renderAll();
                });

                fabricCanvas.on('mouse:up', () => {
                    isDrawing = false;
                });
                break;

            case 'text':
                fabricCanvas.on('mouse:down', (options) => {
                    if (options.target) return;
                    const pointer = fabricCanvas.getPointer(options.e);
                    const text = new fabric.Textbox('双击编辑文字', {
                        left: pointer.x,
                        top: pointer.y,
                        fontSize: 20,
                        fill: color,
                        editable: true,
                        hasControls: true
                    });
                    fabricCanvas.add(text);
                    fabricCanvas.setActiveObject(text);
                    fabricCanvas.off('mouse:down');
                });
                break;

            case 'eraser':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.EraserBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = brushSize * 3;
                break;
        }
    }

    // ---------- 绑定编辑器事件 ----------
    function bindEditorEvents() {
        if (!editModal) return;

        // 关闭按钮
        editModal.querySelector('.btn-close').onclick = closeEditor;
        editModal.querySelector('.btn-cancel').onclick = closeEditor;

        // 工具按钮
        editModal.querySelectorAll('.tool-btn').forEach(btn => {
            btn.onclick = function() {
                editModal.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                setActiveTool(this.dataset.tool);
            };
        });

        // 颜色选择
        editModal.querySelectorAll('.color-option').forEach(btn => {
            btn.onclick = function() {
                editModal.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                if (fabricCanvas?.isDrawingMode && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.color = this.dataset.color;
                }
            };
        });

        // 画笔大小滑块
        const slider = editModal.querySelector('.brush-slider');
        const sizeDisplay = editModal.querySelector('.brush-size');
        slider.oninput = function() {
            sizeDisplay.textContent = `${this.value}px`;
            if (fabricCanvas?.isDrawingMode && fabricCanvas.freeDrawingBrush) {
                const tool = editModal.querySelector('.tool-btn.active')?.dataset.tool;
                if (tool === 'eraser') {
                    fabricCanvas.freeDrawingBrush.width = this.value * 3;
                } else {
                    fabricCanvas.freeDrawingBrush.width = parseInt(this.value);
                }
            }
        };

        // 清空按钮
        editModal.querySelector('.btn-clear').onclick = () => {
            if (!fabricCanvas) return;
            if (confirm('确定要清空所有标注和涂鸦吗？此操作不可撤销。')) {
                const objects = fabricCanvas.getObjects();
                objects.forEach(obj => {
                    if (obj.type !== 'image') {
                        fabricCanvas.remove(obj);
                    }
                });
                fabricCanvas.renderAll();
            }
        };

        // 保存按钮
        editModal.querySelector('.btn-save').onclick = async function() {
            if (!fabricCanvas || !currentBlockId) return;

            const saveBtn = this;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '⏳ 保存中...';

            try {
                // 生成新图片
                const editedBase64 = fabricCanvas.toDataURL({
                    format: 'png',
                    quality: 0.95
                });

                // 使用虎鲸API保存
                if (window.orca?.api?.block?.updateBlock) {
                    await window.orca.api.block.updateBlock(currentBlockId, {
                        attrs: {
                            imageUrl: editedBase64,
                            url: editedBase64
                        }
                    });

                    // 显示成功提示
                    if (window.orca?.api?.ui?.showToast) {
                        window.orca.api.ui.showToast('✅ 图片保存成功', 'success');
                    } else {
                        alert('✅ 图片保存成功');
                    }

                    closeEditor();
                    
                    // 刷新块显示
                    setTimeout(() => {
                        const blockEl = document.querySelector(`[data-block-id="${currentBlockId}"]`);
                        if (blockEl) {
                            const imgEl = blockEl.querySelector('img');
                            if (imgEl) imgEl.src = editedBase64;
                        }
                    }, 300);

                } else {
                    // API不存在时，提供手动保存选项
                    const shouldCopy = confirm('图片处理完成！是否复制Base64数据到剪贴板？');
                    if (shouldCopy) {
                        navigator.clipboard.writeText(editedBase64).then(() => {
                            alert('✅ Base64数据已复制到剪贴板，请手动更新图片块。');
                        }).catch(() => {
                            prompt('请复制以下Base64数据：', editedBase64);
                        });
                    }
                    closeEditor();
                }

            } catch (error) {
                console.error('保存失败:', error);
                alert(`❌ 保存失败: ${error.message}`);
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 保存修改';
            }
        };

        // 点击遮罩层关闭
        editModal.onclick = (e) => {
            if (e.target === editModal) {
                if (confirm('编辑尚未保存，确定要离开吗？')) {
                    closeEditor();
                }
            }
        };
    }

    // ---------- 关闭编辑器 ----------
    function closeEditor() {
        if (editModal && document.body.contains(editModal)) {
            document.body.removeChild(editModal);
        }
        if (fabricCanvas) {
            fabricCanvas.dispose();
            fabricCanvas = null;
        }
        editModal = null;
        isEditorOpen = false;
        currentBlockId = '';
        originalImageBase64 = '';
    }

    // ---------- 初始化插件 ----------
    function initializePlugin() {
        console.log('🚀 虎鲸图片编辑器插件启动...');

        // 初始添加按钮
        addEditButtons();

        // 监听DOM变化，动态添加按钮
        const observer = new MutationObserver(() => {
            addEditButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 页面加载后再次检查
        window.addEventListener('load', () => {
            setTimeout(addEditButtons, 1000);
        });

        // 每5秒检查一次新图片
        setInterval(addEditButtons, 5000);
    }

    // ---------- 启动插件 ----------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePlugin);
    } else {
        initializePlugin();
    }

})();