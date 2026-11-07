/**
 * Sidekick - Background Service Worker (Manifest V3)
 * Continuous-Process Autonomous Browser Agent Engine
 * 
 * Features:
 * 1. Resilient Service Worker Keep-Alive (Alarms + Port + Storage tick)
 * 2. Background Brain & Session State (Agent survives side panel closing/reopening)
 * 3. CDP Navigation Detachment Recovery (Auto-pause, onUpdated wait, re-attach)
 * 4. Rate-Limit Queue & Exponential Backoff (15 RPM pacing + 60s automatic pause on 429)
 * 5. Autonomous Multi-Agent Loop (DOM Stripper + Coordinate Resolver + Consequential Safety Gate)
 * 6. Tab Group Management & Domain Deny-List Security
 */

// Configure side panel behavior to open on action click
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.debug("Panel behavior note:", error));
}

// ============================================================================
// 1. SERVICE WORKER KEEP-ALIVE MECHANISM
// ============================================================================
// Manifest V3 kills idle background workers after ~30s. We combine alarms,
// session storage touch ticks, and port heartbeats to ensure uninterrupted execution.

const KEEP_ALIVE_ALARM = "sidekick-keep-alive-alarm";

// Register periodic keep-alive alarm (MV3 compliant)
chrome.alarms.get(KEEP_ALIVE_ALARM, (alarm) => {
  if (!alarm) {
    chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 1.0 });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    chrome.storage.session.set({ _keepAliveTick: Date.now() }).catch(() => {});
  }
});

let _keepAliveInterval = null;
function startLoopKeepAlive() {
  if (_keepAliveInterval) clearInterval(_keepAliveInterval);
  _keepAliveInterval = setInterval(() => {
    chrome.storage.session.set({ _activeLoopTick: Date.now() }).catch(() => {});
  }, 15000);
}

function stopLoopKeepAlive() {
  if (_keepAliveInterval) clearInterval(_keepAliveInterval);
  _keepAliveInterval = null;
}

// Sidepanel port connection keeper
const activePorts = new Set();
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidekick-sidepanel" || port.name === "sidekick-keepalive") {
    activePorts.add(port);
    port.onMessage.addListener((msg) => {
      if (msg.type === "PING") {
        port.postMessage({ type: "PONG", timestamp: Date.now() });
      }
    });
    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });
  }
});

function broadcastToSidepanel(message) {
  for (const port of activePorts) {
    try {
      port.postMessage(message);
    } catch {}
  }
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ============================================================================
// 2. DOMAIN DENY-LIST & PAYMENT SENSITIVITY SHIELD
// ============================================================================
const AUTOMATION_DENYLIST = [
  "chase.com", "wellsfargo.com", "bankofamerica.com", "citibank.com",
  "capitalone.com", "usbank.com", "americanexpress.com", "amex.com",
  "schwab.com", "fidelity.com", "vanguard.com", "etrade.com",
  "robinhood.com", "paypal.com", "paypal.me", "stripe.com",
  "venmo.com", "cash.app", "zellepay.com", "wise.com", "revolut.com",
  "coinbase.com", "binance.com", "kraken.com", "gemini.com", "plaid.com",
  "sofi.com", "ally.com", "discover.com", "1password.com", "bitwarden.com",
  "lastpass.com", "dashlane.com", "keepersecurity.com", "nordpass.com",
  "roboform.com", "auth0.com", "okta.com", "id.me", "irs.gov", "login.gov",
  "ssa.gov", "turbotax.intuit.com", "taxact.com"
];

function checkDomainAllowed(urlStr) {
  if (!urlStr) return false;
  const urlLower = urlStr.toLowerCase();
  if (
    urlLower.startsWith("chrome://") ||
    urlLower.startsWith("chrome-extension://") ||
    urlLower.startsWith("chrome-search://") ||
    urlLower.startsWith("edge://") ||
    urlLower.startsWith("brave://") ||
    urlLower.startsWith("about:") ||
    urlLower.startsWith("file:") ||
    urlLower.startsWith("javascript:") ||
    urlLower.startsWith("data:")
  ) {
    throw new Error("Security Exception: Cannot automate or debug internal browser pages.");
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
  if (hostname === "chromewebstore.google.com" || (hostname === "chrome.google.com" && pathname.startsWith("/webstore"))) {
    throw new Error("Security Exception: Chrome restricts debugging on the Chrome Web Store.");
  }

  // Exempt benign developer and documentation resources
  if (hostname === "docs.aws.amazon.com" || hostname === "docs.stripe.com" || hostname === "developer.paypal.com") {
    return true;
  }

  // Targeted sensitive security credential path locks
  if (hostname === "github.com" || hostname.endsWith(".github.com")) {
    if (pathname.includes("/settings/security") || pathname.includes("/settings/keys") || pathname.includes("/settings/tokens")) {
      throw new Error("Security Exception: Automation is prohibited on sensitive GitHub security credentials.");
    }
    return true;
  }

  if (hostname === "myaccount.google.com" || hostname === "accounts.google.com") {
    if (pathname.includes("/signinoptions") || pathname.includes("/security") || pathname.includes("/password")) {
      throw new Error("Security Exception: Automation is prohibited on account password or 2FA management.");
    }
    return true;
  }

  if (hostname.includes("microsoft") || hostname.includes("live.com")) {
    if (pathname.includes("/proofs") || pathname.includes("/security") || pathname.includes("/password")) {
      throw new Error("Security Exception: Automation is prohibited on security credential management.");
    }
    return true;
  }

  for (const denied of AUTOMATION_DENYLIST) {
    if (hostname === denied || hostname.endsWith("." + denied)) {
      throw new Error(`Security Exception: Automation is strictly prohibited on sensitive domain (${denied}).`);
    }
  }
  return true;
}

const PAYMENT_PATTERNS = [
  /\b(?:stripe[-_ ]*element|stripe[-_ ]*card|stripe[-_ ]*checkout|stripe[-_ ]*frame)\b/i,
  /\b(?:paypal[-_ ]*button|paypal[-_ ]*checkout|braintree)\b/i,
  /\b(?:credit[-_ ]*card|debit[-_ ]*card|card[-_ ]*number|ccnum|cc[-_ ]*number)\b/i,
  /\b(?:cvv|cvc|cvv2|card[-_ ]*security[-_ ]*code)\b/i,
  /\b(?:exp[-_ ]*date|exp[-_ ]*month|exp[-_ ]*year|payment[-_ ]*widget)\b/i
];

const BENIGN_CARD_EXEMPTIONS = /\b(?:gift[-_ ]*card|loyalty[-_ ]*card|rewards?[-_ ]*card|sd[-_ ]*card|graphics?[-_ ]*card|sound[-_ ]*card|trading[-_ ]*card|playing[-_ ]*card|business[-_ ]*card|library[-_ ]*card|card[-_ ]*sleeve|verification[-_ ]*code|2fa|otp|sms[-_ ]*code|one[-_ ]*time[-_ ]*code)\b/i;

function isSensitivePaymentTarget(desc) {
  if (!desc) return false;
  const dLower = String(desc).toLowerCase();
  if (BENIGN_CARD_EXEMPTIONS.test(dLower)) return false;
  return PAYMENT_PATTERNS.some((pat) => pat.test(dLower));
}

// ============================================================================
// 3. TAB GROUPS MANAGEMENT
// ============================================================================
async function getManagedGroupState() {
  const storage = await chrome.storage.local.get([
    "sidekickManagedGroupId",
    "sidekickManagedGroupName",
    "sidekickGroupIsolationEnabled"
  ]);

  let groupId = storage.sidekickManagedGroupId || null;
  const isolationEnabled = storage.sidekickGroupIsolationEnabled === true; // Default: Permissive active tab mode (only isolate if explicitly enabled in Settings)
  let groupTitle = storage.sidekickManagedGroupName || "Si";
  let groupColor = "grey"; // "grey" is Chrome's ice white / silver tab group pill
  let groupTabs = [];
  let isConfigured = false;

  if (groupId && chrome.tabGroups) {
    try {
      const group = await chrome.tabGroups.get(groupId);
      if (group) {
        isConfigured = true;
        groupTitle = group.title || groupTitle;
        groupColor = group.color || "grey";
        groupTabs = await chrome.tabs.query({ groupId });
      }
    } catch {
      await chrome.storage.local.remove("sidekickManagedGroupId");
      groupId = null;
      isConfigured = false;
    }
  }

  let activeTab = null;
  try {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTabs && activeTabs.length > 0) activeTab = activeTabs[0];
  } catch {}

  const isCurrentTabInGroup = !!(activeTab && groupId && activeTab.groupId === groupId);

  return {
    isConfigured,
    groupId,
    groupTitle,
    groupColor,
    isolationEnabled,
    tabs: groupTabs.map((t) => ({
      id: t.id,
      title: t.title || "Untitled",
      url: t.url || "",
      active: t.active,
      favIconUrl: t.favIconUrl || ""
    })),
    currentTabId: activeTab ? activeTab.id : null,
    currentTabGroupId: activeTab ? activeTab.groupId : null,
    isCurrentTabInGroup
  };
}

async function createOrBindGroup({ targetTabId, existingGroupId, title = "Si", color = "grey" } = {}) {
  if (!chrome.tabs || !chrome.tabGroups) {
    throw new Error("Tab Groups API not supported");
  }

  let finalGroupId = existingGroupId;
  if (!finalGroupId) {
    let tabId = targetTabId;
    if (!tabId) {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs && activeTabs.length > 0) tabId = activeTabs[0].id;
    }
    if (!tabId) {
      const newTab = await chrome.tabs.create({ url: "https://www.google.com", active: true });
      tabId = newTab.id;
    }
    finalGroupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(finalGroupId, { title, color });
  } else if (targetTabId) {
    await chrome.tabs.group({ tabIds: [targetTabId], groupId: finalGroupId });
  }

  await chrome.storage.local.set({
    sidekickManagedGroupId: finalGroupId,
    sidekickManagedGroupName: title,
    sidekickGroupIsolationEnabled: true
  });

  const updatedState = await getManagedGroupState();
  broadcastToSidepanel({ type: "TAB_GROUP_STATE_UPDATED", state: updatedState });
  return updatedState;
}

async function addTabToManagedGroup(tabId) {
  const managed = await getManagedGroupState();
  if (managed.groupId) {
    await chrome.tabs.group({ tabIds: [tabId], groupId: managed.groupId });
    const updatedState = await getManagedGroupState();
    broadcastToSidepanel({ type: "TAB_GROUP_STATE_UPDATED", state: updatedState });
    return updatedState;
  }
  return await createOrBindGroup({ targetTabId: tabId, title: "Si", color: "grey" });
}

// Clean up storage if group closed
if (chrome.tabGroups && chrome.tabGroups.onRemoved) {
  chrome.tabGroups.onRemoved.addListener(async (group) => {
    const storage = await chrome.storage.local.get("sidekickManagedGroupId");
    if (storage.sidekickManagedGroupId === group.id) {
      await chrome.storage.local.remove("sidekickManagedGroupId");
      const updatedState = await getManagedGroupState();
      broadcastToSidepanel({ type: "TAB_GROUP_STATE_UPDATED", state: updatedState });
    }
  });
}

// Broadcast tab activation to update isolation banner immediately
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(async () => {
    const groupState = await getManagedGroupState();
    broadcastToSidepanel({ type: "TAB_GROUP_STATE_UPDATED", state: groupState });
  });
}

// ============================================================================
// 4. CDP CONTROLLER WITH NAVIGATION DETACHMENT RECOVERY
// ============================================================================
let activeDebuggerTabId = null;
let navigationWaiters = new Map();

// Monitor debugger detachments
if (chrome.debugger && chrome.debugger.onDetach) {
  chrome.debugger.onDetach.addListener(async (source, reason) => {
    console.debug(`[CDP] Debugger detached from tab ${source.tabId} (${reason}).`);
    if (activeAgentEngine && activeAgentEngine.tabId === source.tabId) {
      if (reason === "target_closed") {
        activeAgentEngine.stop("Target tab was closed by user.");
      } else {
        // Detached due to navigation or replace
        activeAgentEngine.handleNavigationDetach(source.tabId);
      }
    }
  });
}

// Monitor newly created tabs for autonomous child survey tab redirection
if (chrome.tabs && chrome.tabs.onCreated) {
  chrome.tabs.onCreated.addListener(async (newTab) => {
    if (!activeAgentEngine || activeAgentEngine.state.status !== "RUNNING" || !newTab.id) return;
    if (newTab.openerTabId === activeAgentEngine.tabId) {
      console.log(`[AutonomousAgentEngine] Detected child survey tab #${newTab.id} from parent #${newTab.openerTabId}. Transferring automation session...`);
      activeAgentEngine.addLog("info", `Detected child survey tab #${newTab.id}. Transferring automation context...`);
      await activeAgentEngine.migrateToTab(newTab.id);
    }
  });
}

async function sendCDPCommand(target, method, commandParams = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`CDP command '${method}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.debugger.sendCommand(target, method, commandParams, (result) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

// Anti-Bot Stealth Mouse Tracker & Cubic Bezier Generator
const lastMousePositions = new Map();

function generateCubicBezierWaypoints(startX, startY, endX, endY, steps = 3) {
  const dx = endX - startX;
  const dy = endY - startY;
  const dist = Math.hypot(dx, dy);

  if (dist < 12) {
    return [{ x: endX, y: endY }];
  }

  // Perpendicular deviation scaled by distance (capped at 25px)
  const normX = -dy / (dist || 1);
  const normY = dx / (dist || 1);
  const curvature = (Math.random() - 0.5) * Math.min(25, dist * 0.18);

  const cx1 = startX + dx * 0.33 + normX * curvature;
  const cy1 = startY + dy * 0.33 + normY * curvature;
  const cx2 = startX + dx * 0.66 - normX * (curvature * 0.5);
  const cy2 = startY + dy * 0.66 - normY * (curvature * 0.5);

  const waypoints = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = Math.round(u * u * u * startX + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * endX);
    const y = Math.round(u * u * u * startY + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * endY);
    waypoints.push({ x, y });
  }
  return waypoints;
}

async function executeCDPActionOnTab(tabId, action, params = {}) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.url) throw new Error("Target tab not accessible");
  checkDomainAllowed(tab.url);

  // Strict Workgroup Isolation Guard: Verify target tab belongs to authorized "Si" group
  const managed = await getManagedGroupState();
  if (managed.isolationEnabled && managed.groupId) {
    if (tab.groupId !== managed.groupId) {
      throw new Error(`Security Exception: Tab #${tabId} ("${tab.title || 'Untitled'}") is outside the authorized "Si" tab group. Automation is strictly locked.`);
    }
  }

  // Direct tab navigation without debugger attachment
  if (action === "navigate") {
    let targetUrl = (params?.url || "").trim();
    if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    checkDomainAllowed(targetUrl);
    await chrome.tabs.update(tabId, { url: targetUrl });
    return { navigated: true, url: targetUrl };
  }

  // Fast Native Select Option Dispatch (Framework & React Safe)
  if (action === "select_option" || action === "select") {
    return await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, {
        action: "SELECT_OPTION",
        targetId: params.targetId || params.id || params.selector,
        value: params.value || params.option_value || params.text
      }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res || !res.success) {
          reject(new Error(res?.error || "Failed to select option"));
        } else {
          resolve(res);
        }
      });
    });
  }

  const debugTarget = { tabId };
  const isInAgentSession = Boolean(activeAgentEngine && activeAgentEngine.tabId === tabId && activeAgentEngine.state.status === "RUNNING");
  let attachedLocally = false;

  if (activeDebuggerTabId !== tabId) {
    try {
      await chrome.debugger.attach(debugTarget, "1.3");
      activeDebuggerTabId = tabId;
      attachedLocally = !isInAgentSession;
    } catch (err) {
      console.warn("CDP Attach warning (falling back to DOM action):", err.message);
      broadcastToSidepanel({
        type: "AGENT_DEGRADED_NOTICE",
        warning: `CDP hardware debugger unavailable (${err.message}). Using synthetic DOM event fallback.`
      });
      return await dispatchDOMFallback(tabId, action, params);
    }
  }

  try {
    switch (action) {
      case "click": {
        let { x, y } = params;
        if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) {
          return await dispatchDOMFallback(tabId, action, params);
        }

        let targetX = Math.round(x);
        let targetY = Math.round(y);

        // Pre-Click Coordinate Re-Verification & Occlusion Safety
        try {
          const targetFrameId = params.frameId !== undefined ? params.frameId : 0;
          const verifyMsg = {
            action: "reverifyCoordinates",
            selector: params.selector || params.targetId,
            elementId: params.targetId,
            x: targetX,
            y: targetY
          };
          const sendOptions = targetFrameId !== 0 ? { frameId: targetFrameId } : {};
          const reverifyResp = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, verifyMsg, sendOptions, (res) => {
              if (chrome.runtime.lastError || !res || !res.success) resolve(null);
              else resolve(res.coords);
            });
          });

          if (reverifyResp) {
            // Check if element is occluded by overlay/backdrop
            if (reverifyResp.isOccluded || reverifyResp.isIntercepted || reverifyResp.blocked) {
              const blocker = reverifyResp.occludedBy || reverifyResp.interceptedBy || "modal backdrop";
              console.warn(`[Pre-Click] Target appears occluded by ${blocker}. Attempting trusted synthetic DOM dispatch fallback.`);
              try {
                const fallbackResult = await dispatchDOMFallback(tabId, "click", params);
                return { clicked: true, usedDOMFallback: true, fallbackResult, x: targetX, y: targetY };
              } catch (fallbackErr) {
                return {
                  clicked: false,
                  occluded: true,
                  occludedBy: blocker,
                  reason: `Target is occluded by overlay (${blocker}) and DOM fallback failed: ${fallbackErr.message}`
                };
              }
            }

            // Check if element moved by > 5px due to animation/reflow (only for top-level frame to avoid iframe coordinate space corruption)
            if (targetFrameId === 0 && reverifyResp.verified && (Math.abs(reverifyResp.x - targetX) > 5 || Math.abs(reverifyResp.y - targetY) > 5)) {
              console.log(`[Pre-Click] Element shifted from (${targetX}, ${targetY}) to (${reverifyResp.x}, ${reverifyResp.y}). Re-centering click centroid.`);
              targetX = reverifyResp.x;
              targetY = reverifyResp.y;
            }
          }
        } catch (reverifyErr) {
          console.debug("[Pre-Click] Re-verification notice:", reverifyErr.message);
        }

        const prevPos = lastMousePositions.get(tabId) || {
          x: Math.max(20, targetX - 60),
          y: Math.max(20, targetY - 40)
        };

        const waypoints = generateCubicBezierWaypoints(prevPos.x, prevPos.y, targetX, targetY, 3);
        const dist = Math.hypot(targetX - prevPos.x, targetY - prevPos.y);
        const totalDuration = Math.min(100, Math.max(40, Math.round(30 + dist * 0.08)));
        const stepDelay = Math.max(10, Math.round(totalDuration / waypoints.length));

        // Update visible OS cursor in page overlay
        chrome.tabs.sendMessage(tabId, {
          action: "UPDATE_CURSOR_POSITION",
          x: targetX,
          y: targetY,
          durationMs: totalDuration
        }).catch(() => {});

        // Dispatch mouseMoved waypoints
        for (const pt of waypoints) {
          await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: pt.x,
            y: pt.y
          });
          await delay(stepDelay);
        }

        lastMousePositions.set(tabId, { x: targetX, y: targetY });

        // Dispatch mousePressed
        await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: targetX,
          y: targetY,
          button: "left",
          clickCount: 1
        });

        // Natural human click hold duration with Gaussian jitter (45-75ms)
        const holdDuration = 45 + Math.round(Math.random() * 30);
        await delay(holdDuration);

        try {
          await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: targetX,
            y: targetY,
            button: "left",
            clickCount: 1
          });
          // Visual click pulse ripple
          chrome.tabs.sendMessage(tabId, {
            action: "SHOW_CLICK_PULSE",
            x: targetX,
            y: targetY
          }).catch(() => {});
        } catch (releaseErr) {
          const msg = releaseErr?.message?.toLowerCase() || "";
          if (msg.includes("debugger is not attached") || msg.includes("target closed")) {
            return { clicked: true, navigated: true, x: targetX, y: targetY };
          }
          throw releaseErr;
        }
        return { clicked: true, x: targetX, y: targetY };
      }

      case "type": {
        const { x, y, text = "", pressEnter = false } = params;
        if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
          chrome.tabs.sendMessage(tabId, {
            action: "UPDATE_CURSOR_POSITION",
            x,
            y,
            durationMs: 80
          }).catch(() => {});

          await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1
          });
          await delay(20);
          await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1
          });
          await delay(25);
          lastMousePositions.set(tabId, { x, y });
        }

        if (text) {
          try {
            await sendCDPCommand(debugTarget, "Input.insertText", { text });
          } catch {
            for (const char of text) {
              await sendCDPCommand(debugTarget, "Input.dispatchKeyEvent", {
                type: "keyDown",
                text: char,
                key: char
              });
              await sendCDPCommand(debugTarget, "Input.dispatchKeyEvent", {
                type: "keyUp",
                key: char
              });
            }
          }
        }

        if (pressEnter) {
          await delay(15);
          await sendCDPCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyDown",
            code: "Enter",
            key: "Enter",
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13
          });
          await delay(10);
          await sendCDPCommand(debugTarget, "Input.dispatchKeyEvent", {
            type: "keyUp",
            code: "Enter",
            key: "Enter"
          });
        }
        return { typed: true, textLength: text.length };
      }

      case "scroll": {
        const { x = 400, y = 350, deltaX = 0, deltaY = 400 } = params;
        const dir = deltaY > 0 ? "down" : "up";

        // Show scroll indicator badge on visible cursor
        chrome.tabs.sendMessage(tabId, {
          action: "SHOW_SCROLL_INDICATOR",
          x,
          y,
          direction: dir
        }).catch(() => {});

        await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x,
          y
        });
        await delay(25);
        await sendCDPCommand(debugTarget, "Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x,
          y,
          deltaX,
          deltaY
        });
        lastMousePositions.set(tabId, { x, y });
        return { scrolled: true, deltaY };
      }

      default:
        throw new Error(`Unsupported CDP action: ${action}`);
    }
  } finally {
    if (attachedLocally && !isInAgentSession) {
      try {
        await chrome.debugger.detach(debugTarget);
        if (activeDebuggerTabId === tabId) activeDebuggerTabId = null;
      } catch {}
    }
  }
}

async function dispatchDOMFallback(tabId, action, params) {
  const frameId = params?.frameId || 0;
  const sendOptions = frameId !== 0 ? { frameId } : {};
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: "executeDOMAction", cdpAction: action, params }, sendOptions, (res) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else if (!res || !res.success) reject(new Error(res?.error || "DOM fallback failed"));
      else resolve(res.result);
    });
  });
}

// ============================================================================
// 5. RESILIENT GEMINI API CLIENT & 15 RPM RATE-LIMIT QUEUE
// ============================================================================
class BackgroundGeminiClient {
  constructor() {
    this.queue = Promise.resolve();
    this.lastCallEndTime = 0;
    this.minIntervalMs = 4000; // Pacing for 15 RPM
    this.isPaused429 = false;
  }

  async executeInference(prompt, systemInstruction, config = {}, onStatusUpdate = () => {}) {
    const run = async () => {
      const now = Date.now();
      const timeSinceLast = now - this.lastCallEndTime;
      if (timeSinceLast < this.minIntervalMs && this.lastCallEndTime > 0) {
        await delay(this.minIntervalMs - timeSinceLast);
      }

      let attempt = 0;
      const maxRetries = 3;
      let delayMs = 1000;

      const storage = await chrome.storage.local.get([
        "gemini_sidekick_api_key",
        "gemini_sidekick_model",
        "gemini_sidekick_proxy_url"
      ]);
      const apiKey = (storage.gemini_sidekick_api_key || "").trim();
      const model = storage.gemini_sidekick_model || "gemini-3.5-flash-lite";
      const proxyUrl = (storage.gemini_sidekick_proxy_url || "http://localhost:3000").replace(/\/+$/, "");

      while (attempt <= maxRetries) {
        attempt++;
        try {
          if (apiKey) {
            // Direct Google Generative Language API
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const parts = [];
            if (config.screenshotDataUrl && typeof config.screenshotDataUrl === "string" && config.screenshotDataUrl.startsWith("data:")) {
              const match = config.screenshotDataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: {
                    mimeType: match[1],
                    data: match[2]
                  }
                });
              }
            }
            parts.push({ text: prompt });

            const body = {
              contents: [{ role: "user", parts }],
              systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
              generationConfig: {
                temperature: config.temperature !== undefined ? config.temperature : 0.2,
                maxOutputTokens: config.maxOutputTokens || 2048,
              }
            };

            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });

            if (res.ok) {
              const data = await res.json();
              this.lastCallEndTime = Date.now();
              const text = data?.candidates?.[0]?.content?.parts?.filter((p) => p && !p.thought && p.text).map((p) => p.text).join("") || data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
              return text;
            }

            if (res.status === 429) {
              this.isPaused429 = true;
              console.warn(`[BackgroundApiClient] Rate limit 429 hit. Pausing for 60 seconds.`);
              for (let s = 60; s > 0; s--) {
                onStatusUpdate(`Rate limit: Pausing for ${s}s`, s);
                await delay(1000);
              }
              this.isPaused429 = false;
              onStatusUpdate("Resuming after rate limit pause...", 0);
              continue;
            }

            const errText = await res.text().catch(() => res.statusText);
            throw new Error(`Gemini API error (${res.status}): ${errText}`);
          } else {
            // Server proxy route with fail-fast detection (30-second budget for multimodal reasoning)
            const endpoint = `${proxyUrl}/api/gemini`;
            const proxyController = new AbortController();
            const proxyTimeout = setTimeout(() => proxyController.abort(), 30000);

            let res;
            try {
              res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  promptText: prompt,
                  model,
                  screenshotDataUrl: config.screenshotDataUrl || undefined,
                  rawPayload: {
                    prompt,
                    screenshotDataUrl: config.screenshotDataUrl || undefined,
                    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
                  }
                }),
                signal: proxyController.signal
              });
              clearTimeout(proxyTimeout);
            } catch (proxyFetchErr) {
              clearTimeout(proxyTimeout);
              // Localhost server is offline (standard in unpacked extension)
              broadcastToSidepanel({
                type: "DOCTOR_ALERT",
                issue: "MISSING_KEY",
                message: "Gemini API Key is not configured. Please open Sidekick Settings (or Doctor) and enter your Google AI Studio API key to enable autonomous browsing."
              });
              throw new Error("CONFIG_ERROR: Gemini API Key is not configured. Please open Sidekick Settings (or Doctor) and enter your Google AI Studio API key to enable autonomous browsing.");
            }

            if (res.ok) {
              const data = await res.json();
              this.lastCallEndTime = Date.now();
              return data?.text || data?.rawResponse?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            }

            if (res.status === 429) {
              this.isPaused429 = true;
              console.warn(`[BackgroundApiClient] Proxy returned 429. Pausing for 60 seconds.`);
              for (let s = 60; s > 0; s--) {
                onStatusUpdate(`Rate limit: Pausing for ${s}s`, s);
                await delay(1000);
              }
              this.isPaused429 = false;
              onStatusUpdate("Resuming after rate limit pause...", 0);
              continue;
            }

            const errText = await res.text().catch(() => res.statusText);
            throw new Error(`Proxy error (${res.status}): ${errText}`);
          }
        } catch (err) {
          if (attempt <= maxRetries && !this.isPaused429) {
            await delay(delayMs);
            delayMs *= 2;
            continue;
          }
          throw err;
        }
      }
    };

    const resultPromise = this.queue.then(run, run);
    this.queue = resultPromise.catch(() => {});
    return resultPromise;
  }
}

const geminiClient = new BackgroundGeminiClient();

// ============================================================================
// 6. AUTONOMOUS AGENT BRAIN & STATE MACHINE (LIVES IN SERVICE WORKER)
// ============================================================================
class AutonomousAgentEngine {
  constructor() {
    this.tabId = null;
    this.isNavigating = false;
    this.abortController = null;
    this.frameElementRegistry = new Map();
    this.actionHistory = [];
    this.state = {
      status: "IDLE", // IDLE, RUNNING, PAUSED_429, WAITING_APPROVAL, PAUSED_FOR_USER, COMPLETED, STOPPED, ERROR
      objective: "",
      currentStep: 1,
      maxSteps: 50,
      startTime: 0,
      elapsedMs: 0,
      checklist: [],
      completedMilestones: [],
      domDelta: "Initial viewport state captured",
      lastAction: null,
      historySignatures: [],
      currentThought: "",
      logs: [],
      rateLimitNotice: null,
      pendingApproval: null,
      resultSummary: null,
      error: null
    };
  }

  async persistState() {
    await chrome.storage.session.set({ sidekickAgentState: this.state });
    broadcastToSidepanel({ type: "AGENT_STATE_UPDATED", state: this.state });
  }

  async restoreStateFromSession() {
    try {
      const res = await chrome.storage.session.get("sidekickAgentState");
      if (res && res.sidekickAgentState && this.state.status === "IDLE") {
        this.state = {
          ...this.state,
          ...res.sidekickAgentState
        };
        console.log("[AutonomousAgentEngine] Successfully restored durable agent state from session storage:", this.state.status);
      }
    } catch {}
  }

  async resume(additionalSteps = 50) {
    if (this.state.status === "RUNNING") return;
    this.abortController = new AbortController();
    this.state.maxSteps = this.state.currentStep + additionalSteps;
    this.state.status = "RUNNING";
    this.addLog("info", `Task resumed by user. Extended budget by ${additionalSteps} steps (max: ${this.state.maxSteps}).`);
    startLoopKeepAlive();
    await this.persistState();
    this.runAgentLoop();
  }

  recordActionOutcome(actionType, targetId, outcome) {
    this.actionHistory.push({
      step: this.state.currentStep,
      actionType,
      targetId,
      outcome,
      timestamp: Date.now()
    });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
  }

  async migrateToTab(newTabId) {
    if (!newTabId || newTabId === this.tabId) return;
    console.log(`[AutonomousAgentEngine] Migrating autonomous execution from tab #${this.tabId} to child tab #${newTabId}`);
    this.addLog("info", `Detected child survey tab #${newTabId}. Migrating execution context.`);

    // Detach debugger from old tab
    if (this.tabId && activeDebuggerTabId === this.tabId) {
      try {
        await chrome.debugger.detach({ tabId: this.tabId });
        activeDebuggerTabId = null;
      } catch {}
    }

    this.tabId = newTabId;
    this.frameElementRegistry.clear();

    // Auto-group child tab into managed group if needed
    try {
      await addTabToManagedGroup(newTabId);
    } catch {}

    // Attach debugger to new tab
    try {
      await chrome.debugger.attach({ tabId: newTabId }, "1.3");
      activeDebuggerTabId = newTabId;
    } catch (err) {
      console.warn("[AutonomousAgentEngine] Debugger attach on migrated tab notice:", err?.message || err);
    }

    // Wait for completion and inject content script if needed
    await this.waitForNavigation(newTabId, 10000);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: newTabId, allFrames: true },
        files: ["content.js"]
      });
    } catch {}

    await this.persistState();
  }

  async start(prompt) {
    if (this.state.status === "RUNNING") {
      this.stop("Starting new task");
    }

    this.abortController = new AbortController();
    this.frameElementRegistry.clear();
    this.actionHistory = [];
    this.lastActionFailure = null;
    startLoopKeepAlive();

    // Determine target tab and automatically group into "Si" (ice white / silver)
    let tab = null;
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTabs && activeTabs.length > 0) tab = activeTabs[0];
    if (!tab || !tab.id) {
      tab = await chrome.tabs.create({ url: "https://www.google.com", active: true });
      await delay(800);
    }

    // Auto-group active tab into "Si" workgroup so extension knows what it has access to
    const managed = await getManagedGroupState();
    if (!managed.groupId || tab.groupId !== managed.groupId) {
      const bound = await addTabToManagedGroup(tab.id);
      console.log(`[TabGroups] Auto-grouped tab ${tab.id} into "${bound.groupTitle}"`);
    }

    this.tabId = tab.id;
    checkDomainAllowed(tab.url);

    // Attach persistent CDP session for entire autonomous run (prevents infobar reflow thrashing)
    try {
      if (activeDebuggerTabId && activeDebuggerTabId !== this.tabId) {
        await chrome.debugger.detach({ tabId: activeDebuggerTabId });
        activeDebuggerTabId = null;
      }
      if (activeDebuggerTabId !== this.tabId) {
        await chrome.debugger.attach({ tabId: this.tabId }, "1.3");
        activeDebuggerTabId = this.tabId;
        console.log(`[CDP] Attached persistent debugger session for tab #${this.tabId}`);
      }
    } catch (attachErr) {
      console.warn("[CDP] Session attach notice:", attachErr.message);
    }

    this.state = {
      status: "RUNNING",
      objective: prompt,
      currentStep: 1,
      maxSteps: 50,
      startTime: Date.now(),
      elapsedMs: 0,
      checklist: [
        { id: "c1", text: "Analyze active page and identify interactive controls", status: "in_progress" }
      ],
      currentThought: "Extracting DOM snapshot and interactive element catalog…",
      logs: [
        { timestamp: Date.now(), type: "info", text: `Autonomous session started: "${prompt}"` }
      ],
      rateLimitNotice: null,
      pendingApproval: null,
      resultSummary: null,
      error: null
    };

    await this.persistState();
    this.runAgentLoop();
  }

  async captureCurrentTabScreenshot() {
    try {
      if (!this.tabId) return null;
      const tab = await chrome.tabs.get(this.tabId);
      if (!tab || tab.windowId === undefined) return null;
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 75
      });
      return dataUrl;
    } catch (err) {
      console.warn("[AutonomousAgentEngine] Viewport screenshot notice:", err?.message || err);
      return null;
    }
  }

  async runAgentLoop() {
    const signal = this.abortController.signal;

    while (this.state.status === "RUNNING" && this.state.currentStep <= this.state.maxSteps) {
      if (signal.aborted) break;

      try {
        // Step 1: Wait if tab is navigating
        if (this.isNavigating) {
          await delay(500);
          continue;
        }

        this.state.elapsedMs = Date.now() - this.state.startTime;
        this.addLog("info", `Step ${this.state.currentStep}: Capturing viewport screenshot & inspecting live state...`);
        this.state.currentThought = "Capturing live viewport screenshot & extracting DOM representation...";
        await this.persistState();

        // Step 2: Ensure content script is active, extract stripped DOM & capture live viewport screenshot concurrently
        let [domData, screenshotDataUrl] = await Promise.all([
          this.getStrippedDOM(),
          this.captureCurrentTabScreenshot()
        ]);
        if (!domData) {
          await delay(1000);
          domData = await this.getStrippedDOM();
        }

        if (signal.aborted) break;

        // Step 3: Construct multimodal prompt for Gemini Vision & Reasoning
        const systemPrompt = `You are Sidekick, an elite autonomous browser agent powered by Gemini Multimodal Vision.
You receive:
1. A live JPEG screenshot of the current browser tab viewport.
2. A list of interactive DOM elements indexed with IDs like [button_1], [f1_radio_2], [select_3], along with exact spatial coordinates (x, y, w, h) and viewport location anchors (e.g. [Bottom Action Bar], [Center Main Content]).

SPATIAL GROUNDING & VISUAL INSPECTION DIRECTIVE (MANDATORY):
1. Examine the screenshot and cross-reference visible buttons with the provided spatial coordinates and location anchors:
   - Match buttons by visual text, quadrant location (e.g. [Bottom-Right / Action Area], [Top Header]), and bounding coordinates (x, y, w, h).
   - If an element is located inside a survey iframe, it is identified with a frame prefix such as [f1_radio_1] or [f2_button_2].
2. Look for any active modal dialogs, popup overlays, consent gates, or interstitials (e.g. "What you need to know...", "Attention", "Notice", "Accept", "Close", "Ok, let's go").
3. If ANY modal or overlay dialog is visually covering or floating on top of the page:
   - You MUST identify and interact with the button INSIDE that modal dialog (e.g. "Ok, let's go", "Accept", "Close", "Continue") to dismiss it.
   - NEVER click background buttons beneath the modal (such as background survey cards or links) while an overlay is active, as those clicks will be blocked by the backdrop!
4. If no modal is present, visually confirm the location and state of the target element on the webpage before taking action.
5. Output your visual observation in VISUAL_CHECK before your final action.

ALLOWED ACTIONS (Output exactly one in this format):
- ACTION: CLICK [tag_id] (e.g. ACTION: CLICK [button_1] or ACTION: CLICK [f1_radio_2])
- ACTION: SELECT [tag_id] "option_text_or_value" (e.g. ACTION: SELECT [select_3] "California" or "CA")
- ACTION: TYPE [tag_id] "text" (e.g. ACTION: TYPE [input_2] "laptop deals" [ENTER])
- ACTION: SCROLL down (or SCROLL up)
- ACTION: NAVIGATE https://...
- ACTION: FINISH "Detailed conclusion or answer"

CRITICAL FOR DROPDOWN MENUS:
Always use ACTION: SELECT [tag_id] "option_text" for dropdown menus (<select>) instead of clicking them, ensuring first-try precision without getting trapped in open menus.

OUTPUT FORMAT:
VISUAL_CHECK: <crisp observation of what is visually on top in the screenshot, noting any active modal dialogs or overlays and spatial anchors>
THOUGHT: <concise reasoning about what to do next based on both visual evidence and DOM>
CHECKLIST: <comma-separated list of 2-4 progress checklist items>
ACTION: <single command from allowed actions>`;

        const recentHistoryStr = this.actionHistory.length > 0
          ? this.actionHistory.slice(-4).map(h => `Step ${h.step}: ${h.actionType} on ${h.targetId} -> Outcome: ${h.outcome}`).join("\n")
          : "None (Initial step)";

        let failureFeedbackStr = "";
        if (this.lastActionFailure) {
          failureFeedbackStr = `\nCRITICAL - PREVIOUS ACTION FAILURE FEEDBACK:
[!] Your previous action in Step ${this.lastActionFailure.step} (${this.lastActionFailure.actionType} on ${this.lastActionFailure.targetId}) FAILED.
REASON: ${this.lastActionFailure.reason}
MANDATORY DIRECTIVE: Do NOT repeat the exact same action. If an overlay or modal dialog is blocking the page, identify the button inside the modal (e.g. "Accept", "Close", "Continue", "Ok") and click it. If the target element was missing or unclickable, choose a different element or SCROLL.\n`;
        }

        const userPrompt = `USER OBJECTIVE: ${this.state.objective}
CURRENT STEP: ${this.state.currentStep} of ${this.state.maxSteps}
PAGE TITLE: ${domData?.title || "Untitled"}
PAGE URL: ${domData?.url || ""}${failureFeedbackStr}
${domData?.hasActiveModal ? "NOTICE: Active modal dialog layer detected in DOM! Prioritize front modal controls.\n" : ""}
RECENT ACTION HISTORY & OUTCOMES:
${recentHistoryStr}

INTERACTIVE ELEMENTS:
${domData?.elementsSummary || "(No interactive elements found)"}

VISIBLE PAGE EXCERPT:
${(domData?.visiblePageText || "").slice(0, 3500)}`;

        // Step 4: Run Gemini Multimodal Vision Inference with Rate Limit Feedback
        const responseText = await geminiClient.executeInference(
          userPrompt,
          systemPrompt,
          { temperature: 0.2, screenshotDataUrl },
          (statusMsg, countdown) => {
            this.state.status = countdown > 0 ? "PAUSED_429" : "RUNNING";
            this.state.rateLimitNotice = countdown > 0 ? statusMsg : null;
            this.state.currentThought = statusMsg;
            this.persistState();
          }
        );

        if (signal.aborted) break;

        // Step 5: Parse Response
        const parsed = this.parseAgentDecision(responseText);
        if (parsed.visualCheck) {
          this.addLog("info", `👁️ Visual Check: ${parsed.visualCheck}`);
        }
        this.state.currentThought = parsed.thought || "Executing determined action...";
        if (parsed.checklist && parsed.checklist.length > 0) {
          this.state.checklist = parsed.checklist.map((item, idx) => ({
            id: `c_${idx}`,
            text: item,
            status: idx === 0 ? "done" : (idx === 1 ? "in_progress" : "pending")
          }));
        }
        await this.persistState();

        this.addLog("thought", parsed.thought || "Decision reached");

        // Step 6: Execute the decided Action
        if (parsed.actionType === "UNKNOWN") {
          this.addLog("warn", "Model output did not match a standard ACTION: format. Attempting recovery...");
          const rawUnbolded = responseText.replace(/\*\*/g, "");
          const matchClick = rawUnbolded.match(/CLICK\s*(\[[a-zA-Z0-9_\-]+\])/i);
          const matchType = rawUnbolded.match(/TYPE\s*(\[[a-zA-Z0-9_\-]+\])\s*["']([^"']+)["']/i);
          const matchSelect = rawUnbolded.match(/SELECT\s*(\[[a-zA-Z0-9_\-]+\])\s*["']([^"']+)["']/i);
          const matchScroll = rawUnbolded.match(/SCROLL\s*(down|up)/i);
          const matchNav = rawUnbolded.match(/NAVIGATE\s*(https?:\/\/[^\s\n"']+)/i);
          const matchFinish = rawUnbolded.match(/FINISH\s*["']([^"']+)["']/i);

          if (matchClick) {
            parsed.actionType = "CLICK";
            parsed.targetId = matchClick[1];
          } else if (matchType) {
            parsed.actionType = "TYPE";
            parsed.targetId = matchType[1];
            parsed.textToType = matchType[2];
            parsed.pressEnter = /\[ENTER\]/i.test(rawUnbolded) || /ENTER/i.test(rawUnbolded);
          } else if (matchSelect) {
            parsed.actionType = "SELECT";
            parsed.targetId = matchSelect[1];
            parsed.actionArg = matchSelect[2];
          } else if (matchScroll) {
            parsed.actionType = "SCROLL";
            parsed.actionArg = matchScroll[1];
          } else if (matchNav) {
            parsed.actionType = "NAVIGATE";
            parsed.actionArg = matchNav[1];
          } else if (matchFinish && this.state.currentStep > 1) {
            parsed.actionType = "FINISH";
            parsed.actionArg = matchFinish[1];
          } else {
            this.lastActionFailure = {
              step: this.state.currentStep,
              actionType: "UNKNOWN_COMMAND",
              targetId: "NONE",
              reason: "Your output was missing an ACTION command. You MUST include a line in the format: 'ACTION: CLICK [tag_id]' or 'ACTION: TYPE [tag_id] \"text\"' or 'ACTION: SCROLL down' or 'ACTION: FINISH \"summary\"'."
            };
            this.addLog("warn", `Could not parse valid action. Retrying step with strict formatting instruction...`);
            this.state.currentStep++;
            await this.persistState();
            await delay(250);
            continue;
          }
        }

        if (parsed.actionType === "FINISH") {
          this.state.status = "COMPLETED";
          this.state.resultSummary = parsed.actionArg || "Task objective completed successfully.";
          this.addLog("success", `Completed: ${this.state.resultSummary}`);
          this.lastActionFailure = null;
          await this.persistState();
          break;
        }

        if (parsed.actionType === "NAVIGATE") {
          this.addLog("action", `Navigating to ${parsed.actionArg}`);
          await executeCDPActionOnTab(this.tabId, "navigate", { url: parsed.actionArg });
          await this.waitForNavigation(this.tabId);
          this.recordActionOutcome("NAVIGATE", parsed.actionArg, "PAGE_NAVIGATED");
          this.lastActionFailure = null;
        } else if (parsed.actionType === "SCROLL") {
          const deltaY = parsed.actionArg.toLowerCase().includes("up") ? -500 : 500;
          this.addLog("action", `Scrolling page (${deltaY > 0 ? "down" : "up"})`);
          await executeCDPActionOnTab(this.tabId, "scroll", { deltaY });
          this.recordActionOutcome("SCROLL", parsed.actionArg, "VIEWPORT_SCROLLED");
          this.lastActionFailure = null;
          await delay(200);
        } else if (parsed.actionType === "SELECT") {
          const targetId = parsed.targetId;
          const optVal = parsed.actionArg;
          this.addLog("action", `Selecting dropdown option "${optVal}" on ${targetId}...`);
          try {
            await executeCDPActionOnTab(this.tabId, "select_option", {
              targetId,
              value: optVal
            });
            this.addLog("success", `Selected option "${optVal}" on ${targetId}`);
            this.recordActionOutcome("SELECT", targetId, `SELECTED_${optVal}`);
            this.lastActionFailure = null;
          } catch (selErr) {
            this.addLog("warn", `Direct select option error (${selErr.message}), falling back to coordinate click`);
            const coords = await this.resolveTargetCoordinates(targetId);
            if (coords?.success) {
              await executeCDPActionOnTab(this.tabId, "click", { x: coords.x, y: coords.y, frameId: coords.frameId || 0 });
              this.recordActionOutcome("SELECT", targetId, "CLICK_FALLBACK");
              this.lastActionFailure = null;
            } else {
              this.recordActionOutcome("SELECT", targetId, "FAILED");
              this.lastActionFailure = {
                step: this.state.currentStep,
                actionType: "SELECT",
                targetId,
                reason: `Failed to select option on ${targetId}: ${selErr.message}`
              };
            }
          }
          await delay(180);
        } else if (parsed.actionType === "CLICK" || parsed.actionType === "TYPE") {
          const targetId = parsed.targetId;

          // Dropdown loop prevention: If clicking on a select element, auto-divert to SELECT_OPTION if value known or pick first viable option
          if (parsed.actionType === "CLICK" && (targetId.includes("select_") || targetId.startsWith("[select"))) {
            this.addLog("info", `Target ${targetId} is a native <select> menu. Using framework-safe option selector to avoid popup trap.`);
            try {
              await executeCDPActionOnTab(this.tabId, "select_option", {
                targetId,
                value: parsed.actionArg || ""
              });
              this.recordActionOutcome("SELECT_OPTION", targetId, "DIRECT_OPTION_SELECTED");
              this.lastActionFailure = null;
              await delay(180);
              this.state.currentStep++;
              await this.persistState();
              continue;
            } catch (selErr) {
              console.warn("Select fallback to coordinate click:", selErr.message);
            }
          }

          this.addLog("action", `Resolving target ${targetId}...`);

          // Call content script with anti-blur target centering
          const coords = await this.resolveTargetCoordinates(targetId);
          if (!coords || !coords.success) {
            this.addLog("warn", `Could not resolve coordinates for ${targetId}: ${coords?.error || "Element missing"}`);
            this.recordActionOutcome(parsed.actionType, targetId, `MISSING_COORDINATES_${coords?.error || "NOT_FOUND"}`);
            this.lastActionFailure = {
              step: this.state.currentStep,
              actionType: parsed.actionType,
              targetId,
              reason: `Target ${targetId} could not be resolved in the page DOM (${coords?.error || "Element missing or scrolled out of view"}). Choose a visible target from INTERACTIVE ELEMENTS or SCROLL.`
            };
          } else {
            if (coords.isOccluded) {
              this.addLog("warn", `Target ${targetId} is occluded by ${coords.occludedBy || "overlay"}. Physical click may be intercepted by modal.`);
              this.lastActionFailure = {
                step: this.state.currentStep,
                actionType: parsed.actionType,
                targetId,
                reason: `Target ${targetId} is occluded by ${coords.occludedBy || "overlay/modal"}. Dismiss the modal dialog first or click the button inside the modal.`
              };
            }

            // Consequential Action Safety Gate Check
            const isSensitive = isSensitivePaymentTarget(parsed.actionArg || targetId);
            if (isSensitive) {
              this.state.status = "WAITING_APPROVAL";
              this.state.pendingApproval = {
                actionType: parsed.actionType,
                targetId,
                actionArg: parsed.actionArg,
                coords
              };
              this.addLog("warn", `Pausing for Consequential Action approval: ${parsed.actionType} on ${targetId}`);
              await this.persistState();
              return; // Wait for user approval
            }

            if (parsed.actionType === "CLICK") {
              // Capture pre-state snapshot to verify post-click DOM mutation (with explicit frameId)
              let preState = null;
              try {
                preState = await new Promise((res) => {
                  chrome.tabs.sendMessage(this.tabId, { action: "capturePreState", selector: targetId }, { frameId: coords.frameId || 0 }, (r) => res(r?.state || null));
                });
              } catch {}

              const clickResult = await executeCDPActionOnTab(this.tabId, "click", {
                x: coords.x,
                y: coords.y,
                targetId,
                frameId: coords.frameId || 0
              });

              if (clickResult && clickResult.occluded) {
                this.addLog("warn", `Target ${targetId} is occluded by ${clickResult.occludedBy || "overlay"}. Physical click prevented.`);
                this.state.currentThought = `Target is occluded by ${clickResult.occludedBy || "modal backdrop"}. Redirecting attention to dismiss modal...`;
                this.recordActionOutcome("CLICK", targetId, `OCCLUDED_BY_${clickResult.occludedBy || "OVERLAY"}`);
                this.lastActionFailure = {
                  step: this.state.currentStep,
                  actionType: "CLICK",
                  targetId,
                  reason: `Target ${targetId} was occluded by ${clickResult.occludedBy || "modal backdrop"}. Click the button inside the modal dialog to dismiss it first.`
                };
              } else {
                // Post-state mutation verification: Did the click actually register? (with explicit frameId)
                await delay(200);
                let postVerification = null;
                try {
                  postVerification = await new Promise((res) => {
                    chrome.tabs.sendMessage(this.tabId, {
                      action: "verifyPostState",
                      cdpAction: "click",
                      selector: targetId,
                      preState,
                      expectedPostcondition: null
                    }, { frameId: coords.frameId || 0 }, (r) => res(r?.result || null));
                  });
                } catch {}

                if (postVerification && postVerification.mutated === false) {
                  this.addLog("warn", `CDP click on ${targetId} resulted in 0 DOM mutations. Triggering authentic DOM fallback dispatch...`);
                  try {
                    await dispatchDOMFallback(this.tabId, "click", { targetId, x: coords.x, y: coords.y, frameId: coords.frameId || 0 });
                    this.addLog("info", `DOM fallback click dispatched successfully on ${targetId}.`);
                    this.recordActionOutcome("CLICK", targetId, "DOM_FALLBACK_DISPATCHED");
                    this.lastActionFailure = null;
                  } catch (domErr) {
                    this.addLog("warn", `DOM fallback notice: ${domErr.message}`);
                    this.recordActionOutcome("CLICK", targetId, "CLICK_NO_MUTATION");
                    this.lastActionFailure = {
                      step: this.state.currentStep,
                      actionType: "CLICK",
                      targetId,
                      reason: `Click on ${targetId} produced no state mutations (${domErr.message}). Check if the element is disabled, requires another field filled, or is non-clickable.`
                    };
                  }
                } else {
                  this.recordActionOutcome("CLICK", targetId, "SUCCESS_MUTATION_VERIFIED");
                  this.lastActionFailure = null;
                }
              }
            } else if (parsed.actionType === "TYPE") {
              await executeCDPActionOnTab(this.tabId, "type", {
                x: coords.x,
                y: coords.y,
                text: parsed.textToType,
                pressEnter: parsed.pressEnter,
                targetId,
                frameId: coords.frameId || 0
              });
              this.recordActionOutcome("TYPE", targetId, `TYPED_${(parsed.textToType || "").slice(0, 15)}`);
              this.lastActionFailure = null;
            }
          }
          await delay(160);
        }

        this.state.currentStep++;
        if (this.state.currentStep > this.state.maxSteps) {
          this.state.status = "COMPLETED";
          this.state.resultSummary = "Reached safety limit of 50 steps.";
          await this.persistState();
          break;
        }

        await this.persistState();
        await delay(120);
      } catch (loopErr) {
        if (signal.aborted) break;
        console.error("[AutonomousAgentEngine] Loop error:", loopErr);
        this.addLog("error", `Error in step ${this.state.currentStep}: ${loopErr.message}`);
        this.state.status = "ERROR";
        this.state.error = loopErr.message;
        await this.persistState();
        break;
      }
    }

    stopLoopKeepAlive();
    if (this.tabId && activeDebuggerTabId === this.tabId) {
      try {
        await chrome.debugger.detach({ tabId: this.tabId });
        activeDebuggerTabId = null;
        console.log(`[CDP] Cleanly detached persistent session from tab #${this.tabId}`);
      } catch {}
    }
  }

  async getStrippedDOM() {
    try {
      this.frameElementRegistry.clear();

      // 1. Extract from top frame (frameId: 0)
      let topData = await new Promise((resolve) => {
        chrome.tabs.sendMessage(this.tabId, { action: "EXTRACT_STRIPPED_DOM" }, { frameId: 0 }, (res) => {
          if (chrome.runtime.lastError || !res || !res.success) {
            // Attempt script injection across all frames if content script not yet present
            chrome.scripting.executeScript({
              target: { tabId: this.tabId, allFrames: true },
              files: ["content.js"]
            }).then(() => {
              delay(300).then(() => {
                chrome.tabs.sendMessage(this.tabId, { action: "EXTRACT_STRIPPED_DOM" }, { frameId: 0 }, (retryRes) => {
                  resolve(retryRes?.data || null);
                });
              });
            }).catch(() => resolve(null));
          } else {
            resolve(res.data);
          }
        });
      });

      if (!topData) return null;

      // 2. Discover and traverse subframes via webNavigation if available
      let allFrames = [];
      try {
        if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
          allFrames = await chrome.webNavigation.getAllFrames({ tabId: this.tabId });
        }
      } catch {}

      const subframes = (allFrames || []).filter((f) => f.frameId !== 0);
      const topIframes = topData.iframes || [];

      if (subframes.length > 0) {
        let combinedElements = [...(topData.interactiveElements || [])];
        let subframeTexts = [];
        // Filter out 0x0 or 1x1 tracking pixels from topIframes
        const visibleTopIframes = topIframes.filter((ifr) => ifr.rect && ifr.rect.width >= 30 && ifr.rect.height >= 30);

        for (let i = 0; i < subframes.length; i++) {
          const sf = subframes[i];
          // 1. First try exact URL match
          let matchedIframe = visibleTopIframes.find((ifr) => ifr.src && sf.url && ifr.src === sf.url);
          // 2. Next try partial URL / pathname match
          if (!matchedIframe) {
            matchedIframe = visibleTopIframes.find((ifr) => ifr.src && sf.url && (sf.url.includes(ifr.src) || ifr.src.includes(sf.url)));
          }
          // 3. Next try matching origins if valid
          if (!matchedIframe && sf.url && sf.url.startsWith("http")) {
            try {
              const sfOrigin = new URL(sf.url).origin;
              matchedIframe = visibleTopIframes.find((ifr) => ifr.src && ifr.src.startsWith("http") && new URL(ifr.src).origin === sfOrigin);
            } catch {}
          }
          // 4. Fallback to visible iframe by matching index or largest visible iframe
          if (!matchedIframe) {
            matchedIframe = visibleTopIframes[i] || visibleTopIframes[0] || topIframes[i] || { rect: { left: 0, top: 0, width: 800, height: 600 } };
          }
          const frameOffset = matchedIframe.rect || { left: 0, top: 0, width: 800, height: 600 };

          try {
            const sfData = await new Promise((res) => {
              chrome.tabs.sendMessage(this.tabId, { action: "EXTRACT_STRIPPED_DOM" }, { frameId: sf.frameId }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) res(null);
                else res(response.data);
              });
            });

            if (sfData && sfData.interactiveElements && sfData.interactiveElements.length > 0) {
              sfData.interactiveElements.forEach((el, elIdx) => {
                const subTagId = `[f${sf.frameId}_${el.kind || 'el'}_${elIdx + 1}]`;
                const origId = el.id;
                const absX = Math.round(frameOffset.left + el.x);
                const absY = Math.round(frameOffset.top + el.y);

                this.frameElementRegistry.set(subTagId, {
                  frameId: sf.frameId,
                  origId: origId,
                  cleanId: el.cleanId,
                  iframeOffset: frameOffset
                });

                combinedElements.push({
                  ...el,
                  id: subTagId,
                  x: absX,
                  y: absY,
                  frameId: sf.frameId,
                  inIframe: true,
                  iframeOffset: frameOffset
                });
              });

              if (sfData.visiblePageText) {
                subframeTexts.push(`[IFRAME #${sf.frameId} CONTENT]:\n${sfData.visiblePageText}`);
              }
            }
          } catch {}
        }

        topData.interactiveElements = combinedElements;
        topData.interactiveElementsCount = combinedElements.length;
        if (subframeTexts.length > 0) {
          topData.visiblePageText = `${topData.visiblePageText}\n\n${subframeTexts.join("\n\n")}`;
        }

        // Re-generate elementsSummary with updated spatial coordinates and frame indicators
        topData.elementsSummary = combinedElements
          .map((item) => {
            const frameTag = item.inIframe ? " (in iframe)" : "";
            const anchor = item.spatialAnchor || "Center Main Content";
            let desc = `${item.id} ${item.kind.toUpperCase()}${frameTag}: "${item.text}" (x: ${item.x}, y: ${item.y}, w: ${item.width}, h: ${item.height}) [${anchor}]`;
            if (item.options && item.options.length > 0) {
              const optPreview = item.options.slice(0, 10).map((o) => `"${o.text || o.value}"`).join(", ");
              desc += ` [Available Options: ${optPreview}]`;
            } else if (item.value) {
              desc += ` (value: "${item.value}")`;
            }
            if (item.checked) desc += ` [CHECKED]`;
            if (item.disabled) desc += ` [DISABLED]`;
            return desc;
          })
          .join("\n");
      }

      return topData;
    } catch {
      return null;
    }
  }

  async resolveTargetCoordinates(targetId) {
    const reg = this.frameElementRegistry.get(targetId);
    let targetFrameId = reg ? reg.frameId : 0;
    if (!targetFrameId && targetId) {
      const fMatch = targetId.match(/^\[f(\d+)_/);
      if (fMatch) targetFrameId = parseInt(fMatch[1], 10);
    }
    const sendId = reg ? reg.origId : targetId;
    const sendOptions = targetFrameId !== 0 ? { frameId: targetFrameId } : {};

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(this.tabId, { action: "GET_ELEMENT_COORDINATES", targetId: sendId }, sendOptions, (res) => {
        if (chrome.runtime.lastError) {
          const lastErr = chrome.runtime.lastError.message || "";
          if (lastErr.includes("Receiving end does not exist") || lastErr.includes("Could not establish connection")) {
            console.log("[AutonomousAgentEngine] Content script dropped. Auto-re-injecting and retrying...");
            chrome.scripting.executeScript({
              target: { tabId: this.tabId, allFrames: true },
              files: ["content.js"]
            }).then(() => {
              delay(300).then(() => {
                chrome.tabs.sendMessage(this.tabId, { action: "GET_ELEMENT_COORDINATES", targetId: sendId }, sendOptions, (retryRes) => {
                  if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                  } else {
                    if (retryRes && reg && reg.iframeOffset) {
                      retryRes.x = Math.round(reg.iframeOffset.left + retryRes.x);
                      retryRes.y = Math.round(reg.iframeOffset.top + retryRes.y);
                    }
                    if (retryRes) retryRes.frameId = targetFrameId;
                    resolve(retryRes || { success: false, error: "No response from re-injected content script" });
                  }
                });
              });
            }).catch(() => resolve({ success: false, error: lastErr }));
            return;
          }
          resolve({ success: false, error: lastErr });
        } else if (!res || !res.success) {
          resolve(res || { success: false, error: "No response from content script" });
        } else {
          if (reg && reg.iframeOffset) {
            res.x = Math.round(reg.iframeOffset.left + res.x);
            res.y = Math.round(reg.iframeOffset.top + res.y);
          }
          res.frameId = targetFrameId;
          resolve(res);
        }
      });
    });
  }

  parseAgentDecision(text) {
    const lines = text.split("\n").map(l => l.trim());
    let visualCheck = "";
    let thought = "";
    let checklist = [];
    let actionType = "UNKNOWN"; // Safe default: NEVER default to FINISH!
    let actionArg = "";
    let targetId = "";
    let textToType = "";
    let pressEnter = false;

    // Helper to extract clean targetId from strings like [button_1], **[button_1]**, etc.
    const extractTarget = (str) => {
      const m = str.match(/\[([a-zA-Z0-9_\-]+)\]/);
      return m ? `[${m[1]}]` : "";
    };

    for (let rawLine of lines) {
      if (!rawLine) continue;
      // Strip leading markdown bullets/numbers/asterisks
      const strippedLine = rawLine.replace(/^[*_#\s\->\d.]+/g, "").trim();
      // Remove double asterisks/underscores for tag matching
      const cleanLine = strippedLine.replace(/\*\*/g, "").replace(/__/g, "").trim();

      if (/^VISUAL_CHECK\s*:/i.test(cleanLine)) {
        visualCheck = cleanLine.replace(/^VISUAL_CHECK\s*:\s*/i, "").trim();
      } else if (/^THOUGHT\s*:/i.test(cleanLine)) {
        thought = cleanLine.replace(/^THOUGHT\s*:\s*/i, "").trim();
      } else if (/^CHECKLIST\s*:/i.test(cleanLine)) {
        const raw = cleanLine.replace(/^CHECKLIST\s*:\s*/i, "").trim();
        checklist = raw.split(",").map(c => c.trim()).filter(Boolean);
      } else if (/^ACTION\s*:/i.test(cleanLine)) {
        const rawAction = cleanLine.replace(/^ACTION\s*:\s*/i, "").trim();

        if (/^FINISH/i.test(rawAction)) {
          actionType = "FINISH";
          actionArg = rawAction.replace(/^FINISH\s*/i, "").replace(/^["']|["']$/g, "").trim();
        } else if (/^NAVIGATE/i.test(rawAction)) {
          actionType = "NAVIGATE";
          actionArg = rawAction.replace(/^NAVIGATE\s*/i, "").trim();
        } else if (/^SCROLL/i.test(rawAction)) {
          actionType = "SCROLL";
          actionArg = rawAction.replace(/^SCROLL\s*/i, "").trim() || "down";
        } else if (/^SELECT/i.test(rawAction)) {
          actionType = "SELECT";
          targetId = extractTarget(rawAction);
          const textMatch = rawAction.match(/["'](.*?)["']/);
          actionArg = textMatch ? textMatch[1] : rawAction.replace(/^SELECT\s*(\[[^\]]+\])?/i, "").trim();
        } else if (/^CLICK/i.test(rawAction)) {
          actionType = "CLICK";
          targetId = extractTarget(rawAction) || rawAction.replace(/^CLICK\s*/i, "").trim();
          if (targetId && !targetId.startsWith("[")) targetId = `[${targetId.replace(/^\[+|\]+$/g, "")}]`;
        } else if (/^TYPE/i.test(rawAction)) {
          actionType = "TYPE";
          targetId = extractTarget(rawAction);
          const textMatch = rawAction.match(/["'](.*?)["']/);
          textToType = textMatch ? textMatch[1] : "";
          pressEnter = /\[ENTER\]/i.test(rawAction) || /ENTER/i.test(rawAction);
        }
      }
    }

    // Secondary fallback: If actionType is still UNKNOWN, scan text for markdown bolded actions
    if (actionType === "UNKNOWN") {
      const fullText = text.replace(/\*\*/g, "");
      const actionMatch = fullText.match(/ACTION\s*:\s*(CLICK|TYPE|SELECT|SCROLL|NAVIGATE|FINISH)\s*(.*?)(?:\n|$)/i);
      if (actionMatch) {
        const cmd = actionMatch[1].toUpperCase();
        const rest = (actionMatch[2] || "").trim();
        if (cmd === "CLICK") {
          actionType = "CLICK";
          const m = rest.match(/\[([a-zA-Z0-9_\-]+)\]/);
          targetId = m ? `[${m[1]}]` : rest;
        } else if (cmd === "TYPE") {
          actionType = "TYPE";
          const m = rest.match(/\[([a-zA-Z0-9_\-]+)\]/);
          targetId = m ? `[${m[1]}]` : "";
          const tm = rest.match(/["'](.*?)["']/);
          textToType = tm ? tm[1] : "";
          pressEnter = /\[ENTER\]/i.test(rest) || /ENTER/i.test(rest);
        } else if (cmd === "SCROLL") {
          actionType = "SCROLL";
          actionArg = /up/i.test(rest) ? "up" : "down";
        } else if (cmd === "SELECT") {
          actionType = "SELECT";
          const m = rest.match(/\[([a-zA-Z0-9_\-]+)\]/);
          targetId = m ? `[${m[1]}]` : "";
          const tm = rest.match(/["'](.*?)["']/);
          actionArg = tm ? tm[1] : rest;
        } else if (cmd === "NAVIGATE") {
          actionType = "NAVIGATE";
          actionArg = rest;
        } else if (cmd === "FINISH") {
          actionType = "FINISH";
          actionArg = rest.replace(/^["']|["']$/g, "");
        }
      }
    }

    if (!thought) thought = text.slice(0, 150);
    return { visualCheck, thought, checklist, actionType, actionArg, targetId, textToType, pressEnter };
  }

  async handleNavigationDetach(tabId) {
    this.isNavigating = true;
    this.addLog("info", "CDP Detach by navigation. Pausing execution queue while page loads...");
    this.state.currentThought = "Page navigating... waiting for document load and re-attaching CDP debugger.";
    await this.persistState();

    await this.waitForNavigation(tabId);
    await delay(600);

    // Re-inject content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
    } catch {}

    // Re-attach persistent CDP debugger session immediately
    try {
      if (activeDebuggerTabId !== tabId) {
        await chrome.debugger.attach({ tabId }, "1.3");
        activeDebuggerTabId = tabId;
      }
    } catch (attachErr) {
      console.debug("[CDP] Re-attach after navigation notice:", attachErr.message);
    }

    this.isNavigating = false;
    this.addLog("info", "Page navigation finished. Debugger and content script re-synchronized.");
    await this.persistState();
  }

  async waitForNavigation(tabId, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  async approvePendingAction() {
    if (this.state.status !== "WAITING_APPROVAL" || !this.state.pendingApproval) return;
    const approval = this.state.pendingApproval;
    this.state.pendingApproval = null;
    this.state.status = "RUNNING";
    this.addLog("info", `Consequential action approved: ${approval.actionType} on ${approval.targetId}`);
    await this.persistState();

    if (approval.actionType === "CLICK") {
      await executeCDPActionOnTab(this.tabId, "click", { x: approval.coords.x, y: approval.coords.y });
    } else if (approval.actionType === "TYPE") {
      await executeCDPActionOnTab(this.tabId, "type", {
        x: approval.coords.x,
        y: approval.coords.y,
        text: approval.actionArg
      });
    }
    this.runAgentLoop();
  }

  async denyPendingAction() {
    if (this.state.status !== "WAITING_APPROVAL") return;
    this.state.pendingApproval = null;
    this.state.status = "RUNNING";
    this.addLog("warn", "Consequential action was denied by user. Re-evaluating next step.");
    this.state.currentThought = "Action denied by user. Selecting alternate path...";
    await this.persistState();
    this.runAgentLoop();
  }

  stop(reason = "Stopped by user") {
    if (this.abortController) {
      this.abortController.abort();
    }
    stopLoopKeepAlive();
    if (this.tabId && activeDebuggerTabId === this.tabId) {
      chrome.debugger.detach({ tabId: this.tabId }).catch(() => {});
      activeDebuggerTabId = null;
    }
    this.state.status = "STOPPED";
    this.state.currentThought = reason;
    this.addLog("warn", reason);
    this.persistState();
  }

  addLog(type, text) {
    this.state.logs.push({ timestamp: Date.now(), type, text });
    if (this.state.logs.length > 100) this.state.logs.shift();
  }
}

const activeAgentEngine = new AutonomousAgentEngine();
activeAgentEngine.restoreStateFromSession();

// ============================================================================
// 7. MESSAGE ROUTING DISPATCHER
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender && sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: "Unauthorized sender" });
    return false;
  }

  if (!message || typeof message !== "object") {
    sendResponse({ success: false, error: "Invalid message" });
    return false;
  }

  // Autonomous Agent Control Messages
  if (message.type === "START_AGENT_LOOP") {
    activeAgentEngine.start(message.prompt)
      .then(() => sendResponse({ success: true, state: activeAgentEngine.state }))
      .catch((err) => {
        const errMsg = err?.message || "Failed to start agent loop";
        const issue = errMsg.includes("CONFIG_ERROR") || errMsg.includes("API Key")
          ? "MISSING_KEY"
          : (errMsg.includes("Security Exception") || errMsg.includes("internal browser pages") || errMsg.includes("Web Store")
            ? "RESTRICTED_TAB"
            : "GENERAL_ERROR");
        broadcastToSidepanel({
          type: "DOCTOR_ALERT",
          issue,
          message: errMsg
        });
        sendResponse({ success: false, error: errMsg, issue });
      });
    return true;
  }

  if (message.type === "RESUME_AGENT_LOOP") {
    activeAgentEngine.resume(message.additionalSteps || 50)
      .then(() => sendResponse({ success: true, state: activeAgentEngine.state }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "STOP_AGENT_LOOP") {
    activeAgentEngine.stop("Stopped by user");
    sendResponse({ success: true, state: activeAgentEngine.state });
    return false;
  }

  if (message.type === "GET_AGENT_STATE") {
    chrome.storage.session.get("sidekickAgentState").then((res) => {
      const state = (res && res.sidekickAgentState) || activeAgentEngine.state;
      sendResponse({ success: true, state });
    }).catch(() => {
      sendResponse({ success: true, state: activeAgentEngine.state });
    });
    return true;
  }

  if (message.type === "WAIT_FOR_PAGE_SETTLED") {
    const targetTabId = message.tabId || activeAgentEngine.tabId;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, { action: "WAIT_FOR_PAGE_SETTLED", timeoutMs: message.timeoutMs }, (res) => {
        sendResponse(res || { success: true, settled: true });
      });
      return true;
    }
    sendResponse({ success: true, settled: true });
    return false;
  }

  if (message.type === "APPROVE_CONSEQUENTIAL_ACTION") {
    activeAgentEngine.approvePendingAction()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "DENY_CONSEQUENTIAL_ACTION") {
    activeAgentEngine.denyPendingAction()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // CDP Execution Messages
  if (message.type === "EXECUTE_CDP_ACTION") {
    executeCDPActionOnTab(message.tabId, message.action, message.params)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Tab Groups Messages
  if (message.type === "GET_MANAGED_GROUP_STATE") {
    getManagedGroupState()
      .then((state) => sendResponse({ success: true, state }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CREATE_OR_BIND_GROUP") {
    createOrBindGroup(message.params)
      .then((state) => sendResponse({ success: true, state }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "ADD_TAB_TO_MANAGED_GROUP") {
    addTabToManagedGroup(message.tabId)
      .then((state) => sendResponse({ success: true, state }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SET_GROUP_ISOLATION") {
    chrome.storage.local.set({ sidekickGroupIsolationEnabled: message.enabled !== false })
      .then(getManagedGroupState)
      .then((state) => {
        broadcastToSidepanel({ type: "TAB_GROUP_STATE_UPDATED", state });
        sendResponse({ success: true, state });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Multimodal Vision Screenshot Capture
  if (message.type === "CAPTURE_VISION_SCREENSHOT") {
    captureTabScreenshot(message.tabId)
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

async function captureTabScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!dataUrl) {
          reject(new Error("Empty screenshot returned from captureVisibleTab"));
        } else {
          resolve(dataUrl);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

