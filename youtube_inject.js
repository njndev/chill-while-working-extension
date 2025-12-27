(() => {
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
  let dockPosition = "bottom-right";
  let lastAdSkipTime = 0;
  let isProcessingAd = false;

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "CHILL_MINI_MODE" && message?.position) {
      dockPosition = message.position;
      updateDockPosition();
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
    const video = getPlayerVideo();
    if (!video) {
      return;
    }

    pipRequested = document.pictureInPictureElement === video;
    video.setAttribute("controls", "true");
    video.style.width = "100vw";
    video.style.height = "100vh";
    video.style.objectFit = "contain";
    video.style.backgroundColor = "#000";
    forceTheaterMode();
    attachDock(video);
    requestPiP(video);
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

  function attachDock(video) {
    const dock = ensureDock();
    if (!document.getElementById(pipButtonId)) {
      const pipButton = createDockButton("Let's Chill", pipButtonId);
      pipButton.addEventListener("click", () => {
        const currentVideo = getPlayerVideo() || video;
        if (currentVideo) {
          togglePiP(currentVideo);
        }
        requestWindowMinimize();
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
    try {
      await video.requestPictureInPicture();
      pipRequested = true;
    } catch (_error) {
      // ignored; user can press button later
    }
  }

  async function togglePiP(video) {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
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
      chrome.runtime.sendMessage({ type: "MINIMIZE_CHILL_WINDOW" }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_error) {
      // ignore failures
    }
  }
})();
