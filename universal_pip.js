// Universal Picture-in-Picture Support
// Works with all HTML5 videos on any website (YouTube, Facebook, TikTok, etc.)
// Auto-detects videos and injects floating buttons for easy PiP access

(() => {
  const UNIVERSAL_PIP_MARKER = "__universal_pip__";
  const PIP_BUTTON_ID = "chill-pip-button";
  const ADD_BUTTON_ID = "chill-add-button";
  const BUTTON_CHECK_INTERVAL = 2000;
  
  let videosObserver = null;
  let lastVideoCheck = 0;
  let isPopupMode = false;
  let extensionEnabled = true;

  // Listen for extension state changes
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "EXTENSION_STATE_CHANGED") {
        extensionEnabled = message.enabled;
        
        if (!extensionEnabled) {
          // Remove buttons when disabled
          removeButtons();
        } else {
          // Re-inject buttons when enabled
          injectButtonsIfNeeded();
        }
        
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  // Check if running in any popup window (YouTube or Universal)
  // MUST run FIRST before anything else
  function isInPopupWindow() {
    // Method 1: Check window.name (set by background.js)
    if (window.name === "chill-mini-window" || window.name === "chill-universal-popup") {
      return true;
    }
    
    // Method 2: Check metadata (set by background.js for universal popup)
    if (typeof window.__chillPopup !== "undefined") {
      return true;
    }
    
    // Method 3: Check URL parameters
    try {
      const url = new URL(window.location.href);
      const hasYouTubeParam = url.searchParams.get("ypip_ext") === "1";
      const hasUniversalParam = url.searchParams.get("chill_popup") === "1";
      
      if (hasYouTubeParam) {
        return true;
      }
      if (hasUniversalParam) {
        return true;
      }
    } catch (e) {
      // Invalid URL, continue
    }
    
    // Method 4: Check window.opener (popup opened by window.open)
    if (window.opener !== null && window.opener !== window) {
      return true;
    }
    
    return false;
  }

  // Initialize - CHECK POPUP MODE FIRST!
  function initialize() {
    // CRITICAL: Check popup mode BEFORE doing anything else
    isPopupMode = isInPopupWindow();
    
    if (isPopupMode) {
      // Popup mode detected, apply popup-specific logic
      
      // ADD CLASS TO BODY to trigger CSS hiding (failsafe)
      document.body.classList.add("chill-popup-window");
      
      // FORCE REMOVE any existing buttons immediately
      const existingPipButton = document.getElementById(PIP_BUTTON_ID);
      const existingAddButton = document.getElementById(ADD_BUTTON_ID);
      if (existingPipButton) existingPipButton.remove();
      if (existingAddButton) existingAddButton.remove();
      
      // STOP HERE - don't inject buttons, don't observe, don't do anything
      return;
    }
    
    // Normal mode - load extension enabled state from storage
    chrome.storage.sync.get({ extensionEnabled: true }, (data) => {
      extensionEnabled = data.extensionEnabled !== false;
      
      if (!extensionEnabled) {
        return;
      }
      
      // Wait for page to be fully loaded before checking video detail page
      const startInjection = () => {
        // Initial check
        injectButtonsIfNeeded();
        
        // Watch for new videos added dynamically AND URL changes
        videosObserver = new MutationObserver(() => {
          if (!isPopupMode && extensionEnabled) {
            injectButtonsIfNeeded();
          }
        });
        
        videosObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      };
      
      // Start injection when DOM is ready
      if (document.readyState === "complete" || document.readyState === "interactive") {
        // Page already loaded
        setTimeout(startInjection, 500); // Small delay to ensure DOM is stable
      } else {
        // Wait for load
        window.addEventListener("load", () => {
          setTimeout(startInjection, 500);
        });
      }
      
      // IMPORTANT: Listen for navigation changes (SPA support)
      let lastUrl = window.location.href;
      new MutationObserver(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          // Re-check after URL change
          setTimeout(injectButtonsIfNeeded, 1000);
        }
      }).observe(document.querySelector("title") || document.body, {
        subtree: true,
        childList: true
      });
    });
  }

  // Find the largest playing video on the page
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

  // Create floating PiP button
  function createPipButton() {
    // SAFETY CHECK: Never create in popup mode
    if (isPopupMode) {
      return;
    }
    
    if (document.getElementById(PIP_BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = PIP_BUTTON_ID;
    button.className = "chill-floating-button chill-floating-button--pip";
    button.innerHTML = '<span class="chill-floating-button__icon">📺</span>Chill PiP';
    button.title = "Save and play video in popup window";

    button.addEventListener("click", async () => {
      button.classList.add("chill-floating-button--loading");
      button.textContent = "Loading...";
      
      try {
        // Detect platform
        const platform = detectPlatform();
        
        // Extract video data
        const videoData = {
          url: window.location.href,
          title: document.title,
          platform: platform
        };
        
        // Save to history first
        const saveResponse = await sendMessageToBackground({
          type: "ADD_TO_HISTORY",
          payload: videoData
        });
        
        if (!saveResponse?.ok) {
          throw new Error(saveResponse?.error || "Failed to save to history");
        }
        
        // Get user settings from storage
        const settings = await getUserSettings();
        
        // Route based on platform
        if (platform === "youtube") {
          // Use existing YouTube mode WITH settings
          const playResponse = await sendMessageToBackground({
            type: "OPEN_YOUTUBE",
            payload: { 
              url: videoData.url,
              width: settings.width,
              height: settings.height,
              position: settings.position
            }
          });
          
          if (!playResponse?.ok) {
            throw new Error(playResponse?.error || "Failed to open YouTube popup");
          }
        } else {
          // Use new universal mode WITH settings
          const playResponse = await sendMessageToBackground({
            type: "OPEN_UNIVERSAL_POPUP",
            payload: {
              url: videoData.url,
              platform: platform,
              width: settings.width,
              height: settings.height,
              position: settings.position
            }
          });
          
          if (!playResponse?.ok) {
            throw new Error(playResponse?.error || "Failed to open popup");
          }
        }
        
        button.classList.remove("chill-floating-button--loading");
        button.classList.add("chill-floating-button--success");
        button.innerHTML = '<span class="chill-floating-button__icon">✓</span>Playing';
        
        setTimeout(() => {
          button.classList.remove("chill-floating-button--success");
          button.innerHTML = '<span class="chill-floating-button__icon">📺</span>Chill PiP';
        }, 2000);
      } catch (error) {
        console.error("[Chill PiP] Error:", error);
        button.classList.remove("chill-floating-button--loading");
        button.classList.add("chill-floating-button--error");
        button.textContent = "Error";
        
        setTimeout(() => {
          button.classList.remove("chill-floating-button--error");
          button.innerHTML = '<span class="chill-floating-button__icon">📺</span>Chill PiP';
        }, 2000);
      }
    });

    document.body.appendChild(button);
  }

  // Create floating "Add to Chill List" button
  function createAddButton() {
    // SAFETY CHECK: Never create in popup mode
    if (isPopupMode) {
      return;
    }
    
    if (document.getElementById(ADD_BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = ADD_BUTTON_ID;
    button.className = "chill-floating-button chill-floating-button--add";
    button.innerHTML = '<span class="chill-floating-button__icon">➕</span>Add to Chill List';
    button.title = "Add current page to Chill List";

    button.addEventListener("click", async () => {
      button.classList.add("chill-floating-button--loading");
      button.textContent = "Saving...";
      
      try {
        // Extract video information
        const videoData = extractVideoData();
        
        const response = await sendMessageToBackground({
          type: "ADD_TO_HISTORY",
          payload: videoData
        });
        
        if (response?.ok) {
          button.classList.remove("chill-floating-button--loading");
          button.classList.add("chill-floating-button--success");
          button.innerHTML = '<span class="chill-floating-button__icon">✓</span>Added!';
          
          setTimeout(() => {
            button.classList.remove("chill-floating-button--success");
            button.innerHTML = '<span class="chill-floating-button__icon">➕</span>Add to Chill List';
          }, 2000);
        } else {
          throw new Error(response?.error || "Failed to add");
        }
      } catch (error) {
        console.error("[Add to Chill List] Error:", error);
        button.classList.remove("chill-floating-button--loading");
        button.classList.add("chill-floating-button--error");
        button.textContent = "Error";
        
        setTimeout(() => {
          button.classList.remove("chill-floating-button--error");
          button.innerHTML = '<span class="chill-floating-button__icon">➕</span>Add to Chill List';
        }, 2000);
      }
    });

    document.body.appendChild(button);
  }

  // Extract video data (URL, title, thumbnail)
  function extractVideoData() {
    const video = findLargestPlayingVideo();
    const pageUrl = window.location.href;
    const pageTitle = document.title || "Untitled Video";
    
    let videoUrl = pageUrl;
    let videoSrc = null;
    let thumbnail = null;

    if (video) {
      videoSrc = video.currentSrc || video.src || null;
      thumbnail = video.poster || null;

      if (videoSrc && !videoSrc.startsWith("blob:") && !videoSrc.startsWith("data:")) {
        videoUrl = videoSrc;
      }

      if (videoSrc && videoSrc.startsWith("blob:")) {
        const dataUrl = video.getAttribute("data-src") || 
                       video.getAttribute("data-video-url") ||
                       video.getAttribute("data-source");
        if (dataUrl) {
          videoUrl = dataUrl;
          videoSrc = dataUrl;
        }
      }
    }

    return {
      url: pageUrl,
      videoUrl: videoSrc,
      title: pageTitle,
      thumbnail: thumbnail
    };
  }

  // Platform detection function
  function detectPlatform() {
    const hostname = window.location.hostname.replace(/^www\./, "");
    
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      return "youtube";
    }
    if (hostname.includes("facebook.com") || hostname.includes("fb.com")) {
      return "facebook";
    }
    if (hostname.includes("tiktok.com")) {
      return "tiktok";
    }
    if (hostname.includes("instagram.com")) {
      return "instagram";
    }
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      return "twitter";
    }
    if (hostname.includes("vimeo.com")) {
      return "vimeo";
    }
    
    return "generic";
  }

  // Check if current page is a video detail page (not homepage/feed)
  function isVideoDetailPage() {
    const url = window.location.href;
    const pathname = window.location.pathname;
    const hostname = window.location.hostname.replace(/^www\./, "");
    
    // YouTube: ONLY /watch, /shorts, /live - NOT homepage or other pages
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
      // Youtu.be SHORT LINKS - always video page
      if (hostname.includes("youtu.be") && pathname !== "/") {
        return true;
      }
      
      // YouTube.com - check specific paths
      if (hostname.includes("youtube.com")) {
        // EXPLICIT video page patterns
        if (pathname.startsWith("/watch") || 
            pathname.startsWith("/shorts/") || 
            pathname.startsWith("/live/")) {
          return true;
        }
        
        // EXPLICIT non-video pages
        if (pathname === "/" || 
            pathname === "/feed/trending" ||
            pathname === "/feed/subscriptions" ||
            pathname === "/feed/library" ||
            pathname === "/feed/history" ||
            pathname.startsWith("/channel/") ||
            pathname.startsWith("/c/") ||
            pathname.startsWith("/user/") ||
            pathname.startsWith("/@") ||
            pathname.startsWith("/results") ||
            pathname.startsWith("/playlist")) {
          return false;
        }
      }
      
      // If not matched above, assume NOT video page for YouTube
      return false;
    }
    
    // Facebook: /watch, /reel, /video, /permalink, specific video patterns
    if (hostname.includes("facebook.com") || hostname.includes("fb.com")) {
      if (pathname.includes("/watch") || 
          pathname.includes("/reel") || 
          pathname.includes("/video") || 
          pathname.includes("/videos/") ||
          pathname.includes("/permalink.php") ||
          url.match(/\/\d+\/videos\/\d+/)) {
        return true;
      }
      return false;
    }
    
    // TikTok: /@username/video/ID
    if (hostname.includes("tiktok.com")) {
      if (pathname.match(/@[\w.-]+\/video\/\d+/)) {
        return true;
      }
      return false;
    }
    
    // Instagram: /p/, /reel/, /tv/
    if (hostname.includes("instagram.com")) {
      if (pathname.includes("/p/") || 
          pathname.includes("/reel/") || 
          pathname.includes("/tv/")) {
        return true;
      }
      return false;
    }
    
    // Twitter: /status/
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
      if (pathname.includes("/status/")) {
        return true;
      }
      return false;
    }
    
    // Vimeo: /video_id or /video/
    if (hostname.includes("vimeo.com")) {
      if (pathname.match(/^\/\d+/) || pathname.includes("/video/")) {
        return true;
      }
      return false;
    }
    
    // Generic: Check if has video element AND not a known root page
    if (pathname === "/" || pathname === "") {
      return false;
    }
    
    // Check for video element
    const hasVideo = document.querySelector("video") !== null;
    if (hasVideo) {
      return true;
    }
    
    return false;
  }

  // Inject buttons when video is detected
  function injectButtonsIfNeeded() {
    // SAFETY CHECK 1: Never inject in popup mode
    if (isPopupMode) {
      return;
    }
    
    // SAFETY CHECK 2: Extension must be enabled
    if (!extensionEnabled) {
      removeButtons();
      return;
    }
    
    // CHECK 3: Only inject on video detail pages
    const isVideoPage = isVideoDetailPage();
    
    if (!isVideoPage) {
      removeButtons();
      return;
    }
    
    const now = Date.now();
    if (now - lastVideoCheck < BUTTON_CHECK_INTERVAL) {
      return;
    }
    lastVideoCheck = now;

    const video = findLargestPlayingVideo();
    const hasVideo = video !== null;
    
    // Update badge based on video detection
    updateBadge(hasVideo);
    
    if (!video) {
      // Remove buttons if no video found
      removeButtons();
      return;
    }

    createPipButton();
    createAddButton();
  }

  // Remove floating buttons
  function removeButtons() {
    const pipButton = document.getElementById(PIP_BUTTON_ID);
    const addButton = document.getElementById(ADD_BUTTON_ID);
    
    if (pipButton) {
      pipButton.remove();
    }
    if (addButton) {
      addButton.remove();
    }
  }

  // Update extension badge
  function updateBadge(videoDetected) {
    // Skip if extension context is invalid
    if (!chrome?.runtime?.id) {
      return;
    }
    
    sendMessageToBackground({
      type: "UPDATE_BADGE",
      payload: { detected: videoDetected }
    }).catch(() => {
      // Silently fail if badge update fails (not critical)
    });
  }

  // Send message to background script
  function sendMessageToBackground(message) {
    return new Promise((resolve) => {
      // Check if extension context is still valid
      if (!chrome?.runtime?.id) {
        resolve({ ok: false, error: "Extension context invalidated. Please refresh the page." });
        return;
      }

      if (!chrome?.runtime?.sendMessage) {
        resolve({ ok: false, error: "Extension context unavailable" });
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            
            // User-friendly error messages
            if (errorMsg.includes("Extension context invalidated")) {
              resolve({ ok: false, error: "Extension was reloaded. Please refresh this page." });
            } else if (errorMsg.includes("Receiving end does not exist")) {
              resolve({ ok: false, error: "Extension connection lost. Please refresh this page." });
            } else {
              resolve({ ok: false, error: errorMsg });
            }
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.error("[Chill] Send message exception:", error);
        resolve({ ok: false, error: "Failed to communicate with extension" });
      }
    });
  }

  // Get user settings from chrome.storage.sync
  function getUserSettings() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.sync) {
        // Fallback to defaults if storage not available
        resolve({
          width: 640,
          height: 360,
          position: "bottom-right"
        });
        return;
      }

      chrome.storage.sync.get(["width", "height", "position"], (result) => {
        if (chrome.runtime.lastError) {
          console.warn("[Chill] Failed to get settings:", chrome.runtime.lastError);
          resolve({
            width: 640,
            height: 360,
            position: "bottom-right"
          });
          return;
        }

        resolve({
          width: result.width || 640,
          height: result.height || 360,
          position: result.position || "bottom-right"
        });
      });
    });
  }

  // Start when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
