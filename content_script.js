const defaultSettings = {
  width: 640,
  height: 360,
  position: "bottom-right",
  autoNext: true
};

const BUTTON_ID = "ypip-launch-button";
const EXTENSION_MARKER = "ypip_ext";
const MINI_WINDOW_NAME = "chill-mini-window";
let observer;
let forcedMiniWindow = false;

if (!isExtensionWindow()) {
  init();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CHILL_MINI_MODE") {
    forcedMiniWindow = Boolean(message.value);
    removeButton();
  }
});

function init() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton);
  } else {
    ensureButton();
  }

  observer = new MutationObserver(() => ensureButton());
  observer.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true
  });

  window.addEventListener("yt-navigate-finish", ensureButton);
}

function ensureButton() {
  if (isExtensionWindow()) {
    removeButton();
    return;
  }
  const shouldShow = isWatchContext();
  const existing = document.getElementById(BUTTON_ID);

  if (!shouldShow && existing) {
    existing.remove();
    return;
  }

  if (shouldShow && !existing) {
    injectButton();
  }
}

function removeButton() {
  const existing = document.getElementById(BUTTON_ID);
  if (existing) {
    existing.remove();
  }
}

function isExtensionWindow() {
  if (forcedMiniWindow) {
    return true;
  }
  if (window.name === MINI_WINDOW_NAME) {
    return true;
  }
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(EXTENSION_MARKER) === "1";
  } catch (_error) {
    return false;
  }
}

function isWatchContext() {
  const host = location.hostname.replace(/^www\./, "").toLowerCase();
  const path = location.pathname;
  if (host === "youtu.be") {
    return true;
  }
  if (path.startsWith("/watch") || path.startsWith("/shorts") || path.startsWith("/live")) {
    return true;
  }
  return Boolean(document.querySelector("video.html5-main-video"));
}

function injectButton() {
  if (!document.body) {
    return;
  }
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "Add to Chill List";
  Object.assign(button.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    zIndex: 100000,
    padding: "10px 16px",
    background: "rgba(0, 0, 0, 0.75)",
    color: "#00ff95",
    border: "1px solid #00ff95",
    borderRadius: "999px",
    fontFamily: "Consolas, 'Fira Code', monospace",
    fontSize: "12px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
    transition: "transform 0.2s ease, opacity 0.2s ease"
  });
  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-2px)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0)";
  });
  button.addEventListener("click", () => addCurrentPage(button));
  document.body.appendChild(button);
}

function addCurrentPage(button) {
  if (button.dataset.busy === "1") {
    return;
  }
  const url = window.location.href;
  if (!isValidYoutubeUrl(url)) {
    showButtonStatus(button, "Invalid", 1500);
    return;
  }

  button.dataset.busy = "1";
  const originalLabel = "Add to Chill List";
  button.textContent = "Saving...";

  sendAddToHistory(url)
    .then(() => {
      showButtonStatus(button, "Added!", 1200, originalLabel);
    })
    .catch((error) => {
      console.warn("Failed to add Chill link", error);
      showButtonStatus(button, "Error", 1500, originalLabel);
    })
    .finally(() => {
      delete button.dataset.busy;
    });
}

function showButtonStatus(button, status, timeout, resetLabel = "Add to Chill List") {
  button.textContent = status;
  setTimeout(() => {
    button.textContent = resetLabel;
  }, timeout);
}

function sendAddToHistory(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "ADD_TO_HISTORY", payload: { url } }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      if (response?.ok) {
        resolve();
      } else {
        reject(new Error(response?.error || "Request failed"));
      }
    });
  });
}

function isValidYoutubeUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return /(?:youtube\.com|youtu\.be)$/i.test(parsed.hostname.replace(/^www\./, ""));
  } catch (_error) {
    return false;
  }
}
