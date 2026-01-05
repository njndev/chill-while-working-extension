(() => {
  // IMMEDIATE: Add class to body to hide floating buttons via CSS
  document.body.classList.add("chill-popup-window");
  
  // IMMEDIATE: Force remove any floating buttons
  const removeFloatingButtons = () => {
    const pipBtn = document.getElementById("chill-pip-button");
    const addBtn = document.getElementById("chill-add-button");
    if (pipBtn) {
      pipBtn.remove();
    }
    if (addBtn) {
      addBtn.remove();
    }
  };
  removeFloatingButtons();
  // Check again after 100ms in case buttons are injected late
  setTimeout(removeFloatingButtons, 100);
  setTimeout(removeFloatingButtons, 500);
  
  const hiddenSelectors = [
    "#masthead-container",
    "ytd-mini-guide-renderer",
    "#related",
    "ytd-comments",
    "#secondary-inner",
    "#below",
    "#description",
    "#meta",
    "#menu-container",
    "tp-yt-app-drawer",
    "ytd-watch-next-secondary-results-renderer"
  ];

  const pipButtonId = "pip-launcher-button";
  const skipButtonId = "pip-skip-button";
  const dockId = "pip-control-dock";
  let pipRequested = false;
  let autoPipAttempted = false;
  let dockPosition = "bottom-right";
  let pipVolume = 0.8;
  let lastAdSkipTime = 0;
  let isProcessingAd = false;
  let pipObserver = null;

  // Intelligent video detection from reference extension
  function findLargestPlayingVideo() {
    const videos = Array.from(document.querySelectorAll("video"))
      .filter((video) => video.readyState != 0)
      .filter((video) => video.disablePictureInPicture == false)
      .sort((v1, v2) => {
        const v1Rect = v1.getClientRects()[0] || { width: 0, height: 0 };
        const v2Rect = v2.getClientRects()[0] || { width: 0, height: 0 };
        return v2Rect.width * v2Rect.height - v1Rect.width * v1Rect.height;
      });

    if (videos.length === 0) {
      return null;
    }

    return videos[0];
  }

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "CHILL_MINI_MODE") {
      if (message?.position) {
        dockPosition = message.position;
        updateDockPosition();
      }
      if (typeof message?.volume === "number") {
        pipVolume = message.volume / 100;
      }
    }
  });

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") {
      makePlayerPrimary();
    }
  });

  const observer = new MutationObserver(() => {
    makePlayerPrimary();
  });
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  makePlayerPrimary();
  startAdMonitor();

  function makePlayerPrimary() {
    hideChrome();
    const video = findLargestPlayingVideo() || getPlayerVideo();
    if (!video) {
      return;
    }

    pipRequested = document.pictureInPictureElement === video;
    video.setAttribute("controls", "true");
    
    // Apply volume setting
    if (typeof pipVolume === "number" && pipVolume >= 0 && pipVolume <= 1) {
      video.volume = pipVolume;
      video.muted = false;
    }
    
    video.style.width = "100vw";
    video.style.height = "100vh";
    video.style.objectFit = "contain";
    video.style.backgroundColor = "#000";
    forceTheaterMode();
    attachDock(video);
    
    // Auto-trigger PiP when video is ready (only once)
    if (!autoPipAttempted && !pipRequested) {
      tryAutoPip(video);
    }
  }

  function hideChrome() {
    hiddenSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.style.setProperty("display", "none", "important");
      });
    });
  }

  function getPlayerVideo() {
    const player = document.querySelector("video.html5-main-video");
    return player || document.querySelector("video");
  }

  function forceTheaterMode() {
    const flexy = document.querySelector("ytd-watch-flexy");
    if (flexy && !flexy.hasAttribute("theater")) {
      flexy.setAttribute("theater", "true");
    }
  }

  async function tryAutoPip(video) {
    // Mark that we attempted auto-PiP (prevent multiple attempts)
    autoPipAttempted = true;
    
    // Wait for video to be ready
    if (video.readyState < 2) {
      const waitForReady = new Promise((resolve) => {
        const checkReady = () => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            video.addEventListener("loadedmetadata", resolve, { once: true });
            video.addEventListener("canplay", resolve, { once: true });
          }
        };
        checkReady();
      });
      
      // Timeout after 5 seconds
      await Promise.race([
        waitForReady,
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
    }
    
    // Wait for video to start playing (but don't wait forever)
    if (video.paused) {
      const waitForPlay = new Promise((resolve) => {
        video.addEventListener("playing", resolve, { once: true });
      });
      
      // Timeout after 3 seconds
      await Promise.race([
        waitForPlay,
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
    }
    
    // Small delay to ensure video is stable
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now try to trigger PiP
    if (!document.pictureInPictureElement) {
      try {
        await video.requestPictureInPicture();
        pipRequested = true;
        video.setAttribute("__pip__", "true");
        
        // Minimize window immediately
        requestWindowMinimize();
        
        // Start monitoring
        startPipMonitoring(video);
        
        // Listen for PiP exit
        video.addEventListener("leavepictureinpicture", () => {
          pipRequested = false;
          video.removeAttribute("__pip__");
          stopPipMonitoring();
        }, { once: true });
        
      } catch (error) {
        console.warn("[YouTube Inject] Auto-PiP failed:", error.message);
      }
    }
  }

  function attachDock(video) {
    const dock = ensureDock();
    if (!document.getElementById(pipButtonId)) {
      const pipButton = createDockButton("Let's Chill", pipButtonId);
      pipButton.addEventListener("click", async () => {
        const currentVideo = getPlayerVideo() || video;
        if (currentVideo) {
          try {
            await togglePiP(currentVideo);
            // Minimize window (dock stays visible)
            requestWindowMinimize();
          } catch (error) {
            console.warn("[YouTube Inject] PiP failed:", error);
          }
        }
      });
      dock.appendChild(pipButton);
    }

    if (!document.getElementById(skipButtonId)) {
      const skipButton = createDockButton("Skip Ad", skipButtonId);
      skipButton.addEventListener("click", () => {
        skipAdManually();
      });
      dock.appendChild(skipButton);
    }
  }

  function ensureDock() {
    let dock = document.getElementById(dockId);
    if (dock) {
      return dock;
    }
    dock = document.createElement("div");
    dock.id = dockId;
    Object.assign(dock.style, {
      position: "fixed",
      display: "flex",
      gap: "8px",
      zIndex: 100000,
      flexWrap: "wrap"
    });
    updateDockPosition(dock);
    document.body.appendChild(dock);
    return dock;
  }

  function updateDockPosition(dock) {
    const target = dock || document.getElementById(dockId);
    if (!target) {
      return;
    }

    target.style.bottom = "";
    target.style.top = "";
    target.style.left = "";
    target.style.right = "";

    const margin = "16px";

    if (dockPosition.includes("bottom")) {
      target.style.bottom = margin;
    } else {
      target.style.top = margin;
    }

    if (dockPosition.includes("right")) {
      target.style.right = margin;
    } else {
      target.style.left = margin;
    }
  }

  function createDockButton(label, id) {
    const button = document.createElement("button");
    button.id = id;
    button.textContent = label;
    Object.assign(button.style, {
      padding: "8px 12px",
      background: "rgba(0,0,0,0.7)",
      color: "#fff",
      border: "1px solid #00ff95",
      borderRadius: "6px",
      fontFamily: "Consolas, 'Fira Code', monospace",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "600"
    });
    return button;
  }

  async function requestPiP(video) {
    if (pipRequested || document.pictureInPictureElement === video) {
      return;
    }
    if (!document.pictureInPictureEnabled) {
      return;
    }

    // Mark video with PiP attribute
    video.setAttribute("__pip__", "true");

    // Listen for PiP state changes
    video.addEventListener("enterpictureinpicture", () => {
      pipRequested = true;
      video.setAttribute("__pip__", "true");
      // Auto-minimize window when PiP activates
      requestWindowMinimize();
      // Start monitoring for video changes
      startPipMonitoring(video);
    }, { once: true });

    video.addEventListener("leavepictureinpicture", () => {
      pipRequested = false;
      video.removeAttribute("__pip__");
      stopPipMonitoring();
    }, { once: true });
  }

  function startPipMonitoring(currentVideo) {
    if (pipObserver) {
      return;
    }
    pipObserver = new ResizeObserver(() => {
      maybeUpdatePictureInPictureVideo(currentVideo);
    });
    pipObserver.observe(currentVideo);
  }

  function stopPipMonitoring() {
    if (pipObserver) {
      pipObserver.disconnect();
      pipObserver = null;
    }
  }

  function maybeUpdatePictureInPictureVideo(observedVideo) {
    // Check if we still have an active PiP video
    if (!document.querySelector("[__pip__]")) {
      stopPipMonitoring();
      return;
    }

    // Find the largest playing video
    const video = findLargestPlayingVideo();
    
    // Switch to new video if it's larger and different
    if (video && video !== observedVideo && !video.hasAttribute("__pip__")) {
      stopPipMonitoring();
      requestPiP(video);
    }
  }

  async function togglePiP(video) {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
        // Auto-minimize when toggled manually
        requestWindowMinimize();
      }
    } catch (_error) {
      // no-op
    }
  }

  function skipAdManually() {
    const video = getPlayerVideo();
    if (!video) {
      return;
    }
    isProcessingAd = true;
    skipAd(video);
    setTimeout(() => {
      isProcessingAd = false;
    }, 2000);
  }

  function skipAd(video) {
    const now = Date.now();
    if (now - lastAdSkipTime < 2000) {
      return;
    }

    const skipButtonSelectors = [
      ".ytp-ad-skip-button.ytp-button",
      ".ytp-ad-skip-button-modern",
      ".ytp-ad-skip-button",
      ".ytp-skip-ad-button",
      "button.ytp-ad-skip-button",
      ".ytp-ad-overlay-close-button"
    ];

    for (const selector of skipButtonSelectors) {
      const button = document.querySelector(selector);
      if (button && button.offsetParent !== null) {
        button.click();
        lastAdSkipTime = now;
        return;
      }
    }

    if (!isAdPlaying()) {
      return;
    }

    const player = document.querySelector(".html5-video-player");
    if (player && player.classList.contains("ad-showing")) {
      if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 600) {
        const targetTime = Math.max(video.duration - 0.5, 0);
        if (Math.abs(video.currentTime - targetTime) > 1) {
          video.currentTime = targetTime;
          lastAdSkipTime = now;
        }
      }
    }
  }

  function isAdPlaying() {
    const player = document.querySelector(".html5-video-player");
    if (!player) {
      return false;
    }
    
    if (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")) {
      return true;
    }

    const adModule = document.querySelector(".ytp-ad-module");
    if (adModule && adModule.style.display !== "none") {
      return true;
    }

    const adText = document.querySelector(".ytp-ad-text");
    if (adText && adText.offsetParent !== null) {
      return true;
    }

    return false;
  }

  function autoSkipAds() {
    if (isProcessingAd) {
      return;
    }

    const video = getPlayerVideo();
    if (!video) {
      return;
    }

    if (isAdPlaying()) {
      skipAd(video);
    }
  }

  function startAdMonitor() {
    setInterval(() => {
      autoSkipAds();
    }, 2000);
  }

  function requestWindowMinimize() {
    if (!chrome?.runtime?.sendMessage) {
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "MINIMIZE_CHILL_WINDOW" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Failed to minimize window:", chrome.runtime.lastError.message);
        } else if (response?.ok) {
          console.log("Window minimized successfully");
        }
      });
    } catch (error) {
      console.warn("Failed to send minimize message:", error);
    }
  }
})();
