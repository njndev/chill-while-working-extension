const defaultSettings = {
  width: 350,
  height: 200,
  position: "bottom-right",
  autoNext: true,
  volume: 80  // Default volume 80%
};

const HISTORY_KEY = "ypipHistory";
const THEME_KEY = "ypipTheme";
const MAX_HISTORY_ITEMS = 30;

const Themes = {
  DARK: "dark",
  LIGHT: "light"
};

document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("youtubeUrl");
  const widthInput = document.getElementById("widthInput");
  const heightInput = document.getElementById("heightInput");
  const autoNextInput = document.getElementById("autoNext");
  const volumeSlider = document.getElementById("volumeSlider");
  const volumeValue = document.getElementById("volumeValue");
  const playBtn = document.getElementById("playBtn");
  const saveBtn = document.getElementById("saveBtn");
  const stopBtn = document.getElementById("stopBtn");
  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");
  const themeToggle = document.getElementById("themeToggle");
  const extensionEnabledToggle = document.getElementById("extension-enabled");
  const extensionStatusText = document.getElementById("extension-status-text");

  let historyEntries = [];

  chrome.storage.sync.get(defaultSettings, (stored) => {
    applySettings(stored);
  });

  loadTheme();
  loadHistory();
  loadExtensionEnabledState();

  // Volume slider event listener
  volumeSlider.addEventListener("input", () => {
    const value = volumeSlider.value;
    volumeValue.textContent = `${value}%`;
    // Update CSS variable for gradient
    volumeSlider.style.setProperty("--volume-percent", `${value}%`);
  });

  // Initialize volume display
  const initialVolume = volumeSlider.value;
  volumeValue.textContent = `${initialVolume}%`;
  volumeSlider.style.setProperty("--volume-percent", `${initialVolume}%`);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && Object.prototype.hasOwnProperty.call(changes, HISTORY_KEY)) {
      const updated = Array.isArray(changes[HISTORY_KEY]?.newValue) ? changes[HISTORY_KEY].newValue : [];
      historyEntries = updated;
      renderHistory();
    }
  });

  playBtn.addEventListener("click", () => {
    startPlayback(urlInput.value.trim());
  });

  saveBtn.addEventListener("click", () => {
    const settings = readSettings();
    chrome.storage.sync.set(settings, () => {
      saveBtn.textContent = "Saved";
      setTimeout(() => (saveBtn.textContent = "Save Settings"), 1200);
    });
  });

  stopBtn.addEventListener("click", () => {
    if (stopBtn.disabled) {
      return;
    }
    const originalLabel = stopBtn.textContent;
    stopBtn.disabled = true;
    stopBtn.textContent = "Stopping...";
    sendStopRequest()
      .then(() => {
        stopBtn.textContent = "Stopped";
        setTimeout(() => {
          stopBtn.textContent = originalLabel;
          stopBtn.disabled = false;
        }, 1200);
      })
      .catch((error) => {
        console.warn("Failed to stop PiP", error);
        stopBtn.textContent = "Error";
        setTimeout(() => {
          stopBtn.textContent = originalLabel;
          stopBtn.disabled = false;
        }, 1500);
      });
  });

  historyList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    const url = button.dataset.url;
    const videoUrl = button.dataset.videoUrl || url;  // Use video URL if available
    
    if (!url) {
      return;
    }
    if (action === "play") {
      playFromHistory(url, videoUrl, button);
    } else if (action === "remove") {
      removeHistoryEntry(url);
    }
  });

  themeToggle.addEventListener("change", () => {
    const theme = themeToggle.checked ? Themes.LIGHT : Themes.DARK;
    setTheme(theme);
  });

  extensionEnabledToggle.addEventListener("change", () => {
    const isEnabled = extensionEnabledToggle.checked;
    extensionStatusText.textContent = isEnabled ? "Enabled" : "Disabled";
    
    chrome.storage.sync.set({ extensionEnabled: isEnabled }, () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            type: "EXTENSION_STATE_CHANGED",
            enabled: isEnabled
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        });
      });
    });
  });

  function startPlayback(rawUrl) {
    const urlValue = rawUrl.trim();
    if (!isValidUrl(urlValue)) {
      alert("Please enter a valid video URL.");
      return;
    }

    const settings = readSettings();
    const isYouTube = isValidYoutubeUrl(urlValue);
    
    if (isYouTube) {
      // Use YouTube-specific mode with full features
      const finalUrl = buildPlayableUrl(urlValue, settings.autoNext);
      if (!finalUrl) {
        alert("Unable to process the provided URL.");
        return;
      }

      openPipWindow({
        url: finalUrl,
        width: settings.width,
        height: settings.height,
        position: settings.position,
        autoNext: settings.autoNext,
        volume: settings.volume  // Pass volume setting
      })
        .then(() => addToHistory(urlValue))
        .catch((error) => {
          alert(error?.message || "Unable to open PiP window.");
        });
    } else {
      // Use universal popup mode for other videos
      const platform = detectPlatformFromUrl(urlValue);
      
      openUniversalPopup({
        url: urlValue,
        platform: platform,
        width: settings.width,
        height: settings.height,
        position: settings.position,
        volume: settings.volume  // Pass volume setting
      })
        .then(() => addToHistory(urlValue))
        .catch((error) => {
          alert(error?.message || "Unable to open PiP window.");
        });
    }
  }

  function readSettings() {
    const width = parseInt(widthInput.value) || 640;
    const height = parseInt(heightInput.value) || 360;
    const position = document.querySelector('input[name="position"]:checked')?.value || "bottom-right";
    const volume = parseInt(volumeSlider.value) || 80;
    return { width, height, position, volume };
  }

  function applySettings(settings) {
    widthInput.value = settings.width ?? defaultSettings.width;
    heightInput.value = settings.height ?? defaultSettings.height;
    autoNextInput.checked = settings.autoNext ?? defaultSettings.autoNext;
    
    const volume = settings.volume ?? defaultSettings.volume;
    volumeSlider.value = volume;
    volumeValue.textContent = `${volume}%`;
    volumeSlider.style.setProperty("--volume-percent", `${volume}%`);
    
    const radio = document.querySelector(`input[name="position"][value="${settings.position}"]`);
    if (radio) {
      radio.checked = true;
    }
  }

  function loadTheme() {
    chrome.storage.local.get({ ypipTheme: "dark" }, (data) => {
      const theme = data.ypipTheme || "dark";
      document.body.setAttribute("data-theme", theme);
    });
  }

  function setTheme(theme) {
    const normalized = theme === Themes.LIGHT ? Themes.LIGHT : Themes.DARK;
    chrome.storage.local.set({ [THEME_KEY]: normalized });
    applyThemeToDocument(normalized);
  }

  function applyThemeToDocument(theme) {
    const normalized = theme === Themes.LIGHT ? Themes.LIGHT : Themes.DARK;
    document.body.dataset.theme = normalized;
    themeToggle.checked = normalized === Themes.LIGHT;
  }

  function loadHistory() {
    chrome.storage.local.get({ [HISTORY_KEY]: [] }, (data) => {
      const stored = Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
      historyEntries = stored;
      renderHistory();
    });
  }

  function loadExtensionEnabledState() {
    chrome.storage.sync.get({ extensionEnabled: true }, (data) => {
      const isEnabled = data.extensionEnabled !== false;
      extensionEnabledToggle.checked = isEnabled;
      extensionStatusText.textContent = isEnabled ? "Enabled" : "Disabled";
    });
  }

  function addToHistory(url) {
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

  function removeHistoryEntry(url) {
    historyEntries = historyEntries.filter((entry) => entry.url !== url);
    chrome.storage.local.set({ [HISTORY_KEY]: historyEntries }, renderHistory);
  }

  function renderHistory() {
    historyList.innerHTML = "";
    if (!historyEntries.length) {
      historyEmpty.hidden = false;
      return;
    }
    historyEmpty.hidden = true;
    historyEntries.forEach((entry) => {
      const normalizedTitle = typeof entry.title === "string" && entry.title.trim().length ? entry.title.trim() : "No Title";
      const normalizedUrl = entry.url || "";
      const videoUrl = entry.videoUrl || normalizedUrl;  // Prefer video URL for display
      const createdAt = formatTimestamp(entry.createdTime || entry.addedAt);

      const row = document.createElement("tr");

      const infoCell = document.createElement("td");
      infoCell.className = "history__info";
      const titleDiv = document.createElement("div");
      titleDiv.className = "history__title";
      titleDiv.textContent = normalizedTitle;
      titleDiv.title = normalizedTitle;
      const urlLink = document.createElement("a");
      urlLink.className = "history__url";
      
      // Show video URL if different from page URL
      const displayUrl = videoUrl !== normalizedUrl ? `Video: ${videoUrl}` : normalizedUrl;
      urlLink.textContent = displayUrl;
      urlLink.title = videoUrl;
      urlLink.href = normalizedUrl;  // Link to page URL for browser navigation
      urlLink.target = "_blank";
      urlLink.rel = "noopener noreferrer";
      infoCell.appendChild(titleDiv);
      infoCell.appendChild(urlLink);

      const timeCell = document.createElement("td");
      timeCell.className = "history__time";
      timeCell.textContent = createdAt;

      const actionsCell = document.createElement("td");
      actionsCell.className = "history__actions";

      const playButton = document.createElement("button");
      playButton.className = "chip chip--accent";
      playButton.textContent = "Play";
      playButton.dataset.action = "play";
      playButton.dataset.url = normalizedUrl;
      playButton.dataset.videoUrl = videoUrl;  // Store video URL for playback

      const removeButton = document.createElement("button");
      removeButton.className = "chip chip--danger";
      removeButton.textContent = "Remove";
      removeButton.dataset.action = "remove";
      removeButton.dataset.url = normalizedUrl;

      actionsCell.appendChild(playButton);
      actionsCell.appendChild(removeButton);

      row.appendChild(infoCell);
      row.appendChild(timeCell);
      row.appendChild(actionsCell);
      historyList.appendChild(row);
    });
  }

  function playFromHistory(url, videoUrl, button) {
    const isYouTube = isValidYoutubeUrl(url);
    
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Loading...";
    
    if (isYouTube) {
      // For YouTube, use special popup mode with full features (ad-skip, etc.)
      urlInput.value = url;
      startPlayback(url);
      button.textContent = originalText;
      button.disabled = false;
    } else {
      // For other videos, use universal popup mode
      const platform = detectPlatformFromUrl(url);
      const settings = readSettings();
      
      openUniversalPopup({
        url: url,
        platform: platform,
        width: settings.width,
        height: settings.height,
        position: settings.position,
        volume: settings.volume  // Pass volume setting
      })
        .then(() => {
          button.textContent = "Playing";
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 1500);
        })
        .catch((error) => {
          console.warn("Failed to play video", error);
          button.textContent = "Error";
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 1500);
        });
    }
  }

  // Format timestamp for display
  function formatTimestamp(timestamp) {
    if (!timestamp) {
      return "Unknown time";
    }
    
    try {
      let date;
      
      // Handle both ISO string and Unix timestamp
      if (typeof timestamp === "string") {
        date = new Date(timestamp);
      } else if (typeof timestamp === "number") {
        date = new Date(timestamp);
      } else {
        return "Unknown time";
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }
      
      // Format as relative time or absolute time
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) {
        return "Just now";
      } else if (diffMins < 60) {
        return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else if (diffDays < 7) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else {
        // Format as date string for older entries
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
      }
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "Unknown time";
    }
  }

  function openUniversalPopup(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "OPEN_UNIVERSAL_POPUP", payload }, (response) => {
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
});

function openPipWindow(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "OPEN_YOUTUBE", payload }, (response) => {
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

function sendStopRequest() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "STOP_YOUTUBE" }, (response) => {
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

function buildPlayableUrl(urlString, autoNext) {
  try {
    const url = new URL(urlString);
    if (!url.protocol.startsWith("http")) {
      return null;
    }
    if (autoNext) {
      url.searchParams.set("autoplay", "1");
    } else {
      url.searchParams.delete("autoplay");
    }
    return url.toString();
  } catch (error) {
    return null;
  }
}

function isValidYoutubeUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return /(?:youtube\.com|youtu\.be)$/i.test(parsed.hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

function isValidUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol.startsWith("http");
  } catch {
    return false;
  }
}

function detectPlatformFromUrl(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (/\.facebook\.com$/.test(hostname)) {
      return "facebook";
    } else if (/\.twitter\.com$/.test(hostname)) {
      return "twitter";
    } else if (/\.twitch\.tv$/.test(hostname)) {
      return "twitch";
    } else if (/\.vimeo\.com$/.test(hostname)) {
      return "vimeo";
    } else if (/\.dailymotion\.com$/.test(hostname)) {
      return "dailymotion";
    } else if (/\.reddit\.com$/.test(hostname)) {
      return "reddit";
    } else if (/\.linkedin\.com$/.test(hostname)) {
      return "linkedin";
    } else if (/\.instagram\.com$/.test(hostname)) {
      return "instagram";
    }
  } catch {
    // Ignore errors and fallback to null
  }
  return null;
}
