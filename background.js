const DEFAULT_SETTINGS = {
  width: 640,
  height: 360,
  position: "bottom-right"
};

const HISTORY_KEY = "ypipHistory";
const MAX_HISTORY_ITEMS = 30;
const CONTEXT_MENU_ADD_ID = "chill-add-menu";
const CONTEXT_MENU_OPEN_ID = "chill-open-panel";
const MINI_WINDOW_NAME = "chill-mini-window";
const FALLBACK_TITLE = "No Title";

let activeWindowId = null;

initializeSidePanel();
initializeContextMenus();
chrome.runtime.onInstalled.addListener(() => {
  initializeSidePanel();
  initializeContextMenus();
});
chrome.runtime.onStartup.addListener(() => {
  initializeSidePanel();
  initializeContextMenus();
});
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === activeWindowId) {
    activeWindowId = null;
  }
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ADD_ID) {
    const targetUrl = info.linkUrl || info.pageUrl;
    if (!targetUrl) {
      return;
    }
    addUrlToHistory(targetUrl)
      .then(() => {
        if (tab?.windowId) {
          openSidePanel(tab.windowId);
        }
      })
      .catch((error) => console.warn("Unable to add Chill link", error));
  } else if (info.menuItemId === CONTEXT_MENU_OPEN_ID) {
    if (tab?.windowId) {
      openSidePanel(tab.windowId);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "OPEN_YOUTUBE":
      openYoutubeWindow(message.payload)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Unknown error" }));
      return true;
    case "STOP_YOUTUBE":
      stopYoutubeWindow()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Unknown error" }));
      return true;
    case "ADD_TO_HISTORY": {
      const targetUrl = message?.payload?.url;
      const senderTabId = _sender?.tab?.id;
      addUrlToHistory(targetUrl)
        .then(() => {
          sendResponse({ ok: true });
          if (senderTabId && _sender?.tab?.windowId) {
            openSidePanel(_sender.tab.windowId);
          }
        })
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Unable to add" }));
      return true;
    }
    case "MINIMIZE_CHILL_WINDOW":
      minimizeActiveWindow()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Unable to minimize" }));
      return true;
    default:
      return undefined;
  }
});

function initializeSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }
  const result = chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  if (result && typeof result.catch === "function") {
    result.catch((error) => console.warn("Unable to set side panel behavior", error));
  }
}

function initializeContextMenus() {
  if (!chrome.contextMenus?.removeAll) {
    return;
  }
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_OPEN_ID,
      title: "Open Chill While Working",
      contexts: ["page", "selection", "link", "image", "video", "audio"]
    });

    chrome.contextMenus.create({
      id: CONTEXT_MENU_ADD_ID,
      title: "Add to Chill List",
      contexts: ["page", "link"],
      documentUrlPatterns: [
        "https://www.youtube.com/*",
        "https://m.youtube.com/*",
        "https://music.youtube.com/*",
        "https://youtu.be/*"
      ]
    });
  });
}

async function openYoutubeWindow(payload) {
  const { url, width, height, position } = normalizePayload(payload);
  if (!url) {
    throw new Error("Missing URL");
  }

  await closeActiveWindow();

  const launchUrl = tagUrlForExtension(url);
  const display = await getPrimaryDisplay();
  const bounds = display?.workArea || display?.bounds;
  if (!bounds) {
    throw new Error("Unable to read display bounds");
  }

  const { left, top } = calculatePosition(bounds, width, height, position);
  const createdWindow = await chrome.windows.create({
    url: launchUrl,
    type: "popup",
    width,
    height,
    left,
    top,
    focused: true
  });

  activeWindowId = createdWindow.id ?? null;
  const tabId = createdWindow.tabs?.[0]?.id;

  if (typeof tabId === "number") {
    await waitForTabComplete(tabId);
    await markMiniWindow(tabId);
    await applyMinimalUi(tabId);
    notifyMiniMode(tabId, position);
  }
}

async function stopYoutubeWindow() {
  await closeActiveWindow();
}

async function minimizeActiveWindow() {
  if (!activeWindowId) {
    return;
  }
  try {
    await chrome.windows.update(activeWindowId, { state: "minimized" });
  } catch (error) {
    if (!String(error?.message || "").includes("No window with id")) {
      throw error;
    }
  }
}

async function closeActiveWindow() {
  if (!activeWindowId) {
    return;
  }
  try {
    await chrome.windows.remove(activeWindowId);
  } catch (error) {
    if (!String(error?.message || "").includes("No window with id")) {
      console.warn("Failed to close PiP window", error);
    }
  } finally {
    activeWindowId = null;
  }
}

function normalizePayload(payload = {}) {
  const width = clampNumber(Number(payload.width) || DEFAULT_SETTINGS.width, 200, 2000);
  const height = clampNumber(Number(payload.height) || DEFAULT_SETTINGS.height, 150, 1500);
  const position = typeof payload.position === "string" ? payload.position : DEFAULT_SETTINGS.position;
  return { url: payload.url, width, height, position };
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value) || value <= 0) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function getPrimaryDisplay() {
  return new Promise((resolve, reject) => {
    chrome.system.display.getInfo((displays) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      if (!displays || displays.length === 0) {
        reject(new Error("No displays detected"));
        return;
      }
      const primary = displays.find((display) => display.isPrimary) || displays[0];
      resolve(primary);
    });
  });
}

function calculatePosition(bounds, width, height, position) {
  const normalized = ["bottom-right", "top-right", "bottom-left", "top-left"].includes(position)
    ? position
    : DEFAULT_SETTINGS.position;

  const margin = 16;
  let left = bounds.left + bounds.width - width - margin;
  let top = bounds.top + bounds.height - height - margin;

  if (normalized.includes("left")) {
    left = bounds.left + margin;
  }
  if (normalized.includes("top")) {
    top = bounds.top + margin;
  }

  return {
    left: Math.max(bounds.left, left),
    top: Math.max(bounds.top, top)
  };
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }
      if (tab?.status === "complete") {
        resolve();
        return;
      }
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function applyMinimalUi(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["youtube_inject.css"]
    });
  } catch (error) {
    console.warn("Failed to inject CSS", error);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["youtube_inject.js"]
    });
  } catch (error) {
    console.warn("Failed to inject JS", error);
  }
}

function tagUrlForExtension(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("ypip_ext", "1");
    return url.toString();
  } catch (_error) {
    return rawUrl;
  }
}

async function markMiniWindow(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (name) => {
        try {
          window.name = name;
        } catch (_error) {
          /* ignored */
        }
      },
      args: [MINI_WINDOW_NAME]
    });
  } catch (error) {
    console.warn("Failed to mark mini window", error);
  }
}

function notifyMiniMode(tabId, position) {
  try {
    chrome.tabs.sendMessage(tabId, { 
      type: "CHILL_MINI_MODE", 
      value: true,
      position: position || DEFAULT_SETTINGS.position
    });
  } catch (error) {
    console.warn("Unable to notify mini mode", error);
  }
}

async function openSidePanel(windowId) {
  if (!chrome.sidePanel?.open) {
    return;
  }
  try {
    await chrome.sidePanel.open({ windowId });
  } catch (error) {
    console.warn("Unable to open side panel", error);
  }
}

async function addUrlToHistory(url) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error("URL must be a YouTube link");
  }
  const [entries, title] = await Promise.all([getHistoryEntries(), resolveVideoTitle(url)]);
  const timestamp = Date.now();
  const newEntry = {
    url,
    title,
    addedAt: timestamp,
    createdTime: new Date(timestamp).toISOString()
  };
  const updated = [newEntry, ...entries.filter((entry) => entry.url !== url)].slice(0, MAX_HISTORY_ITEMS);
  await setHistoryEntries(updated);
}

function getHistoryEntries() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ [HISTORY_KEY]: [] }, (data) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      const stored = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
      resolve(stored);
    });
  });
}

function setHistoryEntries(entries) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [HISTORY_KEY]: entries }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

async function resolveVideoTitle(url) {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error("oEmbed failed");
    }
    const data = await response.json();
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    return title || FALLBACK_TITLE;
  } catch (_error) {
    return FALLBACK_TITLE;
  }
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
