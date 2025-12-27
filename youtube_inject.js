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

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") {
      makePlayerPrimary();
    }
  });

  const observer = new MutationObserver(makePlayerPrimary);
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  makePlayerPrimary();

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
        const currentVideo = getPlayerVideo() || video;
        if (currentVideo) {
          skipAd(currentVideo);
        }
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
      bottom: "16px",
      right: "16px",
      display: "flex",
      gap: "8px",
      zIndex: 100000,
      flexWrap: "wrap"
    });
    document.body.appendChild(dock);
    return dock;
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
      cursor: "pointer"
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

  function skipAd(video) {
    const clickable = document.querySelector(
      ".ytp-ad-skip-button.ytp-button, .ytp-ad-overlay-close-button, .ytp-ad-skip-button-modern"
    );
    if (clickable) {
      clickable.click();
      return;
    }

    const adOverlay = document.querySelector(".ad-showing, .ytp-ad-player-overlay");
    if (adOverlay && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(video.duration - 0.1, 0);
    }
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
