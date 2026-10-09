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
  "usbank.com",
  "americanexpress.com",
  "amex.com",
  "schwab.com",
  "fidelity.com",
  "vanguard.com",
  "etrade.com",
  "robinhood.com",
  "paypal.com",
  "paypal.me",
  "stripe.com",
  "venmo.com",
  "cash.app",
  "zellepay.com",
  "wise.com",
  "revolut.com",
  "coinbase.com",
  "binance.com",
  "kraken.com",
  "gemini.com",
  "plaid.com",
  "sofi.com",
  "ally.com",
  "discover.com",
  "1password.com",
  "bitwarden.com",
  "lastpass.com",
  "dashlane.com",
  "keepersecurity.com",
  "nordpass.com",
  "roboform.com",
  "accounts.google.com",
  "mail.google.com",
  "login.microsoftonline.com",
  "outlook.live.com",
  "auth0.com",
  "okta.com",
  "id.me",
  "irs.gov",
  "login.gov",
  "usps.com",
  "ssa.gov",
  "turbotax.intuit.com",
  "taxact.com",
  "console.aws.amazon.com",
  "aws.amazon.com",
  "console.cloud.google.com",
  "portal.azure.com",
  "workday.com",
  "adp.com",
  "gusto.com",
  "mychart.com",
  "epic.com",
  "github.com"
];

function checkDomainAllowed(urlStr) {
  if (!urlStr) return false;
  const urlLower = urlStr.toLowerCase();
  if (
    urlLower.startsWith("chrome://") ||
    urlLower.startsWith("chrome-extension://") ||
    urlLower.startsWith("edge://") ||
    urlLower.startsWith("about:") ||
    urlLower.startsWith("file:") ||
    urlLower.startsWith("javascript:") ||
    urlLower.startsWith("data:")
  ) {
    throw new Error("Security Exception: Cannot attach debugger or automate internal/system pages.");
  }
  let hostname = "";
  let pathname = "";
  try {
    const parsed = new URL(urlStr);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    hostname = urlLower;
  }
  for (const denied of AUTOMATION_DENYLIST) {
    if (denied === "github.com") {
      if ((hostname === "github.com" || hostname.endsWith(".github.com")) &&
          (pathname.includes("/settings/security") || pathname.includes("/settings/keys") || pathname.includes("/settings/tokens") || pathname.includes("/settings/auth"))) {
        throw new Error("Security Exception: Automation is strictly prohibited on sensitive GitHub security settings.");
      }
      continue;
    }
    if (hostname === denied || hostname.endsWith("." + denied)) {
      throw new Error(`Security Exception: Automation is strictly prohibited on sensitive domain (${denied}).`);
    }
  }
  return true;
}

// Sensitive payment keywords to block at background service level
const PAYMENT_PATTERNS = [
  "stripe", "paypal", "braintree", "credit-card", "cardnumber", "card_number", "card-number",
  "ccnum", "cvv", "cvc", "exp-date", "exp-month", "exp-year", "cc-number", "payment-widget"
];

// Message Handler for Side Panel Requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // A13: Enforce caller security: only allow extension UI (sidepanel), never webpage content scripts
  if (sender && sender.tab !== undefined) {
    sendResponse({ success: false, error: "Unauthorized sender: CDP actions cannot be invoked from webpage content scripts." });
    return false;
  }
  if (sender && sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Unauthorized sender" });
    return false;
  }

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

  checkDomainAllowed(tab.url);

  // Explicit Payment Widget Lockout across selector, element description, and text
  const descToCheck = `${params?.selector || ""} ${params?.element_description || ""} ${params?.label || ""} ${params?.text || ""}`.toLowerCase();
  for (const pat of PAYMENT_PATTERNS) {
    if (descToCheck.includes(pat)) {
      throw new Error("Security Exception: Automated interaction with payment widgets or checkout card elements is strictly blocked.");
    }
  }

  const debugTarget = { tabId };
  let isDebuggerAttached = false;

  // 2. Just-In-Time (JIT) Attach
  try {
    await chrome.debugger.attach(debugTarget, "1.3");
    isDebuggerAttached = true;
  } catch (attachErr) {
    if (attachErr.message && attachErr.message.includes("Another debugger is already attached")) {
      console.warn("DevTools (F12) is open. Gracefully dispatching via content script DOM action...");
      return await dispatchDOMFallback(tabId, action, params);
    }
    console.debug("JIT Attach notice:", attachErr.message);
  }

  try {
    switch (action) {
      case "click": {
        // True OS-level trusted mouse click sequence
        let { x, y } = params;
        if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
          return await dispatchDOMFallback(tabId, action, params);
        }
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
        await delay(10);
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
        if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
          return await dispatchDOMFallback(tabId, action, params);
        }
          await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1
          });
          await delay(10);
          await sendCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1
          });

        // Fast native CDP text insertion
        if (text) {
          try {
            await sendCommand(debugTarget, "Input.insertText", { text });
          } catch {
            // Fallback to key events with low-latency dispatch
            for (const char of text) {
              await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
                type: "keyDown",
                text: char,
                unmodifiedText: char
              });
              await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
                type: "keyUp"
              });
            }
          }
        }

        if (pressEnter) {
          await delay(15);
          await sendCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyDown",
            code: "Enter",
            key: "Enter",
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13
          });
          await delay(10);
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
        if (!files || !Array.isArray(files) || files.length === 0) {
          throw new Error("Missing files parameter for uploadFile action");
        }
        for (const f of files) {
          const fLower = String(f).toLowerCase();
          if (
            fLower.includes("/etc/") ||
            fLower.includes("/root") ||
            fLower.includes("/var/") ||
            fLower.includes("/proc/") ||
            fLower.includes("/sys/") ||
            fLower.includes("/.ssh") ||
            fLower.includes("/.aws") ||
            fLower.includes("/.env") ||
            fLower.includes("/.config") ||
            fLower.includes("/.git") ||
            fLower.includes("c:\\windows") ||
            fLower.includes("id_rsa") ||
            fLower.includes("credentials") ||
            fLower.includes("passwd") ||
            fLower.includes("hostname") ||
            fLower.includes("secret") ||
            fLower.includes(".bash_history")
          ) {
            throw new Error(`Security Exception: Access to protected or sensitive system path is blocked (${f}).`);
          }
        }
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
        if (!url || typeof url !== "string") throw new Error("Missing URL for navigate action");
        const trimmed = url.trim().toLowerCase();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
          throw new Error("Security Exception: Navigation is restricted to HTTP/HTTPS protocols only.");
        }
        if (!checkDomainAllowed(url)) {
          throw new Error("Security Exception: Navigation to blocked or restricted domain is not allowed.");
        }
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
    if (isDebuggerAttached) {
      try {
        await chrome.debugger.detach(debugTarget);
      } catch (detachErr) {
        console.debug("JIT Detach notice:", detachErr.message);
      }
    }
  }
}

/**
 * Dispatch DOM Fallback directly to content script
 */
async function dispatchDOMFallback(tabId, action, params) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: "executeDOMAction", cdpAction: action, params }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else if (!res || !res.success) {
        reject(new Error(res?.error || "DOM action execution failed"));
      } else {
        resolve(res.result);
      }
    });
  });
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
