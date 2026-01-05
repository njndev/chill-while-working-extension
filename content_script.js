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
let isContextInvalid = false;

// IMPORTANT: This script is DEPRECATED in favor of universal_pip.js
// It only runs to handle special YouTube-specific behaviors
// Floating buttons are now handled by universal_pip.js

// Check if running in extension-created window
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
  checkExtensionContext();
  
  // IMPORTANT: Do NOT inject button anymore - universal_pip.js handles this
  // This script only removes button if it was created by old version
  removeButton();
  
  // Listen for changes to remove button if somehow created
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeButton);
  }

  observer = new MutationObserver(() => {
    // Remove button if it appears
    removeButton();
  });
  observer.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true
  });

  window.addEventListener("yt-navigate-finish", removeButton);
}

function checkExtensionContext() {
  if (!chrome?.runtime?.id) {
    isContextInvalid = true;
    cleanup();
    return false;
  }
  return true;
}

function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  removeButton();
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
