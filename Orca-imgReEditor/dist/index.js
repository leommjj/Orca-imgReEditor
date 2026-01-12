// ===================== 虎鲸笔记图片编辑插件 (整合imgReEditor特性版) =====================
// 版本：2.0.0 (移植思源imgReEditor核心特性)
// 核心特性：二次编辑、多工具扩展、快捷键、画布模式、截图标注一体化、图片美化
// 依赖：需提前下载 fabric.min.js 并放置在插件同目录
// ===================================================================

(function() {
    'use strict';

    // ---------- 全局变量 ----------
    let fabricCanvas = null;
    let editModal = null;
    let currentBlockId = null;  // 使用null而不是空字符串，确保是数字类型
    let originalImageBase64 = '';
    let originalImageWidth = 0;  // 🆕 原始图片宽度
    let originalImageHeight = 0; // 🆕 原始图片高度
    let isEditorOpen = false;
    let editHistoryData = null; // 🆕 存储编辑历史数据（二次编辑用）
    let canvasMode = false;     // 🆕 是否为画布模式（多图编辑）
    let screenshotHistory = []; // 🆕 截图历史
    let undoStack = [];         // 🆕 撤回栈
    let redoStack = [];         // 🆕 重做栈

    // ---------- 配置 ----------
    // 获取当前插件的目录路径
    let pluginPath = '';
    
    // 获取插件基础路径（增强版错误堆栈方式）
    function getPluginBasePath() {
        console.log('🔍 开始获取插件基础路径...');
        
        // 方法1: 使用错误堆栈方式获取当前脚本路径
        try {
            const error = new Error();
            console.log('📋 错误堆栈:', error.stack);
            
            if (error.stack) {
                const stackLines = error.stack.split('\n');
                console.log('📝 堆栈行数:', stackLines.length);
                
                for (let i = 0; i < stackLines.length; i++) {
                    const line = stackLines[i];
                    console.log(`📄 第${i+1}行堆栈:`, line);
                    
                    // 更宽松的匹配条件
                    if (line.includes('index.js') || line.includes('Orca-imgReEditor')) {
                        console.log('✅ 找到匹配的堆栈行:', line);
                        
                        // 提取URL
                        const urlMatch = line.match(/(https?:\/\/[^\s\)]+|file:\/\/[^\s\)]+)/);
                        if (urlMatch && urlMatch[0]) {
                            let url = urlMatch[0];
                            console.log('🔗 提取到的URL:', url);
                            
                            // 清理URL（去掉行号和列号）
                            url = url.replace(/:\d+:\d+$/, '');
                            url = url.replace(/:\d+$/, '');
                            console.log('🧹 清理后的URL:', url);
                            
                            // 返回URL的目录部分
                            const dirPath = url.substring(0, url.lastIndexOf('/'));
                            console.log('📁 最终目录路径:', dirPath);
                            return dirPath;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('❌ 错误堆栈获取路径失败:', e);
        }
        
        // 方法2: 从脚本标签获取（备用方案）
        try {
            console.log('🔄 尝试从脚本标签获取路径...');
            const scripts = document.querySelectorAll('script');
            console.log('📊 找到脚本标签数量:', scripts.length);
            
            for (const script of scripts) {
                const src = script.src;
                console.log('🔗 脚本src:', src);
                
                if (src.includes('Orca-imgReEditor') || src.includes('orca-imgre-editor')) {
                    console.log('✅ 找到匹配的脚本标签:', src);
                    const dirPath = src.substring(0, src.lastIndexOf('/'));
                    console.log('📁 最终目录路径:', dirPath);
                    return dirPath;
                }
            }
        } catch (e) {
            console.error('❌ 脚本标签获取路径失败:', e);
        }
        return hardcodedPath;
    }
    
    pluginPath = getPluginBasePath() + '/';
    
    const CONFIG = {
        fabricPath: pluginPath + 'fabric.5.3.0.min.js', // 本地 fabric 文件路径，使用插件目录相对路径
        brushColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF'],
        defaultBrushSize: 3,
        editDataMode: 'Embed', // 🆕 编辑数据存储模式：Embed(嵌入图片) / Backup(本地备份)
        backupFolder: 'file:///C:/Users/ASUS/Documents/orca/plugins/imgReEditor_backup/', // 🆕 Backup模式存储路径
        screenshotShortcut: 'Ctrl+~', // 🆕 截图快捷键
        numberSequence: 1 // 🆕 数字序号计数器
    };

    // ---------- 核心：加载本地 Fabric.js ----------
    function loadFabricJS() {
        return new Promise((resolve, reject) => {
            if (window.fabric) {
                console.log('✅ Fabric.js 已加载');
                return resolve();
            }

            // 使用可靠的插件路径
            const finalFabricPath = CONFIG.fabricPath;
            console.log('🔍 插件基础路径:', pluginPath);
            console.log('📁 插件目录是否存在fabric.js:', new URL(finalFabricPath).href);

            console.log('🔄 正在从本地加载 Fabric.js...', finalFabricPath);
            const script = document.createElement('script');
            script.src = finalFabricPath;
            script.async = true;

            script.onload = () => {
                console.log('✅ Fabric.js 加载成功，版本:', fabric.version);
                // 🆕 扩展fabric：添加马赛克滤镜
                fabric.Image.filters.Mosaic = fabric.util.createClass(fabric.Image.filters.BaseFilter, {
                    type: 'mosaic',
                    size: 10,
                    applyTo: function(canvasEl) {
                        const ctx = canvasEl.getContext('2d');
                        const imgData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
                        const pixels = imgData.data;
                        const size = this.size;

                        for (let y = 0; y < canvasEl.height; y += size) {
                            for (let x = 0; x < canvasEl.width; x += size) {
                                const idx = (y * canvasEl.width + x) * 4;
                                const r = pixels[idx];
                                const g = pixels[idx + 1];
                                const b = pixels[idx + 2];

                                for (let dy = 0; dy < size; dy++) {
                                    for (let dx = 0; dx < size; dx++) {
                                        if (y + dy < canvasEl.height && x + dx < canvasEl.width) {
                                            const i = ((y + dy) * canvasEl.width + (x + dx)) * 4;
                                            pixels[i] = r;
                                            pixels[i + 1] = g;
                                            pixels[i + 2] = b;
                                        }
                                    }
                                }
                            }
                        }
                        ctx.putImageData(imgData, 0, 0);
                    }
                });
                resolve();
            };

            script.onerror = (err) => {
                console.error('❌ Fabric.js 加载失败:', err);
                reject(new Error(`无法加载本地 Fabric.js 文件。请确保 fabric.5.3.0.min.js 文件存在于插件目录中。`));
            };

            document.head.appendChild(script);
        });
    }

    // ---------- 常量定义 ----------
    const STORAGE_KEY = "edited-images-store";
    const IMG_SELECTORS = [
        '[data-block-id="${id}"] img.orca-image',
        '.orca-block[data-id="${id}"] img.orca-image',
        '[data-id="${id}"] img.orca-image'
    ];
    let pluginName = "Orca-imgReEditor";

    // ---------- 🆕 核心：解析/存储编辑历史数据 ----------
    function extractEditDataFromBase64(base64) {
        // Embed模式：从PNG tEXt块中提取编辑数据
        try {
            // 首先尝试从PNG tEXt块中读取编辑数据
            const keyword = 'siyuan-plugin-imgReEditor';
            const metadataStr = readPNGTextChunk(base64, keyword);
            
            if (metadataStr) {
                // 解析元数据
                const metadata = JSON.parse(metadataStr);
                if (metadata && metadata.canvasJSON) {
                    editHistoryData = metadata.canvasJSON;
                    // 保存其他元数据信息（如果需要）
                    if (metadata.isCanvasMode !== undefined) {
                        canvasMode = metadata.isCanvasMode;
                    }
                    console.log('✅ 从PNG tEXt块读取编辑数据成功');
                    return base64; // 返回完整的PNG图片base64
                }
            }
            
            // 向后兼容：尝试使用旧的分隔符方式读取编辑数据
            const splitData = base64.split('|||EDIT_DATA|||');
            if (splitData.length === 2) {
                // 使用对应的解码方式处理包含中文的字符串
                const decodedStr = decodeURIComponent(escape(atob(splitData[1])));
                editHistoryData = JSON.parse(decodedStr);
                console.log('✅ 从旧格式读取编辑数据成功');
                return splitData[0]; // 返回纯图片base64
            }
            
            // 没有找到编辑数据
            editHistoryData = null;
            return base64;
        } catch (e) {
            console.warn('解析编辑数据失败:', e);
            editHistoryData = null;
            return base64;
        }
    }

    function saveEditDataToBase64(imageBase64) {
        // Embed模式：将编辑数据嵌入到PNG tEXt块中
        if (CONFIG.editDataMode === 'Embed' && fabricCanvas) {
            try {
                // 添加path属性以保存涂鸦数据
                const canvasJson = fabricCanvas.toJSON(['left', 'top', 'scaleX', 'scaleY', 'angle', 'fill', 'stroke', 'strokeWidth', 'text', 'fontSize', 'path', 'rx', 'ry', 'x2', 'y2', 'arrowEnd']);
                
                // 创建包含编辑信息的元数据对象
                const metadata = {
                    version: '2.0.0',
                    isCanvasMode: canvasMode,
                    originalFileName: currentBlockId ? `image_${currentBlockId}` : 'untitled',
                    canvasJSON: canvasJson,
                    timestamp: Date.now(),
                    cropData: null, // 可以根据需要添加裁剪数据
                    source: 'Orca-imgReEditor'
                };
                
                // 将元数据转换为JSON字符串
                const metadataStr = JSON.stringify(metadata);
                
                // 使用insertPNGTextChunk函数将元数据插入到PNG图片的tEXt块中
                const keyword = 'siyuan-plugin-imgReEditor';
                const newImageBase64 = insertPNGTextChunk(imageBase64, keyword, metadataStr);
                
                return newImageBase64;
            } catch (e) {
                console.error('保存编辑数据到PNG tEXt块失败:', e);
                // 回退到Backup模式
                if (currentBlockId) {
                    const canvasJson = fabricCanvas.toJSON();
                    const backupData = {
                        canvasJson: canvasJson,
                        imageBase64: imageBase64,
                        timestamp: Date.now(),
                        blockId: currentBlockId
                    };
                    localStorage.setItem(`orca_image_editor_backup_${currentBlockId}`, JSON.stringify(backupData));
                    console.log('✅ 编辑数据已保存到localStorage:', currentBlockId);
                }
            }
        }
        // Backup模式：保存到localStorage（兼容旧版）
        else if (CONFIG.editDataMode === 'Backup' && currentBlockId && fabricCanvas) {
            const canvasJson = fabricCanvas.toJSON();
            const backupData = {
                canvasJson: canvasJson,
                imageBase64: imageBase64,
                timestamp: Date.now(),
                blockId: currentBlockId
            };
            localStorage.setItem(`orca_image_editor_backup_${currentBlockId}`, JSON.stringify(backupData));
            console.log('✅ 编辑数据已保存到localStorage:', currentBlockId);
        }
        return imageBase64;
    }

    // ---------- 🆕 核心：加载备份的编辑数据 ----------
    async function loadBackupEditData(blockId) {
        if (CONFIG.editDataMode !== 'Backup') return null;
        try {
            // 从localStorage加载备份数据（兼容旧版）
            const backupDataStr = localStorage.getItem(`orca_image_editor_backup_${blockId}`);
            if (backupDataStr) {
                const backupData = JSON.parse(backupDataStr);
                console.log('✅ 从localStorage加载备份数据成功:', blockId);
                return backupData.canvasJson;
            }
            return null;
        } catch (e) {
            console.warn('加载Backup编辑数据失败:', e);
            return null;
        }
    }

    // ---------- 工具函数：清除本地存储备份 ----------
    function clearBackupData(blockId) {
        try {
            localStorage.removeItem(`orca_image_editor_backup_${blockId}`);
            console.log('✅ 已清除localStorage中的备份数据:', blockId);
        } catch (e) {
            console.warn('清除备份数据失败:', e);
        }
    }

    // ---------- 存储操作（兼容imgReEditor格式） ----------
    async function loadImageStore() {
        try {
            if (window.orca?.plugins?.getData) {
                const data = await window.orca.plugins.getData(pluginName, STORAGE_KEY);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed?.images && typeof parsed.images === 'object') {
                        return parsed;
                    }
                }
            }
        } catch (e) {
            console.error('Store load failed:', e);
        }
        return { images: {} };
    }

    async function saveToStore(blockId, assetPath) {
        try {
            if (window.orca?.plugins?.setData) {
                const store = await loadImageStore();
                store.images[String(blockId)] = assetPath;
                await window.orca.plugins.setData(pluginName, STORAGE_KEY, JSON.stringify(store));
                return true;
            }
            console.warn('无法使用orca.plugins.setData，回退到localStorage');
            // 回退到localStorage
            const storeStr = localStorage.getItem(STORAGE_KEY);
            const store = storeStr ? JSON.parse(storeStr) : { images: {} };
            store.images[String(blockId)] = assetPath;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
            return true;
        } catch (e) {
            console.error('Store save failed:', e);
            return false;
        }
    }

    async function saveImageReprProperty(blockId, assetPath) {
        try {
            if (window.orca?.commands?.invokeEditorCommand) {
                const nextRepr = {
                    type: "image",
                    src: assetPath
                };
                
                await window.orca.commands.invokeEditorCommand(
                    "core.editor.setProperties",
                    null,
                    [blockId],
                    [{ name: "_repr", type: 0, value: nextRepr }]
                );
                return true;
            }
            return false;
        } catch (e) {
            console.error('Set properties failed:', e);
            return false;
        }
    }

    // ---------- 工具函数：获取资源路径 ----------
    function getAssetPath(assetPath) {
        if (window.orca?.utils?.getAssetPath) {
            return window.orca.utils.getAssetPath(assetPath);
        }
        // 回退方案：直接返回assetPath
        return assetPath;
    }

    // ---------- 工具函数：获取图片选择器 ----------
    function getImageSelectors(blockId) {
        return IMG_SELECTORS.map(s => s.replace('${id}', String(blockId)));
    }

    // ---------- 工具函数：从DOM元素获取block ID ----------
    function getBlockIdFromElement(element) {
        let current = element;
        while (current) {
            const id = current.dataset.blockId || current.dataset.id || current.getAttribute("data-block-id");
            if (id) {
                const numId = parseInt(id, 10);
                if (!isNaN(numId)) return numId;
            }
            current = current.parentElement;
        }
        return null;
    }

    // ---------- 工具函数：缓存破坏器 ----------
    function withCacheBuster(src) {
        try {
            const url = new URL(src, window.location.href);
            url.searchParams.set("t", Date.now().toString());
            return url.toString();
        } catch {
            const separator = src.includes("?") ? "&" : "?";
            return `${src}${separator}t=${Date.now()}`;
        }
    }

    // ---------- 🆕 核心：PNG tEXt块操作函数（用于Embed模式） ----------
    
    // 从Base64 PNG中读取指定关键字的tEXt块
    function readPNGTextChunk(base64, keyword) {
        try {
            // 将Base64转换为二进制字符串
            const binString = atob(base64.split(',')[1]);
            
            // PNG签名
            const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
            
            // 检查是否为PNG
            for (let i = 0; i < pngSignature.length; i++) {
                if (binString.charCodeAt(i) !== pngSignature[i]) {
                    return null;
                }
            }
            
            let offset = 8; // 跳过PNG签名
            
            while (offset < binString.length) {
                // 读取块长度（4字节，大端）
                const length = (binString.charCodeAt(offset) << 24) |
                              (binString.charCodeAt(offset + 1) << 16) |
                              (binString.charCodeAt(offset + 2) << 8) |
                              binString.charCodeAt(offset + 3);
                offset += 4;
                
                // 读取块类型（4字节）
                const type = binString.slice(offset, offset + 4);
                offset += 4;
                
                if (type === 'tEXt') {
                    // 读取tEXt块数据
                    const data = binString.slice(offset, offset + length);
                    offset += length;
                    
                    // 查找关键字和文本的分隔符\0
                    const nullIndex = data.indexOf('\0');
                    if (nullIndex !== -1) {
                        const chunkKeyword = data.slice(0, nullIndex);
                        if (chunkKeyword === keyword) {
                            const chunkText = data.slice(nullIndex + 1);
                            return chunkText;
                        }
                    }
                } else {
                    // 跳过其他块数据
                    offset += length;
                }
                
                // 跳过CRC（4字节）
                offset += 4;
            }
            
            return null;
        } catch (e) {
            console.warn('读取PNG tEXt块失败:', e);
            return null;
        }
    }
    
    // 向Base64 PNG中插入tEXt块
    function insertPNGTextChunk(base64, keyword, text) {
        try {
            // 将Base64转换为二进制字符串
            const binString = atob(base64.split(',')[1]);
            
            // 创建新的二进制数据数组
            const newBinData = [];
            
            // PNG签名
            const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
            
            // 添加PNG签名
            for (let i = 0; i < pngSignature.length; i++) {
                newBinData.push(pngSignature[i]);
            }
            
            let offset = 8; // 跳过PNG签名
            let inserted = false;
            
            while (offset < binString.length) {
                // 读取块长度（4字节，大端）
                const length = (binString.charCodeAt(offset) << 24) |
                              (binString.charCodeAt(offset + 1) << 16) |
                              (binString.charCodeAt(offset + 2) << 8) |
                              binString.charCodeAt(offset + 3);
                offset += 4;
                
                // 读取块类型（4字节）
                const type = binString.slice(offset, offset + 4);
                offset += 4;
                
                // 如果是IHDR块，在其后面插入tEXt块
                if (type === 'IHDR' && !inserted) {
                    // 复制IHDR块
                    const ihdrData = binString.slice(offset - 8, offset + length + 4);
                    for (let i = 0; i < ihdrData.length; i++) {
                        newBinData.push(ihdrData.charCodeAt(i));
                    }
                    
                    // 创建tEXt块
                    const textData = keyword + '\0' + text;
                    const textLength = textData.length;
                    
                    // 计算CRC
                    const crcInput = 'tEXt' + textData;
                    let crc = 0xFFFFFFFF;
                    for (let i = 0; i < crcInput.length; i++) {
                        crc ^= crcInput.charCodeAt(i);
                        for (let j = 0; j < 8; j++) {
                            crc = (crc >> 1) ^ (0xEDB88320 * (crc & 1));
                        }
                    }
                    crc ^= 0xFFFFFFFF;
                    
                    // 添加tEXt块长度
                    newBinData.push((textLength >> 24) & 0xFF);
                    newBinData.push((textLength >> 16) & 0xFF);
                    newBinData.push((textLength >> 8) & 0xFF);
                    newBinData.push(textLength & 0xFF);
                    
                    // 添加tEXt块类型
                    newBinData.push('t'.charCodeAt(0));
                    newBinData.push('E'.charCodeAt(0));
                    newBinData.push('X'.charCodeAt(0));
                    newBinData.push('t'.charCodeAt(0));
                    
                    // 添加tEXt块数据
                    for (let i = 0; i < textData.length; i++) {
                        newBinData.push(textData.charCodeAt(i));
                    }
                    
                    // 添加CRC
                    newBinData.push((crc >> 24) & 0xFF);
                    newBinData.push((crc >> 16) & 0xFF);
                    newBinData.push((crc >> 8) & 0xFF);
                    newBinData.push(crc & 0xFF);
                    
                    inserted = true;
                } else {
                    // 复制其他块
                    const blockData = binString.slice(offset - 8, offset + length + 4);
                    for (let i = 0; i < blockData.length; i++) {
                        newBinData.push(blockData.charCodeAt(i));
                    }
                }
                
                // 跳过块数据和CRC
                offset += length + 4;
            }
            
            // 如果没有找到IHDR块或未插入成功，在末尾添加tEXt块
            if (!inserted) {
                // 创建tEXt块
                const textData = keyword + '\0' + text;
                const textLength = textData.length;
                
                // 计算CRC
                const crcInput = 'tEXt' + textData;
                let crc = 0xFFFFFFFF;
                for (let i = 0; i < crcInput.length; i++) {
                    crc ^= crcInput.charCodeAt(i);
                    for (let j = 0; j < 8; j++) {
                        crc = (crc >> 1) ^ (0xEDB88320 * (crc & 1));
                    }
                }
                crc ^= 0xFFFFFFFF;
                
                // 添加tEXt块长度
                newBinData.push((textLength >> 24) & 0xFF);
                newBinData.push((textLength >> 16) & 0xFF);
                newBinData.push((textLength >> 8) & 0xFF);
                newBinData.push(textLength & 0xFF);
                
                // 添加tEXt块类型
                newBinData.push('t'.charCodeAt(0));
                newBinData.push('E'.charCodeAt(0));
                newBinData.push('X'.charCodeAt(0));
                newBinData.push('t'.charCodeAt(0));
                
                // 添加tEXt块数据
                for (let i = 0; i < textData.length; i++) {
                    newBinData.push(textData.charCodeAt(i));
                }
                
                // 添加CRC
                newBinData.push((crc >> 24) & 0xFF);
                newBinData.push((crc >> 16) & 0xFF);
                newBinData.push((crc >> 8) & 0xFF);
                newBinData.push(crc & 0xFF);
            }
            
            // 添加IEND块（如果不存在）
            const iendType = binString.slice(binString.length - 12, binString.length - 8);
            if (iendType !== 'IEND') {
                // IEND块：长度0，类型IEND，数据空，CRC 0xAE426082
                newBinData.push(0x00, 0x00, 0x00, 0x00);
                newBinData.push('I'.charCodeAt(0), 'E'.charCodeAt(0), 'N'.charCodeAt(0), 'D'.charCodeAt(0));
                newBinData.push(0x00, 0x00, 0x00, 0x00);
                newBinData.push(0xAE, 0x42, 0x60, 0x82);
            }
            
            // 将二进制数据转换为Base64
            const newBinString = String.fromCharCode.apply(null, newBinData);
            const newBase64 = 'data:image/png;base64,' + btoa(newBinString);
            
            return newBase64;
        } catch (e) {
            console.warn('插入PNG tEXt块失败:', e);
            return base64;
        }
    }
    
    // 从Base64 PNG中移除指定关键字的tEXt块
    function removePNGTextChunk(base64, keyword) {
        try {
            // 将Base64转换为二进制字符串
            const binString = atob(base64.split(',')[1]);
            
            // 创建新的二进制数据数组
            const newBinData = [];
            
            // PNG签名
            const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
            
            // 添加PNG签名
            for (let i = 0; i < pngSignature.length; i++) {
                newBinData.push(pngSignature[i]);
            }
            
            let offset = 8; // 跳过PNG签名
            
            while (offset < binString.length) {
                // 读取块长度（4字节，大端）
                const length = (binString.charCodeAt(offset) << 24) |
                              (binString.charCodeAt(offset + 1) << 16) |
                              (binString.charCodeAt(offset + 2) << 8) |
                              binString.charCodeAt(offset + 3);
                offset += 4;
                
                // 读取块类型（4字节）
                const type = binString.slice(offset, offset + 4);
                offset += 4;
                
                if (type === 'tEXt') {
                    // 读取tEXt块数据
                    const data = binString.slice(offset, offset + length);
                    
                    // 查找关键字和文本的分隔符\0
                    const nullIndex = data.indexOf('\0');
                    if (nullIndex !== -1) {
                        const chunkKeyword = data.slice(0, nullIndex);
                        if (chunkKeyword === keyword) {
                            // 跳过这个tEXt块，不添加到新数据中
                            offset += length + 4; // 跳过数据和CRC
                            continue;
                        }
                    }
                    
                    // 添加这个tEXt块到新数据中
                    const blockData = binString.slice(offset - 8, offset + length + 4);
                    for (let i = 0; i < blockData.length; i++) {
                        newBinData.push(blockData.charCodeAt(i));
                    }
                } else {
                    // 复制其他块
                    const blockData = binString.slice(offset - 8, offset + length + 4);
                    for (let i = 0; i < blockData.length; i++) {
                        newBinData.push(blockData.charCodeAt(i));
                    }
                }
                
                // 跳过块数据和CRC
                offset += length + 4;
            }
            
            // 将二进制数据转换为Base64
            const newBinString = String.fromCharCode.apply(null, newBinData);
            const newBase64 = 'data:image/png;base64,' + btoa(newBinString);
            
            return newBase64;
        } catch (e) {
            console.warn('移除PNG tEXt块失败:', e);
            return base64;
        }
    }

    // ---------- 工具函数：实时更新页面图片显示 (兼容imgReEditor格式) ----------
    function updateDomImageSrc(blockId, imageUrl, forceReload = false) {
        try {
            if (!blockId || !imageUrl) {
                console.error('更新DOM图片失败：缺少必要参数');
                return false;
            }

            const finalUrl = forceReload ? withCacheBuster(imageUrl) : imageUrl;

            // 尝试所有可能的选择器
            for (const selector of getImageSelectors(blockId)) {
                const imgs = document.querySelectorAll(selector);
                if (imgs.length > 0) {
                    imgs.forEach(img => {
                        const imgEl = img;
                        imgEl.src = finalUrl;
                        
                        // 可选：添加加载完成事件监听以确保更新成功
                        imgEl.onload = () => {
                            console.log('✅ 页面图片已成功更新:', blockId);
                        };

                        imgEl.onerror = () => {
                            console.error('❌ 页面图片更新失败:', blockId);
                        };
                    });
                    
                    // 发送更新完成消息
                    sendMessageToMain({
                        action: 'IMAGE_DOM_UPDATED',
                        blockId: blockId,
                        success: true
                    });
                    
                    return true;
                }
            }
            
            console.warn('未找到指定ID的图片元素:', blockId);
            
            // 发送更新失败消息
            sendMessageToMain({
                action: 'IMAGE_DOM_UPDATED',
                blockId: blockId,
                success: false,
                error: '未找到指定ID的图片元素'
            });
            
            return false;
        } catch (error) {
            console.error('更新DOM图片时发生错误:', error);
            
            // 发送更新失败消息
            sendMessageToMain({
                action: 'IMAGE_DOM_UPDATED',
                blockId: blockId || '',
                success: false,
                error: error.message
            });

            return false;
        }
    }

    // ---------- 工具函数：获取图片数据 ----------
    async function getImageData(blockId) {
        try {
            // 方法1: 从虎鲸API获取
            if (window.orca?.api?.block?.getBlock) {
                const block = await window.orca.api.block.getBlock(blockId);
                const imgUrl = block?.attrs?.imageUrl || block?.attrs?.url;
                if (imgUrl) {
                    // 直接返回URL，不转换为Base64
                    return imgUrl;
                }
            }

            // 方法2: 从DOM元素获取（使用与参考插件相同的选择器）
            const selectors = [
                `[data-block-id="${blockId}"] img.orca-image`,
                `.orca-block[data-id="${blockId}"] img.orca-image`,
                `[data-id="${blockId}"] img.orca-image`,
                `[data-block-id="${blockId}"] img`,
                `.orca-block[data-id="${blockId}"] img`,
                `[data-id="${blockId}"] img`
            ];

            for (const selector of selectors) {
                const imgEl = document.querySelector(selector);
                if (imgEl?.src) {
                    // 直接返回URL，不转换为Base64
                    return imgEl.src;
                }
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
                    // 移除白色背景绘制，直接绘制图片
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

    // ---------- 工具函数：Base64转ArrayBuffer ----------
    function base64ToArrayBuffer(base64) {
        // 验证输入
        if (!base64 || typeof base64 !== 'string') {
            throw new Error('Invalid base64 input: must be a non-empty string');
        }

        // 尝试匹配带前缀的Base64
        const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
        let mimeType, base64Data;
        
        if (matches) {
            // 带前缀的Base64
            mimeType = matches[1] || 'image/png';
            base64Data = matches[2];
        } else {
            // 不带前缀的Base64
            mimeType = 'image/png';
            base64Data = base64;
        }

        try {
            // 清理Base64数据：移除换行符、空格等
            base64Data = base64Data.replace(/\s/g, '');
            
            // 确保Base64长度是4的倍数
            const padding = base64Data.length % 4;
            if (padding !== 0) {
                base64Data += '='.repeat(4 - padding);
            }
            
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return { mimeType, buffer: bytes.buffer };
        } catch (error) {
            console.error('Base64 decoding failed:', error);
            throw new Error(`Failed to decode base64: ${error.message}`);
        }
    }

    // ---------- 工具函数：裁剪透明区域 ----------
    function cropTransparentArea(base64) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    // 创建临时画布
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = img.width;
                    tempCanvas.height = img.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    // 绘制图片到临时画布
                    tempCtx.drawImage(img, 0, 0);
                    
                    // 获取像素数据
                    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
                    const data = imageData.data;
                    
                    // 计算非透明区域的边界
                    let minX = img.width;
                    let minY = img.height;
                    let maxX = 0;
                    let maxY = 0;
                    
                    for (let y = 0; y < img.height; y++) {
                        for (let x = 0; x < img.width; x++) {
                            const index = (y * img.width + x) * 4;
                            const alpha = data[index + 3];
                            
                            // 非透明像素
                            if (alpha > 0) {
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }
                    
                    // 如果全透明，返回原图
                    if (minX > maxX || minY > maxY) {
                        resolve(base64);
                        return;
                    }
                    
                    // 计算裁剪后的尺寸
                    const cropWidth = maxX - minX + 1;
                    const cropHeight = maxY - minY + 1;
                    
                    // 创建裁剪画布
                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = cropWidth;
                    cropCanvas.height = cropHeight;
                    const cropCtx = cropCanvas.getContext('2d');
                    
                    // 复制非透明区域到裁剪画布
                    cropCtx.drawImage(tempCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                    
                    // 转换为Base64
                    const croppedBase64 = cropCanvas.toDataURL('image/png');
                    resolve(croppedBase64);
                    
                } catch (e) {
                    console.error('裁剪透明区域失败:', e);
                    // 失败时返回原图
                    resolve(base64);
                }
            };

            img.onerror = () => {
                console.error('加载图片失败，无法裁剪透明区域');
                // 失败时返回原图
                resolve(base64);
            };

            img.src = base64;
        });
    }

    // ---------- 工具函数：上传图片到后端 ----------
    async function uploadImageToBackend(base64) {
        try {
            const { mimeType, buffer } = base64ToArrayBuffer(base64);
            
            // 尝试使用虎鲸笔记的后端API（兼容imgReEditor格式）
            if (window.orca?.invokeBackend) {
                const assetPath = await window.orca.invokeBackend("upload-asset-binary", mimeType, buffer);
                console.log('✅ 使用虎鲸API上传图片成功:', assetPath);
                return assetPath;
            }
            
            // 备用方案：使用传统的fetch上传
            const blob = new Blob([buffer], { type: mimeType });
            const formData = new FormData();
            formData.append('image', blob, `edited_image_${Date.now()}.png`);

            const response = await fetch('/api/upload-image', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ 使用fetch上传图片成功:', result.imageUrl);
                return result.imageUrl;
            } else {
                throw new Error('上传失败');
            }
        } catch (error) {
            console.error('❌ 图片上传失败:', error);
            throw error;
        }
    }

    // ---------- 🆕 工具函数：截图功能 (Ctrl+~触发) ----------
    function initScreenshotShortcut() {
        // 监听快捷键 Ctrl+~
        document.addEventListener('keydown', async (e) => {
            if (e.ctrlKey && e.key === '~') {
                e.preventDefault();
                await takeScreenshot();
            }
        });

        // 模拟截图（实际需结合虎鲸笔记/浏览器截图API）
        async function takeScreenshot() {
            try {
                // 浏览器截图API（需HTTPS/本地环境）
                if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: 'screen' } });
                    const videoTrack = stream.getVideoTracks()[0];
                    const imageCapture = new ImageCapture(videoTrack);
                    const bitmap = await imageCapture.grabFrame();
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width;
                    canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(bitmap, 0, 0);
                    const screenshotBase64 = canvas.toDataURL('image/png');
                    
                    // 停止流
                    videoTrack.stop();
                    
                    // 保存截图历史
                    screenshotHistory.push({
                        id: Date.now(),
                        base64: screenshotBase64,
                        createTime: new Date().toISOString()
                    });
                    
                    // 直接打开编辑器编辑截图
                    currentBlockId = `screenshot_${Date.now()}`; // 临时ID
                    await loadFabricJS();
                    openEditWindow(screenshotBase64, true); // 截图模式打开编辑器
                    
                } else {
                    alert('您的浏览器不支持截图功能，请升级浏览器或使用虎鲸笔记内置截图工具');
                }
            } catch (e) {
                console.error('截图失败:', e);
                alert(`截图失败: ${e.message}`);
            }
        }
    }

    // ---------- 🆕 工具函数：记录画布状态（用于撤回/重做） ----------
    function saveCanvasState() {
        if (!fabricCanvas) return;
        undoStack.push(JSON.stringify(fabricCanvas.toJSON()));
        redoStack = []; // 清空重做栈
        // 限制栈大小
        if (undoStack.length > 20) undoStack.shift();
    }

    // ---------- 🆕 工具函数：撤回操作 ----------
    function undoCanvas() {
        if (undoStack.length === 0 || !fabricCanvas) return;
        redoStack.push(JSON.stringify(fabricCanvas.toJSON()));
        const prevState = undoStack.pop();
        fabricCanvas.loadFromJSON(prevState, () => {
            fabricCanvas.renderAll();
        });
    }

    // ---------- 🆕 工具函数：重做操作 ----------
    function redoCanvas() {
        if (redoStack.length === 0 || !fabricCanvas) return;
        undoStack.push(JSON.stringify(fabricCanvas.toJSON()));
        const nextState = redoStack.pop();
        fabricCanvas.loadFromJSON(nextState, () => {
            fabricCanvas.renderAll();
        });
    }

    // ---------- 向图片块添加编辑按钮 + 🆕 画布模式按钮 ----------
    function addEditButtons() {
        const toolbars = document.querySelectorAll('.orca-image-toolbar');
        toolbars.forEach(toolbar => {
            // 检查是否已添加过按钮
            if (toolbar.querySelector('.orca-edit-btn')) return;

            // 编辑按钮
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
                const blockId = getBlockIdFromElement(toolbar);
                if (blockId) {
                    currentBlockId = blockId;
                    
                    try {
                        await loadFabricJS();
                        const currentImageUrl = await getImageData(currentBlockId);
                        console.log('🔍 图片数据已获取');
                        
                        // 🆕 加载备份的编辑数据
                        editHistoryData = await loadBackupEditData(currentBlockId);
                        
                        // 打开编辑窗口（普通模式）
                        openEditWindow(currentImageUrl, false);
                    } catch (err) {
                        alert(`❌ 初始化失败：${err.message}`);
                        console.error(err);
                    }
                } else {
                    console.error('无法获取图片块ID');
                    alert('❌ 无法获取图片块ID');
                }
            });

            // 🆕 画布模式按钮
            const canvasModeBtn = document.createElement('button');
            canvasModeBtn.className = 'orca-canvas-mode-btn';
            canvasModeBtn.innerText = '画布';
            canvasModeBtn.style.cssText = `
                margin-left: 4px; padding: 4px 8px; border: none;
                border-radius: 4px; background: #f0f7ff; cursor: pointer;
                font-size: 12px; height: 28px; line-height: 1;
                display: inline-block; color: #1677ff;
            `;
            canvasModeBtn.onmouseover = () => canvasModeBtn.style.background = '#e8f4ff';
            canvasModeBtn.onmouseout = () => canvasModeBtn.style.background = '#f0f7ff';

            canvasModeBtn.addEventListener('click', async () => {
                try {
                    await loadFabricJS();
                    openEditWindow('', true); // 空图片打开画布模式
                } catch (err) {
                    alert(`❌ 画布模式初始化失败：${err.message}`);
                    console.error(err);
                }
            });

            toolbar.appendChild(editBtn);
            toolbar.appendChild(canvasModeBtn);
        });
        console.log('✅ 编辑/画布按钮已添加（整合imgReEditor特性）');
    }

    // ---------- 主函数：创建编辑器界面 (扩展多工具+画布模式) ----------
    function openEditWindow(imageBase64, isCanvasMode = false) {
        if (editModal) document.body.removeChild(editModal);
        if (isEditorOpen) return;
        
        isEditorOpen = true;
        canvasMode = isCanvasMode;
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
        
        // 获取页面中class为t-default windows的元素尺寸
        let targetWidth = window.innerWidth * 0.98; // 默认值
        let targetHeight = window.innerHeight * 0.95; // 默认值
        
        const tDefaultWindows = document.querySelector('.t-default.windows');
        if (tDefaultWindows) {
            const rect = tDefaultWindows.getBoundingClientRect();
            // 计算目标尺寸，至少是原元素的85%
            targetWidth = rect.width * 0.85;
            targetHeight = rect.height * 0.85;
        }

        // 编辑窗口
        const modal = document.createElement('div');
        modal.className = 'orca-image-editor-modal';
        // 🆕 扩展工具栏：添加箭头、椭圆、马赛克、数字序号、圆角边框、旋转翻转等
        // 提取图片名称
        let imageName = '未命名图片';
        if (!canvasMode && imageBase64) {
            try {
                // 统一处理各种情况：URL、文件路径、Base64等
                let fileName = '未命名图片';
                
                // 1. 处理Base64数据URL
                if (imageBase64.startsWith('data:')) {
                    fileName = '编辑图片';
                }
                // 2. 处理HTTP/HTTPS URL
                else if (imageBase64.startsWith('http')) {
                    let url;
                    if (imageBase64.includes('://')) {
                        url = new URL(imageBase64);
                    } else {
                        url = new URL(imageBase64, window.location.origin);
                    }
                    fileName = url.pathname.split('/').pop().split('?')[0] || '未命名图片';
                }
                // 3. 处理本地文件路径（含反斜杠情况）
                else if (imageBase64.includes('\\') || imageBase64.includes('/')) {
                    // 替换所有反斜杠为斜杠，统一处理
                    const normalizedPath = imageBase64.replace(/\\/g, '/');
                    // 提取最后一个斜杠后的内容作为文件名
                    fileName = normalizedPath.split('/').pop() || '未命名图片';
                }
                // 4. 处理直接传入文件名的情况
                else if (imageBase64) {
                    fileName = imageBase64;
                }
                
                // 清理文件名：移除查询参数、哈希、空字符等
                imageName = fileName.split('?')[0].split('#')[0].trim() || '未命名图片';
                
            } catch (e) {
                // 任何错误都使用默认值
                imageName = '编辑图片';
            }
        }

        modal.innerHTML = `
            <div class="editor-container">
                <!-- 标题栏 -->
                <div class="editor-header">
                    <div class="header-title">
                        <h3>${canvasMode ? '多图画布编辑器' : `${imageName}`}</h3>
                    </div>
                    <div class="header-actions">
                        <button class="btn-close">×</button>
                    </div>
                </div>

                <!-- 主内容区域 -->
                <div class="editor-main">
                    <!-- 工具栏 (扩展imgReEditor工具) -->
                    <div class="editor-toolbar">
                        <div class="tool-group">
                            <button class="tool-btn active" data-tool="select" title="选择工具 (Ctrl切换)">
                                <span>🖱️</span> 选择
                            </button>
                            <button class="tool-btn" data-tool="pen" title="画笔">
                                <span>✏️</span> 画笔
                            </button>
                            <button class="tool-btn" data-tool="rect" title="矩形">
                                <span>⬜</span> 矩形
                            </button>
                            <button class="tool-btn" data-tool="ellipse" title="椭圆">
                                <span>⭕</span> 椭圆
                            </button>
                            <button class="tool-btn" data-tool="arrow" title="箭头">
                                <span>➡️</span> 箭头
                            </button>
                            <button class="tool-btn" data-tool="number" title="数字序号">
                                <span>🔢</span> 序号
                            </button>
                            <button class="tool-btn" data-tool="text" title="文字 (Ctrl拖动)">
                                <span>🔤</span> 文字
                            </button>
                            <button class="tool-btn" data-tool="eraser" title="橡皮擦">
                                <span>🧽</span> 橡皮
                            </button>
                            <button class="tool-btn" data-tool="mosaic" title="马赛克">
                                <span>🟦</span> 马赛克
                            </button>
                        </div>

                        <div class="tool-group">
                            <button class="btn-clear">清空</button>
                            <button class="btn-undo" title="撤回 (Ctrl+Z)">↩️ 撤回</button>
                            <button class="btn-redo" title="重做 (Ctrl+Y)">↪️ 重做</button>
                            ${canvasMode ? '<button class="btn-add-img" title="添加图片">➕ 添加图片</button>' : ''}
                        </div>

                        <div class="tool-group right-aligned">
                            <button class="tool-btn btn-cancel">取消</button>
                            <button class="tool-btn btn-save">💾 ${canvasMode ? '保存画布' : '保存修改'}</button>
                        </div>
                    </div>

                    <!-- 画布和设置面板区域 -->
                    <div class="editor-content">
                        <!-- 画布区域 -->
                        <div class="editor-canvas-container">
                            <div class="canvas-wrapper">
                                <canvas id="fabric-canvas"></canvas>
                            </div>

                            ${!canvasMode && screenshotHistory.length > 0 ? `
                            <div class="screenshot-history">
                                <h4>截图历史</h4>
                                <div class="history-list">
                                    ${screenshotHistory.slice(-5).map(item => `
                                        <div class="history-item" data-id="${item.id}">
                                            <img src="${item.base64}" alt="截图" width="80" height="60">
                                            <span>${new Date(item.createTime).toLocaleTimeString()}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            ` : ''}
                        </div>

                        <!-- 右侧设置面板 -->
                        <div class="editor-sidebar">
                            <div class="sidebar-header">
                                <h4 id="sidebar-title">工具设置</h4>
                                <button class="sidebar-close">×</button>
                            </div>
                            <div class="sidebar-content">
                                <!-- 选择工具设置 -->
                                <div class="tool-settings select-settings" style="display: block;">
                                    <div class="setting-group">
                                        <h5>选择工具</h5>
                                        <p>点击或拖拽选择元素</p>
                                    </div>
                                </div>

                                <!-- 画笔工具设置 -->
                                <div class="tool-settings pen-settings" style="display: none;">
                                    <div class="setting-group">
                                        <label>颜色</label>
                                        <div class="color-options">
                                            ${CONFIG.brushColors.map(color => `
                                                <button class="color-option ${color === '#FF0000' ? 'active' : ''}" 
                                                        style="background-color: ${color}" 
                                                        data-color="${color}" 
                                                        title="${color}"></button>
                                            `).join('')}
                                        </div>
                                    </div>
                                    <div class="setting-group">
                                        <label>画笔粗细</label>
                                        <input type="range" min="1" max="20" value="3" class="brush-size-slider" data-tool="pen">
                                        <div class="slider-value">3</div>
                                    </div>
                                </div>

                                <!-- 矩形工具设置 -->
                                <div class="tool-settings rect-settings" style="display: none;">
                                    <div class="setting-group">
                                        <label>描边颜色</label>
                                        <div class="color-input-group">
                                            <input type="color" class="color-picker-input" value="#FF0000">
                                            <span class="color-value">#FF0000</span>
                                        </div>
                                    </div>
                                    <div class="setting-group">
                                        <label>描边宽度</label>
                                        <input type="number" min="1" max="20" value="2" class="stroke-width-input">
                                    </div>
                                    <div class="setting-group">
                                        <label>填充</label>
                                        <input type="checkbox" class="fill-checkbox">
                                    </div>
                                </div>

                                <!-- 椭圆工具设置 -->
                                <div class="tool-settings ellipse-settings" style="display: none;">
                                    <div class="setting-group">
                                        <label>描边颜色</label>
                                        <div class="color-input-group">
                                            <input type="color" class="color-picker-input" value="#FF0000">
                                            <span class="color-value">#FF0000</span>
                                        </div>
                                    </div>
                                    <div class="setting-group">
                                        <label>描边宽度</label>
                                        <input type="number" min="1" max="20" value="2" class="stroke-width-input">
                                    </div>
                                    <div class="setting-group">
                                        <label>填充</label>
                                        <input type="checkbox" class="fill-checkbox">
                                    </div>
                                </div>

                                <!-- 箭头工具设置 -->
                                <div class="tool-settings arrow-settings" style="display: none;">
                                    <div class="setting-group">
                                        <label>描边颜色</label>
                                        <div class="color-input-group">
                                            <input type="color" class="color-picker-input" value="#FF0000">
                                            <span class="color-value">#FF0000</span>
                                        </div>
                                    </div>
                                    <div class="setting-group">
                                        <label>描边宽度</label>
                                        <input type="number" min="1" max="20" value="2" class="stroke-width-input">
                                    </div>
                                </div>

                                <!-- 其他工具设置可以在此处继续添加 -->
                            </div>
                        </div>
                    </div>
                </div>

                    ${!canvasMode && screenshotHistory.length > 0 ? `
                    <div class="screenshot-history">
                        <h4>截图历史</h4>
                        <div class="history-list">
                            ${screenshotHistory.slice(-5).map(item => `
                                <div class="history-item" data-id="${item.id}">
                                    <img src="${item.base64}" alt="截图" width="80" height="60">
                                    <span>${new Date(item.createTime).toLocaleTimeString()}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>


            </div>
        `;

        mask.appendChild(modal);
        document.body.appendChild(mask);
        editModal = mask;

        // 应用样式
        applyStyles();
        
        // 设置编辑窗口大小
        const editorContainer = editModal.querySelector('.editor-container');
        if (editorContainer) {
            editorContainer.style.width = `${targetWidth}px`;
            editorContainer.style.height = `${targetHeight}px`;
        }
        
        // 🆕 提取编辑历史数据（二次编辑）
        if (!canvasMode && imageBase64) {
            extractEditDataFromBase64(imageBase64);
        }
        
        // 初始化画布
        initCanvas(imageBase64);
        // 绑定事件（含快捷键）
        bindEditorEvents();
    }

    // ---------- 应用CSS样式 (扩展imgReEditor样式) ----------
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
                width: 98%;
                max-width: none;
                max-height: 95vh;
                background: #ffffff;
                border-radius: 4px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                resize: both;
                min-width: 600px;
                min-height: 400px;
            }

            .editor-header {
                padding: 6px 12px;
                background: #f8f9fa;
                color: #333;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .header-actions {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            .editor-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
            }

            .header-title {
                flex: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                min-width: 0;
            }

            .btn-close {
                background: none;
                border: none;
                color: #666;
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
                background: rgba(0, 0, 0, 0.1);
            }

            .editor-main {
                display: flex;
                flex-direction: column;
                flex: 1;
                overflow: hidden;
            }

            .editor-toolbar {
                padding: 2px 8px;
                border-bottom: 1px solid #eee;
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: center;
                background: #f8f9fa;
                height: auto;
                min-height: 36px;
                z-index: 10;
            }

            .editor-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            .editor-sidebar {
                width: 240px;
                background: #ffffff;
                border-left: 1px solid #eee;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: -2px 0 8px rgba(0, 0, 0, 0.05);
            }

            .sidebar-header {
                padding: 8px 12px;
                background: #f8f9fa;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .sidebar-header h4 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: #333;
            }

            .sidebar-close {
                background: none;
                border: none;
                color: #666;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .sidebar-content {
                padding: 12px;
                overflow-y: auto;
                flex: 1;
            }

            .tool-settings {
                display: none;
            }

            .setting-group {
                margin-bottom: 16px;
            }

            .setting-group label {
                display: block;
                margin-bottom: 6px;
                font-size: 12px;
                font-weight: 500;
                color: #555;
            }

            .setting-group h5 {
                margin: 0 0 6px 0;
                font-size: 13px;
                font-weight: 600;
                color: #333;
            }

            .setting-group p {
                margin: 0;
                font-size: 11px;
                color: #888;
            }

            .color-options {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                margin-top: 6px;
            }

            .color-option {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 1px solid #ddd;
                cursor: pointer;
                padding: 0;
                margin: 0;
            }

            .color-option:hover {
                transform: scale(1.1);
                box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
            }

            .color-option.active {
                border-color: #333;
                box-shadow: 0 0 0 2px white, 0 0 0 3px #333;
            }

            .color-input-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .color-picker-input {
                width: 40px;
                height: 30px;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                padding: 0;
            }

            .color-value {
                font-size: 12px;
                color: #666;
            }

            .brush-size-slider {
                width: 100%;
                margin: 8px 0;
            }

            .slider-value {
                font-size: 12px;
                color: #666;
                text-align: center;
                margin-top: 4px;
            }

            .stroke-width-input {
                width: 60px;
                padding: 4px 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
            }

            .fill-checkbox {
                cursor: pointer;
            }

            .tool-group {
                display: flex;
                gap: 4px;
                align-items: center;
                flex-wrap: wrap;
            }

            .tool-btn {
                padding: 4px 10px;
                border: 1px solid #ddd;
                border-radius: 6px;
                background: white;
                cursor: pointer;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
                height: 28px;
                min-width: 50px;
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
                gap: 3px;
            }

            .color-option {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                border: 1px solid transparent;
                cursor: pointer;
            }

            .color-option:hover {
                transform: scale(1.05);
            }

            .color-option.active {
                border-color: #333;
                box-shadow: 0 0 0 1px white, 0 0 0 2px #333;
            }



            .btn-clear, .btn-undo, .btn-redo, .btn-add-img {
                padding: 4px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                height: 28px;
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .btn-clear {
                background: #fff2f0;
                border: 1px solid #ffccc7;
                color: #d4380d;
            }

            .btn-clear:hover {
                background: #ffccc7;
            }

            .btn-undo, .btn-redo {
                background: #f0f7ff;
                border: 1px solid #91bfff;
                color: #1677ff;
            }

            .btn-undo:hover, .btn-redo:hover {
                background: #e6f4ff;
            }

            .btn-add-img {
                background: #f6ffed;
                border: 1px solid #b7eb8f;
                color: #52c41a;
            }

            .btn-add-img:hover {
                background: #eaffd0;
            }

            .editor-canvas-container {
                flex: 1;
                padding: 2px;
                overflow: hidden;
                background: transparent;
                display: flex;
                flex-direction: column;
            }

            .canvas-wrapper {
                background: transparent;
                border-radius: 2px;
                padding: 0;
                box-shadow: none;
                width: 100%;
                height: 100%;
                overflow: auto;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            #fabric-canvas {
                display: block;
                border-radius: 4px;
            }





            .screenshot-history {
                margin-top: 16px;
                width: 100%;
                max-width: 800px;
            }

            .screenshot-history h4 {
                font-size: 14px;
                color: #666;
                margin: 0 0 8px 0;
            }

            .history-list {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .history-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
            }

            .history-item:hover {
                background: #f0f7ff;
            }

            .history-item img {
                border-radius: 4px;
                border: 1px solid #eee;
            }

            .history-item span {
                font-size: 12px;
                color: #888;
                margin-top: 4px;
            }

            /* 标题栏中的按钮样式 */
            .header-actions {
                display: flex;
                gap: 6px;
                align-items: center;
            }

            /* 靠右对齐的工具组 */
            .tool-group.right-aligned {
                margin-left: auto;
            }

            /* 工具栏保存和取消按钮样式 */
            .btn-save.tool-btn {
                background: #e6f4ff;
                border-color: #1677ff;
                color: #1677ff;
            }

            .btn-save.tool-btn:hover {
                background: #bae0ff;
            }

            .btn-cancel.tool-btn {
                background: rgba(0, 0, 0, 0.05);
                color: #666;
                border: 1px solid rgba(0, 0, 0, 0.1);
            }

            .btn-cancel.tool-btn:hover {
                background: rgba(0, 0, 0, 0.1);
                border-color: rgba(0, 0, 0, 0.2);
            }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.textContent = styles;
        document.head.appendChild(styleEl);
    }

    // ---------- 初始化画布 (扩展二次编辑+多工具+画布模式) ----------
    async function initCanvas(imageBase64) {
        const container = editModal.querySelector('.canvas-wrapper');
        container.innerHTML = '<div style="padding: 40px; color: #666; text-align: center;">正在加载...</div>';

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

            // 创建新画布 (启用多选择+旋转吸附)
            fabricCanvas = new fabric.Canvas('fabric-canvas', {
                backgroundColor: null, // 设置为透明背景
                preserveObjectStacking: true,
                selection: true,
                multiSelection: true, // 🆕 启用多选
                rotationSnap: 45,     // 🆕 Shift旋转吸附45°
            });

            let imageLoaded = false;
            let originalImage = null;
            
            // 画布模式：初始化空白画布
            if (canvasMode) {
                fabricCanvas.setWidth(container.clientWidth - 40);
                fabricCanvas.setHeight(2600);
                imageLoaded = true;
            }
            // 普通模式：加载图片
            else if (imageBase64) {
                await new Promise((resolve, reject) => {
                    fabric.Image.fromURL(imageBase64, (img) => {
                            if (!img) {
                                reject(new Error('图片加载失败'));
                                return;
                            }

                            originalImage = img;
                            
                            // 🆕 保存原始图片尺寸
                            originalImageWidth = img.width;
                            originalImageHeight = img.height;

                            // 获取编辑器容器的尺寸
                            const editorContainer = editModal.querySelector('.editor-container');
                            const containerWidth = editorContainer ? editorContainer.clientWidth : window.innerWidth * 0.98;
                            const containerHeight = editorContainer ? editorContainer.clientHeight : window.innerHeight * 0.95;
                            
                            // 计算图片的宽高比
                            const aspectRatio = img.width / img.height;
                            
                            // 获取工具栏和标题栏的实际高度
                            const editorHeader = editModal.querySelector('.editor-header');
                            const editorToolbar = editModal.querySelector('.editor-toolbar');
                            
                            // 计算标题栏和工具栏的总高度（使用实际高度或默认值）
                            const headerHeight = editorHeader ? editorHeader.offsetHeight : 40;
                            const toolbarHeight = editorToolbar ? editorToolbar.offsetHeight : 60;
                            const headerAndToolbarHeight = headerHeight + toolbarHeight;
                            
                            // 计算画布的可用高度
                            const availableHeight = containerHeight - headerAndToolbarHeight;
                            
                            // 计算编辑器和画布的最佳尺寸
                            let editorWidth, canvasHeight;
                            
                            // 根据图片宽高比调整画布尺寸
                            if (aspectRatio > 1) {
                                // 宽图
                                editorWidth = Math.min(img.width, containerWidth);
                                canvasHeight = editorWidth / aspectRatio;
                                // 如果高度超过最大允许高度，调整宽度
                                if (canvasHeight > availableHeight) {
                                    canvasHeight = availableHeight;
                                    editorWidth = canvasHeight * aspectRatio;
                                }
                            } else {
                                // 高图或方图
                                canvasHeight = Math.min(img.height, availableHeight);
                                editorWidth = canvasHeight * aspectRatio;
                                // 如果宽度超过最大允许宽度，调整高度
                                if (editorWidth > containerWidth) {
                                    editorWidth = containerWidth;
                                    canvasHeight = editorWidth / aspectRatio;
                                }
                            }
                            
                            // 调整画布尺寸为计算出的最佳尺寸，保持图片原始比例
                            fabricCanvas.setWidth(editorWidth);
                            fabricCanvas.setHeight(canvasHeight);
                            
                            // 计算图片在画布中的缩放比例和位置，确保居中显示
                            const canvasScale = Math.min(
                                fabricCanvas.width / img.width,
                                fabricCanvas.height / img.height
                            );
                            
                            // 调整图片大小和位置，使其在画布中居中显示
                            img.set({
                                left: (fabricCanvas.width - img.width * canvasScale) / 2,
                                top: (fabricCanvas.height - img.height * canvasScale) / 2,
                                scaleX: canvasScale,
                                scaleY: canvasScale,
                                selectable: false,
                                evented: false
                            });

                            fabricCanvas.add(img);
                            imageLoaded = true;
                            resolve();
                        }, { crossOrigin: 'anonymous' });
                });
            }
            
            // 🆕 加载历史编辑数据（二次编辑）
            if (imageLoaded && editHistoryData) {
                // 先移除除了原始图片之外的所有对象
                fabricCanvas.getObjects().forEach(obj => {
                    if (obj.type !== 'image') {
                        fabricCanvas.remove(obj);
                    }
                });
                
                // 加载编辑历史数据
                fabricCanvas.loadFromJSON(editHistoryData, () => {
                    fabricCanvas.renderAll();
                });
            }
            
            // 🆕 添加ResizeObserver，确保lower-canvas与editor-canvas-container大小一致
            const editorCanvasContainer = editModal.querySelector('.editor-canvas-container');
            if (editorCanvasContainer) {
                const resizeObserver = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        if (fabricCanvas) {
                            const containerWidth = entry.contentRect.width;
                            const containerHeight = entry.contentRect.height;
                            
                            // 调整画布尺寸
                            fabricCanvas.setWidth(containerWidth);
                            fabricCanvas.setHeight(containerHeight);
                            
                            // 重新定位和缩放图片（如果有）
                            const objects = fabricCanvas.getObjects();
                            const imageObj = objects.find(obj => obj.type === 'image');
                            if (imageObj && !canvasMode) {
                                // 计算图片在新尺寸下的缩放比例
                                const canvasScale = Math.min(
                                    containerWidth / originalImageWidth,
                                    containerHeight / originalImageHeight
                                );
                                
                                // 调整图片大小和位置，使其在画布中居中显示
                                imageObj.set({
                                    left: (containerWidth - originalImageWidth * canvasScale) / 2,
                                    top: (containerHeight - originalImageHeight * canvasScale) / 2,
                                    scaleX: canvasScale,
                                    scaleY: canvasScale
                                });
                            }
                            
                            fabricCanvas.renderAll();
                        }
                    }
                });
                
                resizeObserver.observe(editorCanvasContainer);
            }

            // 🆕 自定义控件样式设置
            fabric.Object.prototype.set({ 
                // 边框样式
                borderColor: '#ff0000',
                cornerColor: '#ffffff',
                cornerStrokeColor: '#333333',
                cornerSize: 8,
                transparentCorners: false,
                padding: 0,
                // 旋转控件设置
                rotatingPointOffset: 20,
                borderDashArray: [3, 3],
                // 显示默认旋转控件
                hasRotatingPoint: true
            });

            // 🆕 修改默认旋转控件位置到正下方，简化为简单圆形
            fabric.Object.prototype.controls.mtr = new fabric.Control({
                position: 'bm',
                x: 0,
                y: 0.5,
                offsetY: 20,
                cursorStyle: 'pointer',
                render: function(ctx, left, top, styleOverride, fabricObject) {
                    ctx.save();
                    // 绘制旋转控件：简单圆形
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#333333';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(left, top, 8, 0, 2 * Math.PI, false);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                },
                actionName: 'rotate',
                actionHandler: fabric.controlsUtils.rotationWithSnapping
            });

            // 🆕 增强旋转控件可见性
            fabric.Object.prototype.set({
                hasControls: true,
                hasBorders: true,
                hasRotatingPoint: true,
                // 调整控件样式
                cornerSize: 8,
                cornerColor: '#ffffff',
                cornerStrokeColor: '#333333',
                borderColor: '#ff0000',
                transparentCorners: false,
                borderDashArray: [3, 3]
            });
            
            // 🆕 添加自定义删除控件 
            fabric.Object.prototype.controls.deleteControl = new fabric.Control({ 
                position: 'tl', 
                x: 0.5, 
                y: -0.5, 
                offsetX: 15, 
                offsetY: -15, 
                cursorStyle: 'pointer', 
                // 确保控件始终可见 
                visible: true, 
                // 使用正确的render函数签名 
                render: function(ctx, left, top, styleOverride, fabricObject) { 
                    ctx.save(); 
                    // 绘制红色圆形背景 
                    ctx.fillStyle = '#ff0000'; 
                    ctx.beginPath(); 
                    ctx.arc(left, top, 12, 0, 2 * Math.PI, false); 
                    ctx.fill(); 
                    // 绘制白色叉号 
                    ctx.strokeStyle = '#ffffff'; 
                    ctx.lineWidth = 2; 
                    ctx.beginPath(); 
                    ctx.moveTo(left - 7, top - 7); 
                    ctx.lineTo(left + 7, top + 7); 
                    ctx.moveTo(left + 7, top - 7); 
                    ctx.lineTo(left - 7, top + 7); 
                    ctx.stroke(); 
                    ctx.restore(); 
                }, 
                // 使用正确的actionHandler签名: (delta, fabricObject, transform) 
                actionHandler: function(delta, fabricObject, transform) { 
                    // 获取目标对象和画布
                    const target = fabricObject;
                    const canvas = target.canvas;
                    if (canvas) { 
                        canvas.remove(target); 
                        canvas.renderAll(); 
                        saveCanvasState(); // 🆕 记录操作状态 
                    } 
                    return true; 
                } 
            });

            // 🆕 修改控制点样式
            for (const controlName in fabric.Object.prototype.controls) {
                const control = fabric.Object.prototype.controls[controlName];
                if (controlName !== 'deleteControl' && controlName !== 'mtr') {
                    control.render = function(ctx, left, top, styleOverride, fabricObject) {
                        ctx.save();
                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = '#333333';
                        ctx.lineWidth = 1;
                        ctx.fillRect(left - 4, top - 4, 8, 8);
                        ctx.strokeRect(left - 4, top - 4, 8, 8);
                        ctx.restore();
                    };
                }
            }

            // 🆕 记录初始状态（用于撤回）
            saveCanvasState();

            // 绑定右键删除事件（保留原有功能）
            fabricCanvas.on('mouse:down', (options) => {
                if (options.e.button === 2 && options.target) {
                    fabricCanvas.remove(options.target);
                    fabricCanvas.renderAll();
                    saveCanvasState(); // 🆕 记录操作状态
                    options.e.preventDefault();
                }
            });

            // 🆕 Ctrl键快速切换选择模式
            fabricCanvas.on('mouse:move', (options) => {
                if (options.e.ctrlKey) {
                    fabricCanvas.selection = true;
                    fabricCanvas.defaultCursor = 'pointer';
                } else if (fabricCanvas.isDrawingMode) {
                    fabricCanvas.defaultCursor = 'crosshair';
                }
            });

            // 添加滚轮缩放功能
            fabricCanvas.on('mouse:wheel', (opt) => {
                const delta = opt.e.deltaY;
                let zoom = fabricCanvas.getZoom();
                zoom *= 0.999 ** delta;
                if (zoom > 10) zoom = 10;
                if (zoom < 0.1) zoom = 0.1;
                fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
                opt.e.preventDefault();
                opt.e.stopPropagation();
            });

            // 默认工具：选择
            setActiveTool('select');

            console.log(`✅ ${canvasMode ? '画布模式' : '图片编辑器'}初始化完成`);

        } catch (error) {
            container.innerHTML = `<div style="color: #ff4d4f; padding: 40px; text-align: center;">
                <p>❌ 初始化失败</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>`;
            throw error;
        }
    }

    // ---------- 设置活动工具 (扩展imgReEditor所有工具) ----------
    function setActiveTool(tool) {
        if (!fabricCanvas) return;

        // 重置画布状态
        fabricCanvas.isDrawingMode = false;
        fabricCanvas.selection = true;
        fabricCanvas.defaultCursor = 'default';
        fabricCanvas.off('mouse:down');
        fabricCanvas.off('mouse:move');
        fabricCanvas.off('mouse:up');

        // 显示对应工具的设置面板
        editModal.querySelectorAll('.tool-settings').forEach(setting => {
            setting.style.display = 'none';
        });
        const settingsPanel = editModal.querySelector(`.${tool}-settings`);
        if (settingsPanel) {
            settingsPanel.style.display = 'block';
        }

        // 更新侧边栏标题
        const sidebarTitle = editModal.querySelector('#sidebar-title');
        if (sidebarTitle) {
            const toolTitles = {
                'select': '选择工具',
                'pen': '画笔工具',
                'rect': '矩形工具',
                'ellipse': '椭圆工具',
                'arrow': '箭头工具',
                'number': '数字序号',
                'text': '文字工具',
                'eraser': '橡皮擦',
                'mosaic': '马赛克'
            };
            sidebarTitle.textContent = toolTitles[tool] || '工具设置';
        }

        const color = editModal.querySelector('.color-option.active')?.dataset.color || '#FF0000';
        // 获取画笔大小（从滑块或默认值）
        const brushSizeSlider = editModal.querySelector('.brush-size-slider');
        const brushSize = brushSizeSlider ? parseInt(brushSizeSlider.value) : CONFIG.defaultBrushSize;

        switch (tool) {
            case 'select':
                fabricCanvas.selection = true;
                fabricCanvas.defaultCursor = 'pointer';
                break;

            case 'pen':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = brushSize;
                fabricCanvas.freeDrawingBrush.color = color;
                fabricCanvas.defaultCursor = 'crosshair';
                break;

            case 'rect':
                let rect, isDrawingRect = false;
                fabricCanvas.on('mouse:down', (options) => {
                    if (options.target) return;
                    isDrawingRect = true;
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
                    saveCanvasState(); // 🆕 记录状态
                });

                fabricCanvas.on('mouse:move', (options) => {
                    if (!isDrawingRect) return;
                    const pointer = fabricCanvas.getPointer(options.e);
                    rect.set({
                        width: Math.abs(pointer.x - rect.left),
                        height: Math.abs(pointer.y - rect.top)
                    });
                    fabricCanvas.renderAll();
                });

                fabricCanvas.on('mouse:up', () => {
                    isDrawingRect = false;
                });
                break;

            // 🆕 椭圆工具
            case 'ellipse':
                let ellipse, isDrawingEllipse = false;
                fabricCanvas.on('mouse:down', (options) => {
                    if (options.target) return;
                    isDrawingEllipse = true;
                    const pointer = fabricCanvas.getPointer(options.e);
                    ellipse = new fabric.Ellipse({
                        left: pointer.x,
                        top: pointer.y,
                        rx: 0,
                        ry: 0,
                        fill: 'transparent',
                        stroke: color,
                        strokeWidth: brushSize / 2
                    });
                    fabricCanvas.add(ellipse);
                    saveCanvasState(); // 🆕 记录状态
                });

                fabricCanvas.on('mouse:move', (options) => {
                    if (!isDrawingEllipse) return;
                    const pointer = fabricCanvas.getPointer(options.e);
                    ellipse.set({
                        rx: Math.abs(pointer.x - ellipse.left) / 2,
                        ry: Math.abs(pointer.y - ellipse.top) / 2,
                        left: (pointer.x + ellipse.left) / 2,
                        top: (pointer.y + ellipse.top) / 2
                    });
                    fabricCanvas.renderAll();
                });

                fabricCanvas.on('mouse:up', () => {
                    isDrawingEllipse = false;
                });
                break;

            // 🆕 箭头工具
            case 'arrow':
                let arrow, isDrawingArrow = false;
                fabricCanvas.on('mouse:down', (options) => {
                    if (options.target) return;
                    isDrawingArrow = true;
                    const pointer = fabricCanvas.getPointer(options.e);
                    arrow = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                        stroke: color,
                        strokeWidth: brushSize,
                        strokeLineCap: 'round',
                        strokeLineJoin: 'round',
                        arrowEnd: {
                            type: 'arrow',
                            fill: color,
                            stroke: color,
                            scale: brushSize / 2
                        }
                    });
                    fabricCanvas.add(arrow);
                    saveCanvasState(); // 🆕 记录状态
                });

                fabricCanvas.on('mouse:move', (options) => {
                    if (!isDrawingArrow) return;
                    const pointer = fabricCanvas.getPointer(options.e);
                    arrow.set({ x2: pointer.x, y2: pointer.y });
                    fabricCanvas.renderAll();
                });

                fabricCanvas.on('mouse:up', () => {
                    isDrawingArrow = false;
                });
                break;

            // 🆕 数字序号工具
            case 'number':
                fabricCanvas.selection = false;
                fabricCanvas.defaultCursor = 'crosshair';
                fabricCanvas.on('mouse:down', (options) => {
                    // 允许在任何位置创建数字序号，包括已有的对象上
                    const pointer = fabricCanvas.getPointer(options.e);
                    const numberText = new fabric.Textbox(CONFIG.numberSequence++, {
                        left: pointer.x,
                        top: pointer.y,
                        fontSize: brushSize * 3,
                        fill: color,
                        backgroundColor: '#ffffff',
                        borderColor: color,
                        strokeWidth: 1,
                        width: brushSize * 4,
                        textAlign: 'center'
                    });
                    fabricCanvas.add(numberText);
                    fabricCanvas.setActiveObject(numberText);
                    saveCanvasState(); // 🆕 记录状态
                });
                break;

            case 'text':
                fabricCanvas.selection = false;
                fabricCanvas.defaultCursor = 'crosshair';
                fabricCanvas.on('mouse:down', (options) => {
                    if (options.target && (options.target.type === 'text' || options.target.type === 'textbox')) {
                        // 如果点击的是现有文字元素，选中并编辑它
                        fabricCanvas.setActiveObject(options.target);
                        // 自动进入编辑模式
                        if (options.target.type === 'textbox') {
                            options.target.enterEditing();
                            options.target.selectAll();
                        }
                    } else {
                        // 在空白处或其他元素上点击，创建新文字
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
                        text.enterEditing();
                        text.selectAll();
                        saveCanvasState(); // 🆕 记录状态
                    }
                });
                break;

            case 'eraser':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.EraserBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = brushSize * 3;
                fabricCanvas.defaultCursor = 'crosshair';
                break;

            // 🆕 马赛克工具
            case 'mosaic':
                fabricCanvas.isDrawingMode = true;
                fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
                fabricCanvas.freeDrawingBrush.width = brushSize * 5;
                fabricCanvas.freeDrawingBrush.color = 'rgba(200,200,200,0.8)';
                fabricCanvas.freeDrawingBrush.globalCompositeOperation = 'source-over';
                fabricCanvas.defaultCursor = 'crosshair';
                break;

            default:
                // 默认使用选择工具
                fabricCanvas.selection = true;
                fabricCanvas.defaultCursor = 'pointer';
                break;
        }
    }

    // ---------- 绑定编辑器事件 (扩展快捷键+画布模式+截图历史) ----------
    function bindEditorEvents() {
        if (!editModal) return;

        // 关闭按钮
        editModal.querySelector('.btn-close').onclick = closeEditor;
        editModal.querySelector('.btn-cancel').onclick = closeEditor;
        
        // 监听编辑器容器大小变化，调整画布尺寸
        const editorContainer = editModal.querySelector('.editor-container');
        const containerResizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (fabricCanvas && !canvasMode) {
                    const editorContent = editModal.querySelector('.editor-content');
                    const editorToolbar = editModal.querySelector('.editor-toolbar');
                    const editorHeader = editModal.querySelector('.editor-header');
                    
                    if (editorContent && editorToolbar && editorHeader) {
                        const availableWidth = editorContent.clientWidth - 4;
                        const availableHeight = editorContent.clientHeight - 4;
                        
                        // 获取当前画布上的对象
                        const objects = fabricCanvas.getObjects();
                        const imageObj = objects.find(obj => obj.type === 'image');
                        
                        if (imageObj) {
                                // 计算图片在新尺寸下的缩放比例
                                const scale = Math.min(
                                    availableWidth / originalImageWidth,
                                    availableHeight / originalImageHeight
                                );
                                
                                // 调整画布尺寸
                                fabricCanvas.setWidth(availableWidth);
                                fabricCanvas.setHeight(availableHeight);
                                
                                // 重新定位和缩放图片
                                imageObj.set({
                                    left: (availableWidth - originalImageWidth * scale) / 2,
                                    top: (availableHeight - originalImageHeight * scale) / 2,
                                    scaleX: scale,
                                    scaleY: scale
                                });
                                
                                // 重新渲染画布
                                fabricCanvas.renderAll();
                            }
                        } else if (fabricCanvas && canvasMode) {
                            // 画布模式：调整画布宽度，保持高度不变
                            const editorContent = editModal.querySelector('.editor-content');
                            if (editorContent) {
                                const availableWidth = editorContent.clientWidth - 4;
                                // 只调整宽度，保持高度不变
                                fabricCanvas.setWidth(availableWidth);
                                fabricCanvas.renderAll();
                            }
                    }
                }
            }
        });
        
        containerResizeObserver.observe(editorContainer);

        // 工具按钮
        editModal.querySelectorAll('.tool-btn').forEach(btn => {
            btn.onclick = function() {
                editModal.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                if (this.dataset.tool !== 'rotate' && this.dataset.tool !== 'flipH' && this.dataset.tool !== 'flipV' && this.dataset.tool !== 'border') {
                    this.classList.add('active');
                }
                setActiveTool(this.dataset.tool);
            };
        });

        // 颜色选择
        editModal.querySelectorAll('.color-option').forEach(btn => {
            btn.onclick = function() {
                editModal.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const color = this.dataset.color;
                
                // 更新当前工具的颜色设置
                if (fabricCanvas?.isDrawingMode && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.color = color;
                }
                
                // 如果当前是矩形、椭圆或箭头工具，可以更新下一次绘制的颜色
                const activeTool = editModal.querySelector('.tool-btn.active')?.dataset.tool;
                if (activeTool === 'rect' || activeTool === 'ellipse' || activeTool === 'arrow') {
                    // 记录当前颜色，下次绘制时使用
                    editModal.dataset.currentColor = color;
                }
            };
        });

        // 画笔大小滑块
        const brushSizeSlider = editModal.querySelector('.brush-size-slider');
        if (brushSizeSlider) {
            brushSizeSlider.oninput = function() {
                const value = parseInt(this.value);
                const sliderValue = this.parentElement.querySelector('.slider-value');
                if (sliderValue) {
                    sliderValue.textContent = value;
                }
                
                // 更新画笔大小
                if (fabricCanvas?.isDrawingMode && fabricCanvas.freeDrawingBrush) {
                    fabricCanvas.freeDrawingBrush.width = value;
                }
                
                // 记录当前画笔大小，下次绘制时使用
                editModal.dataset.currentBrushSize = value;
            };
        }

        // 颜色选择器输入
        editModal.querySelectorAll('.color-picker-input').forEach(input => {
            input.oninput = function() {
                const color = this.value;
                const colorValue = this.parentElement.querySelector('.color-value');
                if (colorValue) {
                    colorValue.textContent = color;
                }
            };
        });

        // 描边宽度输入
        editModal.querySelectorAll('.stroke-width-input').forEach(input => {
            input.oninput = function() {
                const width = parseInt(this.value);
                // 可以在这里添加描边宽度的应用逻辑
            };
        });

        // 侧边栏关闭按钮（虽然现在设计中不关闭，保留功能）
        const sidebarClose = editModal.querySelector('.sidebar-close');
        if (sidebarClose) {
            sidebarClose.onclick = function() {
                // 可以添加侧边栏折叠逻辑
            };
        }



        // 清空按钮
        editModal.querySelector('.btn-clear').onclick = () => {
            if (!fabricCanvas) return;
            if (confirm('确定要清空所有标注和涂鸦吗？此操作不可撤销。')) {
                const objects = fabricCanvas.getObjects();
                objects.forEach(obj => {
                    if (canvasMode || obj.type !== 'image') {
                        fabricCanvas.remove(obj);
                    }
                });
                fabricCanvas.renderAll();
                saveCanvasState(); // 🆕 记录状态
            }
        };

        // 🆕 撤回/重做按钮
        editModal.querySelector('.btn-undo')?.addEventListener('click', undoCanvas);
        editModal.querySelector('.btn-redo')?.addEventListener('click', redoCanvas);

        // 🆕 画布模式-添加图片按钮
        editModal.querySelector('.btn-add-img')?.addEventListener('click', async () => {
            // 创建文件选择器
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64 = event.target.result;
                    fabric.Image.fromURL(base64, (img) => {
                        img.scale(0.5);
                        img.left = fabricCanvas.width / 2 - img.width / 2;
                        img.top = fabricCanvas.height / 2 - img.height / 2;
                        fabricCanvas.add(img);
                        fabricCanvas.renderAll();
                        saveCanvasState(); // 🆕 记录状态
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });

        // 🆕 截图历史点击事件
        editModal.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const screenshot = screenshotHistory.find(s => s.id == id);
                if (screenshot) {
                    fabricCanvas.getObjects().forEach(obj => fabricCanvas.remove(obj));
                    fabric.Image.fromURL(screenshot.base64, (img) => {
                        img.scale(0.8);
                        fabricCanvas.setWidth(img.width * 0.8);
                        fabricCanvas.setHeight(img.height * 0.8);
                        fabricCanvas.add(img);
                        fabricCanvas.renderAll();
                        saveCanvasState();
                    });
                }
            });
        });

        // 保存按钮
        editModal.querySelector('.btn-save').onclick = async function() {
            if (!fabricCanvas) return;

            const saveBtn = this;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '⏳ 保存中...';

            try {
                let editedBase64;
                
                // 直接生成图片，不调整画布尺寸和对象位置，避免编辑数据移位
                editedBase64 = fabricCanvas.toDataURL({
                    format: 'png',
                    quality: 0.95,
                    multiplier: 1 // 确保生成的图片分辨率与原始图片一致
                });
                
                // 如果是普通模式且有原始图片尺寸信息，使用原始尺寸重新渲染图片
                if (!canvasMode && originalImageWidth > 0 && originalImageHeight > 0) {
                    // 获取当前画布的图片对象
                    const originalImage = fabricCanvas.getObjects().find(obj => obj.type === 'image');
                    if (originalImage) {
                        // 创建一个临时的HTML5 Canvas，使用原始图片尺寸
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = originalImageWidth;
                        tempCanvas.height = originalImageHeight;
                        const ctx = tempCanvas.getContext('2d');
                        
                        if (ctx) {
                            // 绘制原始图片到临时画布
                            const img = new Image();
                            await new Promise((resolve, reject) => {
                                img.onload = resolve;
                                img.onerror = reject;
                                img.src = originalImageBase64;
                            });
                            
                            ctx.drawImage(img, 0, 0, originalImageWidth, originalImageHeight);
                            
                            // 绘制所有编辑对象到临时画布
                            const objects = fabricCanvas.getObjects();
                            for (const obj of objects) {
                                if (obj.type !== 'image') {
                                    // 计算对象在原始尺寸下的位置和大小
                                    const scaleX = originalImageWidth / fabricCanvas.width;
                                    const scaleY = originalImageHeight / fabricCanvas.height;
                                    
                                    // 保存对象的原始属性
                                    const originalLeft = obj.left;
                                    const originalTop = obj.top;
                                    const originalScaleX = obj.scaleX;
                                    const originalScaleY = obj.scaleY;
                                    const originalStrokeWidth = obj.strokeWidth;
                                    
                                    // 调整对象的位置和大小
                                    obj.left = obj.left * scaleX;
                                    obj.top = obj.top * scaleY;
                                    obj.scaleX = obj.scaleX * scaleX;
                                    obj.scaleY = obj.scaleY * scaleY;
                                    if (obj.strokeWidth) {
                                        obj.strokeWidth = obj.strokeWidth * Math.min(scaleX, scaleY);
                                    }
                                    
                                    // 渲染对象到临时画布
                                    obj.render(ctx);
                                    
                                    // 恢复对象的原始属性
                                    obj.left = originalLeft;
                                    obj.top = originalTop;
                                    obj.scaleX = originalScaleX;
                                    obj.scaleY = originalScaleY;
                                    obj.strokeWidth = originalStrokeWidth;
                                }
                            }
                            
                            // 生成最终的Base64图片
                            editedBase64 = tempCanvas.toDataURL('image/png', 0.95);
                        }
                    }
                }

                // 🆕 裁剪透明区域
                const croppedBase64 = await cropTransparentArea(editedBase64);

                // 🆕 嵌入编辑数据
                const finalBase64 = saveEditDataToBase64(croppedBase64);

                // 画布模式：直接保存为新图片块
                if (canvasMode) {
                    if (window.orca?.api?.block?.createBlock) {
                        // 虎鲸笔记创建新图片块（伪代码，需适配实际API）
                        await window.orca.api.block.createBlock({
                            type: 'image',
                            attrs: { imageUrl: finalBase64, url: finalBase64 }
                        });
                        window.orca.api.ui.showToast('✅ 画布已保存为新图片块', 'success');
                    }
                    closeEditor();
                }
                // 普通模式：使用新的保存机制
                else if (currentBlockId) {
                    // 使用新的handleImageSave函数处理保存
                    await handleImageSave(currentBlockId, finalBase64);
                    closeEditor();
                } else {
                    // API不存在时，提供手动保存选项
                    const shouldCopy = confirm('图片处理完成！是否复制Base64数据到剪贴板？');
                    if (shouldCopy) {
                        navigator.clipboard.writeText(finalBase64).then(() => {
                            alert('✅ Base64数据已复制到剪贴板（含编辑数据），请手动更新图片块。');
                        }).catch(() => {
                            prompt('请复制以下Base64数据（含编辑数据）：', finalBase64);
                        });
                    }
                    closeEditor();
                }

            } catch (error) {
                console.error('保存失败:', error);
                alert(`❌ 保存失败: ${error.message}`);
                saveBtn.disabled = false;
                saveBtn.innerHTML = `💾 ${canvasMode ? '保存画布' : '保存修改'}`;
            }
        };

        // 点击遮罩层关闭
        editModal.onclick = (e) => {
            if (e.target === editModal) {
                closeEditor();
            }
        };

        // 🆕 全局快捷键绑定 (Ctrl+Z/Y/C/V/Esc/Delete)
        document.addEventListener('keydown', (e) => {
            if (!isEditorOpen) return;
            
            // Ctrl+Z 撤回
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                undoCanvas();
            }
            // Ctrl+Y 重做
            else if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                redoCanvas();
            }
            // Ctrl+C 复制选中对象
            else if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                const activeObj = fabricCanvas.getActiveObject();
                if (activeObj) fabricCanvas.clipboard = fabric.util.object.clone(activeObj);
            }
            // Ctrl+V 粘贴对象
            else if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                if (fabricCanvas.clipboard) {
                    const obj = fabric.util.object.clone(fabricCanvas.clipboard);
                    obj.left += 20;
                    obj.top += 20;
                    fabricCanvas.add(obj);
                    fabricCanvas.setActiveObject(obj);
                    fabricCanvas.renderAll();
                    saveCanvasState();
                }
            }
            // Delete键 删除选中对象
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                const activeObj = fabricCanvas.getActiveObject();
                const activeObjs = fabricCanvas.getActiveObjects();
                if (activeObjs && activeObjs.length > 0) {
                    // 删除多个选中对象
                    activeObjs.forEach(obj => fabricCanvas.remove(obj));
                    fabricCanvas.discardActiveObject();
                    fabricCanvas.renderAll();
                    saveCanvasState();
                } else if (activeObj) {
                    // 删除单个选中对象
                    fabricCanvas.remove(activeObj);
                    fabricCanvas.renderAll();
                    saveCanvasState();
                }
            }
            // Esc 取消选中/退出绘制
            else if (e.key === 'Escape') {
                e.preventDefault();
                fabricCanvas.discardActiveObject();
                fabricCanvas.isDrawingMode = false;
                fabricCanvas.selection = true;
                fabricCanvas.renderAll();
                editModal.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                editModal.querySelector('[data-tool="select"]').classList.add('active');
            }
        });
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
        canvasMode = false;
        currentBlockId = null; // 重置为null以保持数字类型
        originalImageBase64 = '';
        editHistoryData = null;
    }

    // ---------- 跨上下文通信机制 ----------
    function sendMessageToMain(message) {
        window.postMessage(message, '*');
    }

    // ---------- 初始化插件 (整合imgReEditor特性) ----------
    function initializePlugin() {
        console.log('🚀 虎鲸图片编辑器插件启动 (整合imgReEditor核心特性)...');

        // 初始添加按钮
        addEditButtons();

        // 🆕 初始化截图快捷键
        initScreenshotShortcut();

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

        // 监听来自编辑器的消息（兼容imgReEditor格式）
        window.addEventListener('message', (event) => {
            // 只处理编辑器相关消息
            const data = event.data;
            if (!data || typeof data.type !== 'string') {
                return;
            }

            if (data.type === 'FILEROBOT_READY') {
                console.log('✅ 编辑器已准备就绪');
            } else if (data.type === 'FILEROBOT_SAVE') {
                console.log('💾 保存图片，数据长度:', data.imageData?.length);
                if (currentBlockId) {
                    handleImageSave(currentBlockId, data.imageData);
                }
                closeEditor();
            } else if (data.type === 'FILEROBOT_CLOSE') {
                closeEditor();
            } else if (data.type === 'ORCA_MAIN_MESSAGE') {
                // 兼容原有消息格式
                handleMainMessage(data.data);
            }
        });
    }

    // 处理来自主插件的消息
    function handleMainMessage(data) {
        switch (data.action) {
            case 'OPEN_EDITOR':
                if (data.blockId) {
                    currentBlockId = data.blockId;
                    loadFabricJS().then(() => {
                        getImageData(currentBlockId).then(imageBase64 => {
                            openEditWindow(imageBase64, false);
                        });
                    });
                }
                break;
            case 'OPEN_CANVAS_MODE':
                loadFabricJS().then(() => {
                    openEditWindow('', true);
                });
                break;
            case 'CLOSE_EDITOR':
                closeEditor();
                break;
        }
    }

    // 图片保存处理函数
    async function handleImageSave(blockId, imageData) {
        try {
            // 提取纯Base64图片数据（移除可能嵌入的编辑数据）
            let pureBase64 = imageData;
            const splitIndex = imageData.indexOf('|||EDIT_DATA|||');
            if (splitIndex !== -1) {
                pureBase64 = imageData.substring(0, splitIndex);
                console.log('🔍 已提取纯Base64图片数据');
            }
            
            // 上传图片到后端
            const assetPath = await uploadImageToBackend(pureBase64);
            if (!assetPath) {
                alert('❌ 图片上传失败');
                return;
            }

            // 尝试直接保存到block属性
            const saved = await saveImageReprProperty(blockId, assetPath);
            if (!saved) {
                // 保存失败时，将图片路径暂存到本地存储
                await saveToStore(blockId, assetPath);
                alert('⚠️ 图片保存失败，已暂存到本地存储');
            }

            // 保存成功后，实时更新页面图片显示
            const displayPath = getAssetPath(assetPath);
            updateDomImageSrc(blockId, displayPath, true);

            // 移除保存成功提示，静默保存
        } catch (error) {
            console.error('图片保存处理失败:', error);
            alert('❌ 图片保存处理失败');
        }
    }

    // ---------- 启动插件 ----------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePlugin);
    } else {
        initializePlugin();
    }

})();