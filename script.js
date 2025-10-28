// ==UserScript==
// @name         (v5.0) 终极版-全自动播放列表模拟器
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  自动嗅探 lessonVideoResourceList，获取播放列表并全自动模拟所有视频的心跳包。
// @author       You
// @match        https://dx.scu.edu.cn/videodetails/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- 全局状态 ---
    let SCRIPT_CONFIG = {};       // 存储请求配置 (headers, url)
    let videoPlaylist = [];       // 存储整个播放列表
    let currentVideoIndex = -1;     // 当前正在模拟的视频索引
    let timeTrackerInterval = null; // 定时器句柄
    let simulatedTimeInSeconds = 0; // 模拟的当前时间（秒）
    let isTrackerRunning = false;   // 跟踪器是否已在运行

    console.log("%c[Auto-Tracker] v5.0 终极版已启动！等待页面加载...", "color: #00aaff; font-weight: bold;");

    // ===================================================================
    // 
    //  TRACKER 模块 (模拟器核心)
    // 
    // ===================================================================

    /**
     * 核心功能：运行跟踪器 (模拟发送请求)
     */
    async function runTracker() {
        try {
            // 0. 检查是否在运行
            if (!isTrackerRunning || currentVideoIndex === -1) {
                stopTracker();
                return;
            }

            // 1. 获取当前视频的详细信息
            const currentVideo = videoPlaylist[currentVideoIndex];
            const totalDurationInSeconds = convertTimeToSeconds(currentVideo.resourceDuration);

            // 2. 检查是否已完成
            if (simulatedTimeInSeconds >= totalDurationInSeconds) {
                console.log(`%c[Auto-Tracker] 视频 "${currentVideo.resourceTitle}" 已完成。`, "color: #00cc66;");
                // 发送最后一次完美的心跳包
                await sendHeartbeat(totalDurationInSeconds); 
                stopTracker();
                startNextVideo(); // 自动播放下一个
                return;
            }

            // 3. 累加时间 (普通心跳)
            simulatedTimeInSeconds += SCRIPT_CONFIG.intervalInSeconds;

            // 确保不会超过总时长 (只在最后一次发送时才等于总时长)
            const timeToSend = Math.min(simulatedTimeInSeconds, totalDurationInSeconds);
            
            await sendHeartbeat(timeToSend);

        } catch (e) {
            console.error(`[Auto-Tracker] 模拟器执行出错:`, e);
            stopTracker();
        }
    }

    /**
     * 真正发送心跳包的函数
     */
    async function sendHeartbeat(secondsToSend) {
        const timeString = formatTime(secondsToSend);
        const resourceId = videoPlaylist[currentVideoIndex].resourceId;

        console.log(`%c[Auto-Tracker] 正在发送: (ID: ${resourceId}) -> ${timeString}`, "color: #00aaff;");

        const formData = new FormData();
        formData.append("resourceId", resourceId);
        formData.append(SCRIPT_CONFIG.timeField, timeString);
        // 如果有其他静态字段，也一并添加
        if (SCRIPT_CONFIG.staticData) {
            for (const key in SCRIPT_CONFIG.staticData) {
                formData.append(key, SCRIPT_CONFIG.staticData[key]);
            }
        }

        const response = await fetch(SCRIPT_CONFIG.url, {
            method: "POST",
            headers: SCRIPT_CONFIG.headers,
            body: formData,
            mode: "cors",
            credentials: "include"
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log(`%c[Auto-Tracker] 发送成功 ${timeString} ->`, "color: #00cc66;", data);
        } else {
            console.error(`[Auto-Tracker] 服务器返回错误 (Status: ${response.status}):`, data);
            if (response.status === 401 || response.status === 403) {
                 console.error("[Auto-Tracker] 身份验证(Token)失效，请刷新页面以重新捕获。");
            }
            stopTracker(); // 遇到错误停止
        }
    }

    /**
     * 控制函数：启动指定索引的视频
     */
    function startTracker(videoIndex) {
        if (isTrackerRunning) stopTracker();
        if (videoIndex < 0 || videoIndex >= videoPlaylist.length) {
            console.error("[Auto-Tracker] 视频索引无效。");
            return;
        }

        currentVideoIndex = videoIndex;
        const video = videoPlaylist[currentVideoIndex];

        // 设置初始时间
        // 检查 state，如果 state=0 并且有 resource_time，就从那里开始，否则从 0 开始
        if (video.state === 0 && video.resource_time) {
            simulatedTimeInSeconds = convertTimeToSeconds(video.resource_time);
        } else {
            simulatedTimeInSeconds = 0;
        }

        isTrackerRunning = true;

        console.log(`%c[Auto-Tracker] 模拟器已启动 [${currentVideoIndex + 1}/${videoPlaylist.length}]
        - 视频: ${video.resourceTitle}
        - 资源ID: ${video.resourceId}
        - 总时长: ${video.resourceDuration}
        - 开始时间: ${formatTime(simulatedTimeInSeconds)}
        - 发送间隔: ${SCRIPT_CONFIG.intervalInSeconds} 秒
        
        (如需手动停止, 请在控制台输入: stopAutoTracker())`, "color: #00cc66; font-weight: bold;");

        // 立即先发送一次启动时间
        runTracker();
        
        // 启动定时器
        timeTrackerInterval = setInterval(runTracker, SCRIPT_CONFIG.intervalInSeconds * 1000);
    }

    /**
     * 控制函数：停止
     */
    function stopTracker() {
        if (timeTrackerInterval) {
            clearInterval(timeTrackerInterval);
            timeTrackerInterval = null;
        }
        isTrackerRunning = false;
        // 不重置 currentVideoIndex，以便 startNextVideo 知道下一个是哪个
        console.log("%c[Auto-Tracker] 模拟器已停止。", "color: #ff6600; font-weight: bold;");
    }

    /**
     * 控制函数：启动下一个视频
     */
    function startNextVideo() {
        const nextIndex = currentVideoIndex + 1;
        if (nextIndex >= videoPlaylist.length) {
            console.log("%c[Auto-Tracker] 恭喜！所有视频已模拟完成！", "color: blue; font-weight: bold;");
            return;
        }

        console.log(`%c[Auto-Tracker] 准备切换到下一个视频...`, "color: orange;");
        startTracker(nextIndex);
    }
    
    // 暴露一个手动停止的方法到全局，方便调试
    unsafeWindow.stopAutoTracker = stopTracker;

    // ===================================================================
    // 
    //  HELPER 模块 (工具函数)
    // 
    // ===================================================================

    /**
     * 帮助函数：将 "HH:MM:SS" 转换为总秒数
     */
    function convertTimeToSeconds(timeString) {
        if (!timeString || typeof timeString !== 'string') return 0;
        const parts = timeString.split(':').map(Number);
        if (parts.length === 3) {
            return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
        }
        if (parts.length === 2) {
            return (parts[0] || 0) * 60 + (parts[1] || 0);
        }
        if (parts.length === 1) {
            return (parts[0] || 0);
        }
        return 0;
    }

    /**
     * 帮助函数：将总秒数格式化为 HH:MM:SS
     */
    function formatTime(totalSeconds) {
        totalSeconds = Math.floor(totalSeconds); // 确保是整数
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    // ===================================================================
    // 
    //  SNIFFER 模块 (v5.0)
    // 
    // ===================================================================

    /**
     * 核心处理逻辑：提取并存储配置，然后启动 Tracker
     */
    function processAndStoreConfig(url, headersObj, formDataBody, responseText) {
        try {
            console.log("[Auto-Tracker] 嗅探器：捕获到 'lessonVideoResourceList'！");
            
            // 1. 解析响应
            const response = JSON.parse(responseText);
            if (!response.data || !response.data.playList) {
                console.error("[Auto-Tracker] 嗅探器：响应格式不正确，未找到 playList。");
                return;
            }
            
            videoPlaylist = response.data.playList;
            if (videoPlaylist.length === 0) {
                console.error("[Auto-Tracker] 嗅探器：播放列表为空。");
                return;
            }

            // 2. 提取请求头
            const capturedHeaders = {};
            for (const key in headersObj) {
                // 排除 content-type，因为我们发送时需要浏览器自动生成 boundary
                if (key.toLowerCase() !== 'content-type') {
                    capturedHeaders[key] = headersObj[key];
                }
            }

            // 3. 提取请求体 (FormData) 中的静态数据
            const capturedStaticData = {};
            if (formDataBody && typeof formDataBody.entries === 'function') {
                for (const [key, value] of formDataBody.entries()) {
                    // videoId 和 lessonId 是 /lessonVideoResourceList 用的
                    // /setResourceTime 可能需要也可能不需要，先存起来
                    capturedStaticData[key] = value;
                }
            }

            // 4. 组装 SCRIPT_CONFIG
            SCRIPT_CONFIG = {
                url: "https://dx.scu.edu.cn/trainingApi/v1/lesson/setResourceTime",
                headers: capturedHeaders,
                staticData: capturedStaticData, // 包含 videoId, lessonId
                timeField: "videoTime",         // 固定的
                intervalInSeconds: 20           // 固定的
            };

            // 5. 决定从哪里开始
            const lastResourceId = response.data.lastResourceId;
            let startIndex = videoPlaylist.findIndex(v => v.resourceId === lastResourceId);
            
            if (startIndex === -1) {
                console.warn(`[Auto-Tracker] 嗅探器：未找到 lastResourceId (${lastResourceId})，从第一个视频开始。`);
                startIndex = 0;
            }
            
            // 检查这个视频是否已经完成了
            if (videoPlaylist[startIndex].state === 1) {
                 console.log(`[Auto-Tracker] 视频 "${videoPlaylist[startIndex].resourceTitle}" (state=1) 已完成。`);
                 // 尝试启动下一个
                 const nextIndex = startIndex + 1;
                 if (nextIndex < videoPlaylist.length) {
                     console.log("[Auto-Tracker] 自动跳转到下一个未完成的视频。");
                     startIndex = nextIndex;
                 } else {
                     console.log("[Auto-Tracker] 所有视频似乎都已完成。");
                     return; // 不启动
                 }
            }
            
            console.log("%c[Auto-Tracker] 嗅探器：成功捕获所有配置！", "color: #00cc66; font-weight: bold;");
            
            // 6. 启动模拟器
            startTracker(startIndex);

        } catch (e) {
            console.error("[Auto-Tracker] 嗅探器处理配置时出错:", e);
        }
    }

    /**
     * 拦截 XMLHttpRequest (XHR)
     */
    const originalXHR_open = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalXHR_send = unsafeWindow.XMLHttpRequest.prototype.send;
    const originalXHR_setRequestHeader = unsafeWindow.XMLHttpRequest.prototype.setRequestHeader;

    unsafeWindow.XMLHttpRequest.prototype.open = function(method, url) {
        this._sniffer_url = url;
        this._sniffer_headers = {};
        return originalXHR_open.apply(this, arguments);
    };

    unsafeWindow.XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (this._sniffer_headers) {
             this._sniffer_headers[header.toLowerCase()] = value;
        }
        return originalXHR_setRequestHeader.apply(this, arguments);
    };

    unsafeWindow.XMLHttpRequest.prototype.send = function(body) {
        // 'body' 在这里就是 FormData 对象
        if (this._sniffer_url && this._sniffer_url.includes("/lesson/lessonVideoResourceList")) {
            
            // 关键：我们必须在 'send' 时附加 'onload' 监听器来读取响应
            this.addEventListener('load', function() {
                if (this.status === 200) {
                    // (this._sniffer_headers) 是请求头
                    // (body) 是请求体
                    // (this.responseText) 是响应体
                    processAndStoreConfig(this._sniffer_url, this._sniffer_headers || {}, body, this.responseText);
                } else {
                    console.error(`[Auto-Tracker] 嗅探器：'lessonVideoResourceList' 请求失败，状态码: ${this.status}`);
                }
            });
        }
        return originalXHR_send.apply(this, arguments);
    };
    console.log("[Auto-Tracker] 'XMLHttpRequest' 嗅探器已部署。");


    /**
     * 拦截 window.fetch
     */
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = async function(url, options) {
        
        const urlString = (url instanceof Request) ? url.url : url;
        
        // 调用原始 fetch
        const response = await originalFetch.apply(this, arguments);

        // 检查是不是我们要找的请求
        if (typeof urlString === 'string' && urlString.includes("/lesson/lessonVideoResourceList")) {
            
            const clonedResponse = response.clone(); // 克隆响应体以便读取
            
            const headersObj = {};
            if (options && options.headers) {
                if (options.headers instanceof Headers) {
                    options.headers.forEach((value, key) => headersObj[key.toLowerCase()] = value);
                } else {
                    // 将普通对象 headers 转为小写
                    for (const key in options.headers) {
                         headersObj[key.toLowerCase()] = options.headers[key];
                    }
                }
            }
            
            const responseText = await clonedResponse.text();
            
            // (options.body) 是请求体
            processAndStoreConfig(urlString, headersObj, options.body, responseText);
        }
        
        return response; // 返回原始响应
    };
    console.log("[Auto-Tracker] 'fetch' 嗅探器已部署。");

})();
