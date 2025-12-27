const defaultSettings = {
  width: 350,
  height: 200,
  position: "bottom-right",
  autoNext: true
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
  const playBtn = document.getElementById("playBtn");
  const saveBtn = document.getElementById("saveBtn");
  const stopBtn = document.getElementById("stopBtn");
  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");
  const themeToggle = document.getElementById("themeToggle");

  let historyEntries = [];

  chrome.storage.sync.get(defaultSettings, (stored) => {
    applySettings(stored);
  });

  loadTheme();
  loadHistory();

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
    if (!url) {
      return;
    }
    if (action === "play") {
      urlInput.value = url;
      startPlayback(url);
    } else if (action === "remove") {
      removeHistoryEntry(url);
    }
  });

  themeToggle.addEventListener("change", () => {
    const theme = themeToggle.checked ? Themes.LIGHT : Themes.DARK;
    setTheme(theme);
  });

  function startPlayback(rawUrl) {
    const urlValue = rawUrl.trim();
    if (!isValidYoutubeUrl(urlValue)) {
      alert("Please enter a valid YouTube URL.");
      return;
    }

    const settings = readSettings();
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
      autoNext: settings.autoNext
    })
      .then(() => addToHistory(urlValue))
      .catch((error) => {
        alert(error?.message || "Unable to open PiP window.");
      });
  }

  function readSettings() {
    const positionValue = document.querySelector('input[name="position"]:checked')?.value || defaultSettings.position;
    return {
      width: clampNumber(parseInt(widthInput.value, 10), 200, 2000) || defaultSettings.width,
      height: clampNumber(parseInt(heightInput.value, 10), 150, 1500) || defaultSettings.height,
      position: positionValue,
      autoNext: autoNextInput.checked
    };
  }

  function applySettings(settings) {
    widthInput.value = settings.width ?? defaultSettings.width;
    heightInput.value = settings.height ?? defaultSettings.height;
    autoNextInput.checked = settings.autoNext ?? defaultSettings.autoNext;
    const radio = document.querySelector(`input[name="position"][value="${settings.position}"]`);
    if (radio) {
      radio.checked = true;
    }
  }

  function loadTheme() {
    chrome.storage.local.get({ [THEME_KEY]: Themes.DARK }, (data) => {
      const storedTheme = data[THEME_KEY];
      applyThemeToDocument(storedTheme);
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
      urlLink.textContent = normalizedUrl;
      urlLink.title = normalizedUrl;
      urlLink.href = normalizedUrl;
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
  } catch (error) {
    return false;
  }
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) {
    return null;
  }
  return Math.min(Math.max(value, min), max);
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}
