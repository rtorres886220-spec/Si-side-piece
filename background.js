/**
 * Sidekick - Background Service Worker (Manifest V3)
 * Just-In-Time (JIT) Chrome DevTools Protocol Engine with Ephemeral Attachment
 * Enterprise Defense-in-Depth Security & Hardware Event Dispatcher
 */

// Side panel behavior: opens on extension icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Failed to set panel behavior:", error));

// Domain Deny-List: High-security and financial domains locked from automation
const AUTOMATION_DENYLIST = [
  "chase.com",
  "wellsfargo.com",
  "bankofamerica.com",
  "citibank.com",
  "capitalone.com",
  "paypal.com",
  "stripe.com",
  "coinbase.com",
  "binance.com",
  "kraken.com",
  "1password.com",
  "bitwarden.com",
  "lastpass.com",
  "console.aws.amazon.com/billing",
  "console.cloud.google.com/billing"
];

// Sensitive payment keywords to block at background service level
const PAYMENT_PATTERNS = [
  "stripe", "paypal", "braintree", "credit-card", "cardnumber",
  "cvv", "cvc", "exp-date", "cc-number", "payment-widget"
];

// Message Handler for Side Panel Requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXECUTE_CDP_ACTION") {
    handleCDPAction(message)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === "CAPTURE_VISION_SCREENSHOT") {
    captureTabScreenshot(message.tabId)
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Executes a native CDP action using Just-In-Time (JIT) ephemeral attach & detach
 */
async function handleCDPAction({ tabId, action, params }) {
  if (!tabId) throw new Error("Missing target tabId for CDP action");

  // 1. Single-Tab Security Lock & Domain Deny-List Verification
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.url) throw new Error("Target tab not accessible");

  const urlLower = tab.url.toLowerCase();
  for (const denied of AUTOMATION_DENYLIST) {
    if (urlLower.includes(denied)) {
      throw new Error(`Security Exception: Automation is strictly prohibited on sensitive domain (${denied}).`);
    }
  }

  // Guard against internal browser schemes
  if (urlLower.startsWith("chrome://") || urlLower.startsWith("chrome-extension://") || urlLower.startsWith("edge://") || urlLower.startsWith("about:")) {
    throw new Error("Security Exception: Cannot attach debugger to internal browser pages.");
  }

  // Explicit Payment Widget Lockout
  if (params && params.selector) {
    const selLower = params.selector.toLowerCase();
    for (const pat of PAYMENT_PATTERNS) {
      if (selLower.includes(pat)) {
        throw new Error(`Security Exception: Automated interaction with payment widgets or checkout card elements is strictly blocked.`);
      }
    }
  }

  const debugTarget = { tabId };

  // 2. Just-In-Time (JIT) Attach
  try {
    await chrome.debugger.attach(debugTarget, "1.3");
  } catch (attachErr) {
    if (attachErr.message && attachErr.message.includes("Another debugger is already attached")) {
      throw new Error("Chrome DevTools (F12) is already open on this tab. Please close DevTools to allow Sidekick CDP automation.");
    }
    console.debug("JIT Attach notice:", attachErr.message);
  }

  try {
    switch (action) {
      case "click": {
        // True OS-level trusted mouse click sequence
        const { x, y } = params;
        await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x,
          y
        });
        await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1
        });
        await delay(40);
        await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1
        });
        return { clicked: true, x, y };
      }

      case "type": {
        // Focus coordinates first, then dispatch trusted keyboard events
        const { x, y, text, pressEnter } = params;
        if (x !== undefined && y !== undefined) {
          await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1
          });
          await delay(30);
          await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1
          });
        }

        // Dispatch key characters
        for (const char of text) {
          await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyDown",
            text: char,
            unmodifiedText: char
          });
          await delay(15);
          await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyUp"
          });
          await delay(10);
        }

        if (pressEnter) {
          await delay(50);
          await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyDown",
            code: "Enter",
            key: "Enter",
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13
          });
          await delay(20);
          await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyUp",
            code: "Enter",
            key: "Enter"
          });
        }

        return { typed: true, textLength: text.length };
      }

      case "scroll": {
        const { x = 200, y = 300, deltaX = 0, deltaY = 300 } = params;
        await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x,
          y,
          deltaX,
          deltaY
        });
        return { scrolled: true, deltaY };
      }

      case "uploadFile": {
        const { selector, files } = params;
        await sendCommand(debugTarget, "DOM.enable", {});
        const doc = await sendCommand(debugTarget, "DOM.getDocument", {});
        const node = await sendCommand(debugTarget, "DOM.querySelector", {
          nodeId: doc.root.nodeId,
          selector
        });

        if (node && node.nodeId) {
          await sendCommand(debugTarget, "DOM.setFileInputFiles", {
            files,
            nodeId: node.nodeId
          });
          return { uploaded: true, filesCount: files.length };
        }
        throw new Error(`FileInput element matching '${selector}' not found`);
      }

      case "navigate": {
        const { url } = params;
        await sendCommand(debugTarget, "Page.enable", {});
        await sendCommand(debugTarget, "Page.navigate", { url });
        return { navigated: true, url };
      }

      case "waitForNetworkIdle": {
        const { timeout = 2500 } = params || {};
        await waitForNetworkIdle(debugTarget, timeout);
        return { networkIdle: true };
      }

      case "setDeviceMetrics": {
        const { width = 1280, height = 800, deviceScaleFactor = 1, mobile = false } = params || {};
        await sendCommand(debugTarget, "Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor,
          mobile
        });
        return { emulated: true, width, height };
      }

      default:
        throw new Error(`Unknown CDP action: ${action}`);
    }
  } finally {
    // 3. Ephemeral JIT Detach immediately to hide the yellow banner
    try {
      await chrome.debugger.detach(debugTarget);
    } catch (detachErr) {
      console.debug("JIT Detach notice:", detachErr.message);
    }
  }
}

/**
 * Capture high-fidelity visual screenshot for Multimodal Grounding
 */
async function captureTabScreenshot(tabId) {
  const debugTarget = { tabId };
  try {
    await chrome.debugger.attach(debugTarget, "1.3");
  } catch {}

  try {
    await sendCommand(debugTarget, "Page.enable", {});
    const screenshot = await sendCommand(debugTarget, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 80
    });
    return `data:image/jpeg;base64,${screenshot.data}`;
  } finally {
    try {
      await chrome.debugger.detach(debugTarget);
    } catch {}
  }
}

/**
 * Network Idle Detection using Network.enable to ensure SPAs finish requests
 */
async function waitForNetworkIdle(debugTarget, timeoutMs = 2500, maxInflight = 0) {
  try {
    await sendCommand(debugTarget, "Network.enable", {});
  } catch {
    return;
  }

  return new Promise((resolve) => {
    let inflight = 0;
    let idleTimer = null;
    const maxWaitTimer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    function onEvent(source, method) {
      if (source.tabId !== debugTarget.tabId) return;
      if (method === "Network.requestWillBeSent") {
        inflight++;
        if (idleTimer) clearTimeout(idleTimer);
      } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        inflight = Math.max(0, inflight - 1);
        if (inflight <= maxInflight) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, 350);
        }
      }
    }

    function cleanup() {
      chrome.debugger.onEvent.removeListener(onEvent);
      clearTimeout(maxWaitTimer);
      if (idleTimer) clearTimeout(idleTimer);
    }

    chrome.debugger.onEvent.addListener(onEvent);
    idleTimer = setTimeout(() => {
      cleanup();
      resolve();
    }, 400);
  });
}

function sendCommand(target, method, commandParams) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, commandParams, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
