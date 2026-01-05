// Universal PiP Content Bridge
// Runs in ISOLATED world with chrome.runtime access
// Bridges communication between MAIN world script and background

(() => {
  // Listen for messages from MAIN world (universal_pip_inject.js)
  window.addEventListener("message", (event) => {
    // Only accept messages from same origin
    if (event.source !== window) {
      return;
    }
    
    const message = event.data;
    
    // Handle different message types
    if (message?.type === "CHILL_MINIMIZE_POPUP") {
      minimizePopup();
    }
  });
  
  function minimizePopup() {
    if (!chrome?.runtime?.sendMessage) {
      console.error("[Chill Bridge] Chrome runtime not available");
      return;
    }
    
    chrome.runtime.sendMessage({ 
      type: "MINIMIZE_CHILL_WINDOW" 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Chill Bridge] Minimize error:", chrome.runtime.lastError.message);
        window.postMessage({
          type: "CHILL_MINIMIZE_RESULT",
          success: false,
          error: chrome.runtime.lastError.message
        }, "*");
      } else {
        window.postMessage({
          type: "CHILL_MINIMIZE_RESULT",
          success: true
        }, "*");
      }
    });
  }
  
  // Notify MAIN world that bridge is ready
  window.postMessage({
    type: "CHILL_BRIDGE_READY"
  }, "*");
})();
