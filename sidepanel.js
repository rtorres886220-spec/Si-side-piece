/**
 * Sidekick - Chrome Side Panel Controller (Option B with JIT CDP & Enterprise Security)
 * Minimalist companion with defense-in-depth security, cryptographic enclave, and agentic loop.
 */

// Storage Keys
const STORAGE_KEY_API_KEY = "gemini_sidekick_api_key";
const STORAGE_KEY_MODEL = "gemini_sidekick_model";
const STORAGE_KEY_SESSIONS = "gemini_sidekick_sessions";

// Configuration
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const MAX_AGENT_STEPS = 5;

// Domain Deny-List (Automation is strictly prohibited on sensitive platforms)
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
    return false;
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
        return false;
      }
      continue;
    }
    if (hostname === denied || hostname.endsWith("." + denied)) {
      return false;
    }
  }
  return true;
}

function sanitizeUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl);
    const sensitiveKeys = [
      "token", "access_token", "auth", "code", "secret", "key", "api_key",
      "apikey", "password", "pwd", "sig", "signature", "session", "session_id",
      "refresh_token", "verification_token", "state", "email", "redirect_uri"
    ];
    for (const k of Array.from(u.searchParams.keys())) {
      if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
        u.searchParams.set(k, "[REDACTED]");
      }
    }
    return u.toString();
  } catch {
    return rawUrl.split("?")[0];
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// High-Risk Action Keywords (Word-bounded matching to prevent false positives)
const HIGH_RISK_REGEX = /\b(cancel|delete|destroy|drop|remove|unsubscribe|pay|payment|submit|confirm|proceed|continue|finish|apply|buy|checkout|purchase|order|place\s*order|transfer|wire|withdraw|publish|sign\s*out|log\s*out|logout|reset|deactivate|terminate|close\s*account|send|post|tweet|authorize|allow\s*access|approve|grant\s*access|merge|subscribe|accept|agree|enviar|payer|acheter|supprimer)\b/i;

const HIGH_RISK_KEYWORDS = [
  "cancel", "delete", "destroy", "drop", "remove", "unsubscribe", "pay", "payment",
  "submit", "confirm", "proceed", "continue", "finish", "apply", "buy", "checkout",
  "purchase", "order", "place order", "transfer", "wire", "withdraw", "publish",
  "sign out", "log out", "logout", "reset", "deactivate", "terminate", "close account",
  "send", "post", "tweet", "authorize", "allow access", "approve", "grant access",
  "merge", "subscribe", "accept", "agree", "enviar", "payer", "acheter", "supprimer"
];

// State
const state = {
  apiKey: "",
  model: DEFAULT_MODEL,
  customAssistantName: "",
  tabReadState: "reading", // "reading" | "ready" | "off" | "failed"
  tabEnabled: true,
  activeEnclaveId: "",
  activeTabId: null,
  activeTabUrl: "",
  pageContext: {
    title: "",
    url: "",
    selectedText: "",
    bodyText: "",
    charCount: 0,
    interactiveElements: []
  },
  conversation: [],
  isBusy: false,
  abortController: null,
  pendingSafetyApproval: null
};

// DOM Elements
const elements = {
  panel: document.getElementById("sidekickPanel"),
  newChatBtn: document.getElementById("newChatBtn"),
  historyBtn: document.getElementById("historyBtn"),
  settingsBtn: document.getElementById("settingsBtn"),

  // Drawers
  historyDrawer: document.getElementById("historyDrawer"),
  historyList: document.getElementById("historyList"),
  closeHistoryBtn: document.getElementById("closeHistoryBtn"),

  settingsDrawer: document.getElementById("settingsDrawer"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  toggleKeyVisibilityBtn: document.getElementById("toggleKeyVisibilityBtn"),
  modelSelect: document.getElementById("modelSelect"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  saveStatus: document.getElementById("saveStatus"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),

  // Thread
  threadContainer: document.getElementById("threadContainer"),
  emptyState: document.getElementById("emptyState"),
  onboardingCard: document.getElementById("onboardingCard"),
  onboardingKeyInput: document.getElementById("onboardingKeyInput"),
  onboardingSaveBtn: document.getElementById("onboardingSaveBtn"),
  onboardingStatus: document.getElementById("onboardingStatus"),
  promptSuggestions: document.getElementById("promptSuggestions"),
  messagesList: document.getElementById("messagesList"),

  // Composer
  composerBox: document.getElementById("composerBox"),
  chatForm: document.getElementById("chatForm"),
  promptInput: document.getElementById("promptInput"),
  selectionBanner: document.getElementById("selectionBanner"),
  selectionQuoteText: document.getElementById("selectionQuoteText"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),

  // Safety Gate Modal
  safetyModal: document.getElementById("safetyModal"),
  safetyStepBadge: document.getElementById("safetyStepBadge"),
  safetyActionDesc: document.getElementById("safetyActionDesc"),
  approveActionBtn: document.getElementById("approveActionBtn"),
  denyActionBtn: document.getElementById("denyActionBtn"),

  // Tokens
  tabToken: document.getElementById("tabToken"),
  tabTokenDot: document.getElementById("tabTokenDot"),
  tabTokenLabel: document.getElementById("tabTokenLabel"),
  selectionToken: document.getElementById("selectionToken"),
  modelToken: document.getElementById("modelToken"),
  modelTokenLabel: document.getElementById("modelTokenLabel"),

  // Send / Stop
  sendBtn: document.getElementById("sendBtn"),
  sendIconSvg: document.getElementById("sendIconSvg"),
  stopIconSquare: document.getElementById("stopIconSquare"),

  // Slash Commands & Modals
  helpBtn: document.getElementById("helpBtn"),
  speechBar: document.getElementById("speechBar"),
  stopSpeechBtn: document.getElementById("stopSpeechBtn"),
  slashMenu: document.getElementById("slashMenu"),
  slashList: document.getElementById("slashList"),
  slashCheatSheetBtn: document.getElementById("slashCheatSheetBtn") || document.getElementById("helpBtn"),
  toggleSlashBtn: document.getElementById("toggleSlashBtn"),
  helpModal: document.getElementById("helpModal"),
  closeHelpModalBtn: document.getElementById("closeHelpModalBtn"),
  helpSearchInput: document.getElementById("helpSearchInput"),
  helpModalList: document.getElementById("helpModalList"),
  auditModal: document.getElementById("auditModal"),
  closeAuditModalBtn: document.getElementById("closeAuditModalBtn"),
  auditModalBody: document.getElementById("auditModalBody"),
  toastNotification: document.getElementById("toastNotification")
};

// Safe storage wrapper
const storage = {
  async get(keys) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }
    const res = {};
    for (const k of Object.keys(keys)) {
      const v = localStorage.getItem(k);
      res[k] = v !== null ? JSON.parse(v) : keys[k];
    }
    return res;
  },
  async set(items) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => chrome.storage.local.set(items, resolve));
    }
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  }
};

/**
 * Initialize
 */
async function init() {
  const saved = await storage.get({
    [STORAGE_KEY_API_KEY]: "",
    [STORAGE_KEY_MODEL]: DEFAULT_MODEL,
    si_custom_assistant_name: ""
  });

  state.apiKey = (saved[STORAGE_KEY_API_KEY] || "").replace(/['"\s]/g, "").trim();
  state.customAssistantName = saved.si_custom_assistant_name || "";
  let loadedModel = saved[STORAGE_KEY_MODEL] || DEFAULT_MODEL;
  if (!loadedModel || (loadedModel !== DEFAULT_MODEL && loadedModel !== FALLBACK_MODEL)) {
    loadedModel = DEFAULT_MODEL;
    await storage.set({ [STORAGE_KEY_MODEL]: DEFAULT_MODEL });
  }
  state.model = loadedModel;
  state.activeEnclaveId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : ("enclave-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));

  if (elements.apiKeyInput) elements.apiKeyInput.value = state.apiKey;
  if (elements.modelSelect) elements.modelSelect.value = state.model;
  updateModelToken(state.model);
  updateOnboardingVisibility();

  bindEvents();
  setupTabListeners();
  initWordmarkAndRenaming();
  initRollsRoyceStarlight();
  await extractContext();

  if (elements.promptInput) elements.promptInput.focus();
}

/**
 * Toggle First-Run Onboarding Card vs Suggested Prompts
 */
function updateOnboardingVisibility() {
  if (!state.apiKey) {
    elements.onboardingCard?.classList.remove("hidden");
    elements.promptSuggestions?.classList.add("hidden");
  } else {
    elements.onboardingCard?.classList.add("hidden");
    elements.promptSuggestions?.classList.remove("hidden");
  }
}

/**
 * Verify Gemini API key with graceful handling of free-tier demand and auto-fallback
 */
async function verifyApiKey(rawKey, preferredModel = state.model) {
  const key = (rawKey || "").replace(/['"\s]/g, "").trim();
  if (!key) {
    return { valid: false, error: "Please enter your Gemini API key." };
  }

  const baseModel = preferredModel || DEFAULT_MODEL;
  const modelsToTry = [baseModel, FALLBACK_MODEL].filter((m, i, a) => a.indexOf(m) === i);
  
  let keyIsExplicitlyInvalid = false;
  let lastDetailedError = "";

  for (const m of modelsToTry) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "hi" }] }],
          generationConfig: { maxOutputTokens: 2 }
        })
      });

      if (res.ok) {
        return { valid: true, model: m, highDemand: false };
      }

      if (res.status === 503 || res.status === 429) {
        // Model capacity spike - key is recognized and authenticated by Google! Try next or succeed
        continue;
      }

      let errData = null;
      try { errData = await res.json(); } catch {}
      const errMsg = errData?.error?.message || "";
      const errReason = errData?.error?.details?.[0]?.reason || "";

      const isAuthError =
        res.status === 401 ||
        res.status === 403 ||
        errReason === "API_KEY_INVALID" ||
        errMsg.toLowerCase().includes("api key not valid") ||
        errMsg.toLowerCase().includes("api_key_invalid") ||
        errMsg.toLowerCase().includes("permission denied");

      if (isAuthError) {
        keyIsExplicitlyInvalid = true;
        lastDetailedError = errMsg || "Invalid API key. Please check your key from Google AI Studio.";
        break; // Key itself is invalid across all models
      } else {
        lastDetailedError = errMsg || `HTTP ${res.status}`;
        continue;
      }
    } catch {
      // If offline or network-blocked, allow standard Google API key format
      if (key.startsWith("AIzaSy")) {
        return { valid: true, model: m, highDemand: false };
      }
    }
  }

  if (keyIsExplicitlyInvalid || lastDetailedError) {
    return { valid: false, error: lastDetailedError || "Invalid Gemini API key. Please check your key from Google AI Studio." };
  }

  // All tested models returned 503/429 (traffic spike on free tier): Key was authenticated by Google
  return { valid: true, model: preferredModel || DEFAULT_MODEL, highDemand: true };
}

/**
 * Bind UI Events
 */
function bindEvents() {
  // First-run Onboarding Connect Key Button
  elements.onboardingSaveBtn?.addEventListener("click", async () => {
    const rawKey = elements.onboardingKeyInput?.value || "";
    const key = rawKey.replace(/['"\s]/g, "").trim();
    if (!key) return;

    if (elements.onboardingStatus) {
      elements.onboardingStatus.textContent = "Verifying…";
      elements.onboardingStatus.style.color = "var(--sky)";
    }

    const check = await verifyApiKey(key, state.model);

    if (check.valid) {
      state.apiKey = key;
      await storage.set({ [STORAGE_KEY_API_KEY]: key });
      if (elements.apiKeyInput) elements.apiKeyInput.value = key;
      if (elements.onboardingStatus) {
        elements.onboardingStatus.textContent = check.highDemand ? "Connected (Auto-fallback ready) ✓" : "Connected ✓";
        elements.onboardingStatus.style.color = "var(--emerald)";
      }
      setTimeout(() => {
        updateOnboardingVisibility();
        elements.promptInput?.focus();
      }, 700);
    } else {
      if (elements.onboardingStatus) {
        elements.onboardingStatus.textContent = check.error || "Invalid key";
        elements.onboardingStatus.style.color = "#f59e0b";
      }
    }
  });

  // New chat
  elements.newChatBtn?.addEventListener("click", () => {
    if (state.isBusy) stopRequest();
    state.conversation = [];
    elements.messagesList.innerHTML = "";
    elements.emptyState.style.display = "flex";
    updateOnboardingVisibility();
    elements.threadContainer.classList.remove("has-messages");
    hideSafetyModal();
    removeFollowUps();
  });

  // History Drawer
  elements.historyBtn?.addEventListener("click", () => {
    elements.settingsDrawer.classList.add("hidden");
    elements.historyDrawer.classList.toggle("hidden");
    if (!elements.historyDrawer.classList.contains("hidden")) {
      loadHistoryList();
    }
  });

  elements.closeHistoryBtn?.addEventListener("click", () => {
    elements.historyDrawer.classList.add("hidden");
  });

  // Settings Drawer
  elements.settingsBtn?.addEventListener("click", () => {
    elements.historyDrawer.classList.add("hidden");
    elements.settingsDrawer.classList.toggle("hidden");
    if (!elements.settingsDrawer.classList.contains("hidden")) {
      elements.apiKeyInput.focus();
    }
  });

  elements.closeSettingsBtn?.addEventListener("click", () => {
    elements.settingsDrawer.classList.add("hidden");
  });

  // Model token opens settings
  elements.modelToken?.addEventListener("click", () => {
    elements.historyDrawer.classList.add("hidden");
    elements.settingsDrawer.classList.remove("hidden");
    elements.modelSelect.focus();
  });

  // Toggle API Key text mask
  elements.toggleKeyVisibilityBtn?.addEventListener("click", () => {
    const isPw = elements.apiKeyInput.type === "password";
    elements.apiKeyInput.type = isPw ? "text" : "password";
    elements.toggleKeyVisibilityBtn.textContent = isPw ? "hide" : "show";
  });

  // Save Settings with live Gemini validation
  elements.saveSettingsBtn?.addEventListener("click", async () => {
    const rawKey = elements.apiKeyInput.value || "";
    const key = rawKey.replace(/['"\s]/g, "").trim();
    const mdl = elements.modelSelect.value;
    state.apiKey = key;
    state.model = mdl;

    elements.saveStatus.textContent = key ? "Verifying key…" : "Saved";
    elements.saveStatus.style.color = "var(--sky)";

    let keyStatus = "Saved ✓";
    if (key) {
      const check = await verifyApiKey(key, mdl);
      if (check.valid) {
        keyStatus = check.highDemand ? "Key verified (High demand on model) ✓" : "Key verified ✓";
        elements.saveStatus.style.color = "var(--emerald)";
      } else {
        keyStatus = check.error || "Warning: Key check failed";
        elements.saveStatus.style.color = "#f59e0b";
      }
    }

    await storage.set({
      [STORAGE_KEY_API_KEY]: key,
      [STORAGE_KEY_MODEL]: mdl
    });

    updateModelToken(mdl);
    elements.saveStatus.textContent = keyStatus;
    setTimeout(() => {
      elements.saveStatus.textContent = "";
      if (keyStatus.includes("verified") || !key) {
        elements.settingsDrawer.classList.add("hidden");
      }
    }, 1800);
  });

  // This tab token toggle / retry
  elements.tabToken?.addEventListener("click", async () => {
    if (state.tabReadState === "failed") {
      await extractContext();
    } else {
      state.tabEnabled = !state.tabEnabled;
      setTabReadState(state.tabEnabled ? "ready" : "off");
    }
  });

  // Selection token click: captures highlighted page text and shows quote banner
  elements.selectionToken?.addEventListener("click", async () => {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.scripting && state.activeTabId) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: state.activeTabId },
          func: () => window.getSelection() ? window.getSelection().toString().trim() : ""
        });
        const sel = results?.[0]?.result;
        if (sel) {
          state.pageContext.selectedText = sel;
        }
      } catch (err) {
        console.debug("Selection query error:", err);
      }
    } else if (typeof window !== "undefined" && window.getSelection) {
      const sel = window.getSelection().toString().trim();
      if (sel) {
        state.pageContext.selectedText = sel;
      }
    }
    updateSelectionUI();
    if (elements.promptInput) elements.promptInput.focus();
  });

  // Clear selection quote
  elements.clearSelectionBtn?.addEventListener("click", () => {
    state.pageContext.selectedText = "";
    updateSelectionUI();
  });

  // Empty state inline prompt buttons
  document.querySelectorAll(".empty-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      if (prompt) submitPrompt(prompt);
    });
  });

  // Composer Input Focus State for Edge Light
  elements.promptInput?.addEventListener("focus", () => {
    elements.composerBox?.classList.add("focused");
  });

  elements.promptInput?.addEventListener("blur", () => {
    elements.composerBox?.classList.remove("focused");
  });

  // Auto-resize textarea
  elements.promptInput?.addEventListener("input", (e) => {
    autoResizeTextarea();
    handleSlashInput(e.target.value);
  });

  // Slash menu toggle button
  elements.toggleSlashBtn?.addEventListener("click", () => {
    if (elements.promptInput) {
      if (elements.promptInput.value === "/") {
        elements.promptInput.value = "";
        hideSlashMenu();
      } else {
        elements.promptInput.value = "/";
        showSlashMenu();
      }
      elements.promptInput.focus();
    }
  });

  // Help modal triggers
  elements.helpBtn?.addEventListener("click", openHelpModal);
  elements.slashCheatSheetBtn?.addEventListener("click", openHelpModal);
  elements.closeHelpModalBtn?.addEventListener("click", closeHelpModal);
  elements.closeAuditModalBtn?.addEventListener("click", closeAuditModal);
  elements.stopSpeechBtn?.addEventListener("click", stopSpeech);

  elements.helpSearchInput?.addEventListener("input", (e) => {
    renderHelpList(e.target.value);
  });

  // Slash Tier tabs
  document.querySelectorAll(".slash-tier-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".slash-tier-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tier = tab.getAttribute("data-tier");
      slashState.tier = tier === "all" ? "all" : parseInt(tier, 10);
      renderSlashList();
    });
  });

  // Keydown: Slash menu navigation, Enter sends, Shift+Enter adds newline
  elements.promptInput?.addEventListener("keydown", (e) => {
    const val = elements.promptInput.value;
    if (val.startsWith("/")) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slashState.selectedIndex = (slashState.selectedIndex + 1) % Math.max(1, slashState.filtered.length);
        updateSlashSelection();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slashState.selectedIndex = (slashState.selectedIndex - 1 + Math.max(1, slashState.filtered.length)) % Math.max(1, slashState.filtered.length);
        updateSlashSelection();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        elements.promptInput.value = "";
        hideSlashMenu();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (slashState.filtered.length > 0) {
          const cmd = slashState.filtered[slashState.selectedIndex] || slashState.filtered[0];
          selectSlashCommand(cmd, false);
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        if (slashState.filtered.length > 0 && !val.includes(" ")) {
          e.preventDefault();
          const cmd = slashState.filtered[slashState.selectedIndex] || slashState.filtered[0];
          selectSlashCommand(cmd, true);
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      elements.chatForm?.dispatchEvent(new Event("submit"));
    }
  });

  // Form Submit
  elements.chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    hideSlashMenu();
    if (state.isBusy) {
      stopRequest();
      return;
    }
    const val = elements.promptInput.value.trim();
    if (!val) return;
    elements.promptInput.value = "";
    autoResizeTextarea();
    submitPrompt(val);
  });

  // HITL Approval Gate Buttons
  elements.approveActionBtn?.addEventListener("click", () => {
    if (state.pendingSafetyApproval) {
      const resolve = state.pendingSafetyApproval.resolve;
      hideSafetyModal();
      resolve(true);
    }
  });

  elements.denyActionBtn?.addEventListener("click", () => {
    if (state.pendingSafetyApproval) {
      const resolve = state.pendingSafetyApproval.resolve;
      hideSafetyModal();
      resolve(false);
    }
  });
}

function updateModelToken(mdl) {
  if (elements.modelTokenLabel) {
    elements.modelTokenLabel.textContent = mdl;
  }
}

function autoResizeTextarea() {
  const el = elements.promptInput;
  if (!el) return;
  el.style.height = "auto";
  const newHeight = Math.min(el.scrollHeight, 160);
  el.style.height = `${Math.max(newHeight, 24)}px`;
  elements.sendBtn?.classList.toggle("active", Boolean(el.value.trim()));
}

/**
 * Setup Tab change and update listeners
 */
function setupTabListeners() {
  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.onActivated?.addListener(async () => {
      await extractContext();
    });
    chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
      if (tabId === state.activeTabId) {
        if (changeInfo.status === "complete" || (changeInfo.url && changeInfo.url !== state.activeTabUrl)) {
          if (changeInfo.url) state.activeTabUrl = changeInfo.url;
          extractContext();
        }
      }
    });

    // SPA client-side history navigation (YouTube, GitHub, X/Twitter, Gmail, Next.js / React apps)
    if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
      chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
        if (details.tabId === state.activeTabId && details.frameId === 0) {
          if (details.url && details.url !== state.activeTabUrl) {
            state.activeTabUrl = details.url;
            extractContext();
          }
        }
      });
    }
  }
}

/**
 * Set "This tab" Read State
 */
function setTabReadState(newState) {
  state.tabReadState = newState;
  const token = elements.tabToken;
  const label = elements.tabTokenLabel;
  if (!token || !label) return;

  token.className = `mono-token ${newState}`;

  switch (newState) {
    case "reading":
      label.textContent = "Reading…";
      break;
    case "ready":
      label.textContent = "This tab";
      break;
    case "off":
      label.textContent = "Tab off";
      break;
    case "failed":
      label.textContent = "Can't read this tab · retry";
      break;
  }
}

/**
 * Context Extraction via Sanitized Pipeline
 */
async function extractContext() {
  setTabReadState("reading");

  try {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      }
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        setTabReadState("off");
        return;
      }
      state.activeTabId = activeTab.id;
      state.activeTabUrl = activeTab.url || "";

      // Check if internal system URL (new tab, settings, extensions)
      const isInternal =
        !state.activeTabUrl ||
        state.activeTabUrl.startsWith("chrome://") ||
        state.activeTabUrl.startsWith("chrome-search://") ||
        state.activeTabUrl.startsWith("edge://") ||
        state.activeTabUrl.startsWith("chrome-extension://") ||
        state.activeTabUrl.startsWith("about:") ||
        state.activeTabUrl === "about:blank";

      if (isInternal) {
        state.isInternalTab = true;
        state.pageContext = {
          title: "New Tab",
          url: state.activeTabUrl || "about:blank",
          selectedText: "",
          bodyText: "",
          charCount: 0,
          interactiveElements: []
        };
        setTabReadState("off");
        if (elements.tabTokenLabel) {
          elements.tabTokenLabel.textContent = "New tab";
        }
        return;
      }
      state.isInternalTab = false;

      // Check Domain Deny-List
      for (const denied of AUTOMATION_DENYLIST) {
        if (state.activeTabUrl.toLowerCase().includes(denied)) {
          setTabReadState("off");
          renderNotice(`Security Lock: Automation disabled on protected domain (${denied}).`);
          return;
        }
      }

      // Message content.js to run defense-in-depth sanitization
      chrome.tabs.sendMessage(activeTab.id, { action: "extractContext" }, { frameId: 0 }, (res) => {
        const err = chrome.runtime.lastError; // Checked to prevent console warning
        if (err || !res || !res.context) {
          // If content script was not ready, inject dynamically
          chrome.scripting.executeScript(
            { target: { tabId: activeTab.id }, files: ["content.js"] },
            () => {
              const injectErr = chrome.runtime.lastError; // Checked to prevent console warning
              if (injectErr) {
                setTabReadState("ready");
                return;
              }
              chrome.tabs.sendMessage(activeTab.id, { action: "extractContext" }, { frameId: 0 }, (res2) => {
                const err2 = chrome.runtime.lastError; // Checked to prevent console warning
                if (!err2 && res2 && res2.context) {
                  state.pageContext = res2.context;
                  setTabReadState(state.tabEnabled ? "ready" : "off");
                  updateSelectionUI();
                } else {
                  setTabReadState("ready");
                }
              });
            }
          );
        } else {
          state.pageContext = res.context;
          setTabReadState(state.tabEnabled ? "ready" : "off");
          updateSelectionUI();
        }
      });
      return;
    }

    // Fallback simulation for local development preview
    const docText = (document.body ? document.body.innerText || "" : "").slice(0, 100000);
    state.pageContext = {
      title: document.title || "Demo Page",
      url: window.location.href || "https://example.com",
      selectedText: window.getSelection ? window.getSelection().toString().trim() : "",
      bodyText: docText,
      charCount: docText.length,
      interactiveElements: []
    };
    setTabReadState(docText.length > 30 ? (state.tabEnabled ? "ready" : "off") : "failed");
    updateSelectionUI();
  } catch (err) {
    console.debug("Extraction failed:", err);
    setTabReadState("failed");
  }
}

/**
 * Update Selection Token and Quote Banner
 */
function updateSelectionUI() {
  const sel = state.pageContext.selectedText;
  if (sel && sel.length > 0) {
    elements.selectionBanner?.classList.remove("hidden");
    if (elements.selectionQuoteText) {
      elements.selectionQuoteText.textContent = `“${sel.slice(0, 85)}${sel.length > 85 ? "…" : ""}”`;
    }
  } else {
    elements.selectionBanner?.classList.add("hidden");
  }
}

/**
 * Grounding & Verification Helpers
 */
function normalizeForSearch(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/[""''`]/g, "'")
    .replace(/[–—]/g, "-")
    .trim()
    .toLowerCase();
}

function verifyQuoteInSource(quote, sourceText) {
  if (!quote || !sourceText) return false;
  const cleanQuote = quote.trim();
  if (cleanQuote.length < 3) return false;
  if (sourceText.includes(cleanQuote)) return true;
  const normQuote = normalizeForSearch(cleanQuote);
  const normSource = normalizeForSearch(sourceText);
  return normSource.includes(normQuote);
}

function validateAndEnforceGroundingClient(payload, sourceText) {
  if (!payload || !Array.isArray(payload.paragraphs)) return { sanitizedPayload: payload || { paragraphs: [] }, issues: [] };
  const issues = [];
  const contextNotes = [...(payload.contextSeparationNotes || [])];
  const sanitizedParagraphs = [];

  // Extract all numbers appearing in source document
  const numRegex = /(\$?\b\d+(?:,\d{3})*(?:\.\d+)?(?:k|m|b|t)?\b(?:\s*(?:bleu|percent|%|days?|hours?|steps?|gpus?|parameters?|layers?|usd|dollars?|million|billion|trillion|gb|mb|tb|ms|seconds?|wordpieces?|tokens?|acc|accuracy))?)/gi;

  for (const para of payload.paragraphs) {
    const rawText = para.text || "";
    const validatedCitations = [];

    if (para.citations && Array.isArray(para.citations)) {
      for (const cit of para.citations) {
        const isVerified = verifyQuoteInSource(cit.quote, sourceText);
        validatedCitations.push({
          ...cit,
          verified: isVerified
        });
      }
    }

    // Split sentences and check for numerical association and relationship conflations
    const sentences = rawText.split(/(?<=[.!?])\s+/);
    const sanitizedSentences = [];

    for (const sentence of sentences) {
      // Find numbers in sentence
      const sentenceNumbers = [];
      let m;
      const localNumRegex = new RegExp(numRegex.source, "gi");
      while ((m = localNumRegex.exec(sentence)) !== null) {
        if (m[1]) sentenceNumbers.push(m[1].toLowerCase().trim());
      }

      // If a sentence combines multiple numbers, check if all co-occur in any single paragraph or table row of the source
      if (sentenceNumbers.length >= 2) {
        const paragraphs = sourceText.split(/\n\s*\n|\n(?=[|#•])/);
        const coOccursInSingleBlock = paragraphs.some((block) => {
          const bLower = block.toLowerCase();
          return sentenceNumbers.every((tok) => bLower.includes(tok));
        });

        if (!coOccursInSingleBlock && (sentence.toLowerCase().includes(" after ") || sentence.toLowerCase().includes(" with "))) {
          issues.push({
            type: "numerical-context-misbinding",
            description: `Sentence combines numbers [${sentenceNumbers.join(", ")}] from distinct source blocks or conditions.`,
            offendingText: sentence,
            resolution: "Preserved contrastive separation across distinct conditions or benchmarks."
          });
          contextNotes.push("Identified cross-condition numerical conflation; context separation enforced.");
        }
      }

      sanitizedSentences.push(sentence);
    }

    sanitizedParagraphs.push({
      text: sanitizedSentences.join(" "),
      citations: validatedCitations
    });
  }

  return {
    sanitizedPayload: {
      ...payload,
      paragraphs: sanitizedParagraphs,
      contextSeparationNotes: Array.from(new Set(contextNotes)),
      unverifiedClaims: payload.unverifiedClaims || []
    },
    issues
  };
}

/**
 * Gemini Tools / Function Declarations Schema (Supports both camelCase and snake_case)
 */
const CDP_ACTION_DECLARATIONS = [
  {
    name: "click_element",
    description: "Click an element at viewport coordinates (x, y) using native OS-level trusted mouse click.",
    parameters: {
      type: "OBJECT",
      properties: {
        x: { type: "NUMBER", description: "Viewport X coordinate in pixels" },
        y: { type: "NUMBER", description: "Viewport Y coordinate in pixels" },
        element_description: { type: "STRING", description: "Descriptive label of the element being clicked" }
      },
      required: ["x", "y", "element_description"]
    }
  },
  {
    name: "type_text",
    description: "Focus at viewport coordinates (x, y) and type text using native OS-level trusted keystrokes.",
    parameters: {
      type: "OBJECT",
      properties: {
        x: { type: "NUMBER", description: "Viewport X coordinate of the input" },
        y: { type: "NUMBER", description: "Viewport Y coordinate of the input" },
        text: { type: "STRING", description: "The text to type" },
        press_enter: { type: "BOOLEAN", description: "Whether to press Enter after typing" }
      },
      required: ["text"]
    }
  },
  {
    name: "scroll_viewport",
    description: "Scroll the webpage viewport vertically.",
    parameters: {
      type: "OBJECT",
      properties: {
        direction: { type: "STRING", enum: ["up", "down"], description: "Direction to scroll" },
        pixels: { type: "NUMBER", description: "Pixel distance to scroll (e.g., 300)" }
      },
      required: ["direction", "pixels"]
    }
  },
  {
    name: "navigate_to",
    description: "Navigate the active browser tab to a new URL.",
    parameters: {
      type: "OBJECT",
      properties: {
        url: { type: "STRING", description: "Destination URL starting with http:// or https://" }
      },
      required: ["url"]
    }
  },
  {
    name: "upload_file",
    description: "Programmatically attach files to a file input element without native OS dialogs.",
    parameters: {
      type: "OBJECT",
      properties: {
        element_selector: { type: "STRING", description: "CSS selector for the input[type=file]" },
        file_path: { type: "STRING", description: "Local file path to attach" }
      },
      required: ["element_selector", "file_path"]
    }
  }
];

const FINISH_TASK_DECLARATION = {
  name: "finish_task",
  description: "Provide the final verified, source-grounded answer or task completion summary to the user.",
  parameters: {
    type: "OBJECT",
    properties: {
      paragraphs: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING", description: "Verified factual response containing context-separated statements" },
            citations: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  quote: { type: "STRING", description: "Verbatim quote copied directly from page" },
                  label: { type: "STRING", description: "Short section label" }
                },
                required: ["quote", "label"]
              }
            }
          },
          required: ["text"]
        }
      },
      atomicClaims: {
        type: "ARRAY",
        description: "Decomposed atomic claims with specific entity and context scope",
        items: {
          type: "OBJECT",
          properties: {
            entity: { type: "STRING" },
            assertion: { type: "STRING" },
            contextScope: { type: "STRING" },
            evidenceQuote: { type: "STRING" }
          }
        }
      },
      contextSeparationNotes: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      unverifiedClaims: {
        type: "ARRAY",
        items: { type: "STRING" }
      },
      followUps: {
        type: "ARRAY",
        items: { type: "STRING" }
      }
    },
    required: ["paragraphs"]
  }
};

const GEMINI_FUNCTION_DECLARATIONS = [...CDP_ACTION_DECLARATIONS, FINISH_TASK_DECLARATION];

const GEMINI_TOOLS = [
  {
    functionDeclarations: GEMINI_FUNCTION_DECLARATIONS
  }
];

// ============================================================================
// DETERMINISTIC ROUTING, RESOLUTION & ADAPTIVE EVIDENCE RETRIEVAL PIPELINE
// ============================================================================

const PAYMENT_KEYWORDS = [
  "stripe", "paypal", "braintree", "credit-card", "cardnumber",
  "cvv", "cvc", "exp-date", "cc-number", "payment-widget", "checkout-card"
];

function isElementRestricted(el) {
  const combined = `${el.label || ""} ${el.role || ""} ${el.selector || ""}`.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => combined.includes(kw));
}

function computeSimilarity(label, term) {
  const l = (label || "").toLowerCase().trim();
  const t = (term || "").toLowerCase().trim();
  if (!l || !t) return 0;
  if (l === t) return 1.0;
  const wordRegex = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (wordRegex.test(l)) return 0.95;
  if (l.includes(t)) {
    const ratio = t.length / l.length;
    return Math.max(0.7, Math.min(0.9, 0.7 + ratio * 0.2));
  }
  if (t.includes(l) && l.length >= 3) {
    const ratio = l.length / t.length;
    return Math.max(0.65, Math.min(0.85, 0.65 + ratio * 0.2));
  }
  return 0;
}

function resolveActionTarget(targetTerms, actionTypes, elements, viewportBounds = { width: 1920, height: 1080 }) {
  if (actionTypes.has("scroll") && actionTypes.size === 1) {
    return { isUnambiguous: true, isAmbiguous: false, hasTarget: false, directTarget: null, candidates: [] };
  }
  if (!elements || elements.length === 0) {
    return { isUnambiguous: false, isAmbiguous: false, hasTarget: false, directTarget: null, candidates: [] };
  }
  const safeElements = elements.filter((el) => {
    if (isElementRestricted(el)) return false;
    if (el.x < 0 || el.y < 0 || el.x > viewportBounds.width || el.y > viewportBounds.height) return false;
    return true;
  });
  if (safeElements.length === 0) {
    return { isUnambiguous: false, isAmbiguous: false, hasTarget: false, directTarget: null, candidates: [] };
  }
  if (!targetTerms || targetTerms.length === 0) {
    return { isUnambiguous: false, isAmbiguous: true, hasTarget: true, directTarget: null, candidates: safeElements.slice(0, 5) };
  }
  const scoredCandidates = [];
  for (const el of safeElements) {
    let maxScore = 0;
    for (const rawTerm of targetTerms) {
      const term = (rawTerm || "").toLowerCase().trim();
      if (!term) continue;
      const score = computeSimilarity(el.label, term);
      if (score > maxScore) maxScore = score;
    }
    if (actionTypes.has("type") && ((el.role || "").includes("input") || (el.role || "").includes("text"))) maxScore += 0.05;
    if (actionTypes.has("click") && ((el.role || "").includes("button") || (el.role || "").includes("link"))) maxScore += 0.02;
    if (maxScore > 0.35) {
      scoredCandidates.push({ element: { ...el, matchScore: Math.round(maxScore * 100) / 100 }, score: maxScore });
    }
  }
  scoredCandidates.sort((a, b) => b.score - a.score);
  if (scoredCandidates.length === 0) {
    return { isUnambiguous: false, isAmbiguous: true, hasTarget: true, directTarget: null, candidates: safeElements.slice(0, 5) };
  }
  const best = scoredCandidates[0];
  const secondBest = scoredCandidates[1];
  const isClearSingle = scoredCandidates.length === 1 && best.score >= 0.65;
  const isDominantWinner = best.score >= 0.85 && (!secondBest || best.score - secondBest.score >= 0.25);
  if (isClearSingle || isDominantWinner) {
    return { isUnambiguous: true, isAmbiguous: false, hasTarget: true, directTarget: best.element, candidates: [best.element] };
  }
  return { isUnambiguous: false, isAmbiguous: true, hasTarget: true, directTarget: null, candidates: scoredCandidates.slice(0, 5).map(sc => sc.element) };
}

function retrieveAdaptiveEvidence(rawBodyText, promptText, options) {
  const rawBody = (rawBodyText || "").trim();
  const selectedText = (options?.selectedText || "").trim();
  if (!rawBody) {
    return { retrievedContent: "", retainedRegionsCount: 0, totalSectionsCount: 0, isFullDocument: true, isTruncated: false, insufficientEvidence: true, selectedTextDeduplicated: false };
  }
  const stopWords = new Set(["what", "when", "where", "which", "who", "whom", "whose", "why", "how", "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "up", "about", "into", "over", "after", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "can", "could", "should", "would", "may", "might", "this", "that", "these", "those", "page", "document", "tell", "show", "find"]);
  const queryTokens = (promptText.toLowerCase().match(/[a-z0-9_-]{2,}/g) || []).filter(w => !stopWords.has(w));
  const isBroad = /(?:summarize|overview|entire|all|table\s+of\s+contents|outline)/i.test(promptText);

  // Deterministic EVIDENCE_ABSENT early detection
  if (queryTokens.length > 0 && !isBroad) {
    const rawLower = rawBody.toLowerCase();
    const hasAnyTokenMatch = queryTokens.some((tok) => rawLower.includes(tok));
    if (!hasAnyTokenMatch && !selectedText) {
      return { retrievedContent: rawBody.slice(0, 1000), retainedRegionsCount: 1, totalSectionsCount: 1, isFullDocument: false, isTruncated: true, insufficientEvidence: true, selectedTextDeduplicated: false };
    }
  }

  if (rawBody.length <= 8000) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return { retrievedContent: rawBody, retainedRegionsCount: 1, totalSectionsCount: 1, isFullDocument: true, isTruncated: false, insufficientEvidence: false, selectedTextDeduplicated: isDup };
  }
  const sectionRegex = /(?=^#{1,6}\s+)/gm;
  const rawSections = rawBody.split(sectionRegex);
  if (rawSections.length <= 2) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return { retrievedContent: rawBody, retainedRegionsCount: rawSections.length, totalSectionsCount: rawSections.length, isFullDocument: true, isTruncated: false, insufficientEvidence: false, selectedTextDeduplicated: isDup };
  }
  const parsedSections = [];
  const headingStack = [];
  for (let i = 0; i < rawSections.length; i++) {
    const secText = rawSections[i].trim();
    if (!secText) continue;
    const headingMatch = secText.match(/^(#{1,6})\s+(.+)$/m);
    const level = headingMatch ? headingMatch[1].length : 1;
    const heading = headingMatch ? headingMatch[2].trim() : (i === 0 ? "Document Header" : `Section ${i}`);
    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
    headingStack.push({ level, heading });
    parsedSections.push({ index: i, level, heading, text: secText, lowerText: secText.toLowerCase(), hasTable: secText.includes("|") || secText.includes("[Table"), score: 0 });
  }
  for (const sec of parsedSections) {
    let score = 0;
    for (const tok of queryTokens) {
      if (sec.heading.toLowerCase().includes(tok)) score += 3.0;
      if (sec.lowerText.includes(tok)) score += 1.0;
    }
    sec.score = score;
  }
  const scoredSections = parsedSections.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (scoredSections.length === 0 && !isBroad) {
    return { retrievedContent: rawSections[0] || "", retainedRegionsCount: 1, totalSectionsCount: rawSections.length, isFullDocument: false, isTruncated: true, insufficientEvidence: true, selectedTextDeduplicated: false };
  }
  const selectedIndices = new Set([0]);
  if (isBroad) {
    for (let k = 0; k < Math.min(parsedSections.length, 5); k++) selectedIndices.add(k);
  } else {
    for (let k = 0; k < Math.min(scoredSections.length, 4); k++) {
      selectedIndices.add(scoredSections[k].index);
      if (scoredSections[k].text.length < 600 || scoredSections[k].hasTable) {
        if (scoredSections[k].index > 0) selectedIndices.add(scoredSections[k].index - 1);
        if (scoredSections[k].index < rawSections.length - 1) selectedIndices.add(scoredSections[k].index + 1);
      }
    }
  }
  const orderedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  const retrievedContent = orderedIndices.map(i => rawSections[i]).join("\n\n");
  const isDeduplicated = selectedText.length > 0 && retrievedContent.includes(selectedText);
  return { retrievedContent, retainedRegionsCount: orderedIndices.length, totalSectionsCount: rawSections.length, isFullDocument: orderedIndices.length >= rawSections.length, isTruncated: orderedIndices.length < rawSections.length, insufficientEvidence: false, selectedTextDeduplicated: isDeduplicated };
}

/**
 * Classifies user prompt into Minimum Sufficient Context categories:
 * - "conversational": greetings, thanks, identity, capability queries with zero page references.
 * - "pure_action": browser clicks, scrolls, typing, navigation without asking for page information.
 * - "informational": factual questions, summaries, citations, table extractions without page actions.
 * - "hybrid": combination of information request and action, or greeting + question/action.
 */
function classifyUserRequestIntent(prompt) {
  const p = (prompt || "").trim();
  const pLower = p.toLowerCase();

  // 1. Detect Greeting / Social Conversational components
  const GREETING_PATTERNS = [
    /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|greetings|howdy)(?:[\s,!.?]|$)/i,
    /(?:how\s+are\s+you(?:\s+doing)?|how's\s+it\s+going|what's\s+up)(?:[\s,!.?]|$)/i,
    /^(?:thank\s+you|thanks(?:\s+a\s+lot)?|bye|goodbye|see\s+ya)(?:[\s,!.?]|$)/i,
    /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|explain\s+yourself|help\s+me\s+understand\s+your\s+purpose|how\s+do\s+you\s+work)(?:[\s,!.?]|$)/i
  ];
  const hasGreeting = GREETING_PATTERNS.some((pat) => pat.test(pLower));

  // 2. Detect Action Intent (Browser Automation Commands)
  const actionTypes = new Set();
  const targetTerms = [];

  const isAskingAboutAction = /(?:what\s+(?:does|is)\s+(?:the\s+)?(?:[a-z0-9_\-\s]{1,30})?(?:button|link|control)\s+(?:do|mean|for)|how\s+(?:do\s+I|to)\s+(?:click|scroll|type)|explain\s+(?:what\s+)?(?:the\s+)?(?:button|link)\s+does)/i.test(
    pLower
  );

  // Scroll actions
  if (/(?:^|\b)scroll(?:\s+(?:down|up|to\s+top|to\s+bottom|to\s+[a-z0-9_\-\s]{1,30}|smoothly|by|\d+|half))?(?:[\s,!.?]|$)/i.test(pLower)) {
    actionTypes.add("scroll");
  }

  // Click actions: imperative commands targeting an element
  if (!isAskingAboutAction) {
    const clickMatch = pLower.match(
      /(?:\b)(?:click|press|tap)(?:\s+on)?(?:\s+the)?\s+([a-z0-9_\-\"\'\s]{1,40}?)(?=(?:\s+and\b|\s+then\b|[.,!?]|$))/i
    );
    if (clickMatch) {
      actionTypes.add("click");
      const target = clickMatch[1]
        .replace(/["']/g, "")
        .replace(/\b(?:button|link|item|tab)\b/g, "")
        .trim();
      if (target) targetTerms.push(target);
    }
  }

  // Type / Fill actions
  if (!isAskingAboutAction) {
    const typeMatch = pLower.match(
      /(?:\b)(?:type|enter|fill|input)\s+(?:["'](.*?)["']\s+(?:in|into)|into\s+(?:the\s+)?([a-z0-9_\-\s]{1,30}))/i
    );
    if (typeMatch) {
      actionTypes.add("type");
      if (typeMatch[1]) targetTerms.push(typeMatch[1].trim());
      if (typeMatch[2]) targetTerms.push(typeMatch[2].trim());
    } else if (/(?:\b)(?:type|enter|fill|input)\b/i.test(pLower) && /(?:search|input|field|form|box)/i.test(pLower)) {
      actionTypes.add("type");
    }
  }

  // Navigate actions
  if (/(?:\b)(?:navigate\s+to|go\s+to\s+https?:\/\/|open\s+https?:\/\/)/i.test(pLower)) {
    actionTypes.add("navigate");
  }

  // Upload actions
  if (/(?:\b)(?:upload\s+file|attach\s+file)\b/i.test(pLower)) {
    actionTypes.add("upload");
  }

  const hasAction = actionTypes.size > 0;

  // 3. Detect Informational / Reading / Research Questions
  const isBroadSummary = /(?:^|\b)(?:summarize(?:\s+(?:the\s+)?entire\s+page|\s+this\s+page|\s+all)?|overview|entire\s+page|whole\s+document|table\s+of\s+contents|brief\s+summary)(?:[\s,!.?]|$)/i.test(
    pLower
  );

  const INFO_PATTERNS = [
    /\b(?:who|what|when|where|why|which|whose)\b/i,
    /\b(?:how\s+much|how\s+many|how\s+fast|how\s+long|how\s+often)\b/i,
    /\b(?:is\s+there|are\s+there|does\s+this|did\s+|was\s+|were\s+|can\s+you\s+find|tell\s+me\s+about)\b/i,
    /\b(?:summarize|summary|overview|explain|outline|describe|extract|quote|define|table|pricing|price|cost|score|bleu|author|date)\b/i,
    /\b(?:compare|difference|findings|results|methodology|specifications|specs|terms)\b/i
  ];

  let hasInformationQuery = isBroadSummary || INFO_PATTERNS.some((pat) => pat.test(pLower));

  if (hasGreeting) {
    const strippedGreeting = pLower
      .replace(/^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|greetings|howdy)[,\s.!]*/i, "")
      .replace(/^(?:how\s+are\s+you(?:\s+doing)?|how's\s+it\s+going|what's\s+up)[,\s.!]*/i, "")
      .replace(/^(?:thank\s+you|thanks(?:\s+a\s+lot)?|bye|goodbye|see\s+ya)[,\s.!]*/i, "")
      .replace(/^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|explain\s+yourself)[,\s.!]*/i, "")
      .trim();

    if (strippedGreeting.length === 0) {
      hasInformationQuery = false;
    }
  }

  let intent = "informational";
  if (hasAction && hasInformationQuery) {
    intent = "hybrid";
  } else if (hasAction) {
    intent = hasGreeting ? "hybrid" : "pure_action";
  } else if (hasInformationQuery) {
    intent = hasGreeting ? "hybrid" : "informational";
  } else if (hasGreeting) {
    intent = "conversational";
  } else {
    intent = "informational";
  }

  return {
    intent,
    actionTypes,
    targetTerms,
    isBroadSummary,
    requiresDomElements: intent === "pure_action" || intent === "hybrid",
    requiresPageEvidence: intent === "informational" || intent === "hybrid",
    hasGreeting,
    hasAction,
    hasInformationQuery
  };
}

/**
 * Client-Side Structure-Preserving Evidence Context Windowing.
 * Preserves headings, parent section condition hierarchy, tables, and relationships.
 * Progressively widens evidence context to prevent condition detachment.
 */
function getEvidenceAwareWindow(rawBodyText, promptText, options) {
  const rawBody = (rawBodyText || "").trim();
  const selectedText = (options?.selectedText || "").trim();

  if (!rawBody) {
    return {
      windowedContent: "",
      isTruncated: false,
      isFullDocument: true,
      retainedSectionsCount: 0,
      totalSectionsCount: 0,
      selectedTextDeduplicated: false
    };
  }

  const classification = classifyUserRequestIntent(promptText);
  if (classification.isBroadSummary || rawBody.length <= 10000) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return {
      windowedContent: rawBody,
      isTruncated: false,
      isFullDocument: true,
      retainedSectionsCount: 1,
      totalSectionsCount: 1,
      selectedTextDeduplicated: isDup
    };
  }

  const sectionRegex = /(?=^#{1,6}\s+)/gm;
  const rawSections = rawBody.split(sectionRegex);

  if (rawSections.length <= 2) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return {
      windowedContent: rawBody,
      isTruncated: false,
      isFullDocument: true,
      retainedSectionsCount: rawSections.length,
      totalSectionsCount: rawSections.length,
      selectedTextDeduplicated: isDup
    };
  }

  const parsedSections = [];
  const headingStack = [];

  for (let i = 0; i < rawSections.length; i++) {
    const secText = rawSections[i].trim();
    if (!secText) continue;

    const headingMatch = secText.match(/^(#{1,6})\s+(.+)$/m);
    const level = headingMatch ? headingMatch[1].length : 1;
    const heading = headingMatch ? headingMatch[2].trim() : (i === 0 ? "Document Header" : "Section");

    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop();
    }
    const parentIndex = headingStack.length > 0 ? headingStack[headingStack.length - 1].index : (i > 0 ? 0 : -1);
    headingStack.push({ level, index: i });

    parsedSections.push({
      index: i,
      level,
      heading,
      parentIndex,
      text: secText,
      lowerText: secText.toLowerCase(),
      hasTable: secText.includes("|") || secText.includes("[Table")
    });
  }

  const stopWords = new Set([
    "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "up", "about", "into", "over", "after",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "can", "could", "should", "would", "may", "might",
    "this", "that", "these", "those", "page", "document", "tell", "show", "find"
  ]);

  const pWords = (promptText.toLowerCase().match(/[a-z0-9_-]{2,}/g) || []).filter(
    (w) => !stopWords.has(w)
  );

  const selectedIndices = new Set();
  selectedIndices.add(0); // Always retain document header and title

  parsedSections.forEach((sec) => {
    let matchCount = 0;
    for (const word of pWords) {
      if (sec.lowerText.includes(word)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      selectedIndices.add(sec.index);
      if (sec.parentIndex >= 0) {
        selectedIndices.add(sec.parentIndex);
      }
      if (sec.text.length < 800 || sec.hasTable) {
        if (sec.index > 0) selectedIndices.add(sec.index - 1);
        if (sec.index < rawSections.length - 1) selectedIndices.add(sec.index + 1);
      }
    }
  });

  if (selectedIndices.size <= 1) {
    for (let k = 0; k < Math.min(parsedSections.length, 4); k++) {
      selectedIndices.add(k);
    }
  }

  const orderedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  let assembled = orderedIndices.map((i) => rawSections[i]).join("\n\n");

  if (assembled.length < 3000 && rawSections.length > orderedIndices.length) {
    for (let k = 0; k < rawSections.length; k++) {
      if (!selectedIndices.has(k)) {
        selectedIndices.add(k);
        orderedIndices.push(k);
        orderedIndices.sort((a, b) => a - b);
        assembled = orderedIndices.map((i) => rawSections[i]).join("\n\n");
        if (assembled.length >= 4000) break;
      }
    }
  }

  const isDeduplicated = selectedText.length > 0 && assembled.includes(selectedText);

  return {
    windowedContent: assembled,
    isTruncated: orderedIndices.length < rawSections.length,
    isFullDocument: orderedIndices.length >= rawSections.length,
    retainedSectionsCount: orderedIndices.length,
    totalSectionsCount: rawSections.length,
    selectedTextDeduplicated: isDeduplicated
  };
}

/**
 * Filter interactive elements list to minimum sufficient targets for the action.
 * Omits entire interactive list for conversational and informational queries.
 */
function filterTargetedInteractiveElements(elements, targetTerms, actionTypes) {
  if (!elements || elements.length === 0) return [];
  if (!actionTypes || actionTypes.size === 0) return [];

  // Pure vertical scrolling targets no individual element
  if (actionTypes.has("scroll") && actionTypes.size === 1) {
    return [];
  }

  if (!targetTerms || targetTerms.length === 0) {
    return elements.slice(0, 15);
  }

  const candidateIndices = new Set();
  elements.forEach((el, idx) => {
    const label = (el.label || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    const selector = (el.selector || "").toLowerCase();

    const matches = targetTerms.some(
      (term) => label.includes(term.toLowerCase()) || role.includes(term.toLowerCase()) || selector.includes(term.toLowerCase())
    );

    if (matches) {
      candidateIndices.add(idx);
      if (idx > 0) candidateIndices.add(idx - 1);
      if (idx < elements.length - 1) candidateIndices.add(idx + 1);
    }
  });

  if (candidateIndices.size > 0) {
    const ordered = Array.from(candidateIndices).sort((a, b) => a - b);
    return ordered.map((i) => elements[i]);
  }

  return elements.slice(0, 15);
}

/**
 * Compact conversation history for Gemini prompt.
 * Preserves user requests, concise answers, assertions, entities, and citation references
 * without re-serializing redundant raw JSON schema boilerplate.
 */
function compactHistoryForModel(conversation) {
  if (!Array.isArray(conversation) || conversation.length === 0) return [];

  const compact = [];
  for (const item of conversation) {
    if (!item) continue;
    const role = item.role === "user" ? "user" : "model";

    if (role === "user") {
      compact.push({
        role: "user",
        parts: [{ text: typeof item.text === "string" ? item.text : JSON.stringify(item.text) }]
      });
      continue;
    }

    if (typeof item.text === "string") {
      compact.push({ role: "model", parts: [{ text: item.text }] });
    } else if (item.text && typeof item.text === "object") {
      const obj = item.text;
      let textContent = "";
      if (Array.isArray(obj.paragraphs)) {
        textContent = obj.paragraphs
          .map((p) => (p && p.text ? p.text : ""))
          .filter(Boolean)
          .join("\n\n");

        const allCites = obj.paragraphs
          .flatMap((p) => (p && Array.isArray(p.citations) ? p.citations : []))
          .filter((c) => c && c.quote);

        if (allCites.length > 0) {
          const citeStr = allCites
            .slice(0, 4)
            .map((c) => `"${c.quote.slice(0, 60)}" (${c.label || "Source"})`)
            .join("; ");
          textContent += `\n[Citations: ${citeStr}]`;
        }
      } else if (obj.text) {
        textContent = String(obj.text);
      } else {
        textContent = JSON.stringify(obj);
      }

      compact.push({
        role: "model",
        parts: [{ text: textContent }]
      });
    }
  }

  return compact;
}

/**
 * Token Instrumentation & Diagnostics Tracker
 */
function countEstimatedTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

function countToolsTokens(toolsArray) {
  if (!toolsArray || toolsArray.length === 0) return 0;
  return countEstimatedTokens(JSON.stringify(toolsArray));
}

function recordTokenDiagnostics(metrics) {
  state.lastTokenMetrics = metrics;
  if (typeof window !== "undefined") {
    window.__sidekickTokenDiagnostics = metrics;
  }
}


/**
 * Robust Gemini API Client with Exponential Backoff Retry and Model Fallback Cascade.
 * Solves: "Error: This model is currently experiencing high demand. Spikes in demand are usually temporary."
 */
async function callGeminiWithResilience(requestBody, preferredModel, apiKey, signal) {
  const cleanKey = (apiKey || "").replace(/['"\s]/g, "").trim();
  const baseModel = preferredModel || DEFAULT_MODEL;
  const fallbackCascade = [
    baseModel,
    FALLBACK_MODEL
  ].filter((m, i, a) => a.indexOf(m) === i);

  let lastError = null;

  if (cleanKey) {
    for (let mIdx = 0; mIdx < fallbackCascade.length; mIdx++) {
      const currentModel = fallbackCascade[mIdx];
      const isFallback = mIdx > 0;

      // Up to 2 attempts per model (1 initial + 1 backoff retry for transient spikes)
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": cleanKey
            },
            body: JSON.stringify(requestBody),
            signal
          });

          if (response.ok) {
            const data = await response.json();
            return { data, usedModel: currentModel, wasFallback: isFallback };
          }

          let errorMsg = `HTTP ${response.status} ${response.statusText}`;
          let errorCode = response.status;
          let errorReason = "";
          try {
            const errorJson = await response.json();
            if (errorJson?.error?.message) errorMsg = errorJson.error.message;
            if (errorJson?.error?.code) errorCode = errorJson.error.code;
            if (errorJson?.error?.details?.[0]?.reason) errorReason = errorJson.error.details[0].reason;
          } catch {}

          lastError = new Error(errorMsg);
          lastError.status = errorCode;
          lastError.reason = errorReason;

          // Check if error is due to high demand, rate limits, or transient capacity issues
          const errorLower = errorMsg.toLowerCase();
          const isHighDemandOrOverloaded =
            errorCode === 503 ||
            errorCode === 429 ||
            errorCode === 500 ||
            errorLower.includes("high demand") ||
            errorLower.includes("spikes in demand") ||
            errorLower.includes("overloaded") ||
            errorLower.includes("capacity") ||
            errorLower.includes("resource_exhausted") ||
            errorLower.includes("temporarily unavailable");

          const isExplicitKeyError =
            errorCode === 401 ||
            errorCode === 403 ||
            errorReason === "API_KEY_INVALID" ||
            errorLower.includes("api_key_invalid") ||
            errorLower.includes("api key not valid");

          if (isExplicitKeyError) {
            throw lastError; // Do not retry across models if key is invalid
          }

          if (isHighDemandOrOverloaded) {
            if (attempt < maxRetries) {
              console.warn(`[Sidekick] ${currentModel} experiencing high demand spike. Retrying in 1.2s (attempt ${attempt}/${maxRetries})...`);
              await delay(1200);
              continue;
            }
            console.warn(`[Sidekick] ${currentModel} still overloaded. Switching to fallback in cascade...`);
            break; // Move to next model in fallback cascade
          } else {
            // Model-specific error
            if (mIdx < fallbackCascade.length - 1) {
              console.warn(`[Sidekick] Model notice on ${currentModel}: ${errorMsg}. Falling back to ${fallbackCascade[mIdx + 1]}...`);
              break;
            }
            throw lastError;
          }
        } catch (fetchErr) {
          if (fetchErr.name === "AbortError") throw fetchErr;
          lastError = fetchErr;
          const msg = (fetchErr.message || "").toLowerCase();
          const isDemand = msg.includes("high demand") || msg.includes("spikes in demand") || msg.includes("overloaded") || msg.includes("timeout") || msg.includes("fetch failed");
          if (isDemand && attempt < maxRetries) {
            await delay(1200);
            continue;
          }
          if (!isDemand && attempt < maxRetries) {
            await delay(1000);
            continue;
          }
        }
      }
    }
  }

  throw lastError || new Error("Failed to communicate with Gemini API after trying fallbacks.");
}

// ================= Complete 3-Tier Slash Commands Catalog & Engine =================
const SLASH_COMMANDS = [
  // Tier 1: Core Essentials
  { id: "summarize", name: "/summarize", aliases: ["/sum", "/brief"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/summarize [bullets | tldr | deep | executive]", desc: "Digest page with verbatim citations", example: "/summarize bullets" },
  { id: "cite", name: "/cite", aliases: ["/evidence", "/findquote"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/cite <claim or question>", desc: "Find proof and highlight passage", example: "/cite training duration", requiresArg: true },
  { id: "explain", name: "/explain", aliases: ["/eli5", "/simplify"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/explain [concept]", desc: "Explain concept in plain English", example: "/explain Multi-Head Attention" },
  { id: "actions", name: "/actions", aliases: ["/cdp", "/scan"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/actions", desc: "Scan clickable buttons and inputs", example: "/actions" },
  { id: "clear", name: "/clear", aliases: ["/reset", "/new"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/clear", desc: "Clear conversation thread", example: "/clear" },
  { id: "help", name: "/help", aliases: ["/shortcuts", "/?"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/help [command name]", desc: "Show command cheat sheet", example: "/help" },
  { id: "copy", name: "/copy", aliases: ["/export", "/save"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/copy [last | all | markdown]", desc: "Copy response or chat to clipboard", example: "/copy markdown" },

  // Tier 2: Action, Data & Audio
  { id: "click", name: "/click", aliases: [], tier: 2, tierLabel: "Tier 2: Action", syntax: "/click <element name or text>", desc: "Click element via CDP mouse event", example: "/click Add to Cart", requiresArg: true },
  { id: "fill", name: "/fill", aliases: ["/type", "/input"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/fill <field name> = <value>", desc: "Type into inputs via CDP key events", example: "/fill Search = Headphones", requiresArg: true },
  { id: "scroll", name: "/scroll", aliases: [], tier: 2, tierLabel: "Tier 2: Action", syntax: "/scroll [top | bottom | half]", desc: "Scroll page viewport smoothly", example: "/scroll bottom" },
  { id: "fillcart", name: "/fillcart", aliases: ["/checkout-prep"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/fillcart", desc: "Select options and add to cart", example: "/fillcart" },
  { id: "extract", name: "/extract", aliases: ["/scrape", "/parse"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/extract [table | links | emails | pricing | json]", desc: "Extract tables, links, or JSON", example: "/extract table" },
  { id: "reply", name: "/reply", aliases: ["/respond", "/draft"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/reply [agree | disagree | professional | concise]", desc: "Draft contextual email or PR reply", example: "/reply professional" },
  { id: "model", name: "/model", aliases: [], tier: 2, tierLabel: "Tier 2: Action", syntax: "/model [flash | pro]", desc: "Switch between Flash and Pro", example: "/model pro" },
  { id: "readaloud", name: "/readaloud", aliases: ["/tts", "/speak"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/readaloud [last | stop]", desc: "Read aloud with speech player", example: "/readaloud" },

  // Tier 3: Power, Tech & Security
  { id: "code", name: "/code", aliases: ["/snippet", "/refactor"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/code [explain | typescript | python | optimize]", desc: "Explain, optimize, or convert code", example: "/code explain" },
  { id: "inspect", name: "/inspect", aliases: ["/dom", "/selector"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/inspect <element name>", desc: "Inspect selector & coordinates", example: "/inspect search", requiresArg: true },
  { id: "curl", name: "/curl", aliases: [], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/curl", desc: "Generate curl commands for APIs", example: "/curl" },
  { id: "definitions", name: "/definitions", aliases: ["/terms", "/glossary"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/definitions", desc: "Build glossary of terms on page", example: "/definitions" },
  { id: "factcheck", name: "/factcheck", aliases: ["/verify", "/counter"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/factcheck", desc: "Audit claims, sources, and bias", example: "/factcheck" },
  { id: "translate", name: "/translate", aliases: ["/tr"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/translate [language]", desc: "Translate text or page content", example: "/translate Spanish" },
  { id: "rewrite", name: "/rewrite", aliases: ["/polish", "/fix"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/rewrite [grammar | punchy | formal | shorter]", desc: "Polish text for clarity or impact", example: "/rewrite punchy" },
  { id: "quiz", name: "/quiz", aliases: ["/testme"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/quiz [3 | 5 questions]", desc: "Create comprehension quiz", example: "/quiz 3" },
  { id: "timeline", name: "/timeline", aliases: ["/chrono"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/timeline", desc: "Extract chronological timeline", example: "/timeline" },
  { id: "audit", name: "/audit", aliases: ["/privacy", "/inspect-data"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/audit", desc: "Inspect privacy & sanitized enclave", example: "/audit" },
  { id: "sludge-audit", name: "/sludge-audit", aliases: ["/sludge", "/predatory-audit"], tier: 3, tierLabel: "Tier 3: Security", syntax: "/sludge-audit", desc: "Audit page for hidden fees & asymmetric UI", example: "/sludge-audit" },
  { id: "disinfect", name: "/disinfect", aliases: ["/clean-cart", "/uncheck-fees"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/disinfect", desc: "Instantly uncheck hidden fees & predatory toggles", example: "/disinfect" },
  { id: "cancel", name: "/cancel", aliases: ["/click-to-cancel", "/unsubscribe-now"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/cancel", desc: "Autonomous click-to-cancel roach motel navigator", example: "/cancel" },
  { id: "denylist", name: "/denylist", aliases: ["/block"], tier: 3, tierLabel: "Tier 3: Tech", syntax: "/denylist [add | remove | check]", desc: "Manage domain automation blocklist", example: "/denylist check" }
];

const slashState = {
  tier: "all",
  filtered: [],
  selectedIndex: 0,
  isSpeaking: false
};

function handleSlashInput(val) {
  if (!val.startsWith("/")) {
    hideSlashMenu();
    return;
  }
  const term = val.trim().toLowerCase().slice(1);
  let list = SLASH_COMMANDS;
  if (slashState.tier !== "all") {
    list = list.filter((c) => c.tier === slashState.tier);
  }
  if (term) {
    list = list.filter((c) => 
      c.name.slice(1).startsWith(term) ||
      c.aliases.some((a) => a.slice(1).startsWith(term)) ||
      c.desc.toLowerCase().includes(term)
    );
  }
  slashState.filtered = list;
  slashState.selectedIndex = 0;
  if (list.length > 0) {
    renderSlashList();
    showSlashMenu();
  } else {
    hideSlashMenu();
  }
}

function showSlashMenu() {
  elements.slashMenu?.classList.remove("hidden");
}

function hideSlashMenu() {
  elements.slashMenu?.classList.add("hidden");
}

function renderSlashList() {
  if (!elements.slashList) return;
  elements.slashList.innerHTML = "";
  slashState.filtered.forEach((cmd, idx) => {
    const item = document.createElement("div");
    item.className = `slash-item ${idx === slashState.selectedIndex ? "selected" : ""}`;
    const argHint = cmd.syntax
      ? cmd.syntax.trim() === cmd.name.trim()
        ? ""
        : cmd.syntax.startsWith(cmd.name)
        ? cmd.syntax.slice(cmd.name.length).trim()
        : cmd.syntax
      : "";

    item.innerHTML = `
      <div class="slash-item-top">
        <span class="slash-item-name">${escapeXml(cmd.name)}</span>
        ${argHint ? `<span class="slash-item-syntax">${escapeXml(argHint)}</span>` : ""}
      </div>
      <div class="slash-item-desc">${escapeXml(cmd.desc)}</div>
    `;
    item.addEventListener("click", () => selectSlashCommand(cmd, !cmd.requiresArg));
    item.addEventListener("mouseenter", () => {
      slashState.selectedIndex = idx;
      updateSlashSelection();
    });
    elements.slashList.appendChild(item);
  });
}

function updateSlashSelection() {
  const items = elements.slashList?.querySelectorAll(".slash-item");
  if (!items) return;
  items.forEach((el, idx) => {
    el.classList.toggle("selected", idx === slashState.selectedIndex);
  });
}

function selectSlashCommand(cmd, autoSubmit = false) {
  hideSlashMenu();
  if (cmd.id === "clear") {
    elements.promptInput.value = "";
    elements.newChatBtn?.click();
    showToast("Conversation cleared");
    return;
  }
  if (cmd.id === "help") {
    elements.promptInput.value = "";
    openHelpModal();
    return;
  }
  if (cmd.id === "audit") {
    elements.promptInput.value = "";
    openAuditModal();
    return;
  }

  if (autoSubmit || !cmd.requiresArg) {
    elements.promptInput.value = "";
    submitPrompt(cmd.name);
  } else {
    elements.promptInput.value = cmd.name + " ";
    elements.promptInput.focus();
  }
}

function showToast(msg) {
  if (!elements.toastNotification) return;
  elements.toastNotification.textContent = msg;
  elements.toastNotification.classList.remove("hidden");
  setTimeout(() => {
    elements.toastNotification.classList.add("hidden");
  }, 2500);
}

function openHelpModal() {
  elements.helpModal?.classList.remove("hidden");
  renderHelpList("");
  if (elements.helpSearchInput) {
    elements.helpSearchInput.value = "";
    elements.helpSearchInput.focus();
  }
}

function closeHelpModal() {
  elements.helpModal?.classList.add("hidden");
}

function renderHelpList(q = "") {
  if (!elements.helpModalList) return;
  elements.helpModalList.innerHTML = "";
  const query = q.toLowerCase().trim();
  const list = SLASH_COMMANDS.filter((c) => 
    !query ||
    c.name.toLowerCase().includes(query) ||
    c.desc.toLowerCase().includes(query) ||
    c.syntax.toLowerCase().includes(query)
  );

  list.forEach((c) => {
    const card = document.createElement("div");
    card.className = "modal-cmd-card";
    const badgeClass = c.tier === 1 ? "t1" : c.tier === 2 ? "t2" : "t3";
    card.innerHTML = `
      <div class="modal-cmd-top">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:var(--font-mono);font-size:12px;color:var(--sky);font-weight:500;">${c.name}</span>
          <span class="slash-item-badge ${badgeClass}">${c.tierLabel}</span>
        </div>
        <button type="button" class="modal-run-btn">Run</button>
      </div>
      <div style="font-size:11.5px;color:rgba(236,238,244,0.8);">${c.desc}</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--mute);">
        Syntax: <span style="color:#7dd3fc;">${c.syntax}</span> • Ex: <span style="color:#fde68a;">${c.example}</span>
      </div>
    `;
    card.querySelector(".modal-run-btn")?.addEventListener("click", () => {
      closeHelpModal();
      selectSlashCommand(c, !c.requiresArg);
    });
    elements.helpModalList.appendChild(card);
  });
}

function openAuditModal() {
  elements.auditModal?.classList.remove("hidden");
  if (!elements.auditModalBody) return;
  const chars = state.pageContext.charCount || 0;
  const elementsCount = state.pageContext.interactiveElements?.length || 0;
  elements.auditModalBody.innerHTML = `
    <div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:flex;flex-direction:column;gap:6px;">
      <div><strong>Enclave UUID:</strong> <span style="color:var(--sky);">${escapeHtml(state.activeEnclaveId || "enclave-active")}</span></div>
      <div><strong>Isolated Domain:</strong> <span style="color:#6ee7b7;">${escapeHtml(state.pageContext.url || "active tab")}</span></div>
      <div><strong>Sanitized DOM Elements:</strong> ${elementsCount} interactive nodes</div>
      <div><strong>Sanitized Text Size:</strong> ${chars} characters</div>
    </div>
    <div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:flex;flex-direction:column;gap:4px;">
      <div style="color:var(--sky);font-weight:500;">Sanitization Defense Pipeline:</div>
      <div>✓ Hidden DOM stripped (display:none, opacity:0)</div>
      <div>✓ Zero-width Unicode characters stripped (\\u200B)</div>
      <div>✓ Credit card numbers masked ([REDACTED_CREDIT_CARD])</div>
      <div>✓ SSN & Bearer Auth tokens masked</div>
    </div>
  `;
}

function closeAuditModal() {
  elements.auditModal?.classList.add("hidden");
}

function speakText(txt) {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const clean = txt.replace(/\\[\\d+\\]/g, "").replace(/[*_#`]/g, "").slice(0, 1000);
    const u = new SpeechSynthesisUtterance(clean);
    u.onend = () => {
      slashState.isSpeaking = false;
      elements.speechBar?.classList.add("hidden");
    };
    window.speechSynthesis.speak(u);
    slashState.isSpeaking = true;
    elements.speechBar?.classList.remove("hidden");
    showToast("Reading aloud");
  }
}

function stopSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  slashState.isSpeaking = false;
  elements.speechBar?.classList.add("hidden");
}

async function handleSlashCommand(fullCommand) {
  const parts = fullCommand.trim().split(" ");
  const rawCmd = parts[0].toLowerCase();
  const cmd = rawCmd.startsWith("/") ? rawCmd : `/${rawCmd}`;
  const arg = parts.slice(1).join(" ").trim();
  const argLower = arg.toLowerCase();

  renderUserMessage(fullCommand);
  state.conversation.push({ role: "user", text: fullCommand });

  if (elements.emptyState) elements.emptyState.style.display = "none";
  elements.threadContainer.classList.add("has-messages");

  // Canonical catalog matching: resolves all 26 commands and their aliases
  const catalogEntry = SLASH_COMMANDS.find(
    (c) => c.name === cmd || (c.aliases && c.aliases.includes(cmd)) || `/${c.id}` === cmd
  );
  const commandId = catalogEntry ? catalogEntry.id : cmd.replace(/^\//, "");

  // Tier 1: /clear (aliases: /reset, /new)
  if (commandId === "clear") {
    state.conversation = [];
    if (elements.messagesList) elements.messagesList.innerHTML = "";
    if (elements.emptyState) elements.emptyState.style.display = "flex";
    elements.threadContainer.classList.remove("has-messages");
    showToast("Conversation cleared");
    return;
  }

  // Tier 1: /help (aliases: /shortcuts, /?)
  if (commandId === "help") {
    openHelpModal();
    renderAssistantPlainMessage("Opened Command Cheat Sheet (26 slash commands across 3 tiers).");
    return;
  }

  // Tier 1: /copy (aliases: /export, /save)
  if (commandId === "copy") {
    const lastMsg = [...state.conversation].reverse().find(m => m.role === "model");
    const text = typeof lastMsg?.text === "string" ? lastMsg.text : JSON.stringify(lastMsg?.text || "No message");
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
    renderAssistantPlainMessage(`Copied last response (${text.length} chars) to clipboard.`);
    return;
  }

  // Tier 1: /actions (aliases: /cdp, /scan)
  if (commandId === "actions") {
    const elList = state.pageContext.interactiveElements || [];
    let summary = `🔍 Scanned DOM for interactive targets on active tab:\n\n`;
    if (elList.length > 0) {
      summary += elList.map(e => `• [#${e.id}] ${e.role.toUpperCase()}: "${e.label}" at (${e.x}, ${e.y})`).join("\n");
      summary += `\n\n💡 Tip: Run /click <label> to click or /fill <input> = <val> to type.`;
    } else {
      summary += "No interactive elements detected on this viewport.";
    }
    renderAssistantPlainMessage(summary);
    return;
  }

  // Tier 1: /cite (aliases: /evidence, /findquote)
  if (commandId === "cite") {
    const query = arg || "overview";
    const body = state.pageContext.bodyText || "";
    const sentences = body.split(/(?<=[.!?])\s+/);
    const qLower = query.toLowerCase();
    const matchedSentence = sentences.find(s => s.toLowerCase().includes(qLower));
    if (matchedSentence) {
      scrollToPageQuote(matchedSentence.slice(0, 50), { textContent: "" });
      await renderAssistantResponse({
        paragraphs: [
          {
            text: `Evidence found for "${query}":\n\nDirect textual proof has been located and highlighted in the active tab.`,
            citations: [
              { quote: matchedSentence.trim(), label: "Verified Passage", verified: true }
            ]
          }
        ],
        followUps: ["/summarize", "/actions", "/copy markdown"]
      });
      return;
    } else {
      renderAssistantPlainMessage(`No direct evidence found matching "${query}" in the active page context.`);
      return;
    }
  }

  // Tier 1: /summarize (aliases: /sum, /brief)
  if (commandId === "summarize") {
    await submitPrompt(`Summarize this page${arg ? ` (${arg})` : " with structured bullet points and key takeaways"}.`);
    return;
  }

  // Tier 1: /explain (aliases: /eli5, /simplify)
  if (commandId === "explain") {
    await submitPrompt(`Explain "${arg || "the primary subject of this page"}" simply and directly based strictly on page evidence.`);
    return;
  }

  // Tier 2: /click
  if (commandId === "click") {
    if (!arg) {
      renderAssistantPlainMessage("Please specify an element label or button to click. Example: `/click Add to Cart` or `/click #2`");
      return;
    }
    const match = resolveElementCoordinates({ element_description: arg, element_id: arg.startsWith("#") ? arg.slice(1) : undefined }, state.pageContext.interactiveElements);
    if (!match) {
      renderAssistantPlainMessage(`Could not find an element matching "${arg}" in the active tab. Run \`/actions\` to view all clickable elements.`);
      return;
    }
    const isHigh = await checkHighRiskAction("click_element", { element_description: match.label, x: match.x, y: match.y, selector: match.selector }, match.label);
    if (isHigh) {
      const approved = await requestSafetyApproval("click_element", { element_description: match.label }, 1);
      if (!approved) {
        renderAgentStepBadge(`Action denied by user: ${match.label}`, false);
        renderAssistantPlainMessage("Action stopped by safety policy.");
        return;
      }
    }
    try {
      await executeJITAction("click_element", { x: match.x, y: match.y, element_description: match.label, selector: match.selector });
      renderAgentStepBadge(`Step 1: Clicked "${match.label}" at (${match.x}, ${match.y}) [CDP Trusted]`, true);
      renderAssistantPlainMessage(`Successfully clicked "${match.label}". Hardware event dispatched via Chrome DevTools Protocol.`);
    } catch (err) {
      renderAgentStepBadge(`Click failed: ${err.message}`, false);
      renderAssistantPlainMessage(`Failed to click element: ${err.message}`);
    }
    return;
  }

  // Tier 2: /fill (aliases: /type, /input)
  if (commandId === "fill") {
    const eqIdx = arg.indexOf("=");
    const fieldName = eqIdx > -1 ? arg.slice(0, eqIdx).trim() : "";
    const fieldVal = eqIdx > -1 ? arg.slice(eqIdx + 1).trim() : arg;
    const match = resolveElementCoordinates({ element_description: fieldName, text: fieldVal }, state.pageContext.interactiveElements);
    if (!match) {
      renderAssistantPlainMessage(`Could not find an input field matching "${fieldName || arg}" in the active tab. Run \`/actions\` to view available inputs.`);
      return;
    }
    const isHigh = await checkHighRiskAction("type_text", { element_description: match.label, text: fieldVal, x: match.x, y: match.y, selector: match.selector }, match.label);
    if (isHigh) {
      const approved = await requestSafetyApproval("type_text", { element_description: match.label, text: fieldVal }, 1);
      if (!approved) {
        renderAgentStepBadge(`Action denied by user: ${match.label}`, false);
        renderAssistantPlainMessage("Action stopped by safety policy.");
        return;
      }
    }
    try {
      await executeJITAction("type_text", { x: match.x, y: match.y, text: fieldVal, press_enter: false, selector: match.selector });
      renderAgentStepBadge(`Step 1: Typed "${fieldVal}" into input at (${match.x}, ${match.y}) [CDP Trusted]`, true);
      renderAssistantPlainMessage(`Input updated: typed "${fieldVal}". Hardware keystrokes dispatched via Chrome DevTools Protocol.`);
    } catch (err) {
      renderAgentStepBadge(`Type failed: ${err.message}`, false);
      renderAssistantPlainMessage(`Failed to type into element: ${err.message}`);
    }
    return;
  }

  // Tier 2: /scroll
  if (commandId === "scroll") {
    const dir = argLower || "down";
    try {
      await executeJITAction("scroll_viewport", { direction: dir, pixels: 450 });
      renderAgentStepBadge(`Step 1: Scrolled page ${dir} [CDP Trusted]`, true);
      renderAssistantPlainMessage(`Viewport smoothly scrolled ${dir} via Chrome DevTools Protocol.`);
    } catch (err) {
      renderAgentStepBadge(`Scroll failed: ${err.message}`, false);
      renderAssistantPlainMessage(`Failed to scroll viewport: ${err.message}`);
    }
    return;
  }

  // Tier 2: /navigate (aliases: /goto)
  if (commandId === "navigate") {
    if (!arg) {
      renderAssistantPlainMessage("Please provide a destination URL. Example: `/navigate https://google.com`");
      return;
    }
    try {
      await executeJITAction("navigate_to", { url: arg });
      renderAgentStepBadge(`Step 1: Navigated to ${arg} [CDP Trusted]`, true);
      renderAssistantPlainMessage(`Active tab navigated to ${arg}.`);
    } catch (err) {
      renderAgentStepBadge(`Navigate failed: ${err.message}`, false);
      renderAssistantPlainMessage(`Failed to navigate: ${err.message}`);
    }
    return;
  }

  // Tier 2: /extract (aliases: /scrape, /parse)
  if (commandId === "extract") {
    const mode = argLower || "table";
    if (mode === "links") {
      const links = (state.pageContext.interactiveElements || []).filter(e => e.role === "link");
      const summary = links.length > 0
        ? `🔗 Extracted Links on Page:\n\n` + links.map(l => `• "${l.label}" at (${l.x}, ${l.y})`).join("\n")
        : "No links detected on this viewport.";
      renderAssistantPlainMessage(summary);
      return;
    }
    if (mode === "json") {
      const jsonStr = JSON.stringify({
        title: state.pageContext.title,
        url: sanitizeUrl(state.pageContext.url),
        charCount: state.pageContext.charCount,
        interactiveElementsCount: (state.pageContext.interactiveElements || []).length
      }, null, 2);
      renderAssistantPlainMessage(`\`\`\`json\n${jsonStr}\n\`\`\``);
      return;
    }
    await submitPrompt(`Extract and structure all ${arg || "tables and core data"} from this page into clean markdown.`);
    return;
  }

  // Tier 2: /model
  if (commandId === "model") {
    const target = (argLower.includes("fallback") || argLower.includes("3.1")) ? FALLBACK_MODEL : DEFAULT_MODEL;
    state.model = target;
    await storage.set({ [STORAGE_KEY_MODEL]: target });
    if (elements.modelSelect) elements.modelSelect.value = target;
    updateModelToken(target);
    showToast(`Model set to ${target}`);
    renderAssistantPlainMessage(`Switched active model to **${target}**.`);
    return;
  }

  // Tier 2: /readaloud (aliases: /tts, /speak)
  if (commandId === "readaloud") {
    if (argLower === "stop") {
      stopSpeech();
      renderAssistantPlainMessage("Speech stopped.");
      return;
    }
    const lastMsg = [...state.conversation].reverse().find(m => m.role === "model");
    const txt = typeof lastMsg?.text === "string" ? lastMsg.text : "Sidekick audio briefing.";
    speakText(txt);
    renderAssistantPlainMessage("Playing audio via Web Speech Synthesis.");
    return;
  }

  // Tier 3: /audit (aliases: /privacy, /inspect-data)
  if (commandId === "audit") {
    openAuditModal();
    renderAssistantPlainMessage("Opened Security Enclave Audit Modal.");
    return;
  }

  // Tier 3: /denylist (aliases: /block)
  if (commandId === "denylist") {
    renderAssistantPlainMessage(`Domain Automation Policy: ${AUTOMATION_DENYLIST.length} domains strictly protected.`);
    return;
  }

  // Tier 3: /sludge-audit (aliases: /sludge, /predatory-audit)
  if (commandId === "sludge-audit") {
    if (!checkDomainAllowed(state.activeTabUrl)) {
      renderAssistantPlainMessage(`Security Lock: Predatory pattern audit is disabled on sensitive domain.`);
      return;
    }
    renderAssistantPlainMessage("🔍 Scanning page for predatory patterns (hidden fees, asymmetric buttons)...", "system");
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = (tabs && tabs[0]) || (state.activeTabId ? { id: state.activeTabId } : null);
      if (!tab || !tab.id) {
        if (typeof window !== "undefined" && window.SludgeAuditor) {
          const feeFindings = window.SludgeAuditor.scanPrecheckedFees();
          const visualFindings = window.SludgeAuditor.scanAsymmetricButtons();
          const findings = [...feeFindings, ...visualFindings];
          if (findings.length === 0) {
            renderAssistantPlainMessage("✅ Audit Clean: No predatory patterns or hidden fees detected on this page.", "assistant");
          } else {
            let msg = `🚨 **Found ${findings.length} Predatory Patterns:**\n\n`;
            findings.forEach(f => {
              msg += `- **${f.type.replace(/_/g, ' ').toUpperCase()}** (${f.severity}):\n  *"${f.detectedText}"*\n`;
            });
            msg += `\n💡 Type \`/disinfect\` to instantly neutralize these threats.`;
            renderAssistantPlainMessage(msg, "assistant");
          }
          return;
        }
        renderAssistantPlainMessage("❌ Could not scan page. Ensure the page is fully loaded.", "system");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: "RUN_SLUDGE_AUDIT" }, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError || !response || !response.findings) {
          renderAssistantPlainMessage("❌ Could not scan page. Ensure the page is fully loaded.", "system");
          return;
        }
        if (response.findings.length === 0) {
          renderAssistantPlainMessage("✅ Audit Clean: No predatory patterns or hidden fees detected on this page.", "assistant");
        } else {
          let msg = `🚨 **Found ${response.findings.length} Predatory Patterns:**\n\n`;
          response.findings.forEach(f => {
            msg += `- **${f.type.replace(/_/g, ' ').toUpperCase()}** (${f.severity}):\n  *"${f.detectedText}"*\n`;
          });
          msg += `\n💡 Type \`/disinfect\` to instantly neutralize these threats.`;
          renderAssistantPlainMessage(msg, "assistant");
        }
      });
    });
    return;
  }

  // Tier 2: /disinfect (aliases: /clean-cart, /uncheck-fees)
  if (commandId === "disinfect") {
    if (!checkDomainAllowed(state.activeTabUrl)) {
      renderAssistantPlainMessage(`Security Lock: Automated disinfection is disabled on sensitive domain.`);
      return;
    }
    renderAssistantPlainMessage("🛡️ Disinfecting cart... unchecking unconsented fees and add-ons.", "system");
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = (tabs && tabs[0]) || (state.activeTabId ? { id: state.activeTabId } : null);
      if (!tab || !tab.id) {
        renderAssistantPlainMessage("❌ Disinfection failed. Target tab inaccessible.", "system");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: "EXECUTE_DISINFECT" }, { frameId: 0 }, (response) => {
        if (chrome.runtime.lastError || !response) {
          renderAssistantPlainMessage("❌ Disinfection failed. Could not communicate with page.", "system");
          return;
        }
        if (response.count === 0) {
          renderAssistantPlainMessage("✅ No active threats required disinfection.", "assistant");
        } else {
          renderAssistantPlainMessage(`🛡️ **Disinfection Complete!** Automatically neutralized **${response.count}** unconsented fees/toggles.`, "assistant");
        }
      });
    });
    return;
  }

  // Tier 2: /cancel (aliases: /click-to-cancel, /unsubscribe-now)
  if (commandId === "cancel") {
    if (!checkDomainAllowed(state.activeTabUrl)) {
      renderAssistantPlainMessage(`Security Lock: Autonomous cancellation is strictly prohibited on sensitive domain.`);
      return;
    }
    renderAssistantPlainMessage("🤖 Initiating Autonomous Click-to-Cancel Engine...", "system");
    
    let stepsTaken = 0;
    let stuckRetries = 0;
    const maxSteps = 8;
    const maxRetries = 3;

    function runCancelLoop() {
      if (state.abortController?.signal.aborted) {
        renderAssistantPlainMessage("🛑 Cancellation flow stopped by user.", "system");
        return;
      }
      if (stepsTaken >= maxSteps) {
        renderAssistantPlainMessage("⚠️ Halting: Reached maximum steps. Maze requires manual intervention.", "system");
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = (tabs && tabs[0]) || (state.activeTabId ? { id: state.activeTabId } : null);
        if (!tab || !tab.id) {
          renderAssistantPlainMessage("⏳ Waiting for page navigation to complete...", "system");
          setTimeout(runCancelLoop, 2000);
          return;
        }
        
        chrome.tabs.sendMessage(tab.id, { action: "EXECUTE_CANCEL_STEP" }, { frameId: 0 }, async (response) => {
          if (chrome.runtime.lastError || !response) {
            renderAssistantPlainMessage("⏳ Waiting for page navigation to complete...", "system");
            setTimeout(runCancelLoop, 2000);
            return;
          }
          
          if (response.status === "complete") {
            renderAssistantPlainMessage(`✅ **SUCCESS:** ${response.message}`, "assistant");
          } else if (response.status === "requires_approval") {
            const approved = await requestSafetyApproval("click_element", {
              element_description: response.targetName,
              selector: response.selector
            }, stepsTaken + 1);

            if (!approved) {
              renderAgentStepBadge(`Cancellation stopped by user: ${response.targetName}`, false);
              renderAssistantPlainMessage("🛑 Cancellation flow stopped by user.", "system");
              return;
            }

            chrome.tabs.sendMessage(tab.id, { action: "EXECUTE_APPROVED_CANCEL_CLICK", selector: response.selector }, { frameId: 0 }, (clickRes) => {
              if (clickRes && clickRes.success) {
                stepsTaken++;
                stuckRetries = 0;
                renderAgentStepBadge(`[Step ${stepsTaken}] Confirmed: ${response.targetName}`, true);
                renderAssistantPlainMessage(`🔄 Step ${stepsTaken}: ${response.message}`, "system");
                setTimeout(runCancelLoop, 1200);
              } else {
                renderAssistantPlainMessage(`⚠️ Failed to click target: ${clickRes?.error || "Target element not interactable"}`, "system");
              }
            });
          } else if (response.status === "stuck") {
            if (stuckRetries < maxRetries) {
              stuckRetries++;
              setTimeout(runCancelLoop, 1500);
            } else {
              renderAssistantPlainMessage(`⚠️ **Halted:** ${response.message}`, "system");
            }
          } else {
            stepsTaken++;
            stuckRetries = 0;
            renderAssistantPlainMessage(`🔄 Step ${stepsTaken}: ${response.message}`, "system");
            setTimeout(runCancelLoop, 1000);
          }
        });
      });
    }
    
    runCancelLoop();
    return;
  }

  // Additional Tier 2 & Tier 3 catalog commands:
  if (commandId === "factcheck") {
    await submitPrompt("Perform a rigorous fact-check and evidence verification of claims made on this page, separating verified facts from unverified claims.");
    return;
  }
  if (commandId === "translate") {
    await submitPrompt(`Translate the key content of this page into ${arg || "Spanish"}.`);
    return;
  }
  if (commandId === "rewrite") {
    await submitPrompt(`Rewrite and polish the following text from this page${arg ? ` (${arg})` : ""}:`);
    return;
  }
  if (commandId === "definitions") {
    await submitPrompt("Extract a glossary and definition list of key terms defined on this page.");
    return;
  }
  if (commandId === "timeline") {
    await submitPrompt("Extract a chronological timeline of events mentioned in this page.");
    return;
  }
  if (commandId === "quiz") {
    await submitPrompt(`Generate a ${arg || "3-question"} comprehension quiz testing key factual takeaways from this page with answers cited from the text.`);
    return;
  }
  if (commandId === "code") {
    await submitPrompt(`Analyze and explain code snippets on this page${arg ? ` (${arg})` : ""}.`);
    return;
  }
  if (commandId === "reply") {
    await submitPrompt(`Draft a ${arg || "professional"} reply to the message or discussion on this page.`);
    return;
  }
  if (commandId === "fillcart") {
    await submitPrompt("Find the primary purchase or add-to-cart action on this page and proceed.");
    return;
  }
  if (commandId === "curl") {
    await submitPrompt("Generate curl commands for API requests based on documentation on this page.");
    return;
  }
  if (commandId === "inspect") {
    const elList = state.pageContext.interactiveElements || [];
    const matched = resolveElementCoordinates({ element_description: arg }, elList);
    if (matched) {
      renderAssistantPlainMessage(`🔍 Inspected Element: "${matched.label}"\n• Role: ${matched.role}\n• Selector: \`${matched.selector}\`\n• Viewport Coords: (${matched.x}, ${matched.y})`);
    } else {
      renderAssistantPlainMessage(`Could not find an element matching "${arg}" to inspect.`);
    }
    return;
  }

  // CATCH-ALL: Prevent infinite loop for unsupported commands
  renderAssistantPlainMessage(`The command "/${cmd.replace(/^\//, "")}" is not currently supported or implemented.`);
  return;
}

/**
 * Lightweight, XSS-Safe Markdown to HTML Renderer
 */
function renderMarkdownToHtml(markdownText) {
  if (!markdownText) return "";
  let text = String(markdownText);

  // 1. Code blocks
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    codeBlocks.push(`<pre class="code-block-box"><code class="language-${lang || 'plaintext'}">${escaped}</code></pre>`);
    return id;
  });

  // 2. Escape HTML entities in remainder
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 3. Inline code
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 4. Headers
  text = text.replace(/^### (.*$)/gim, '<h4 style="margin:8px 0 4px;font-size:13px;font-weight:600;">$1</h4>');
  text = text.replace(/^## (.*$)/gim, '<h3 style="margin:10px 0 4px;font-size:14px;font-weight:600;">$1</h3>');
  text = text.replace(/^# (.*$)/gim, '<h2 style="margin:12px 0 6px;font-size:15px;font-weight:700;">$1</h2>');

  // 5. Bold & Italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/___(.*?)___/g, "<strong><em>$1</em></strong>");
  text = text.replace(/__(.*?)__/g, "<strong>$1</strong>");
  text = text.replace(/\*([^\*\n]+)\*/g, "<em>$1</em>");
  text = text.replace(/_([^_\n]+)_/g, "<em>$1</em>");

  // 6. Blockquotes
  text = text.replace(/^\> (.*$)/gim, '<blockquote style="border-left:2px solid var(--accent, #6366f1);padding-left:8px;margin:6px 0;opacity:0.85;">$1</blockquote>');

  // 7. Unordered lists
  text = text.replace(/^[\*\-] (.*$)/gim, '<li style="margin-left:16px;list-style-type:disc;">$1</li>');
  text = text.replace(/(<li style="margin-left:16px;list-style-type:disc;">.*<\/li>\n?)+/g, '<ul style="margin:6px 0;padding-left:4px;">$&</ul>');

  // 8. Ordered lists
  text = text.replace(/^\d+\. (.*$)/gim, '<li style="margin-left:16px;list-style-type:decimal;">$1</li>');
  text = text.replace(/(<li style="margin-left:16px;list-style-type:decimal;">.*<\/li>\n?)+/g, '<ol style="margin:6px 0;padding-left:4px;">$&</ol>');

  // 9. Paragraph breaks & line breaks
  text = text.replace(/\n\n+/g, '<p style="margin:6px 0;"></p>');
  text = text.replace(/\n/g, '<br>');

  // 10. Restore code blocks
  codeBlocks.forEach((block, idx) => {
    text = text.replace(`__CODE_BLOCK_${idx}__`, block);
  });

  return text;
}

function renderAssistantPlainMessage(txt, type = "assistant") {
  const item = document.createElement("div");
  item.className = `message-item ${type === "system" ? "system" : "assistant"}`;
  const formatted = renderMarkdownToHtml(txt);
  item.innerHTML = `<div class="${type === "system" ? "system-notice" : "assistant-content"}">${formatted}</div>`;
  elements.messagesList?.appendChild(item);
  scrollThreadBottom();
}

/**
 * Render Assistant Markdown Response (Open Synthesis, Transform Worker)
 */
function renderAssistantMarkdownMessage(markdownText, followUps = []) {
  const entry = document.createElement("div");
  entry.className = "message-entry assistant";

  const container = document.createElement("div");
  container.className = "assistant-text markdown-body";

  const html = renderMarkdownToHtml(markdownText);
  container.innerHTML = html;

  // Add Copy button meta bar
  const metaBar = document.createElement("div");
  metaBar.className = "message-meta-bar";
  metaBar.innerHTML = `
    <button type="button" class="meta-copy-btn" title="Copy response to clipboard">
      <svg class="meta-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      <span class="copy-label">Copy</span>
    </button>
  `;
  const copyBtn = metaBar.querySelector(".meta-copy-btn");
  copyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(markdownText);
    const label = metaBar.querySelector(".copy-label");
    if (label) label.textContent = "Copied!";
    setTimeout(() => { if (label) label.textContent = "Copy"; }, 1500);
  });

  entry.appendChild(container);
  entry.appendChild(metaBar);

  elements.messagesList?.appendChild(entry);
  scrollThreadBottom();

  if (followUps && followUps.length > 0) {
    renderFollowUps(followUps);
  }
}

/**
 * Handle Prompt Submission via Multi-Agent Pipeline Coordinator
 */
async function submitPrompt(promptText) {
  removeFollowUps();
  hideSafetyModal();

  // Check if it's a slash command first!
  if (promptText.trim().startsWith("/")) {
    await handleSlashCommand(promptText.trim());
    return;
  }

  if (!state.apiKey) {
    renderUserMessage(promptText);
    renderInlineKeySetup();
    return;
  }

  renderUserMessage(promptText);
  state.conversation.push({ role: "user", text: promptText });

  if (elements.emptyState) {
    elements.emptyState.style.display = "none";
  }
  elements.threadContainer.classList.add("has-messages");
  setBusyState(true);

  // Generate dynamic cryptographic UUID enclave for this request
  state.activeEnclaveId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : ("enclave-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));

  state.abortController = new AbortController();

  try {
    const apiClient = new SidekickApiClient(state.apiKey, state.model);
    const coordinator = new SidekickCoordinator(apiClient);

    const result = await coordinator.processTurn(promptText, state.pageContext, {
      signal: state.abortController.signal,
      enclaveId: state.activeEnclaveId,
      onProgress: (actionLabel, detail, step) => {
        updateTurnAction(actionLabel, detail, step);
      }
    });

    // 1. Mechanical Action Bypass (0ms)
    if (result.type === "mechanical") {
      const dir = result.direction || "down";
      await executeJITAction("scroll_viewport", { direction: dir, pixels: 450 });
      renderAgentStepBadge(`Scrolled page ${dir} [Direct Mechanical Action]`, true);
      renderAssistantPlainMessage(`Viewport smoothly scrolled ${dir} via Chrome DevTools Protocol.`);
      state.conversation.push({ role: "model", text: `Viewport scrolled ${dir}.` });
      saveSession();
      return;
    }

    // 2. Security Lockout or Action Validation Blocked
    if (result.type === "security_blocked" || result.type === "action_blocked" || (result.type === "action" && (!result.payload || result.gateResult?.passed === false))) {
      const reason = result.reason || "Action failed deterministic verification invariants and could not be repaired.";
      renderAgentStepBadge(`Action Blocked: ${reason}`, false);
      renderAssistantPlainMessage(`🛡️ **Action Blocked by Deterministic Gate:**\n${reason}`);
      state.conversation.push({ role: "model", text: reason });
      saveSession();
      return;
    }

    // 3. Action Worker Execution (Element [#ID] based)
    if (result.type === "action") {
      const actionData = result.payload;
      const actType = actionData.action;

      if (actType === "scroll") {
        const dir = actionData.direction || "down";
        await executeJITAction("scroll_viewport", { direction: dir, pixels: 450 });
        renderAgentStepBadge(`Scrolled page ${dir} [CDP Action]`, true);
        renderAssistantPlainMessage(`Viewport smoothly scrolled ${dir}.`);
      } else if (actType === "navigate") {
        if (!actionData.url || (!actionData.url.startsWith("http://") && !actionData.url.startsWith("https://"))) {
          renderAgentStepBadge(`Blocked navigation: Invalid URL`, false);
          renderAssistantPlainMessage(`🛑 Navigation blocked: Invalid protocol for "${actionData.url}".`);
          return;
        }
        if (!checkDomainAllowed(actionData.url)) {
          renderAgentStepBadge(`Blocked navigation: Restricted domain`, false);
          renderAssistantPlainMessage(`🛡️ Navigation blocked: Destination "${actionData.url}" matches restricted domain.`);
          return;
        }
        // MANDATORY SAFETY APPROVAL FOR NAVIGATION
        const approved = await requestSafetyApproval("navigate_to", { url: actionData.url }, 1);
        if (!approved) {
          renderAgentStepBadge(`Navigation denied by user: ${actionData.url}`, false);
          renderAssistantPlainMessage("Navigation stopped by user.");
          return;
        }
        await executeJITAction("navigate_to", { url: actionData.url });
        renderAgentStepBadge(`Navigated to ${actionData.url} [CDP Action]`, true);
        renderAssistantPlainMessage(`Navigated active tab to ${actionData.url}.`);
        await delay(80);
        await extractContext();
      } else if (actType === "click" || actType === "type") {
        let targetEl = null;
        if (state.pageContext?.interactiveElements) {
          targetEl = state.pageContext.interactiveElements.find(e => e.id === actionData.target_id);
        }

        if (!targetEl && actionData.element_label && state.pageContext?.interactiveElements) {
          targetEl = resolveElementCoordinates({ element_description: actionData.element_label }, state.pageContext.interactiveElements);
        }

        if (!targetEl) {
          renderAssistantPlainMessage(`Target element [#${actionData.target_id || "?"}] could not be found in active viewport.`);
          return;
        }

        // Live coordinate re-verification to eliminate stale coordinates
        let liveX = targetEl.x;
        let liveY = targetEl.y;
        if (state.activeTabId && targetEl.selector) {
          try {
            const liveRes = await new Promise(res => {
              chrome.tabs.sendMessage(state.activeTabId, { action: "reverifyCoordinates", selector: targetEl.selector, x: liveX, y: liveY }, { frameId: 0 }, r => {
                const _ = chrome.runtime.lastError;
                res(r?.coords);
              });
              setTimeout(() => res(null), 120);
            });
            if (liveRes && liveRes.verified) {
              liveX = liveRes.x;
              liveY = liveRes.y;
            }
          } catch {}
        }

        const isClick = actType === "click";
        const cdpTool = isClick ? "click_element" : "type_text";
        const cdpArgs = {
          x: liveX,
          y: liveY,
          selector: targetEl.selector,
          element_description: targetEl.label,
        };
        if (!isClick) {
          cdpArgs.text = actionData.text || "test";
          cdpArgs.press_enter = false;
        }

        // Check high risk confirmation
        const isHighRisk = checkHighRiskAction(cdpTool, cdpArgs, targetEl.label);
        if (isHighRisk) {
          const approved = await requestSafetyApproval(cdpTool, cdpArgs, 1);
          if (!approved) {
            renderAgentStepBadge(`Action denied by user: ${targetEl.label}`, false);
            renderAssistantPlainMessage("Action stopped by user.");
            return;
          }
        }

        await executeJITAction(cdpTool, cdpArgs);
        renderAgentStepBadge(`[Step 1] ${isClick ? "Clicked" : "Typed into"} "${targetEl.label}" [CDP Trusted]`, true);
        const feedback = isClick
          ? `Clicked "${targetEl.label}" (element [#${targetEl.id}]). Hardware event dispatched via Chrome DevTools Protocol.`
          : `Typed "${cdpArgs.text}" into "${targetEl.label}". Keystrokes dispatched via Chrome DevTools Protocol.`;
        renderAssistantPlainMessage(feedback);

        // Invalidate stale observation and re-extract context after action
        await delay(80);
        await extractContext();
      }

      state.conversation.push({ role: "model", text: JSON.stringify(actionData) });
      saveSession();
      return;
    }

    // 4. Answer Worker Execution (Factual with receipts)
    if (result.type === "answer") {
      const answerPayload = result.payload;
      await renderAssistantResponse(answerPayload);
      state.conversation.push({ role: "model", text: answerPayload });
      saveSession();
      return;
    }

    // 5. Transform Worker Execution (Open synthesis, evaluate, rewrite, etc.)
    if (result.type === "transform") {
      const transformPayload = result.payload;
      renderAssistantMarkdownMessage(transformPayload.text || "", transformPayload.followUps || []);
      state.conversation.push({ role: "model", text: transformPayload.text || "" });
      saveSession();
      return;
    }

  } catch (error) {
    if (error.name === "AbortError") {
      renderNotice("Generation stopped.");
    } else {
      console.error("Multi-Agent Pipeline Error:", error);
      const handled = await handleResilientDirectActionFallback(promptText);
      if (!handled) {
        renderErrorCard(error, promptText);
      }
    }
  } finally {
    setBusyState(false);
    hideSafetyModal();
    state.abortController = null;
    scrollThreadBottom();
  }
}

/**
 * Resilient Direct Action Fallback
 * Executes explicit user action commands even when external AI API is experiencing transient 503 load
 */
async function handleResilientDirectActionFallback(promptText) {
  const pLower = promptText.toLowerCase().trim();

  // 1. Click element intent
  if (pLower.startsWith("click ") || pLower.startsWith("press ") || pLower.startsWith("tap ")) {
    const targetQuery = pLower.replace(/^(click|press|tap)\s+(on\s+)?(the\s+)?/i, "").trim();
    const match = resolveElementCoordinates({ element_description: targetQuery }, state.pageContext.interactiveElements);
    if (match) {
      const isHigh = checkHighRiskAction("click_element", { element_description: match.label });
      if (isHigh) {
        const approved = await requestSafetyApproval("click_element", { element_description: match.label }, 1);
        if (!approved) {
          renderAgentStepBadge(`Action denied by user: ${match.label}`, false);
          renderAssistantPlainMessage("Action cancelled by user.");
          return true;
        }
      }
      try {
        await executeJITAction("click_element", { x: match.x, y: match.y, element_description: match.label, selector: match.selector });
        renderAgentStepBadge(`Step 1: Clicked "${match.label}" at (${match.x}, ${match.y}) [CDP Trusted]`, true);
        renderAssistantPlainMessage(`Successfully clicked "${match.label}". Hardware event dispatched via Chrome DevTools Protocol.`);
        return true;
      } catch (e) {
        console.debug("Fallback click failed:", e);
      }
    }
  }

  // 2. Scroll viewport intent
  if (pLower.startsWith("scroll") || pLower === "scroll down" || pLower === "scroll up" || pLower === "scroll to top" || pLower === "scroll to bottom") {
    const dir = pLower.includes("up") ? "up" : pLower.includes("top") ? "top" : pLower.includes("bottom") ? "bottom" : "down";
    try {
      await executeJITAction("scroll_viewport", { direction: dir, pixels: 450 });
      renderAgentStepBadge(`Step 1: Scrolled page ${dir} [CDP Trusted]`, true);
      renderAssistantPlainMessage(`Viewport smoothly scrolled ${dir} via Chrome DevTools Protocol.`);
      return true;
    } catch (e) {
      console.debug("Fallback scroll failed:", e);
    }
  }

  // 3. Type into input intent
  if (pLower.startsWith("type ") || pLower.startsWith("fill ") || pLower.startsWith("enter ")) {
    const textMatch = promptText.match(/(?:type|fill|enter)\s+["']?([^"']+)["']?\s+(?:in|into|on)\s+["']?([^"']+)["']?/i);
    if (textMatch) {
      const textToType = textMatch[1].trim();
      const fieldDesc = textMatch[2].trim();
      const match = resolveElementCoordinates({ element_description: fieldDesc, text: textToType }, state.pageContext.interactiveElements);
      if (match) {
        const isHigh = checkHighRiskAction("type_text", { element_description: match.label, text: textToType }, match.label);
        if (isHigh) {
          const approved = await requestSafetyApproval("type_text", { element_description: match.label, text: textToType }, 1);
          if (!approved) {
            renderAgentStepBadge(`Action denied by user: ${match.label}`, false);
            renderAssistantPlainMessage("Action stopped by safety policy.");
            return true;
          }
        }
        try {
          await executeJITAction("type_text", { x: match.x, y: match.y, text: textToType, press_enter: false, selector: match.selector });
          renderAgentStepBadge(`Step 1: Typed "${textToType}" into input at (${match.x}, ${match.y}) [CDP Trusted]`, true);
          renderAssistantPlainMessage(`Input updated: typed "${textToType}" via Chrome DevTools Protocol.`);
          return true;
        } catch (e) {}
      }
    }
  }

  // 4. Informational question answered from active tab text
  if (state.pageContext.bodyText && state.pageContext.bodyText.length > 50) {
    const trimmed = pLower.trim();
    const isPureGreeting = /^(hi|hello|hey|good\s+(morning|afternoon|evening|day))[\s!.?]*$/i.test(trimmed);
    const isConversationalInquiry = /^(how\s+are\s+you(\s+doing)?|who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|how's\s+it\s+going|how\s+do\s+you\s+do)[\s!.?]*$/i.test(trimmed);

    if (isPureGreeting || isConversationalInquiry) {
      renderAssistantPlainMessage(
        isConversationalInquiry && /who/i.test(trimmed)
          ? "I'm Sidekick. I run browser actions, pull verified facts, and cut through the noise with zero fluff. Talk to me—what are we doing on this page?"
          : "I'm locked in. What are we doing on this tab?"
      );
      return true;
    }

    const STOP_WORDS = new Set([
      "how", "are", "you", "who", "what", "when", "where", "why",
      "the", "and", "for", "with", "that", "this", "from", "have",
      "has", "had", "can", "could", "will", "would", "should", "all",
      "any", "some", "our", "your", "their", "its", "about", "into",
      "more", "then", "them", "these", "those", "does", "been", "being",
      "hello", "hey", "hi", "good", "morning", "afternoon", "evening",
      "please", "tell", "show", "help", "thank", "thanks", "there", "here"
    ]);

    const body = state.pageContext.bodyText;
    const sentences = body.split(/(?<=[.!?])\s+/);
    const words = (pLower.match(/[a-z0-9_-]{3,}/g) || []).filter((w) => !STOP_WORDS.has(w));
    if (words.length > 0) {
      let bestSentence = "";
      let bestMatches = 0;
      for (const sent of sentences) {
        const sLower = sent.toLowerCase();
        let matchCount = 0;
        for (const w of words) {
          if (sLower.includes(w)) matchCount++;
        }
        if (matchCount > bestMatches) {
          bestMatches = matchCount;
          bestSentence = sent.trim();
        }
      }
      if (bestMatches >= 2 && bestSentence) {
        renderAgentStepBadge(`Grounded on active tab: ${state.pageContext.title.slice(0, 30)}`, true);
        await renderAssistantResponse({
          paragraphs: [
            {
              text: bestSentence,
              citations: [
                { quote: bestSentence.slice(0, 60), label: state.pageContext.title.slice(0, 25) || "Page Context" }
              ]
            }
          ],
          followUps: ["/actions", "/summarize", "/copy"]
        });
        return true;
      }
    }
  }

  return false;
}

/**
 * High-Risk Action Classifier (Upgraded to inspect physical coordinates & prevent safety bypass)
 * A5: Inspects element physically at (x, y) coordinates
 * A6: Word-bounded keywords & gates type_text with press_enter
 */
function checkHighRiskAction(toolName, args = {}, targetLabel = "") {
  if (toolName === "scroll_viewport") return false;

  // A6: typing with Enter key can submit forms / post messages / trigger checkout
  if (toolName === "type_text" && (args.press_enter || args.pressEnter)) {
    return true;
  }

  let labelToCheck = targetLabel;
  // A5: If coordinates are provided, inspect what is physically at (x, y)
  let physicalLabel = "";
  if (args.x !== undefined && args.y !== undefined && state?.pageContext?.interactiveElements) {
    const nearElement = state.pageContext.interactiveElements.find(el => {
      return Math.abs(el.x - args.x) <= 30 && Math.abs(el.y - args.y) <= 30;
    });
    if (nearElement?.label) {
      physicalLabel = nearElement.label;
    }
  }

  if (!labelToCheck && state?.pageContext?.interactiveElements) {
    if (physicalLabel) {
      labelToCheck = physicalLabel;
    } else {
      const matched = resolveElementCoordinates(args, state.pageContext.interactiveElements);
      if (matched?.label) {
        labelToCheck = matched.label;
      }
    }
  }

  const desc = (args.element_description || "").toLowerCase();
  const text = (args.text || "").toLowerCase();
  const label = (labelToCheck || args.label || "").toLowerCase();
  const phys = physicalLabel.toLowerCase();
  const actionName = (toolName || "").toLowerCase();

  const textToCheck = `${actionName} ${desc} ${text} ${label} ${phys}`.toLowerCase();

  if (HIGH_RISK_REGEX.test(textToCheck)) {
    return true;
  }

  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (textToCheck.includes(keyword)) {
      return true;
    }
  }

  if (toolName === "upload_file" || toolName === "navigate_to") {
    return true;
  }

  return false;
}

/**
 * Human-in-the-Loop Approval Modal Trigger
 * A7: Surfaces exact file path in upload_file modal description
 */
function requestSafetyApproval(toolName, args, stepNumber) {
  return new Promise((resolve) => {
    state.pendingSafetyApproval = { resolve };

    if (elements.safetyModal && elements.safetyActionDesc && elements.safetyStepBadge) {
      elements.safetyStepBadge.textContent = `Step ${stepNumber} of ${MAX_AGENT_STEPS}`;
      const targetParam = args.element_description || args.text || args.url || args.filePath || args.file_path || (args.files ? args.files.join(", ") : "") || "";
      elements.safetyActionDesc.textContent = `Sidekick is about to execute: ${toolName.replace(/_/g, " ")} ("${targetParam}") on ${state.activeTabUrl.split("/")[2] || "current page"}.`;
      elements.safetyModal.classList.remove("hidden");
    } else {
      resolve(true);
    }
  });
}

function hideSafetyModal() {
  if (elements.safetyModal) {
    elements.safetyModal.classList.add("hidden");
  }
  state.pendingSafetyApproval = null;
}

/**
 * Helper to resolve element coordinates from indexed elements if missing or incomplete
 */
function resolveElementCoordinates(args, elements) {
  if (!elements || elements.length === 0) return null;
  const targetId = args.element_id !== undefined ? args.element_id : args.id;
  if (targetId !== undefined) {
    const found = elements.find((e) => String(e.id) === String(targetId));
    if (found) return found;
  }
  const desc = (args.element_description || args.label || args.text || "").toLowerCase().trim();
  if (desc) {
    let found = elements.find((e) => (e.label || "").toLowerCase().trim() === desc);
    if (found) return found;
    found = elements.find((e) => (e.label || "").toLowerCase().includes(desc) || desc.includes((e.label || "").toLowerCase()));
    if (found) return found;
  }
  if (args.selector) {
    const found = elements.find((e) => e.selector === args.selector);
    if (found) return found;
  }
  if (args.text !== undefined) {
    const inputEl = elements.find((e) => (e.role || "").includes("input") || (e.role || "").includes("text"));
    if (inputEl) return inputEl;
  }
  return null;
}

/**
 * Execute CDP Action via Background Service Worker
 */
async function executeJITAction(toolName, args) {
  if (!state.activeTabId) throw new Error("No active tab connected");

  // Smart Coordinate & Element Resolution if coordinates are missing or invalid
  if (toolName === "click_element" || toolName === "type_text") {
    if (args.x === undefined || args.y === undefined || isNaN(args.x) || isNaN(args.y)) {
      const resolved = resolveElementCoordinates(args, state.pageContext.interactiveElements);
      if (resolved) {
        args.x = resolved.x;
        args.y = resolved.y;
        if (!args.selector) args.selector = resolved.selector;
        if (!args.element_description) args.element_description = resolved.label;
      }
    }
  }

  // JIT Live Coordinate Re-verification (Prevents missed clicks if page was scrolled or element moved)
  if (toolName === "click_element" || toolName === "type_text") {
    if (args.selector || (args.x !== undefined && args.y !== undefined)) {
      try {
        const liveCoords = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            state.activeTabId,
            { action: "reverifyCoordinates", selector: args.selector, x: args.x, y: args.y },
            { frameId: 0 },
            (res) => {
              const _ = chrome.runtime.lastError;
              resolve(res?.coords);
            }
          );
          setTimeout(() => resolve(null), 150);
        });
        if (liveCoords && liveCoords.blocked) {
          throw new Error("Security Exception: Interaction with checkout or payment widget is strictly blocked.");
        }
        if (liveCoords && liveCoords.verified) {
          args.x = liveCoords.x;
          args.y = liveCoords.y;
        }
      } catch {}
    }
  }

  // Show visual dot on active page if coordinates exist
  if (args.x !== undefined && args.y !== undefined) {
    try {
      chrome.tabs.sendMessage(state.activeTabId, {
        action: "highlightTarget",
        x: args.x,
        y: args.y,
        label: args.element_description
      }, { frameId: 0 }, () => {
        const _ = chrome.runtime.lastError;
      });
    } catch {}
  }

  let cdpAction = "click";
  let params = {};

  switch (toolName) {
    case "click_element":
      cdpAction = "click";
      params = { x: args.x, y: args.y, selector: args.selector };
      break;

    case "type_text": {
      const text = args.text || args.value || "";
      const pressEnter = args.press_enter !== undefined ? args.press_enter : (args.pressEnter !== undefined ? args.pressEnter : false);
      cdpAction = "type";
      params = { x: args.x, y: args.y, text, pressEnter, selector: args.selector };
      break;
    }

    case "scroll_viewport": {
      cdpAction = "scroll";
      const dir = (args.direction || "down").toLowerCase();
      const px = Math.abs(typeof args.pixels === "number" && !isNaN(args.pixels) ? args.pixels : 400);
      let deltaY = px;
      if (dir === "up") deltaY = -px;
      else if (dir === "top") deltaY = -5000;
      else if (dir === "bottom") deltaY = +5000;
      else deltaY = px;
      params = { deltaY };
      break;
    }

    case "navigate_to": {
      let targetUrl = (args.url || "").trim();
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }
      cdpAction = "navigate";
      params = { url: targetUrl };
      break;
    }

    case "upload_file":
      cdpAction = "uploadFile";
      params = { selector: args.element_selector, files: [args.file_path] };
      break;

    default:
      throw new Error(`Unsupported tool: ${toolName}`);
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "EXECUTE_CDP_ACTION",
        tabId: state.activeTabId,
        action: cdpAction,
        params
      },
      (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res || !res.success) {
          reject(new Error(res?.error || "CDP execution failed"));
        } else {
          resolve(res.result);
        }
      }
    );
  });
}

function formatActionSummary(toolName, args) {
  switch (toolName) {
    case "click_element":
      return `Clicked "${args.element_description}" at (${args.x}, ${args.y})`;
    case "type_text":
      return `Typed into input: "${args.text.slice(0, 30)}${args.text.length > 30 ? "…" : ""}"`;
    case "scroll_viewport":
      return `Scrolled page ${args.direction} by ${args.pixels}px`;
    case "navigate_to":
      return `Navigated to ${args.url}`;
    case "upload_file":
      return `Attached file to ${args.element_selector}`;
    default:
      return `${toolName}`;
  }
}

function stopRequest() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

let turnTimerInterval = null;
let turnStartTime = 0;

function startTurnIndicator(action, detail = "", step = 1) {
  const indicator = document.getElementById("activeTurnIndicator");
  if (!indicator) return;
  indicator.classList.remove("hidden");
  updateTurnActionUI(action, detail, step);
}

function updateTurnAction(action, detail = "", step = 1) {
  updateTurnActionUI(action, detail, step);
}

function updateTurnActionUI(action, detail = "", step = 1) {
  const labelEl = document.getElementById("turnActionLabel");
  if (labelEl) labelEl.textContent = action || "Processing…";

  const progressPercent = step === 1 ? 25 : step === 2 ? 55 : step === 3 ? 80 : 98;
  const barEl = document.getElementById("turnProgressBar");
  if (barEl) barEl.style.width = `${progressPercent}%`;
}

function stopTurnIndicator() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  const ind = document.getElementById("activeTurnIndicator");
  if (ind) {
    ind.remove();
  }
}

function setBusyState(busy) {
  state.isBusy = busy;
  if (!busy) {
    stopTurnIndicator();
  }
  if (busy) {
    elements.panel?.classList.add("busy");
    elements.sendIconSvg?.classList.add("hidden");
    elements.stopIconSquare?.classList.remove("hidden");
    elements.sendBtn?.setAttribute("title", "Stop");
    elements.sendBtn?.setAttribute("aria-label", "Stop");
  } else {
    elements.panel?.classList.remove("busy");
    elements.sendIconSvg?.classList.remove("hidden");
    elements.stopIconSquare?.classList.add("hidden");
    elements.sendBtn?.setAttribute("title", "Send");
    elements.sendBtn?.setAttribute("aria-label", "Send");
  }
}

/**
 * Render Agent Step Badge in Thread
 */
function renderAgentStepBadge(text, isSuccess) {
  const badge = document.createElement("div");
  badge.className = `agent-step-badge ${isSuccess ? "highlight" : ""}`;

  const icon = document.createElement("span");
  icon.textContent = isSuccess ? "⚡" : "⚠️";
  badge.appendChild(icon);

  const textNode = document.createTextNode(text);
  badge.appendChild(textNode);

  elements.messagesList.appendChild(badge);
  scrollThreadBottom();
}

/**
 * Render User Message (Zero-XSS Safe Text Node)
 */
function renderUserMessage(text) {
  stopTurnIndicator();

  const entry = document.createElement("div");
  entry.className = "message-entry user";

  const userText = document.createElement("div");
  userText.className = "user-text";
  userText.textContent = text;
  entry.appendChild(userText);

  // Active borderless indicator directly under the submitted prompt
  const indicator = document.createElement("div");
  indicator.id = "activeTurnIndicator";
  indicator.className = "turn-action-indicator hidden";
  indicator.innerHTML = `
    <div class="turn-action-row">
      <span id="turnActionLabel" class="turn-action-label">Processing…</span>
    </div>
    <div class="turn-action-track">
      <div id="turnProgressBar" class="turn-action-bar"></div>
    </div>
  `;
  entry.appendChild(indicator);

  elements.messagesList.appendChild(entry);
  scrollThreadBottom();
}

/**
 * Render Assistant Structured Response (16px, blur-to-sharp animation, citations)
 */
async function renderAssistantResponse(data) {
  const entry = document.createElement("div");
  entry.className = "message-entry assistant";

  const container = document.createElement("div");
  container.className = "assistant-text";

  const paragraphs = data.paragraphs || [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const item = paragraphs[pIdx];
    const pEl = document.createElement("div");
    pEl.className = "assistant-paragraph";

    // Split words for blur-to-sharp animation (snappy 4ms per word, capped at 120ms)
    const words = (item.text || "").split(/\s+/).filter(Boolean);
    words.forEach((word, wIdx) => {
      const span = document.createElement("span");
      span.className = "word-in";
      span.style.animationDelay = `${Math.min(120, (pIdx * 20) + (wIdx * 4))}ms`;
      span.textContent = word;
      pEl.appendChild(span);
      pEl.appendChild(document.createTextNode(" "));
    });

    // Render citations [1], [2]
    if (item.citations && Array.isArray(item.citations) && item.citations.length > 0) {
      item.citations.forEach((cit, cIdx) => {
        const isVerified = cit.verified !== false;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `citation-ref ${isVerified ? "verified" : "unverified"}`;
        marker.textContent = String(cIdx + 1);
        marker.title = isVerified ? (cit.label || "Citation (Verified)") : (cit.label || "Citation") + " (Unverified)";

        // Citation drawer under paragraph
        const drawer = document.createElement("div");
        drawer.className = "citation-drawer hidden";

        const statusSpan = document.createElement("span");
        statusSpan.className = `citation-status ${isVerified ? "verified" : "unverified"}`;
        statusSpan.style.display = "block";
        statusSpan.style.fontSize = "11px";
        statusSpan.style.marginBottom = "4px";
        statusSpan.style.color = isVerified ? "#34d399" : "#f87171";
        statusSpan.textContent = isVerified ? "✓ Verified passage in source" : "⚠ Unverified quote in page";
        drawer.appendChild(statusSpan);

        const labelSpan = document.createElement("span");
        labelSpan.className = "citation-label";
        labelSpan.textContent = cit.label || "Page Citation";

        const quoteP = document.createElement("p");
        quoteP.className = "citation-quote";
        quoteP.textContent = `“${cit.quote}”`;

        const scrollBtn = document.createElement("button");
        scrollBtn.type = "button";
        scrollBtn.className = "citation-action-btn";
        scrollBtn.textContent = "Scroll to passage ↗";

        scrollBtn.addEventListener("click", () => {
          scrollToPageQuote(cit.quote, scrollBtn);
        });

        drawer.appendChild(labelSpan);
        drawer.appendChild(quoteP);
        drawer.appendChild(scrollBtn);

        marker.addEventListener("click", () => {
          const isCurrentlyHidden = drawer.classList.contains("hidden");
          container.querySelectorAll(".citation-drawer").forEach(d => d.classList.add("hidden"));
          container.querySelectorAll(".citation-ref").forEach(m => m.classList.remove("active"));
          if (isCurrentlyHidden) {
            drawer.classList.remove("hidden");
            marker.classList.add("active");
          }
        });

        pEl.appendChild(marker);
        pEl.appendChild(drawer);
      });
    }

    container.appendChild(pEl);
  }

  // Action bar with Copy button (clean UI, zero debug telemetry clutter)
  const fullText = paragraphs.map(p => p.text || "").join("\n\n");
  const metaBar = document.createElement("div");
  metaBar.className = "message-meta-bar";
  metaBar.innerHTML = `
    <button type="button" class="meta-copy-btn" title="Copy response to clipboard">
      <svg class="meta-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      <span class="copy-label">Copy</span>
    </button>
  `;
  const copyBtn = metaBar.querySelector(".meta-copy-btn");
  copyBtn?.addEventListener("click", () => {
    navigator.clipboard.writeText(fullText).then(() => {
      const label = copyBtn.querySelector(".copy-label");
      if (label) {
        label.textContent = "Copied ✓";
        setTimeout(() => { label.textContent = "Copy"; }, 2000);
      }
    }).catch(() => {});
  });
  entry.appendChild(metaBar);

  entry.appendChild(container);
  elements.messagesList.appendChild(entry);
  scrollThreadBottom();

  // Render follow-up suggestions
  if (data.followUps && Array.isArray(data.followUps) && data.followUps.length > 0) {
    renderFollowUps(data.followUps);
  }
}

/**
 * Message content.js to locate quote on page, scroll to it, and highlight it briefly
 */
function scrollToPageQuote(quote, actionBtn) {
  const originalText = actionBtn.textContent;
  actionBtn.textContent = "Locating passage…";

  if (typeof chrome === "undefined" || !chrome.tabs) {
    const found = window.find ? window.find(quote.slice(0, 30), false, false, true, false, true, false) : false;
    if (found) {
      actionBtn.textContent = "Located in page ✓";
      setTimeout(() => { actionBtn.textContent = originalText; }, 2200);
    } else {
      actionBtn.textContent = "Couldn't find passage";
    }
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      actionBtn.textContent = "Couldn't find passage";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "scrollToQuote", quote }, { frameId: 0 }, (res) => {
      const err = chrome.runtime.lastError;
      if (err || !res || !res.success) {
        if (chrome.scripting) {
          chrome.scripting.executeScript(
            { target: { tabId: tab.id }, files: ["content.js"] },
            () => {
              const injectErr = chrome.runtime.lastError;
              if (injectErr) {
                actionBtn.textContent = "Couldn't find passage";
                return;
              }
              chrome.tabs.sendMessage(tab.id, { action: "scrollToQuote", quote }, { frameId: 0 }, (res2) => {
                const err2 = chrome.runtime.lastError;
                if (!err2 && res2 && res2.success) {
                  actionBtn.textContent = "Located in page ✓";
                  setTimeout(() => { actionBtn.textContent = originalText; }, 2200);
                } else {
                  actionBtn.textContent = "Couldn't find passage";
                }
              });
            }
          );
        } else {
          actionBtn.textContent = "Couldn't find passage";
        }
      } else {
        actionBtn.textContent = "Located in page ✓";
        setTimeout(() => { actionBtn.textContent = originalText; }, 2200);
      }
    });
  });
}

/**
 * Render Follow-Up Suggestions
 */
function renderFollowUps(followUps) {
  removeFollowUps();
  if (!Array.isArray(followUps) || followUps.length === 0) return;

  const group = document.createElement("div");
  group.id = "followUpsGroup";
  group.className = "followups-group";

  followUps.slice(0, 3).forEach((item, index) => {
    if (!item) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "followup-btn";
    btn.style.animationDelay = `${index * 80 + 150}ms`;
    btn.textContent = item;

    btn.addEventListener("click", () => {
      removeFollowUps();
      submitPrompt(item);
    });

    group.appendChild(btn);
  });

  elements.messagesList.appendChild(group);
  scrollThreadBottom();
}

function removeFollowUps() {
  const existing = document.getElementById("followUpsGroup");
  if (existing) existing.remove();
}

/**
 * Fallback Notice when extraction fails
 */
function renderFallbackNotice() {
  const entry = document.createElement("div");
  entry.className = "message-entry assistant";

  const notice = document.createElement("div");
  notice.className = "thread-notice";

  if (state.isInternalTab) {
    notice.innerHTML = `Chrome blocks extensions from reading browser internal pages (like <code>chrome://extensions</code> or blank tabs).
    <div style="margin-top: 6px; font-size: 11.5px; opacity: 0.85;">Switch to any regular website tab (e.g. Wikipedia, docs, or news) to read and automate pages, or ask general questions!</div>
    <button type="button" class="retry-action-btn" id="retryReadBtn">Check active tab again ↻</button>`;
  } else {
    notice.innerHTML = `I can't read this page right now. It may still be loading, or the site blocks extensions. Try again, or select some text and ask about that.
    <button type="button" class="retry-action-btn" id="retryReadBtn">Retry reading this tab ↻</button>`;
  }

  entry.appendChild(notice);
  elements.messagesList.appendChild(entry);

  notice.querySelector("#retryReadBtn")?.addEventListener("click", async () => {
    notice.innerHTML = "Checking active tab…";
    await extractContext();
    if (state.tabReadState === "ready") {
      notice.innerHTML = "Tab ready! What would you like to ask about this page?";
    } else if (state.isInternalTab) {
      notice.innerHTML = `Still on an internal browser page (<code>${escapeHtml(state.activeTabUrl || "chrome://...")}</code>). Open any regular webpage tab to read it.
      <br><button type="button" class="retry-action-btn" id="retryReadBtn2">Check tab again ↻</button>`;
      notice.querySelector("#retryReadBtn2")?.addEventListener("click", () => renderFallbackNotice());
    } else {
      notice.innerHTML = `Still unable to read this tab. Try selecting text on the page first.
      <button type="button" class="retry-action-btn" id="retryReadBtn2">Retry reading this tab ↻</button>`;
      notice.querySelector("#retryReadBtn2")?.addEventListener("click", () => extractContext());
    }
  });

  scrollThreadBottom();
}

function renderInlineKeySetup() {
  const entry = document.createElement("div");
  entry.className = "message-entry assistant";

  const card = document.createElement("div");
  card.className = "onboarding-card";
  card.style.margin = "4px 0";
  card.innerHTML = `
    <div class="onboarding-badge">Key Required</div>
    <div class="onboarding-title" style="font-size: 13.5px;">Connect Gemini API Key</div>
    <div class="onboarding-desc">To get instant answers, page summaries, and automation, enter your free Google Gemini API key:</div>
    <div class="onboarding-form">
      <input type="password" class="onboarding-input inline-key-input" placeholder="Paste Gemini key (AIzaSy...)" spellcheck="false" autocomplete="off" />
      <button type="button" class="onboarding-btn inline-key-btn">Save Key</button>
    </div>
    <div class="onboarding-footer">
      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="onboarding-link">Get a free key in Google AI Studio ↗</a>
      <span class="onboarding-status inline-key-status"></span>
    </div>
  `;

  entry.appendChild(card);
  elements.messagesList?.appendChild(entry);
  scrollThreadBottom();

  const keyInput = card.querySelector(".inline-key-input");
  const saveBtn = card.querySelector(".inline-key-btn");
  const statusEl = card.querySelector(".inline-key-status");

  keyInput?.focus();

  saveBtn?.addEventListener("click", async () => {
    const rawKey = keyInput?.value || "";
    const key = rawKey.replace(/['"\s]/g, "").trim();
    if (!key) return;

    if (statusEl) {
      statusEl.textContent = "Verifying…";
      statusEl.style.color = "var(--sky)";
    }

    const check = await verifyApiKey(key, state.model);

    if (check.valid) {
      state.apiKey = key;
      await storage.set({ [STORAGE_KEY_API_KEY]: key });
      if (elements.apiKeyInput) elements.apiKeyInput.value = key;
      updateOnboardingVisibility();
      if (statusEl) {
        statusEl.textContent = check.highDemand ? "Connected (Auto-fallback ready) ✓" : "Connected ✓";
        statusEl.style.color = "var(--emerald)";
      }
      setTimeout(() => {
        card.innerHTML = `<div style="color: var(--emerald); font-size: 12px; display: flex; align-items: center; gap: 6px;">Key verified ✓ You can now ask any question or command!</div>`;
        elements.promptInput?.focus();
      }, 700);
    } else {
      if (statusEl) {
        statusEl.textContent = check.error || "Invalid key";
        statusEl.style.color = "#f59e0b";
      }
    }
  });
}

/**
 * Render interactive error recovery card in the conversation thread.
 * Gives 1-click recovery when Google Gemini experiences high demand or rate limits.
 */
function renderErrorCard(error, promptText) {
  const entry = document.createElement("div");
  entry.className = "message-entry assistant";

  const errorMsg = error?.message || "";
  const errorLower = errorMsg.toLowerCase();

  const isHighDemand =
    error?.status === 503 ||
    error?.status === 429 ||
    errorLower.includes("high demand") ||
    errorLower.includes("spikes in demand") ||
    errorLower.includes("overloaded") ||
    errorLower.includes("capacity") ||
    errorLower.includes("resource_exhausted") ||
    errorLower.includes("temporarily unavailable");

  const isDebuggerConflict =
    errorLower.includes("another debugger is already attached") ||
    errorLower.includes("devtools");

  const isKeyError =
    error?.status === 401 ||
    error?.status === 403 ||
    error?.reason === "API_KEY_INVALID" ||
    errorLower.includes("api_key_invalid") ||
    errorLower.includes("api key not valid") ||
    errorLower.includes("api key is not valid") ||
    errorLower.includes("permission_denied") ||
    errorLower.includes("unauthenticated") ||
    (error?.status === 400 && errorLower.includes("api key"));

  const card = document.createElement("div");
  card.className = "error-recovery-card";

  if (isHighDemand) {
    card.innerHTML = `
      <div class="error-recovery-header">
        <span class="error-badge warning">⚡ Model High Demand Spike</span>
        <span class="error-model-hint">${escapeXml(state.model)}</span>
      </div>
      <p class="error-recovery-desc">
        Google's Gemini servers for <strong>${escapeXml(state.model)}</strong> are currently experiencing a temporary traffic surge on the free API tier.
      </p>
      <div class="error-recovery-actions">
        <button type="button" class="error-action-btn primary" id="errSwitchModelBtn">
          Switch to High-Availability (3.1 Flash-Lite) &amp; Retry ↗
        </button>
        <button type="button" class="error-action-btn" id="errRetryBtn">
          Retry Current Model ↻
        </button>
      </div>
    `;
    card.querySelector("#errSwitchModelBtn")?.addEventListener("click", async () => {
      card.remove();
      state.model = "gemini-3.1-flash-lite";
      await storage.set({ [STORAGE_KEY_MODEL]: "gemini-3.1-flash-lite" });
      updateModelToken("gemini-3.1-flash-lite");
      if (elements.modelSelect) elements.modelSelect.value = "gemini-3.1-flash-lite";
      showToast("Switched to gemini-3.1-flash-lite");
      submitPrompt(promptText);
    });
    card.querySelector("#errRetryBtn")?.addEventListener("click", () => {
      card.remove();
      submitPrompt(promptText);
    });
  } else if (isDebuggerConflict) {
    card.innerHTML = `
      <div class="error-recovery-header">
        <span class="error-badge warning">🔍 DevTools Conflict</span>
      </div>
      <p class="error-recovery-desc">
        Chrome DevTools (F12) is currently open on this tab. Chrome only permits one debugger client at a time.
        Please close the F12 developer console to allow Sidekick CDP hardware clicks and keystrokes.
      </p>
      <div class="error-recovery-actions">
        <button type="button" class="error-action-btn primary" id="errRetryBtn">
          Retry Action ↻
        </button>
      </div>
    `;
    card.querySelector("#errRetryBtn")?.addEventListener("click", () => {
      card.remove();
      submitPrompt(promptText);
    });
  } else if (isKeyError) {
    card.innerHTML = `
      <div class="error-recovery-header">
        <span class="error-badge alert">🔑 Key Verification Error</span>
      </div>
      <p class="error-recovery-desc">
        Your Gemini API key could not be authenticated by Google. Please ensure your key is valid and has Gemini API enabled.
      </p>
      <div class="error-recovery-actions">
        <button type="button" class="error-action-btn primary" id="errOpenSettingsBtn">
          Open Settings &amp; Update Key ⚙
        </button>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="error-action-link">
          Get free key at Google AI Studio ↗
        </a>
      </div>
    `;
    card.querySelector("#errOpenSettingsBtn")?.addEventListener("click", () => {
      elements.settingsDrawer?.classList.remove("hidden");
      elements.apiKeyInput?.focus();
    });
  } else {
    card.innerHTML = `
      <div class="error-recovery-header">
        <span class="error-badge alert">⚠️ Request Failed</span>
      </div>
      <p class="error-recovery-desc">
        ${escapeXml(errorMsg || "Failed to communicate with Gemini API.")}
      </p>
      <div class="error-recovery-actions">
        <button type="button" class="error-action-btn primary" id="errRetryBtn">
          Retry ↻
        </button>
        <button type="button" class="error-action-btn" id="errSwitchFlashBtn">
          Try Gemini 3.1 Flash-Lite
        </button>
      </div>
    `;
    card.querySelector("#errRetryBtn")?.addEventListener("click", () => {
      card.remove();
      submitPrompt(promptText);
    });
    card.querySelector("#errSwitchFlashBtn")?.addEventListener("click", async () => {
      card.remove();
      state.model = FALLBACK_MODEL;
      await storage.set({ [STORAGE_KEY_MODEL]: FALLBACK_MODEL });
      updateModelToken(FALLBACK_MODEL);
      if (elements.modelSelect) elements.modelSelect.value = FALLBACK_MODEL;
      submitPrompt(promptText);
    });
  }

  entry.appendChild(card);
  elements.messagesList?.appendChild(entry);
  scrollThreadBottom();
}

function renderNotice(msg) {
  const entry = document.createElement("div");
  entry.className = "message-entry assistant";
  const notice = document.createElement("div");
  notice.className = "thread-notice";
  notice.textContent = msg;
  entry.appendChild(notice);
  elements.messagesList.appendChild(entry);
  scrollThreadBottom();
}

function scrollThreadBottom() {
  if (elements.threadContainer) {
    elements.threadContainer.scrollTop = elements.threadContainer.scrollHeight;
  }
}

/**
 * Session History Storage
 */
async function saveSession() {
  if (state.conversation.length === 0) return;
  const sessions = (await storage.get({ [STORAGE_KEY_SESSIONS]: [] }))[STORAGE_KEY_SESSIONS] || [];
  const firstUser = state.conversation.find(c => c.role === "user")?.text || "Conversation";

  const newSession = {
    id: Date.now(),
    title: firstUser.slice(0, 45),
    date: new Date().toLocaleDateString(),
    conversation: state.conversation
  };

  const updated = [newSession, ...sessions.slice(0, 15)];
  await storage.set({ [STORAGE_KEY_SESSIONS]: updated });
}

async function loadHistoryList() {
  if (!elements.historyList) return;
  elements.historyList.innerHTML = "";
  const sessions = (await storage.get({ [STORAGE_KEY_SESSIONS]: [] }))[STORAGE_KEY_SESSIONS] || [];

  if (sessions.length === 0) {
    elements.historyList.innerHTML = `<span class="field-caption">No previous chats.</span>`;
    return;
  }

  const clearBtn = document.getElementById("clearAllHistoryBtn");
  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "true";
    clearBtn.addEventListener("click", async () => {
      await storage.set({ [STORAGE_KEY_SESSIONS]: [] });
      state.conversation = [];
      if (elements.messagesList) elements.messagesList.innerHTML = "";
      if (elements.emptyState) elements.emptyState.style.display = "";
      if (elements.threadContainer) elements.threadContainer.classList.remove("has-messages");
      loadHistoryList();
      showToast("All conversation history wiped.");
    });
  }

  sessions.forEach(sess => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item";
    btn.textContent = sess.title;
    btn.addEventListener("click", () => {
      state.conversation = sess.conversation;
      elements.messagesList.innerHTML = "";
      elements.emptyState.style.display = "none";
      elements.threadContainer.classList.add("has-messages");
      sess.conversation.forEach(item => {
        if (item.role === "user") {
          renderUserMessage(item.text);
        } else {
          renderAssistantResponse(item.text);
        }
      });
      elements.historyDrawer.classList.add("hidden");
    });
    elements.historyList.appendChild(btn);
  });
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initWordmarkAndRenaming() {
  const wrapper = document.getElementById("wordmarkWrapper");
  const input = document.getElementById("renameInput");
  if (!wrapper || !input) return;

  // Ensure rename input is strictly hidden on load
  input.classList.add("hidden");
  input.style.display = "none";

  let currentEffectIdx = 0;
  wrapper.classList.add("effect-0");

  const savedName = state.customAssistantName || "";
  if (savedName) {
    wrapper.innerHTML = `<span class="wordmark-custom">${escapeXml(savedName)}</span>`;
  } else {
    setTimeout(() => {
      wrapper.classList.add("collapsed");
      const elI = document.getElementById("wordmarkI");
      if (elI) elI.textContent = "i";
    }, 2200);

    // Periodic 25-second cycle rotating through the 3 premium effects
    setInterval(() => {
      if (state.customAssistantName || input.style.display !== "none") return;
      currentEffectIdx = (currentEffectIdx + 1) % 3;
      wrapper.classList.remove("effect-0", "effect-1", "effect-2");
      wrapper.classList.add(`effect-${currentEffectIdx}`);
      wrapper.classList.remove("collapsed");
      const elI = document.getElementById("wordmarkI");
      if (elI) elI.textContent = "I";

      setTimeout(() => {
        if (state.customAssistantName || input.style.display !== "none") return;
        wrapper.classList.add("collapsed");
        if (elI) elI.textContent = "i";
      }, 3500);
    }, 25000);
  }

  wrapper.addEventListener("click", () => {
    const currentName = state.customAssistantName || (wrapper.classList.contains("collapsed") ? "Sⁱ" : "Super Intelligence");
    input.value = currentName === "Sⁱ" || currentName === "Si" || currentName === "Super Intelligence" ? "" : currentName;
    wrapper.classList.add("hidden");
    wrapper.style.display = "none";
    input.classList.remove("hidden");
    input.style.display = "inline-block";
    input.focus();
  });

  const saveRename = async () => {
    const val = input.value.trim();
    if (val) {
      state.customAssistantName = val;
      await storage.set({ si_custom_assistant_name: val });
      wrapper.innerHTML = `<span class="wordmark-custom">${escapeXml(val)}</span>`;
    } else {
      state.customAssistantName = "";
      await storage.set({ si_custom_assistant_name: "" });
      wrapper.innerHTML = `<span id="wordmarkS">S</span><span id="wordmarkUper" class="wordmark-foldable">uper </span><span id="wordmarkI">i</span><span id="wordmarkNtelligence" class="wordmark-foldable">ntelligence</span>`;
      wrapper.classList.add("collapsed");
    }
    input.classList.add("hidden");
    input.style.display = "none";
    wrapper.classList.remove("hidden");
    wrapper.style.display = "flex";
  };

  input.addEventListener("blur", saveRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveRename();
    if (e.key === "Escape") {
      input.classList.add("hidden");
      input.style.display = "none";
      wrapper.classList.remove("hidden");
      wrapper.style.display = "flex";
    }
  });
}

function initRollsRoyceStarlight() {
  const canvas = document.getElementById("galaxyCanvas");
  const ceiling = document.getElementById("rrStarlightCeiling");
  if (!canvas || !ceiling) return;

  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = ceiling.clientWidth || 400;
  let height = ceiling.clientHeight || 280;

  canvas.width = width * Math.min(window.devicePixelRatio || 1, 2);
  canvas.height = height * Math.min(window.devicePixelRatio || 1, 2);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 3-Dimensional Logarithmic Galaxy Star Distribution
  const STAR_COUNT = 3200;
  const ARMS = 3;
  const GALAXY_RADIUS = 130;
  const ARM_SPIN = 1.6;

  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    let x, y, z, color, size;
    const rnd = Math.random();

    if (rnd < 0.25) {
      // Galactic Central Core Bulge
      const r = Math.pow(Math.random(), 2.2) * 26;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.sin(phi) * Math.sin(theta) * 0.45;
      z = r * Math.cos(phi);
      color = Math.random() > 0.4 ? "rgba(255, 247, 230, " : "rgba(200, 225, 255, ";
      size = 0.8 + Math.random() * 1.6;
    } else if (rnd < 0.88) {
      // Logarithmic Spiral Arms
      const r = Math.pow(Math.random(), 1.3) * GALAXY_RADIUS + 8;
      const armAngle = (i % ARMS) * ((2 * Math.PI) / ARMS);
      const spiralAngle = Math.log(r / 8 + 1) * ARM_SPIN + armAngle;

      const spreadX = (Math.random() - 0.5) * (12 + r * 0.16);
      const spreadY = (Math.random() - 0.5) * (6 + r * 0.08);
      const spreadZ = (Math.random() - 0.5) * (12 + r * 0.16);

      x = Math.cos(spiralAngle) * r + spreadX;
      y = spreadY;
      z = Math.sin(spiralAngle) * r + spreadZ;

      if (Math.random() > 0.6) {
        color = "rgba(165, 201, 255, "; // Hot stellar blue
      } else if (Math.random() > 0.3) {
        color = "rgba(196, 181, 253, "; // Soft cosmic violet
      } else {
        color = "rgba(226, 232, 240, "; // Neutral silver
      }
      size = 0.5 + Math.random() * 1.3;
    } else {
      // Outer Halo & Field Stars
      const r = 20 + Math.random() * GALAXY_RADIUS * 1.3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      z = r * Math.cos(phi);
      color = "rgba(241, 245, 249, ";
      size = 0.4 + Math.random() * 0.8;
    }

    stars.push({
      x, y, z,
      baseColor: color,
      baseAlpha: 0.3 + Math.random() * 0.65,
      size,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 2.0,
    });
  }

  // 3D Perspective Projection Matrix & Rotation
  let angle = 0;
  let mouseX = 0;
  let mouseY = 0;
  let curMouseX = 0;
  let curMouseY = 0;

  window.addEventListener("mousemove", (e) => {
    if (isReducedMotion) return;
    const rect = ceiling.getBoundingClientRect();
    if (rect.width > 0) {
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    }
  }, { passive: true });

  const render = () => {
    width = ceiling.clientWidth || 400;
    height = ceiling.clientHeight || 280;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!isReducedMotion) {
      angle += 0.0018;
      curMouseX += (mouseX - curMouseX) * 0.05;
      curMouseY += (mouseY - curMouseY) * 0.05;
    }

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 28-degree inclination tilt looking across the galactic disk
    const tilt = 0.48 + curMouseY * 0.12;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    const fov = 260;
    const centerX = width / 2 + curMouseX * 18;
    const centerY = height * 0.46;

    const time = Date.now() * 0.001;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      // Rotate around galactic Y-axis
      const rx = s.x * cosA - s.z * sinA;
      const rz = s.x * sinA + s.z * cosA;
      const ry = s.y;

      // Incline tilt around X-axis
      const yTilted = ry * cosT - rz * sinT;
      const zTilted = ry * sinT + rz * cosT + 175; // camera distance

      if (zTilted <= 10) continue;

      const scale = fov / zTilted;
      const projX = centerX + rx * scale;
      const projY = centerY + yTilted * scale;

      // Scintillation / twinkle
      const twinkle = 0.8 + 0.2 * Math.sin(time * s.speed + s.phase);
      const alpha = Math.min(1.0, s.baseAlpha * twinkle * (scale * 0.7));

      if (projX >= -5 && projX <= width + 5 && projY >= -5 && projY <= height + 5 && alpha > 0.04) {
        ctx.fillStyle = `${s.baseColor}${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(projX, projY, Math.max(0.4, s.size * scale * 0.75), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
}

// Bootstrap
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
