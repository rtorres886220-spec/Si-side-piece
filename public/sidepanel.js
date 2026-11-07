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
      appendAssistantMessage(`Error: ${state.error}`, state.currentStep, true);
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
      if (res?.state) renderAgentState(res.state);
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
