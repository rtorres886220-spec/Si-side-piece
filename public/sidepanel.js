/**
 * Sidekick - Chrome Side Panel Controller (Manifest V3)
 * Dumb UI Client for Background Autonomous Browser Agent
 * 
 * Features:
 * 1. Decoupled Dumb UI - All thinking & multi-agent execution runs in background.js
 * 2. CPU Throttling Optimizer - Pauses WebGL & CSS animations during active AI thinking/CDP
 * 3. Session Persistence - Reconnects instantly to running agent state on open
 * 4. Human-In-The-Loop Safety Gate - Interactive approval for consequential actions
 * 5. Strict MV3 Compliance - Zero eval(), zero new Function()
 */

// Fallback chrome mock for web preview environment
if (typeof chrome === "undefined" || !chrome.runtime) {
  const mockStorageStore = new Map();
  window.chrome = {
    runtime: {
      connect: () => ({ onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} }, postMessage: () => {} }),
      onMessage: { addListener: () => {} },
      sendMessage: (msg, cb) => {
        if (msg?.type === "START_AGENT_LOOP") {
          const key = mockStorageStore.get("gemini_sidekick_api_key") || (typeof localStorage !== "undefined" ? localStorage.getItem("gemini_sidekick_api_key") : null);
          if (!key) {
            if (cb) cb({
              success: false,
              error: "CONFIG_ERROR: No Gemini API Key configured. Please set your API key in System Doctor [🩺] or Settings [⚙].",
              issue: "MISSING_KEY"
            });
            return;
          }
        }
        if (cb) cb({ success: true, state: null });
      },
      id: "mock-sidekick-id"
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          const keyList = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(keys || {}));
          keyList.forEach((k) => { res[k] = mockStorageStore.get(k) || (typeof localStorage !== "undefined" ? localStorage.getItem(k) : null); });
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (items, cb) => {
          Object.entries(items || {}).forEach(([k, v]) => {
            mockStorageStore.set(k, v);
            if (typeof localStorage !== "undefined") localStorage.setItem(k, String(v));
          });
          if (cb) cb();
          return Promise.resolve();
        },
        remove: (keys, cb) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            mockStorageStore.delete(k);
            if (typeof localStorage !== "undefined") localStorage.removeItem(k);
          });
          if (cb) cb();
          return Promise.resolve();
        }
      },
      session: {
        get: (_k, cb) => { if (cb) cb({}); return Promise.resolve({}); },
        set: (_items, cb) => { if (cb) cb(); return Promise.resolve(); },
        onChanged: { addListener: () => {} }
      }
    },
    tabs: {
      query: (_q, cb) => {
        const dummyTab = [{ id: 1, title: "Google", url: "https://www.google.com" }];
        if (cb) cb(dummyTab);
        return Promise.resolve(dummyTab);
      },
      create: (opts, cb) => {
        const tab = { id: 2, title: "New Tab", url: opts.url || "about:blank" };
        if (cb) cb(tab);
        return Promise.resolve(tab);
      },
      update: (_id, _opts, cb) => { if (cb) cb({}); return Promise.resolve({}); },
      sendMessage: (_tabId, msg, _opts, cb) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        if (msg?.action === "PING") {
          if (callback) callback({ status: "PONG", version: "1.1.3" });
        } else if (callback) {
          callback({ success: true });
        }
        return Promise.resolve({ status: "PONG" });
      },
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} }
    },
    scripting: {
      executeScript: () => Promise.resolve([])
    },
    debugger: {
      attach: (_t, _v, cb) => { if (cb) cb(); },
      detach: (_t, cb) => { if (cb) cb(); }
    }
  };
}

// Storage Keys
const STORAGE_KEY_API_KEY = "gemini_sidekick_api_key";
const STORAGE_KEY_MODEL = "gemini_sidekick_model";
const STORAGE_KEY_SESSIONS = "gemini_sidekick_sessions";
const STORAGE_KEY_PROXY_URL = "gemini_sidekick_proxy_url";

// Current Models
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

const VERIFY_ERROR_CATEGORIES = {
  AUTH_INVALID: "AUTH_INVALID",
  TIMEOUT: "TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  ABORTED: "ABORTED",
  UNKNOWN: "UNKNOWN"
};

function sanitizeKeyFromError(errorText) {
  if (!errorText) return "";
  return String(errorText).replace(/AIzaSy[a-zA-Z0-9_\-]+/g, "[REDACTED_API_KEY]");
}

let state = {
  apiKey: "",
  model: DEFAULT_MODEL
};

async function verifyApiKey(apiKey, modelName = DEFAULT_MODEL, externalSignal = null) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return { valid: false, category: VERIFY_ERROR_CATEGORIES.AUTH_INVALID, error: "API key cannot be empty" };
  }

  const modelToTry = modelName || DEFAULT_MODEL;
  const secondaryModel = "gemini-3.1-flash-lite";
  const models = [modelToTry, secondaryModel];
  let lastError = null;
  let lastCategory = VERIFY_ERROR_CATEGORIES.UNKNOWN;

  for (const m of models) {
    const controller = new AbortController();
    let signal = controller.signal;

    if (externalSignal) {
      if (externalSignal.aborted) {
        return { valid: false, category: VERIFY_ERROR_CATEGORIES.ABORTED, error: "Request aborted" };
      }
      const combinedController = new AbortController();
      const onAbort = () => combinedController.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', onAbort);
      controller.signal.addEventListener('abort', onAbort);
      signal = combinedController.signal;
    }

    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    }, 15000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }]
        }),
        signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && (data.candidates || data.text)) {
          return { valid: true, model: m };
        }
      }

      const status = res.status;
      let errorBody = {};
      try {
        errorBody = await res.json();
      } catch {}

      const errMessage = errorBody.error?.message || `HTTP error ${status}`;
      const reason = errorBody.error?.details?.[0]?.reason || errorBody.error?.status || '';

      if (status === 400 || status === 401 || reason === 'API_KEY_INVALID' || errMessage.toLowerCase().includes('api key') || errMessage.toLowerCase().includes('api_key_invalid')) {
        return { valid: false, category: VERIFY_ERROR_CATEGORIES.AUTH_INVALID, error: sanitizeKeyFromError(`Invalid Gemini API key: ${errMessage}`) };
      }
      if (status === 429 || reason === 'RESOURCE_EXHAUSTED' || errMessage.toLowerCase().includes('quota') || errMessage.toLowerCase().includes('exhausted')) {
        return { valid: false, category: VERIFY_ERROR_CATEGORIES.QUOTA_EXCEEDED, error: sanitizeKeyFromError(`Quota exceeded: ${errMessage}`) };
      }
      if (status === 404 || reason === 'NOT_FOUND' || errMessage.toLowerCase().includes('not found')) {
        lastCategory = VERIFY_ERROR_CATEGORIES.MODEL_UNAVAILABLE;
        lastError = sanitizeKeyFromError(`Model ${m} not found: ${errMessage}`);
        continue;
      }

      return { valid: false, category: VERIFY_ERROR_CATEGORIES.UNKNOWN, error: sanitizeKeyFromError(errMessage) };

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || (externalSignal && externalSignal.aborted)) {
        return { valid: false, category: VERIFY_ERROR_CATEGORIES.ABORTED, error: "Request aborted" };
      }
      if (err.name === 'TimeoutError' || (err.message && err.message.toLowerCase().includes('timeout'))) {
        return { valid: false, category: VERIFY_ERROR_CATEGORIES.TIMEOUT, error: sanitizeKeyFromError(`Request timed out: ${err.message}`) };
      }
      return { valid: false, category: VERIFY_ERROR_CATEGORIES.NETWORK_ERROR, error: sanitizeKeyFromError(`Network connection failed: ${err.message}`) };
    }
  }

  return { valid: false, category: lastCategory || VERIFY_ERROR_CATEGORIES.MODEL_UNAVAILABLE, error: lastError || "All models unavailable" };
}

(function () {
  // DOM Element References
  const panel = document.getElementById("sidekickPanel");
  const threadContainer = document.getElementById("threadContainer");
  const emptyState = document.getElementById("emptyState");
  const messagesList = document.getElementById("messagesList");
  const promptInput = document.getElementById("promptInput");
  const chatForm = document.getElementById("chatForm");
  const sendBtn = document.getElementById("sendBtn");
  const sendIconSvg = document.getElementById("sendIconSvg");
  const stopIconSquare = document.getElementById("stopIconSquare");
  const emergencyStopBtn = document.getElementById("emergencyStopBtn");

  // Ledger Elements
  const activeTaskLedger = document.getElementById("activeTaskLedger");
  const ledgerStepBadge = document.getElementById("ledgerStepBadge");
  const ledgerTimer = document.getElementById("ledgerTimer");
  const ledgerStopBtn = document.getElementById("ledgerStopBtn");
  const ledgerObjective = document.getElementById("ledgerObjective");
  const ledgerChecklist = document.getElementById("ledgerChecklist");
  const ledgerThoughtsText = document.getElementById("ledgerThoughtsText");

  // Safety Gate Modal Elements
  const safetyModal = document.getElementById("safetyModal");
  const safetyStepBadge = document.getElementById("safetyStepBadge");
  const safetyActionDesc = document.getElementById("safetyActionDesc");
  const approveActionBtn = document.getElementById("approveActionBtn");
  const denyActionBtn = document.getElementById("denyActionBtn");

  // Drawers & Modals
  const settingsDrawer = document.getElementById("settingsDrawer");
  const settingsBtn = document.getElementById("settingsBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const saveStatus = document.getElementById("saveStatus");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const proxyUrlInput = document.getElementById("proxyUrlInput");
  const modelSelect = document.getElementById("modelSelect");
  const toggleKeyVisibilityBtn = document.getElementById("toggleKeyVisibilityBtn");

  const historyDrawer = document.getElementById("historyDrawer");
  const historyBtn = document.getElementById("historyBtn");
  const closeHistoryBtn = document.getElementById("closeHistoryBtn");
  const historyList = document.getElementById("historyList");
  const clearAllHistoryBtn = document.getElementById("clearAllHistoryBtn");

  const newChatBtn = document.getElementById("newChatBtn");
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeHelpModalBtn = document.getElementById("closeHelpModalBtn");

  // Tab Groups Bar
  const tabGroupBar = document.getElementById("tabGroupBar");
  const groupBadgeBtn = document.getElementById("groupBadgeBtn");
  const groupTitleLabel = document.getElementById("groupTitleLabel");
  const groupTabCount = document.getElementById("groupTabCount");
  const newGroupTabBtn = document.getElementById("newGroupTabBtn");
  const tabGroupDrawer = document.getElementById("tabGroupDrawer");
  const closeGroupDrawerBtn = document.getElementById("closeGroupDrawerBtn");
  const isolationToggle = document.getElementById("isolationToggle");
  const isolationWarningBanner = document.getElementById("isolationWarningBanner");

  // Slash Menu
  const slashMenu = document.getElementById("slashMenu");
  const slashList = document.getElementById("slashList");
  const toggleSlashBtn = document.getElementById("toggleSlashBtn");

  // Toast
  const toastNotification = document.getElementById("toastNotification");

  // Preflight Banner & Doctor Elements
  const preflightAlertBanner = document.getElementById("preflightAlertBanner");
  const preflightBannerText = document.getElementById("preflightBannerText");
  const preflightActionBtn = document.getElementById("preflightActionBtn");
  const preflightDoctorBtn = document.getElementById("preflightDoctorBtn");

  const doctorBtn = document.getElementById("doctorBtn");
  const doctorBadgeDot = document.getElementById("doctorBadgeDot");
  const doctorDrawer = document.getElementById("doctorDrawer");
  const closeDoctorBtn = document.getElementById("closeDoctorBtn");
  const doctorOverallBadge = document.getElementById("doctorOverallBadge");
  const doctorSummaryHeadline = document.getElementById("doctorSummaryHeadline");
  const doctorSummarySub = document.getElementById("doctorSummarySub");
  const doctorChecksList = document.getElementById("doctorChecksList");
  const doctorAutoFixBtn = document.getElementById("doctorAutoFixBtn");
  const doctorRunTestBtn = document.getElementById("doctorRunTestBtn");
  const doctorQuickKeySection = document.getElementById("doctorQuickKeySection");
  const doctorKeyInput = document.getElementById("doctorKeyInput");
  const doctorSaveKeyBtn = document.getElementById("doctorSaveKeyBtn");

  let activePreflightReport = null;

  // Local State
  let currentAgentState = null;
  let liveTimerInterval = null;
  let cosmosEngineInstance = null;
  let isThrottlingActive = false;

  // ==========================================================================
  // 1. KEEP-ALIVE PORT CONNECTION
  // ==========================================================================
  let bgPort = null;
  function connectBackgroundPort() {
    try {
      bgPort = chrome.runtime.connect({ name: "sidekick-sidepanel" });
      bgPort.onDisconnect.addListener(() => {
        bgPort = null;
        setTimeout(connectBackgroundPort, 2000);
      });
      // Send keep-alive ping every 15s while panel is open
      setInterval(() => {
        if (bgPort) {
          try { bgPort.postMessage({ type: "PING" }); } catch {}
        }
      }, 15000);
    } catch {}
  }
  connectBackgroundPort();

  // ==========================================================================
  // 2. CPU THROTTLING CONTROLLER
  // ==========================================================================
  function setCpuThrottling(active) {
    if (isThrottlingActive === active) return;
    isThrottlingActive = active;

    if (active) {
      document.body.classList.add("ai-active-throttling");
      if (panel) panel.classList.add("ai-active-throttling");
      // Pause 3D Particle WebGL rendering to give 100% CPU to AI & CDP
      if (cosmosEngineInstance && typeof cosmosEngineInstance.pause === "function") {
        cosmosEngineInstance.pause();
      }
    } else {
      document.body.classList.remove("ai-active-throttling");
      if (panel) panel.classList.remove("ai-active-throttling");
      // Resume 3D Particle WebGL rendering when idle
      if (cosmosEngineInstance && typeof cosmosEngineInstance.resume === "function") {
        cosmosEngineInstance.resume();
      }
    }
  }

  // ==========================================================================
  // 3. UI RENDERING: AGENT STATE & TASK LEDGER
  // ==========================================================================
  function renderAgentState(state) {
    if (!state) return;
    currentAgentState = state;

    const isRunning = state.status === "RUNNING";
    const isPaused429 = state.status === "PAUSED_429";
    const isWaitingApproval = state.status === "WAITING_APPROVAL";
    const isActive = isRunning || isPaused429 || isWaitingApproval;

    // Apply CPU Throttling
    setCpuThrottling(isActive);

    // Toggle Empty State vs Active Ledger
    if (isActive) {
      if (emptyState) emptyState.classList.add("hidden");
      if (activeTaskLedger) activeTaskLedger.classList.remove("hidden");
      if (emergencyStopBtn) emergencyStopBtn.classList.remove("hidden");
      if (sendIconSvg) sendIconSvg.classList.add("hidden");
      if (stopIconSquare) stopIconSquare.classList.remove("hidden");
      startLiveTimer(state.startTime);
    } else {
      stopLiveTimer();
      if (emergencyStopBtn) emergencyStopBtn.classList.add("hidden");
      if (sendIconSvg) sendIconSvg.classList.remove("hidden");
      if (stopIconSquare) stopIconSquare.classList.add("hidden");

      if (state.status === "COMPLETED" || state.status === "STOPPED" || state.status === "ERROR") {
        if (activeTaskLedger) activeTaskLedger.classList.add("hidden");
      }
    }

    // Step Badge
    if (ledgerStepBadge) {
      ledgerStepBadge.textContent = `Step ${state.currentStep || 1} / ${state.maxSteps || 50}`;
    }

    // Objective or Rate Limit Notice
    if (ledgerObjective) {
      if (isPaused429 && state.rateLimitNotice) {
        ledgerObjective.innerHTML = `<span style="color: #f87171; font-weight: 400;">⚠️ ${escapeHtml(state.rateLimitNotice)}</span>`;
      } else {
        ledgerObjective.textContent = `Objective: ${state.objective || "Processing request…"}`;
      }
    }

    // Live Checklist
    if (ledgerChecklist && Array.isArray(state.checklist)) {
      ledgerChecklist.innerHTML = "";
      state.checklist.forEach((item) => {
        const row = document.createElement("div");
        row.className = `checklist-item ${item.status || "pending"}`;
        
        let iconHtml = "○";
        if (item.status === "done") iconHtml = "✓";
        else if (item.status === "in_progress") iconHtml = "●";

        row.innerHTML = `<span class="check-icon">${iconHtml}</span><span class="check-text">${escapeHtml(item.text)}</span>`;
        ledgerChecklist.appendChild(row);
      });
    }

    // Live Thoughts Text
    if (ledgerThoughtsText) {
      ledgerThoughtsText.textContent = state.currentThought || "Evaluating browser viewport candidate controls…";
    }

    // Consequential Safety Gate Modal
    if (safetyModal) {
      if (isWaitingApproval && state.pendingApproval) {
        safetyModal.classList.remove("hidden");
        if (safetyStepBadge) safetyStepBadge.textContent = `Step ${state.currentStep || 1}`;
        if (safetyActionDesc) {
          const app = state.pendingApproval;
          safetyActionDesc.textContent = `Sidekick is requesting permission to execute: ${app.actionType} on target ${app.targetId}. Please confirm this action to proceed.`;
        }
      } else {
        safetyModal.classList.add("hidden");
      }
    }

    // If completed or error, render final message bubble if not already present
    if (state.status === "COMPLETED" && state.resultSummary) {
      appendAssistantMessage(state.resultSummary, state.currentStep);
    } else if (state.status === "ERROR" && state.error) {
      const err = state.error;
      if (err.includes("CONFIG_ERROR") || err.includes("Gemini API Key")) {
        appendDiagnosticCard(
          "Gemini API Key Missing",
          "Autonomous browsing requires a Google AI Studio Gemini API key to run client-side in the Chrome extension.",
          "Configure API Key",
          () => handleDoctorAction("OPEN_SETTINGS_KEY")
        );
      } else if (err.includes("SECURITY_RESTRICTION") || err.includes("Security Exception") || err.includes("internal browser pages") || err.includes("Web Store")) {
        appendDiagnosticCard(
          "Target Webpage Inaccessible",
          err,
          "Open Test Webpage (Wikipedia)",
          () => handleDoctorAction("OPEN_TEST_PAGE")
        );
      } else {
        appendAssistantMessage(`Error: ${state.error}`, state.currentStep, true);
      }
    }
  }

  function startLiveTimer(startTime) {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    const updateTimer = () => {
      if (!ledgerTimer || !startTime) return;
      const elapsed = Math.max(0, (Date.now() - startTime) / 1000);
      ledgerTimer.textContent = `${elapsed.toFixed(1)}s`;
    };
    updateTimer();
    liveTimerInterval = setInterval(updateTimer, 100);
  }

  function stopLiveTimer() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }

  // ==========================================================================
  // 4. MESSAGE BUBBLES
  // ==========================================================================
  function appendUserMessage(text) {
    if (emptyState) emptyState.classList.add("hidden");
    const msg = document.createElement("div");
    msg.className = "message-row user";
    msg.innerHTML = `
      <div class="message-bubble user-bubble">
        <div class="message-content">${escapeHtml(text)}</div>
      </div>
    `;
    messagesList.appendChild(msg);
    scrollToBottom();
  }

  function appendAssistantMessage(text, stepCount, isError = false) {
    const existing = messagesList.querySelector(`[data-step-result="${stepCount}"]`);
    if (existing) return;

    const msg = document.createElement("div");
    msg.className = "message-row assistant";
    msg.setAttribute("data-step-result", String(stepCount));

    const bubbleColor = isError ? "border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08);" : "";
    msg.innerHTML = `
      <div class="message-bubble assistant-bubble" style="${bubbleColor}">
        <div class="message-content">${escapeHtml(text)}</div>
      </div>
    `;
    messagesList.appendChild(msg);
    scrollToBottom();
  }

  function appendDiagnosticCard(title, description, actionText, onActionClick, isWarn = false) {
    if (emptyState) emptyState.classList.add("hidden");
    const card = document.createElement("div");
    card.className = `diagnostic-card ${isWarn ? "warn" : ""}`;
    card.innerHTML = `
      <div class="diagnostic-card-header">
        <span class="diagnostic-card-badge">🩺 Doctor Diagnostic</span>
      </div>
      <div class="diagnostic-card-title">${escapeHtml(title)}</div>
      <div class="diagnostic-card-desc">${escapeHtml(description)}</div>
      <div class="diagnostic-card-actions">
        ${actionText ? `<button type="button" class="diagnostic-card-btn primary">${escapeHtml(actionText)}</button>` : ""}
        <button type="button" class="diagnostic-card-btn secondary">Open Doctor</button>
      </div>
    `;

    const primaryBtn = card.querySelector(".diagnostic-card-btn.primary");
    if (primaryBtn && typeof onActionClick === "function") {
      primaryBtn.addEventListener("click", onActionClick);
    }
    const secondaryBtn = card.querySelector(".diagnostic-card-btn.secondary");
    if (secondaryBtn) {
      secondaryBtn.addEventListener("click", () => {
        openDoctorDrawer();
      });
    }

    messagesList.appendChild(card);
    scrollToBottom();
  }

  function scrollToBottom() {
    if (threadContainer) {
      threadContainer.scrollTop = threadContainer.scrollHeight;
    }
  }

  // ==========================================================================
  // 5. EVENT LISTENERS & USER INPUT DISPATCH
  // ==========================================================================
  // Form Submit
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (composerBox) composerBox.classList.remove("focused");
    promptInput.blur();
    const text = (promptInput.value || "").trim();
    if (!text) return;

    if (currentAgentState && (currentAgentState.status === "RUNNING" || currentAgentState.status === "PAUSED_429")) {
      // If currently running, clicking send acts as Stop
      stopAgentLoop();
      return;
    }

    appendUserMessage(text);
    promptInput.value = "";
    promptInput.style.height = "auto";

    chrome.runtime.sendMessage({ type: "START_AGENT_LOOP", prompt: text }, (res) => {
      if (res?.state) {
        renderAgentState(res.state);
      } else if (res?.error) {
        const errMsg = res.error;
        if (errMsg.includes("CONFIG_ERROR") || errMsg.includes("Gemini API Key") || res?.issue === "MISSING_KEY") {
          appendDiagnosticCard(
            "Gemini API Key Missing",
            "Autonomous browser agents require a Google AI Studio API key to run client-side in the extension.",
            "Configure API Key",
            () => handleDoctorAction("OPEN_SETTINGS_KEY")
          );
        } else if (errMsg.includes("SECURITY_RESTRICTION") || errMsg.includes("internal browser pages") || errMsg.includes("Web Store")) {
          appendDiagnosticCard(
            "Target Webpage Inaccessible",
            errMsg,
            "Open Test Webpage (Wikipedia)",
            () => handleDoctorAction("OPEN_TEST_PAGE")
          );
        } else {
          appendDiagnosticCard(
            "Agent Paused",
            errMsg,
            "Run System Doctor",
            () => openDoctorDrawer()
          );
        }
      } else if (!res?.state) {
        appendDiagnosticCard(
          "System Preflight Notice",
          "No active browser agent state received. Check your Gemini API key and active tab permissions in System Doctor.",
          "Open System Doctor",
          () => openDoctorDrawer()
        );
      }
    });
  });

  // Emergency Stop Buttons & Escape Key
  function stopAgentLoop() {
    chrome.runtime.sendMessage({ type: "STOP_AGENT_LOOP" }, (res) => {
      if (res?.state) renderAgentState(res.state);
    });
    showToast("Autonomous loop stopped [Esc]");
  }

  if (emergencyStopBtn) emergencyStopBtn.addEventListener("click", stopAgentLoop);
  if (ledgerStopBtn) ledgerStopBtn.addEventListener("click", stopAgentLoop);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      stopAgentLoop();
    }
  });

  // Consequential Approval Actions
  if (approveActionBtn) {
    approveActionBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "APPROVE_CONSEQUENTIAL_ACTION" });
    });
  }

  if (denyActionBtn) {
    denyActionBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "DENY_CONSEQUENTIAL_ACTION" });
    });
  }

  // Quick Prompt Buttons on Empty State
  document.querySelectorAll(".empty-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      if (prompt) {
        promptInput.value = prompt;
        chatForm.dispatchEvent(new Event("submit"));
      }
    });
  });

  // Settings Drawer Handling
  async function loadSettings() {
    const storage = await chrome.storage.local.get([
      STORAGE_KEY_API_KEY,
      STORAGE_KEY_MODEL,
      STORAGE_KEY_PROXY_URL
    ]);
    if (apiKeyInput) apiKeyInput.value = storage[STORAGE_KEY_API_KEY] || "";
    if (proxyUrlInput) proxyUrlInput.value = storage[STORAGE_KEY_PROXY_URL] || "";
    if (modelSelect) modelSelect.value = storage[STORAGE_KEY_MODEL] || DEFAULT_MODEL;
  }

  async function saveSettings() {
    const key = (apiKeyInput?.value || "").trim();
    const proxy = (proxyUrlInput?.value || "").trim();
    const model = modelSelect?.value || DEFAULT_MODEL;

    if (saveSettingsBtn) saveSettingsBtn.disabled = true;
    if (saveStatus) saveStatus.textContent = "Verifying...";

    try {
      if (key) {
        const verification = await verifyApiKey(key, model);
        if (!verification.valid) {
          if (saveStatus) saveStatus.textContent = `Invalid: ${verification.error}`;
          if (typeof showToast === 'function') showToast(`API key verification failed: ${verification.error}`);
          return; // DO NOT update state or storage if invalid!
        }
      }

      await chrome.storage.local.set({
        [STORAGE_KEY_API_KEY]: key,
        [STORAGE_KEY_PROXY_URL]: proxy,
        [STORAGE_KEY_MODEL]: model
      });

      state.apiKey = key;
      state.model = model;

      if (saveStatus) {
        saveStatus.textContent = "Verified & Saved ✓";
        setTimeout(() => { saveStatus.textContent = ""; }, 2000);
      }
      if (typeof showToast === 'function') showToast("Settings verified and updated successfully");
      runPreflight();
    } catch (err) {
      if (saveStatus) saveStatus.textContent = `Error: ${sanitizeKeyFromError(err.message)}`;
    } finally {
      if (saveSettingsBtn) saveSettingsBtn.disabled = false;
    }
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      loadSettings();
      settingsDrawer.classList.toggle("hidden");
    });
  }
  if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", () => settingsDrawer.classList.add("hidden"));
  if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveSettings);

  if (toggleKeyVisibilityBtn && apiKeyInput) {
    toggleKeyVisibilityBtn.addEventListener("click", () => {
      if (apiKeyInput.type === "password") {
        apiKeyInput.type = "text";
        toggleKeyVisibilityBtn.textContent = "hide";
      } else {
        apiKeyInput.type = "password";
        toggleKeyVisibilityBtn.textContent = "show";
      }
    });
  }

  // History Drawer
  if (historyBtn) {
    historyBtn.addEventListener("click", () => historyDrawer.classList.toggle("hidden"));
  }
  if (closeHistoryBtn) closeHistoryBtn.addEventListener("click", () => historyDrawer.classList.add("hidden"));
  if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener("click", () => {
      messagesList.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      historyDrawer.classList.add("hidden");
      showToast("Chat history cleared");
    });
  }

  // New Chat Button
  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      stopAgentLoop();
      messagesList.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
      if (activeTaskLedger) activeTaskLedger.classList.add("hidden");
      showToast("Fresh session started");
    });
  }

  // Help Modal
  if (helpBtn) helpBtn.addEventListener("click", () => helpModal.classList.toggle("hidden"));
  if (closeHelpModalBtn) closeHelpModalBtn.addEventListener("click", () => helpModal.classList.add("hidden"));

  // ==========================================================================
  // SYSTEM DOCTOR & PREFLIGHT CONTROLLER
  // ==========================================================================
  function openDoctorDrawer() {
    if (doctorDrawer) {
      doctorDrawer.classList.remove("hidden");
      if (settingsDrawer) settingsDrawer.classList.add("hidden");
      if (historyDrawer) historyDrawer.classList.add("hidden");
      runPreflight();
    }
  }

  function closeDoctorDrawer() {
    if (doctorDrawer) doctorDrawer.classList.add("hidden");
  }

  if (doctorBtn) {
    doctorBtn.addEventListener("click", () => {
      if (doctorDrawer.classList.contains("hidden")) {
        openDoctorDrawer();
      } else {
        closeDoctorDrawer();
      }
    });
  }
  if (closeDoctorBtn) closeDoctorBtn.addEventListener("click", closeDoctorDrawer);
  if (preflightDoctorBtn) preflightDoctorBtn.addEventListener("click", openDoctorDrawer);

  if (doctorRunTestBtn) {
    doctorRunTestBtn.addEventListener("click", () => {
      runPreflight();
      showToast("Diagnostic tests re-run");
    });
  }

  if (doctorAutoFixBtn) {
    doctorAutoFixBtn.addEventListener("click", async () => {
      if (typeof globalThis.SidekickDoctor !== "undefined") {
        doctorAutoFixBtn.disabled = true;
        doctorAutoFixBtn.textContent = "⚡ Fixing…";
        try {
          const res = await globalThis.SidekickDoctor.autoFixAll();
          showToast(res.actionsTaken.length > 0 ? res.actionsTaken.join(" • ") : "No automatic fixes required.");
          renderDoctorReport(res.updatedPreflight);
        } catch (e) {
          showToast(`Fix error: ${e.message}`);
        } finally {
          doctorAutoFixBtn.disabled = false;
          doctorAutoFixBtn.textContent = "⚡ Auto-Fix All Issues";
        }
      }
    });
  }

  if (doctorSaveKeyBtn && doctorKeyInput) {
    doctorSaveKeyBtn.addEventListener("click", async () => {
      const key = doctorKeyInput.value.trim();
      if (!key) {
        showToast("Please enter an API key");
        return;
      }
      doctorSaveKeyBtn.disabled = true;
      doctorSaveKeyBtn.textContent = "Testing…";
      try {
        const verify = await verifyApiKey(key, DEFAULT_MODEL);
        if (!verify.valid) {
          showToast(`Verification failed: ${verify.error || 'Invalid key'}`);
          return;
        }
        await chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: key });
        state.apiKey = key;
        if (apiKeyInput) apiKeyInput.value = key;
        showToast("Gemini key verified & connected!");
        if (doctorQuickKeySection) doctorQuickKeySection.classList.add("hidden");
        runPreflight();
      } catch (e) {
        showToast(`Save error: ${e.message}`);
      } finally {
        doctorSaveKeyBtn.disabled = false;
        doctorSaveKeyBtn.textContent = "Connect";
      }
    });
  }

  async function handleDoctorAction(actionId, checkData = {}) {
    if (actionId === "OPEN_SETTINGS_KEY") {
      closeDoctorDrawer();
      if (settingsDrawer) {
        loadSettings();
        settingsDrawer.classList.remove("hidden");
      }
      if (apiKeyInput) {
        apiKeyInput.focus();
        apiKeyInput.select();
      }
    } else if (actionId === "OPEN_TEST_PAGE") {
      const url = checkData.suggestedUrl || "https://en.wikipedia.org/wiki/Artificial_intelligence";
      if (chrome.tabs && chrome.tabs.create) {
        await chrome.tabs.create({ url, active: true });
        showToast("Opened test webpage: Wikipedia");
        setTimeout(() => runPreflight(), 1000);
      }
    } else if (actionId === "AUTO_INJECT_SCRIPT") {
      if (typeof globalThis.SidekickDoctor !== "undefined") {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            await globalThis.SidekickDoctor.autoInjectContentScript(tab.id);
            showToast("Content script auto-injected successfully");
            runPreflight();
          }
        } catch (e) {
          showToast(`Injection failed: ${e.message}`);
        }
      }
    } else if (actionId === "OPEN_AI_STUDIO_QUOTA") {
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: "https://aistudio.google.com/app/apikey" });
      }
    } else if (actionId === "TEST_API_KEY") {
      runPreflight();
    }
  }

  async function runPreflight(options = {}) {
    if (typeof globalThis.SidekickDoctor === "undefined") {
      return null;
    }

    try {
      const report = await globalThis.SidekickDoctor.runFullPreflight(options);
      activePreflightReport = report;

      // 1. Update Preflight Banner
      if (preflightAlertBanner) {
        if (report && !report.ready) {
          preflightAlertBanner.classList.remove("hidden");
          const failingCheck = report.checks.find(c => c.status === "FAIL") || report.checks.find(c => c.status === "WARN");
          if (failingCheck) {
            if (preflightBannerText) preflightBannerText.textContent = failingCheck.message;
            if (failingCheck.status === "FAIL") {
              preflightAlertBanner.classList.add("fail");
            } else {
              preflightAlertBanner.classList.remove("fail");
            }
            if (preflightActionBtn) {
              if (failingCheck.actionText) {
                preflightActionBtn.textContent = failingCheck.actionText;
                preflightActionBtn.onclick = () => handleDoctorAction(failingCheck.actionId, failingCheck);
                preflightActionBtn.classList.remove("hidden");
              } else {
                preflightActionBtn.classList.add("hidden");
              }
            }
          }
        } else {
          preflightAlertBanner.classList.add("hidden");
        }
      }

      // 2. Update Doctor Header Badge Dot
      if (doctorBadgeDot) {
        if (report && !report.ready) {
          doctorBadgeDot.classList.remove("hidden");
          if (report.failCount > 0) {
            doctorBadgeDot.classList.add("fail");
          } else {
            doctorBadgeDot.classList.remove("fail");
          }
        } else {
          doctorBadgeDot.classList.add("hidden");
        }
      }

      // 3. Update Doctor Drawer
      renderDoctorReport(report);
      return report;
    } catch (e) {
      console.warn("Preflight error:", e);
      return null;
    }
  }

  function renderDoctorReport(report) {
    if (!report) return;

    if (doctorOverallBadge) {
      doctorOverallBadge.className = `doctor-status-badge ${report.ready ? "pass" : (report.failCount > 0 ? "fail" : "warn")}`;
      doctorOverallBadge.textContent = report.ready ? "Healthy ✓" : `${report.failCount + report.warnCount} Issues`;
    }

    if (doctorSummaryHeadline) {
      doctorSummaryHeadline.textContent = report.summary;
    }

    if (doctorSummarySub) {
      const ts = new Date(report.timestamp).toLocaleTimeString();
      doctorSummarySub.textContent = `Audited at ${ts} (${report.passCount} passed, ${report.failCount} failed, ${report.warnCount} warnings)`;
    }

    if (doctorChecksList && Array.isArray(report.checks)) {
      doctorChecksList.innerHTML = "";
      report.checks.forEach(check => {
        const item = document.createElement("div");
        const statusLower = (check.status || "info").toLowerCase();
        item.className = `doctor-check-item ${statusLower}`;

        let actionHtml = "";
        if (check.actionText && check.actionId) {
          actionHtml = `
            <div class="doctor-check-action-row">
              <button type="button" class="doctor-item-action-btn" data-action="${check.actionId}">${escapeHtml(check.actionText)}</button>
            </div>
          `;
        }

        item.innerHTML = `
          <div class="doctor-check-header">
            <span class="doctor-check-title">${escapeHtml(check.title)}</span>
            <span class="doctor-check-status-pill">${check.status}</span>
          </div>
          <div class="doctor-check-msg">${escapeHtml(check.message)}</div>
          ${actionHtml}
        `;

        const btn = item.querySelector(".doctor-item-action-btn");
        if (btn) {
          btn.addEventListener("click", () => handleDoctorAction(check.actionId, check));
        }

        doctorChecksList.appendChild(item);
      });
    }

    // Show quick key box if key is missing
    const keyCheck = report.checks.find(c => c.id === "api_key");
    if (doctorQuickKeySection) {
      if (keyCheck && !keyCheck.valid) {
        doctorQuickKeySection.classList.remove("hidden");
      } else {
        doctorQuickKeySection.classList.add("hidden");
      }
    }
  }

  // Tab Groups Bar & Strict Workgroup Isolation
  const bannerAddTabBtn = document.getElementById("bannerAddTabBtn");
  const bannerSwitchTabBtn = document.getElementById("bannerSwitchTabBtn");
  const addActiveTabBtn = document.getElementById("addActiveTabBtn");
  const createBindGroupBtn = document.getElementById("createBindGroupBtn");
  const unbindGroupBtn = document.getElementById("unbindGroupBtn");

  function updateTabGroupUI(s) {
    if (!s) return;
    if (groupTitleLabel) groupTitleLabel.textContent = s.groupTitle || "Si";
    if (groupTabCount) groupTabCount.textContent = `${s.tabs?.length || 0} tabs`;
    if (isolationToggle) isolationToggle.checked = s.isolationEnabled !== false;

    // Strict Isolation Guard Banner:
    // When isolation is active and current tab is outside "Si", lock automation and show banner
    if (isolationWarningBanner) {
      if (s.isConfigured && s.isolationEnabled && !s.isCurrentTabInGroup) {
        isolationWarningBanner.classList.remove("hidden");
        if (sendBtn) sendBtn.title = "Automation locked: current tab is outside the Si tab group.";
      } else {
        isolationWarningBanner.classList.add("hidden");
        if (sendBtn) sendBtn.title = "Send prompt";
      }
    }

    // Populate drawer groupTabsList
    const groupTabsList = document.getElementById("groupTabsList");
    if (groupTabsList && s.tabs) {
      groupTabsList.innerHTML = "";
      if (s.tabs.length === 0) {
        groupTabsList.innerHTML = `<div class="empty-tabs-notice" style="padding: 10px; font-size: 11px; color: var(--mute); text-align: center;">No tabs in Si group yet.</div>`;
      } else {
        s.tabs.forEach((tab) => {
          const row = document.createElement("div");
          row.className = `group-tab-row ${tab.active ? 'active-tab' : ''}`;
          row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; margin-bottom: 4px; background: rgba(255,255,255,0.03);";
          row.innerHTML = `
            <span class="tab-title" style="max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${tab.active ? '#f8fafc' : 'var(--ink)'};" title="${escapeHtml(tab.url)}">${escapeHtml(tab.title)}</span>
            ${tab.active ? '<span style="font-size: 9px; background: rgba(255,255,255,0.15); color: #fff; padding: 1px 5px; border-radius: 4px;">Active</span>' : ''}
          `;
          row.addEventListener("click", () => {
            chrome.tabs.update(tab.id, { active: true });
          });
          groupTabsList.appendChild(row);
        });
      }
    }
  }

  async function refreshTabGroupBar() {
    chrome.runtime.sendMessage({ type: "GET_MANAGED_GROUP_STATE" }, (res) => {
      if (res?.state) {
        updateTabGroupUI(res.state);
      }
    });
  }
  refreshTabGroupBar();

  if (groupBadgeBtn) {
    groupBadgeBtn.addEventListener("click", () => {
      tabGroupDrawer.classList.toggle("hidden");
    });
  }
  if (closeGroupDrawerBtn) closeGroupDrawerBtn.addEventListener("click", () => tabGroupDrawer.classList.add("hidden"));

  if (newGroupTabBtn) {
    newGroupTabBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://www.google.com" }, (tab) => {
        chrome.runtime.sendMessage({ type: "ADD_TAB_TO_MANAGED_GROUP", tabId: tab.id }, (res) => {
          if (res?.state) updateTabGroupUI(res.state);
        });
      });
    });
  }

  if (bannerAddTabBtn) {
    bannerAddTabBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.runtime.sendMessage({ type: "ADD_TAB_TO_MANAGED_GROUP", tabId: tabs[0].id }, (res) => {
            if (res?.state) updateTabGroupUI(res.state);
            showToast("Added active tab to Si");
          });
        }
      });
    });
  }

  if (bannerSwitchTabBtn) {
    bannerSwitchTabBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "GET_MANAGED_GROUP_STATE" }, (res) => {
        if (res?.state?.tabs?.[0]) {
          chrome.tabs.update(res.state.tabs[0].id, { active: true });
        }
      });
    });
  }

  if (addActiveTabBtn) {
    addActiveTabBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.runtime.sendMessage({ type: "ADD_TAB_TO_MANAGED_GROUP", tabId: tabs[0].id }, (res) => {
            if (res?.state) updateTabGroupUI(res.state);
            showToast("Added active tab to Si");
          });
        }
      });
    });
  }

  if (createBindGroupBtn) {
    createBindGroupBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "CREATE_OR_BIND_GROUP", params: { title: "Si", color: "grey" } }, (res) => {
        if (res?.state) updateTabGroupUI(res.state);
        showToast("Si group bound and active");
      });
    });
  }

  if (unbindGroupBtn) {
    unbindGroupBtn.addEventListener("click", () => {
      chrome.storage.local.remove(["sidekickManagedGroupId"], () => {
        refreshTabGroupBar();
        showToast("Group unbound");
      });
    });
  }

  if (isolationToggle) {
    isolationToggle.addEventListener("change", (e) => {
      chrome.runtime.sendMessage({ type: "SET_GROUP_ISOLATION", enabled: e.target.checked }, (res) => {
        if (res?.state) updateTabGroupUI(res.state);
        showToast(e.target.checked ? "Strict isolation active" : "Isolation disabled");
      });
    });
  }

  // Slash Command Menu
  const SLASH_COMMANDS = [
    { name: "/help", desc: "Show slash commands cheat sheet" },
    { name: "/audit", desc: "Audit data redaction enclave" },
    { name: "/summarize", desc: "Summarize the active webpage" },
    { name: "/sludge-audit", desc: "Scan and disinfect predatory web patterns" },
    { name: "/stop", desc: "Emergency stop autonomous agent loop" }
  ];

  function renderSlashList(filter = "") {
    if (!slashList) return;
    slashList.innerHTML = "";
    const filtered = SLASH_COMMANDS.filter((cmd) => cmd.name.includes(filter.toLowerCase()) || cmd.desc.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach((cmd) => {
      const item = document.createElement("div");
      item.className = "slash-item";
      item.innerHTML = `
        <div class="slash-item-top">
          <span class="slash-item-name">${cmd.name}</span>
        </div>
        <div class="slash-item-desc">${cmd.desc}</div>
      `;
      item.addEventListener("click", () => {
        if (cmd.name === "/help") {
          helpModal.classList.remove("hidden");
        } else if (cmd.name === "/stop") {
          stopAgentLoop();
        } else {
          promptInput.value = cmd.name;
          chatForm.dispatchEvent(new Event("submit"));
        }
        slashMenu.classList.add("hidden");
      });
      slashList.appendChild(item);
    });
  }

  if (toggleSlashBtn) {
    toggleSlashBtn.addEventListener("click", () => {
      renderSlashList("");
      slashMenu.classList.toggle("hidden");
    });
  }

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event("submit"));
    }
  });

  promptInput.addEventListener("focus", () => {
    if (composerBox) composerBox.classList.add("focused");
  });

  promptInput.addEventListener("blur", () => {
    if (composerBox) composerBox.classList.remove("focused");
  });

  promptInput.addEventListener("input", () => {
    const val = promptInput.value;
    if (val.startsWith("/")) {
      renderSlashList(val);
      slashMenu.classList.remove("hidden");
    } else {
      slashMenu.classList.add("hidden");
    }
  });

  // Toast Notification Helper
  function showToast(msg) {
    if (!toastNotification) return;
    toastNotification.textContent = msg;
    toastNotification.classList.remove("hidden");
    setTimeout(() => {
      toastNotification.classList.add("hidden");
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ==========================================================================
  // 6. INITIALIZATION & BACKGROUND SYNCHRONIZATION
  // ==========================================================================
  // Listen for agent updates broadcast from background.js
  if (chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "AGENT_STATE_UPDATED" && msg.state) {
        renderAgentState(msg.state);
      }
      if (msg.type === "AGENT_DEGRADED_NOTICE" && msg.warning) {
        showToast(msg.warning);
      }
      if (msg.type === "TAB_GROUP_STATE_UPDATED" && msg.state) {
        updateTabGroupUI(msg.state);
      }
      if (msg.type === "DOCTOR_ALERT") {
        runPreflight();
        if (msg.issue === "MISSING_KEY") {
          appendDiagnosticCard(
            "Gemini API Key Required",
            msg.message || "Autonomous browser actions require a Google AI Studio Gemini API key.",
            "Configure API Key",
            () => handleDoctorAction("OPEN_SETTINGS_KEY")
          );
        } else if (msg.issue === "RESTRICTED_TAB") {
          appendDiagnosticCard(
            "Page Restricted by Chrome",
            msg.message || "Chrome blocks extensions from automating internal pages.",
            "Open Test Webpage (Wikipedia)",
            () => handleDoctorAction("OPEN_TEST_PAGE")
          );
        }
      }
    });
  }

  // Active tab listeners for live preflight monitoring
  if (chrome?.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      runPreflight();
    });
  }
  if (chrome?.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.status === "complete" || changeInfo.url) {
        runPreflight();
      }
    });
  }

  // Listen to chrome.storage.session changes
  if (chrome.storage && chrome.storage.session) {
    chrome.storage.session.onChanged.addListener((changes) => {
      if (changes.sidekickAgentState?.newValue) {
        renderAgentState(changes.sidekickAgentState.newValue);
      }
    });

    // Query active state on startup to recover seamlessly
    chrome.storage.session.get("sidekickAgentState", (res) => {
      if (res?.sidekickAgentState) {
        renderAgentState(res.sidekickAgentState);
      } else {
        chrome.runtime.sendMessage({ type: "GET_AGENT_STATE" }, (stateRes) => {
          if (stateRes?.state) renderAgentState(stateRes.state);
        });
      }
    });
  }

  // Initialize 3D Living Cosmos Particle Globe (Strict MV3, zero eval)
  if (typeof initLivingCosmos === "function") {
    try {
      cosmosEngineInstance = initLivingCosmos({
        canvasId: "galaxyCanvas",
        containerId: "rrStarlightCeiling",
        nebulaIntensity: 0.88
      });
      window.__cosmosEngine = cosmosEngineInstance;
    } catch (e) {
      console.warn("Cosmos initialization notice:", e);
    }
  }

  // ==========================================================================
  // 7. HIDDEN DIAGNOSTIC COPILOT (Toggled via ` or ~)
  // ==========================================================================
  const diagnosticOverlay = document.getElementById("diagnosticOverlay");
  const diagnosticBackdrop = document.getElementById("diagnosticBackdrop");
  const closeDiagnosticBtn = document.getElementById("closeDiagnosticBtn");
  const diagnosticForm = document.getElementById("diagnosticForm");
  const diagnosticInput = document.getElementById("diagnosticInput");
  const diagnosticLog = document.getElementById("diagnosticLog");
  const diagnosticSendBtn = document.getElementById("diagnosticSendBtn");
  const diagnosticHealthStatus = document.getElementById("diagnosticHealthStatus");

  let diagnosticHistory = [];

  function toggleDiagnostic(show) {
    if (!diagnosticOverlay) return;
    const isCurrentlyHidden = diagnosticOverlay.classList.contains("hidden");
    const willShow = show !== undefined ? show : isCurrentlyHidden;
    if (willShow) {
      diagnosticOverlay.classList.remove("hidden");
      checkDiagnosticServerHealth();
      setTimeout(() => diagnosticInput?.focus(), 50);
    } else {
      diagnosticOverlay.classList.add("hidden");
    }
  }

  async function checkDiagnosticServerHealth() {
    if (!diagnosticHealthStatus) return;
    const proxyUrl = (await getStoredSetting(STORAGE_KEY_PROXY_URL, "http://localhost:3000")) || "http://localhost:3000";
    try {
      const res = await fetch(`${proxyUrl}/api/health`);
      if (res.ok) {
        const data = await res.json();
        diagnosticHealthStatus.textContent = `Server: Online • Key: ${data.hasApiKey ? 'Injected' : 'Missing'} • Model: ${data.defaultModel}`;
        diagnosticHealthStatus.style.color = '#10b981';
      } else {
        diagnosticHealthStatus.textContent = `Server: HTTP ${res.status}`;
        diagnosticHealthStatus.style.color = '#f59e0b';
      }
    } catch (e) {
      diagnosticHealthStatus.textContent = "Server: Offline (port 3000)";
      diagnosticHealthStatus.style.color = '#ef4444';
    }
  }

  async function getStoredSetting(key, fallback) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (items) => {
        resolve(items[key] || fallback);
      });
    });
  }

  function appendDiagnosticMessage(sender, text, isUser) {
    if (!diagnosticLog) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = `diagnostic-msg ${isUser ? 'user' : 'assistant'}`;
    const senderDiv = document.createElement("div");
    senderDiv.className = "diagnostic-sender";
    senderDiv.textContent = sender;
    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "diagnostic-bubble";
    bubbleDiv.textContent = text;
    msgDiv.appendChild(senderDiv);
    msgDiv.appendChild(bubbleDiv);
    diagnosticLog.appendChild(msgDiv);
    diagnosticLog.scrollTop = diagnosticLog.scrollHeight;
  }

  diagnosticForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = diagnosticInput.value.trim();
    if (!query) return;

    appendDiagnosticMessage("You", query, true);
    diagnosticInput.value = "";
    diagnosticSendBtn.disabled = true;

    diagnosticHistory.push({ role: "user", text: query });

    // Gather runtime context
    let activeTabContext = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        activeTabContext = {
          tabId: tab.id,
          title: tab.title,
          url: tab.url,
          status: tab.status,
          incognito: tab.incognito,
        };
      }
    } catch {}

    const proxyUrl = (await getStoredSetting(STORAGE_KEY_PROXY_URL, "http://localhost:3000")) || "http://localhost:3000";

    try {
      const res = await fetch(`${proxyUrl}/api/diagnostic-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          history: diagnosticHistory,
          context: {
            activeTab: activeTabContext,
            agentState: currentAgentState,
            model: "gemini-3.5-flash-lite",
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.answer) {
        appendDiagnosticMessage("Diagnostic Copilot", data.answer, false);
        diagnosticHistory.push({ role: "assistant", text: data.answer });
      } else {
        const errMsg = data.error || `HTTP ${res.status} diagnostic failure`;
        appendDiagnosticMessage("Diagnostic Copilot", `Diagnosis error: ${errMsg}`, false);
      }
    } catch (err) {
      appendDiagnosticMessage(
        "Diagnostic Copilot",
        `Could not reach diagnostic server at ${proxyUrl}. Ensure 'npm run dev' is running on port 3000.\nDetails: ${err.message}`,
        false
      );
    } finally {
      diagnosticSendBtn.disabled = false;
      diagnosticInput.focus();
    }
  });

  closeDiagnosticBtn?.addEventListener("click", () => toggleDiagnostic(false));
  diagnosticBackdrop?.addEventListener("click", () => toggleDiagnostic(false));

  // Global key listener for Backquote / Tilde (` or ~)
  document.addEventListener("keydown", (e) => {
    if (e.code === "Backquote" || e.key === "`" || e.key === "~") {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      if (isTyping && activeEl !== diagnosticInput) {
        return;
      }
      e.preventDefault();
      toggleDiagnostic();
    } else if (e.key === "Escape") {
      toggleDiagnostic(false);
    }
  });

  loadSettings();
  setTimeout(() => runPreflight(), 100);
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    verifyApiKey,
    VERIFY_ERROR_CATEGORIES,
    sanitizeKeyFromError,
    DEFAULT_MODEL,
    FALLBACK_MODEL,
    state
  };
}
