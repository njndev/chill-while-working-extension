// Universal PiP Injection Script
// Runs in popup window context for Facebook, TikTok, Instagram, etc.
// Similar pattern to youtube_inject.js but platform-agnostic

(() => {
  // IMMEDIATE: Add class to body to hide floating buttons via CSS
  document.body.classList.add("chill-popup-window");
  
  // IMMEDIATE: Force remove any floating buttons that might have been injected
  const removeFloatingButtons = () => {
    const pipBtn = document.getElementById("chill-pip-button");
    const addBtn = document.getElementById("chill-add-button");
    if (pipBtn) pipBtn.remove();
    if (addBtn) addBtn.remove();
  };
  removeFloatingButtons();
  
  // Check if running in Chill popup
  if (!window.__chillPopup) {
    return;
  }
  
  const platform = window.__chillPopup.platform || "generic";
  
  // Set platform attribute on body for CSS targeting
  document.body.setAttribute("data-chill-platform", platform);
  
  const DOCK_ID = "universal-pip-dock";
  const PIP_BUTTON_ID = "universal-pip-button";
  
  let foundVideo = null;
  let dockPosition = "bottom-right";
  let pipVolume = 0.8;
  let autoPipAttempted = false;
  let bridgeReady = false;
  let isSeeking = false;
  let lastSeekTime = 0;
  
  // Extract volume from metadata
  if (window.__chillPopup && typeof window.__chillPopup.volume === "number") {
    pipVolume = window.__chillPopup.volume / 100;
  }
  
  // Listen for bridge ready message
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    
    const message = event.data;
    
    if (message?.type === "CHILL_BRIDGE_READY") {
      bridgeReady = true;
    } else if (message?.type === "CHILL_MINIMIZE_RESULT") {
      if (!message.success) {
        console.error("[Chill Universal] Minimize failed via bridge:", message.error);
      }
    }
  });
  
  // Platform-specific configuration
  const PLATFORM_CONFIG = {
    facebook: {
      initialDelay: 1000,
      retryDelay: 600,
      maxRetries: 8,
      selectors: [
        'div[data-pagelet="Watch"] video',
        'div[data-pagelet="WatchPermalinkVideo"] video',
        'div[role="main"] div[data-video-id] video',
        'video[data-video-id]',
        'div[aria-label*="video" i] video',
        'div[aria-label*="Video" i] video',
        'div[role="main"] video',
        'div#watch_feed video',
        'video[src*="fbcdn"]',
        'video[src*="facebook"]',
        'video'
      ]
    },
    tiktok: {
      initialDelay: 600,
      retryDelay: 400,
      maxRetries: 5,
      selectors: [
        'video.tiktok-video',
        'video[class*="BasicPlayer"]',
        'div[data-e2e="video-player"] video',
        'video[playsinline]',
        'video'
      ]
    },
    instagram: {
      initialDelay: 1000,
      retryDelay: 600,
      maxRetries: 5,
      selectors: [
        'video.x1lliihq',
        'article video',
        'div[role="dialog"] video',
        'video'
      ]
    },
    twitter: {
      initialDelay: 600,
      retryDelay: 500,
      maxRetries: 5,
      selectors: [
        'div[data-testid="videoPlayer"] video',
        'video[src*="video.twimg.com"]',
        'video[src*="twitter.com"]',
        'video'
      ]
    },
    vimeo: {
      initialDelay: 500,
      retryDelay: 400,
      maxRetries: 4,
      selectors: [
        'video[data-vimeo-initialized]',
        'video.vp-video',
        'video'
      ]
    },
    generic: {
      initialDelay: 800,
      retryDelay: 600,
      maxRetries: 6,
      selectors: [
        'main video',
        'article video',
        'div[role="main"] video',
        'div[class*="video" i] video',
        'div[class*="player" i] video',
        'div[id*="video" i] video',
        'div[id*="player" i] video',
        'video'
      ]
    }
  };
  
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.generic;
  
  // Start video detection and auto-trigger PiP
  initialize();
  
  async function initialize() {
    await findVideoWithRetry();
    
    if (foundVideo) {
      createControlDock();
      
      if (!autoPipAttempted) {
        tryAutoPipImmediate();
      }
    }
  }
  
  async function findVideoWithRetry() {
    await sleep(config.initialDelay);
    
    let retries = 0;
    
    while (retries < config.maxRetries) {
      const video = findVideo();
      
      if (video && video.readyState >= 1) {
        foundVideo = video;
        return;
      }
      
      retries++;
      await sleep(config.retryDelay);
    }
  }
  
  function findVideo() {
    for (const selector of config.selectors) {
      let videos = Array.from(document.querySelectorAll(selector))
        .filter(v => v.readyState > 0)
        .filter(v => !v.disablePictureInPicture);
      
      videos = videos.filter(v => !isAdOrHiddenVideo(v));
      
      if (videos.length === 0) {
        continue;
      }
      
      videos = videos.map(v => ({
        element: v,
        score: calculateVideoScore(v)
      }))
      .sort((a, b) => b.score - a.score);
      
      if (videos.length > 0) {
        const bestVideo = videos[0].element;
        bestVideo.setAttribute('data-found-by', selector);
        return bestVideo;
      }
    }
    
    return null;
  }
  
  // SMART FILTERING: Detect and skip ad/hidden videos
  function isAdOrHiddenVideo(video) {
    const style = window.getComputedStyle(video);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return true;
    }
    
    const rect = video.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) {
      return true;
    }
    
    if (rect.bottom < 0 || rect.top > window.innerHeight || 
        rect.right < 0 || rect.left > window.innerWidth) {
      return true;
    }
    
    if (platform === 'facebook') {
      const parent = video.closest('div');
      if (parent) {
        if (parent.querySelector('[data-ad-preview], [data-ad-comet-preview]')) {
          return true;
        }
        
        const parentWidth = parent.offsetWidth;
        if (parentWidth < 300) {
          return true;
        }
      }
    }
    
    const adAttributes = ['ad', 'advertisement', 'sponsor', 'promoted'];
    const videoClasses = video.className.toLowerCase();
    const videoId = video.id.toLowerCase();
    
    for (const adWord of adAttributes) {
      if (videoClasses.includes(adWord) || videoId.includes(adWord)) {
        return true;
      }
    }
    
    return false;
  }
  
  // SMART SCORING: Calculate video importance score
  function calculateVideoScore(video) {
    let score = 0;
    
    const videoSize = (video.videoWidth || 0) * (video.videoHeight || 0);
    score += videoSize / 1000;
    
    const rect = video.getBoundingClientRect();
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const videoCenterX = rect.left + rect.width / 2;
    const videoCenterY = rect.top + rect.height / 2;
    const distanceFromCenter = Math.sqrt(
      Math.pow(videoCenterX - viewportCenterX, 2) + 
      Math.pow(videoCenterY - viewportCenterY, 2)
    );
    const maxDistance = Math.sqrt(
      Math.pow(viewportCenterX, 2) + 
      Math.pow(viewportCenterY, 2)
    );
    const centerScore = (1 - (distanceFromCenter / maxDistance)) * 1000;
    score += centerScore;
    
    let element = video;
    let depth = 0;
    while (element.parentElement && depth < 20) {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      const id = element.id.toLowerCase();
      const className = element.className.toString().toLowerCase();
      
      if (tag === 'main' || role === 'main') {
        score += 500;
      }
      if (tag === 'article') {
        score += 300;
      }
      if (id.includes('main') || className.includes('main')) {
        score += 200;
      }
      if (id.includes('content') || className.includes('content')) {
        score += 150;
      }
      
      if (id.includes('sidebar') || className.includes('sidebar') ||
          id.includes('suggestion') || className.includes('suggestion') ||
          id.includes('related') || className.includes('related')) {
        score -= 500;
      }
      
      element = element.parentElement;
      depth++;
    }
    
    if (platform === 'facebook') {
      const fbContainer = video.closest('[data-pagelet*="Watch"], [data-pagelet*="Video"]');
      if (fbContainer) {
        score += 1000;
      }
      
      if (video.hasAttribute('data-video-id')) {
        score += 500;
      }
    }
    
    if (!video.paused) {
      score += 200;
    }
    
    const src = video.src || video.currentSrc || '';
    if (src.includes('fbcdn') || src.includes('facebook')) {
      score += 100;
    }
    
    return score;
  }
  
  function tryAutoPipImmediate() {
    if (!foundVideo || autoPipAttempted) {
      return;
    }
    
    autoPipAttempted = true;
    
    prepareVideoForPip(foundVideo);
    setupSeekDetection(foundVideo);
    
    setTimeout(() => {
      activatePipNow(foundVideo);
    }, 100);
  }
  
  function setupSeekDetection(video) {
    video.addEventListener("seeking", () => {
      isSeeking = true;
      lastSeekTime = Date.now();
    });
    
    video.addEventListener("seeked", () => {
      isSeeking = false;
    });
  }
  
  function prepareVideoForPip(video) {
    if (!video.hasAttribute("controls")) {
      video.setAttribute("controls", "true");
    }
    
    if (video.muted) {
      video.muted = false;
    }
    
    if (typeof pipVolume === "number" && pipVolume >= 0 && pipVolume <= 1) {
      video.volume = pipVolume;
    }
  }
  
  async function activatePipNow(video) {
    try {
      if (isSeeking || (Date.now() - lastSeekTime < 500)) {
        await sleep(300);
      }
      
      await video.requestPictureInPicture();
      
      video.setAttribute("__pip__", "true");
      
      window.postMessage({
        type: "CHILL_PIP_ACTIVATED"
      }, "*");
      
      window.postMessage({
        type: "CHILL_MINIMIZE_POPUP"
      }, "*");
      
      video.addEventListener("leavepictureinpicture", () => {
        video.removeAttribute("__pip__");
      }, { once: true });
      
      video.addEventListener("volumechange", () => {
        if (video.muted && document.pictureInPictureElement === video && !isSeeking) {
          video.muted = false;
        }
      });
      
      const pipButton = document.getElementById(PIP_BUTTON_ID);
      if (pipButton) {
        pipButton.textContent = "PiP Active ✓";
        pipButton.style.background = "rgba(0,255,149,0.2)";
        pipButton.disabled = false;
      }
      
    } catch (error) {
      console.warn("[Chill Universal] Immediate auto-PiP failed:", error.message);
      
      window.postMessage({
        type: "CHILL_PIP_FAILED",
        error: error.message
      }, "*");
    }
  }
  
  function createControlDock() {
    const dock = document.createElement("div");
    dock.id = DOCK_ID;
    Object.assign(dock.style, {
      position: "fixed",
      display: "flex",
      gap: "8px",
      zIndex: "999999",
      flexWrap: "wrap"
    });
    updateDockPosition(dock);
    
    const pipButton = document.createElement("button");
    pipButton.id = PIP_BUTTON_ID;
    pipButton.textContent = "Let's Chill";
    Object.assign(pipButton.style, {
      padding: "12px 20px",
      background: "rgba(0,0,0,0.7)",
      color: "#fff",
      border: "2px solid #00ff95",
      borderRadius: "8px",
      fontFamily: "Consolas, 'Fira Code', monospace",
      cursor: "pointer",
      fontSize: "16px",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      boxShadow: "0 4px 12px rgba(0, 255, 149, 0.3)",
      transition: "all 0.2s ease"
    });
    
    pipButton.addEventListener("mouseenter", () => {
      pipButton.style.transform = "scale(1.05)";
      pipButton.style.boxShadow = "0 6px 16px rgba(0, 255, 149, 0.5)";
    });
    pipButton.addEventListener("mouseleave", () => {
      pipButton.style.transform = "scale(1)";
      pipButton.style.boxShadow = "0 4px 12px rgba(0, 255, 149, 0.3)";
    });
    
    pipButton.addEventListener("click", async () => {
      const originalText = pipButton.textContent;
      pipButton.textContent = "Loading...";
      pipButton.disabled = true;
      pipButton.style.cursor = "wait";
      
      try {
        await triggerPip(foundVideo);
        
        pipButton.textContent = "PiP Active ✓";
        pipButton.style.background = "rgba(0,255,149,0.2)";
        
        window.postMessage({
          type: "CHILL_MINIMIZE_POPUP"
        }, "*");
        
        setTimeout(() => {
          pipButton.textContent = originalText;
          pipButton.style.background = "rgba(0,0,0,0.7)";
          pipButton.style.cursor = "pointer";
          pipButton.disabled = false;
        }, 2000);
        
      } catch (error) {
        console.error("[Chill Universal] PiP activation failed:", error);
        pipButton.textContent = "Try Again";
        pipButton.style.cursor = "pointer";
        pipButton.disabled = false;
      }
    });
    
    dock.appendChild(pipButton);
    document.body.appendChild(dock);
  }
  
  function updateDockPosition(dock) {
    const margin = "16px";
    
    if (dockPosition.includes("bottom")) {
      dock.style.bottom = margin;
    } else {
      dock.style.top = margin;
    }
    
    if (dockPosition.includes("right")) {
      dock.style.right = margin;
    } else {
      dock.style.left = margin;
    }
  }
  
  async function triggerPip(video) {
    if (!video) {
      throw new Error("No video available");
    }
    
    prepareVideoForPip(video);
    
    if (isSeeking || (Date.now() - lastSeekTime < 500)) {
      await sleep(300);
    }
    
    await video.requestPictureInPicture();
    
    video.setAttribute("__pip__", "true");
    
    video.addEventListener("leavepictureinpicture", () => {
      video.removeAttribute("__pip__");
    }, { once: true });
    
    video.addEventListener("volumechange", () => {
      if (video.muted && document.pictureInPictureElement === video && !isSeeking) {
        video.muted = false;
      }
    });
  }
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
