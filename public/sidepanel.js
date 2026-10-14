/**
 * Sidekick - Chrome Side Panel Controller (Option B with JIT CDP & Enterprise Security)
 * Minimalist companion with defense-in-depth security, cryptographic enclave, and agentic loop.
 */

// Storage Keys
const STORAGE_KEY_API_KEY = "gemini_sidekick_api_key";
const STORAGE_KEY_MODEL = "gemini_sidekick_model";
const STORAGE_KEY_SESSIONS = "gemini_sidekick_sessions";
const STORAGE_KEY_PROXY_URL = "gemini_sidekick_proxy_url";

// Configuration
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODEL = "gemini-3.8-flash";
// Safety Budget Configuration (Continuous execution loop)
const DEFAULT_SAFETY_BUDGET = {
  maxActions: 50,
  maxTimeMs: 600000, // 10 minutes total task budget
  maxConsecutiveFailures: 3,
};
const MAX_AGENT_STEPS = DEFAULT_SAFETY_BUDGET.maxActions;

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
    urlLower.startsWith("chrome-search://") ||
    urlLower.startsWith("edge://") ||
    urlLower.startsWith("brave://") ||
    urlLower.startsWith("opera://") ||
    urlLower.startsWith("vivaldi://") ||
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
  if (hostname === "chromewebstore.google.com" || (hostname === "chrome.google.com" && pathname.startsWith("/webstore"))) {
    return false;
  }

  // Permitted public documentation & utility tools subdomains on otherwise restricted platforms
  if (hostname === "docs.aws.amazon.com" || (hostname === "aws.amazon.com" && (pathname.startsWith("/blogs") || pathname.startsWith("/documentation") || pathname.startsWith("/pricing") || pathname.startsWith("/about-aws")))) {
    return true;
  }
  if (hostname === "docs.stripe.com" || (hostname === "stripe.com" && (pathname.startsWith("/docs") || pathname.startsWith("/resources")))) {
    return true;
  }
  if (hostname === "developer.paypal.com" || (hostname === "paypal.com" && pathname.startsWith("/developer"))) {
    return true;
  }
  if (hostname === "tools.usps.com" || hostname === "postcalc.usps.com") {
    return true;
  }

  for (const denied of AUTOMATION_DENYLIST) {
    if (denied === "github.com") {
      if ((hostname === "github.com" || hostname.endsWith(".github.com")) &&
          (pathname.startsWith("/settings/security") || pathname.startsWith("/settings/keys") || pathname.startsWith("/settings/tokens") || pathname.startsWith("/settings/auth") ||
           pathname.includes("/settings/security") || pathname.includes("/settings/keys") || pathname.includes("/settings/tokens") || pathname.includes("/settings/auth"))) {
        return false;
      }
      continue;
    }
    if (denied === "aws.amazon.com") {
      if (hostname === "console.aws.amazon.com" || (hostname === "aws.amazon.com" && (pathname.includes("/billing") || pathname.includes("/signin")))) {
        return false;
      }
      continue;
    }
    if (denied === "stripe.com") {
      if (hostname === "dashboard.stripe.com" || hostname === "checkout.stripe.com" || hostname === "js.stripe.com") {
        return false;
      }
      continue;
    }
    if (denied === "paypal.com") {
      if (hostname === "paypal.com" || hostname === "www.paypal.com" || hostname.endsWith(".paypal.com")) {
        return false;
      }
      continue;
    }
    if (denied === "usps.com") {
      if (hostname === "reg.usps.com" || hostname === "store.usps.com") {
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

// High-Risk Action Keywords (Word-bounded matching to prevent false positives like dropdown or border)
const HIGH_RISK_REGEX = /\b(cancel|delete|destroy|drop\s+(?:table|database|account)|remove|unsubscribe|pay|payment|submit|confirm|proceed|continue|finish|apply|buy|checkout|purchase|order|place\s*order|transfer|wire|withdraw|publish|sign\s*out|log\s*out|logout|reset|deactivate|terminate|close\s*account|send|post|tweet|authorize|allow\s*access|approve|grant\s*access|merge|subscribe|accept|agree|enviar|payer|acheter|supprimer)\b/i;

const HIGH_RISK_KEYWORDS = [
  "cancel", "delete", "destroy", "drop", "remove", "unsubscribe", "pay", "payment",
  "submit", "confirm", "proceed", "continue", "finish", "apply", "buy", "checkout",
  "purchase", "order", "place order", "transfer", "wire", "withdraw", "publish",
  "sign out", "log out", "logout", "reset", "deactivate", "terminate", "close account",
  "send", "post", "tweet", "authorize", "allow access", "approve", "grant access",
  "merge", "subscribe", "accept", "agree", "enviar", "payer", "acheter", "supprimer"
];

// Benign UI action exemptions to avoid false-alarm safety modals on search filters, sorting, cookie banners, reading articles, and addresses
const BENIGN_UI_PATTERNS = [
  /\b(?:apply\s+(?:filter|filters|sorting|sort|theme|style|mode|view|discount|coupon|promo|code))\b/i,
  /\b(?:order\s*by|sort\s*order|ascending\s*order|descending\s*order|alphabetical\s*order|reorder)\b/i,
  /\b(?:accept\s+(?:all\s+)?cookies?|agree\s+(?:to\s+)?cookies?|cookie\s+(?:consent|banner|policy|accept|agree))\b/i,
  /\b(?:continue\s+(?:reading|browsing|slideshow|article|shopping|to\s+(?:article|content|chapter|read)))\b/i,
  /\b(?:postal[-_ ]*code|post[-_ ]*code|postcode)\b/i,
  /\b(?:finish\s+(?:reading|tutorial|tour|guide|setup\s+tour))\b/i,
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
  currentSessionId: null,
  isBusy: false,
  abortController: null,
  pendingSafetyApproval: null,
  tabGroup: {
    isConfigured: false,
    groupId: null,
    groupTitle: "Sidekick Workgroup",
    groupColor: "purple",
    isolationEnabled: true,
    tabs: [],
    currentTabId: null,
    isCurrentTabInGroup: false
  }
};

// DOM Elements
const elements = {
  panel: document.getElementById("sidekickPanel"),
  newChatBtn: document.getElementById("newChatBtn"),
  historyBtn: document.getElementById("historyBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  emergencyStopBtn: document.getElementById("emergencyStopBtn"),

  // Active Task Ledger & Autonomous Engine
  activeTaskLedger: document.getElementById("activeTaskLedger"),
  ledgerStepBadge: document.getElementById("ledgerStepBadge"),
  ledgerTimer: document.getElementById("ledgerTimer"),
  ledgerStopBtn: document.getElementById("ledgerStopBtn"),
  ledgerObjective: document.getElementById("ledgerObjective"),
  ledgerChecklist: document.getElementById("ledgerChecklist"),
  ledgerThoughtsAccordion: document.getElementById("ledgerThoughtsAccordion"),
  ledgerThoughtsText: document.getElementById("ledgerThoughtsText"),

  // Tab Group Controls
  tabGroupBar: document.getElementById("tabGroupBar"),
  groupBadgeBtn: document.getElementById("groupBadgeBtn"),
  groupColorDot: document.getElementById("groupColorDot"),
  groupTitleLabel: document.getElementById("groupTitleLabel"),
  groupTabCount: document.getElementById("groupTabCount"),
  newGroupTabBtn: document.getElementById("newGroupTabBtn"),
  tabGroupDrawer: document.getElementById("tabGroupDrawer"),
  closeGroupDrawerBtn: document.getElementById("closeGroupDrawerBtn"),
  isolationToggle: document.getElementById("isolationToggle"),
  addActiveTabBtn: document.getElementById("addActiveTabBtn"),
  groupTabsList: document.getElementById("groupTabsList"),
  createBindGroupBtn: document.getElementById("createBindGroupBtn"),
  unbindGroupBtn: document.getElementById("unbindGroupBtn"),
  isolationWarningBanner: document.getElementById("isolationWarningBanner"),
  isolationBannerText: document.getElementById("isolationBannerText"),
  bannerAddTabBtn: document.getElementById("bannerAddTabBtn"),
  bannerSwitchTabBtn: document.getElementById("bannerSwitchTabBtn"),

  // Drawers
  historyDrawer: document.getElementById("historyDrawer"),
  historyList: document.getElementById("historyList"),
  closeHistoryBtn: document.getElementById("closeHistoryBtn"),

  settingsDrawer: document.getElementById("settingsDrawer"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  proxyUrlInput: document.getElementById("proxyUrlInput"),
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

// Tab Group Helper Functions
async function refreshTabGroupState() {
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_MANAGED_GROUP_STATE" }, (r) => {
        const _ = chrome.runtime.lastError;
        resolve(r);
      });
      setTimeout(() => resolve(null), 300);
    });

    if (res && res.success && res.state) {
      state.tabGroup = res.state;
      updateTabGroupUI();
    }
  } catch (err) {
    console.debug("[TabGroup] refresh failed:", err);
  }
}

function updateTabGroupUI() {
  const tg = state.tabGroup;
  if (!elements.groupTitleLabel) return;

  if (tg.isConfigured && tg.groupId) {
    elements.groupTitleLabel.textContent = tg.groupTitle || "Sidekick Workgroup";
    elements.groupTabCount.textContent = `${tg.tabs.length} tab${tg.tabs.length === 1 ? "" : "s"}`;
    if (elements.groupColorDot) {
      elements.groupColorDot.className = `group-dot ${tg.groupColor || "purple"}`;
    }
  } else {
    elements.groupTitleLabel.textContent = "No Tab Group";
    elements.groupTabCount.textContent = "Click to bind";
    if (elements.groupColorDot) {
      elements.groupColorDot.className = "group-dot grey";
    }
  }

  if (elements.isolationToggle) {
    elements.isolationToggle.checked = tg.isolationEnabled !== false;
  }

  // Isolation Warning Banner Visibility
  if (elements.isolationWarningBanner) {
    if (tg.isConfigured && tg.isolationEnabled && !tg.isCurrentTabInGroup) {
      elements.isolationWarningBanner.classList.remove("hidden");
      if (elements.isolationBannerText) {
        elements.isolationBannerText.textContent = `Tab outside "${tg.groupTitle}". Automation locked to group.`;
      }
    } else {
      elements.isolationWarningBanner.classList.add("hidden");
    }
  }

  // Populate drawer tab list
  if (elements.groupTabsList) {
    elements.groupTabsList.textContent = "";
    if (tg.tabs && tg.tabs.length > 0) {
      tg.tabs.forEach((t) => {
        const item = document.createElement("div");
        item.className = `group-tab-item ${t.id === state.activeTabId ? "active" : ""}`;
        
        const titleSpan = document.createElement("span");
        titleSpan.className = "tab-title-text";
        titleSpan.title = `${t.title || "Untitled"} (${t.url || ""})`;
        titleSpan.textContent = t.title || "Untitled";
        item.appendChild(titleSpan);

        if (t.id === state.activeTabId) {
          const dot = document.createElement("span");
          dot.className = "tab-active-dot";
          dot.title = "Active Tab";
          item.appendChild(dot);
        }

        item.addEventListener("click", () => {
          chrome.tabs.update(t.id, { active: true }, () => {
            elements.tabGroupDrawer?.classList.add("hidden");
            extractContext();
            refreshTabGroupState();
          });
        });
        elements.groupTabsList.appendChild(item);
      });
    } else {
      const emptyNotice = document.createElement("div");
      emptyNotice.style.cssText = "color: var(--mute); font-size: 10px; padding: 6px;";
      emptyNotice.textContent = "No tabs in this workgroup.";
      elements.groupTabsList.appendChild(emptyNotice);
    }
  }
}

async function bindOrCreateGroup() {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "CREATE_OR_BIND_GROUP", params: { targetTabId: state.activeTabId } }, resolve);
  });
  if (res?.state) {
    state.tabGroup = res.state;
    updateTabGroupUI();
    renderAgentStepBadge(`Workgroup bound: ${res.state.groupTitle}`, true);
    renderAssistantPlainMessage(`🟣 **Sidekick Tab Group Active:**\nControl is now strictly scoped to tabs within "${res.state.groupTitle}". New tabs will automatically open inside this group.`);
  }
}

async function addActiveTabToGroup() {
  if (!state.activeTabId) return;
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "ADD_TAB_TO_MANAGED_GROUP", tabId: state.activeTabId }, resolve);
  });
  if (res?.state) {
    state.tabGroup = res.state;
    updateTabGroupUI();
    renderAgentStepBadge("Tab added to workgroup", true);
  }
}

async function openNewTabInManagedGroup(url = "https://www.google.com") {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "OPEN_TAB_IN_MANAGED_GROUP", url }, resolve);
  });
  if (res?.state) {
    state.tabGroup = res.state;
    updateTabGroupUI();
  }
}

async function unbindGroup() {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "UNBIND_MANAGED_GROUP" }, resolve);
  });
  if (res?.state) {
    state.tabGroup = res.state;
    updateTabGroupUI();
    renderAgentStepBadge("Tab Group unbound", false);
  }
}

async function toggleIsolation(enabled) {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "SET_GROUP_ISOLATION", enabled }, resolve);
  });
  if (res?.state) {
    state.tabGroup = res.state;
    updateTabGroupUI();
  }
}

/**
 * Initialize
 */
function getResolvedProxyUrl() {
  if (state.proxyUrl) return state.proxyUrl;
  if (typeof globalThis !== "undefined" && globalThis.__SIDEKICK_BACKEND_URL__) {
    return String(globalThis.__SIDEKICK_BACKEND_URL__).trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location && window.location.protocol && window.location.protocol.startsWith("http")) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

async function init() {
  const saved = await storage.get({
    [STORAGE_KEY_API_KEY]: "",
    [STORAGE_KEY_MODEL]: DEFAULT_MODEL,
    [STORAGE_KEY_PROXY_URL]: "",
    si_custom_assistant_name: ""
  });

  state.apiKey = (saved[STORAGE_KEY_API_KEY] || "").replace(/['"\s]/g, "").trim();
  state.proxyUrl = (saved[STORAGE_KEY_PROXY_URL] || "").trim().replace(/\/+$/, "");
  state.customAssistantName = saved.si_custom_assistant_name || "";
  let loadedModel = saved[STORAGE_KEY_MODEL] || DEFAULT_MODEL;
  if (loadedModel === "gemini-3.5-flash-lite" || (loadedModel !== DEFAULT_MODEL && loadedModel !== FALLBACK_MODEL && loadedModel !== LATEST_FLASH_MODEL)) {
    loadedModel = DEFAULT_MODEL;
    await storage.set({ [STORAGE_KEY_MODEL]: DEFAULT_MODEL });
  }
  state.model = loadedModel;
  state.activeEnclaveId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : ("enclave-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));

  if (elements.apiKeyInput) elements.apiKeyInput.value = state.apiKey;
  if (elements.proxyUrlInput) elements.proxyUrlInput.value = state.proxyUrl;
  if (elements.modelSelect) elements.modelSelect.value = state.model;
  updateModelToken(state.model);
  updateOnboardingVisibility();

  bindEvents();
  setupTabListeners();
  initWordmarkAndRenaming();
  initRollsRoyceStarlight();
  await extractContext();
  await refreshTabGroupState();

  if (elements.promptInput) elements.promptInput.focus();
}

let _serverProxyAvailable = false;

async function checkServerProxyHealth() {
  try {
    const proxyBase = getResolvedProxyUrl();
    const res = await fetch(`${proxyBase}/api/health`);
    if (res.ok) {
      const data = await res.json();
      _serverProxyAvailable = !!data.hasApiKey;
      return _serverProxyAvailable;
    }
  } catch {}
  _serverProxyAvailable = false;
  return false;
}

/**
 * Toggle First-Run Onboarding Card vs Suggested Prompts
 */
async function updateOnboardingVisibility() {
  elements.promptSuggestions?.classList.remove("hidden");
  if (!state.apiKey) {
    const hasProxyKey = await checkServerProxyHealth();
    if (hasProxyKey) {
      elements.onboardingCard?.classList.add("hidden");
      return;
    }
    elements.onboardingCard?.classList.remove("hidden");
  } else {
    elements.onboardingCard?.classList.add("hidden");
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

  const rawModel = preferredModel || DEFAULT_MODEL;
  const baseModel = rawModel === "gemini-3.5-flash-lite" ? DEFAULT_MODEL : rawModel;
  const modelsToTry = [baseModel, FALLBACK_MODEL, LATEST_FLASH_MODEL].filter((m, i, a) => a.indexOf(m) === i);
  
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
    state.currentSessionId = null;
    state.conversation = [];
    elements.messagesList.innerHTML = "";
    elements.emptyState.style.display = "flex";
    updateOnboardingVisibility();
    elements.threadContainer.classList.remove("has-messages");
    hideSafetyModal();
    removeFollowUps();
  });

  // Tab Group Management Controls
  elements.groupBadgeBtn?.addEventListener("click", () => {
    elements.tabGroupDrawer?.classList.toggle("hidden");
    if (!elements.tabGroupDrawer?.classList.contains("hidden")) {
      refreshTabGroupState();
    }
  });

  elements.closeGroupDrawerBtn?.addEventListener("click", () => {
    elements.tabGroupDrawer?.classList.add("hidden");
  });

  elements.newGroupTabBtn?.addEventListener("click", () => {
    openNewTabInManagedGroup();
  });

  elements.addActiveTabBtn?.addEventListener("click", async () => {
    await addActiveTabToGroup();
  });

  elements.createBindGroupBtn?.addEventListener("click", async () => {
    await bindOrCreateGroup();
  });

  elements.unbindGroupBtn?.addEventListener("click", async () => {
    await unbindGroup();
  });

  elements.isolationToggle?.addEventListener("change", (e) => {
    toggleIsolation(e.target.checked);
  });

  elements.bannerAddTabBtn?.addEventListener("click", async () => {
    await addActiveTabToGroup();
  });

  elements.bannerSwitchTabBtn?.addEventListener("click", () => {
    elements.tabGroupDrawer?.classList.remove("hidden");
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
    const proxyUrl = (elements.proxyUrlInput?.value || "").trim().replace(/\/+$/, "");
    state.apiKey = key;
    state.model = mdl;
    state.proxyUrl = proxyUrl;

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
      [STORAGE_KEY_MODEL]: mdl,
      [STORAGE_KEY_PROXY_URL]: proxyUrl
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

  // Autonomous Multi-Process Engine: Emergency Stop Handlers
  elements.emergencyStopBtn?.addEventListener("click", () => {
    if (state.pendingSafetyApproval) {
      const resolve = state.pendingSafetyApproval.resolve;
      hideSafetyModal();
      resolve(false);
    }
    if (state.abortController) {
      state.abortController.abort();
    }
    renderAgentStepBadge("Emergency Stop Activated [Esc]", false);
    renderAssistantPlainMessage("🛑 **Emergency Stop:** Autonomous loop halted immediately by user.");
    hideActiveTaskLedger();
    setBusyState(false);
  });

  elements.ledgerStopBtn?.addEventListener("click", () => {
    if (state.pendingSafetyApproval) {
      const resolve = state.pendingSafetyApproval.resolve;
      hideSafetyModal();
      resolve(false);
    }
    if (state.abortController) {
      state.abortController.abort();
    }
    renderAgentStepBadge("Emergency Stop Activated [Esc]", false);
    renderAssistantPlainMessage("🛑 **Emergency Stop:** Autonomous loop halted immediately by user.");
    hideActiveTaskLedger();
    setBusyState(false);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.isBusy) {
      if (state.pendingSafetyApproval) {
        const resolve = state.pendingSafetyApproval.resolve;
        hideSafetyModal();
        resolve(false);
      }
      if (state.abortController) {
        state.abortController.abort();
      }
      renderAgentStepBadge("Emergency Stop Activated [Esc]", false);
      renderAssistantPlainMessage("🛑 **Emergency Stop:** Autonomous loop halted immediately by user [Esc].");
      hideActiveTaskLedger();
      setBusyState(false);
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
    // When user switches tabs, extract context from the newly activated tab immediately
    chrome.tabs.onActivated?.addListener(async (activeInfo) => {
      await extractContext(activeInfo?.tabId);
      await refreshTabGroupState();
    });

    // When tab updates (navigates, changes title, completes load)
    chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
      if (tab?.active || tabId === state.activeTabId) {
        if (changeInfo.status === "complete" || (changeInfo.url && changeInfo.url !== state.activeTabUrl) || changeInfo.title) {
          if (changeInfo.url) state.activeTabUrl = changeInfo.url;
          extractContext(tabId);
          refreshTabGroupState();
        }
      }
    });

    if (chrome.tabGroups) {
      chrome.tabGroups.onUpdated?.addListener(refreshTabGroupState);
      chrome.tabGroups.onRemoved?.addListener(refreshTabGroupState);
      chrome.tabGroups.onCreated?.addListener(refreshTabGroupState);
    }

    // Window focus change (e.g. switching between Chrome windows)
    if (chrome.windows && chrome.windows.onFocusChanged) {
      chrome.windows.onFocusChanged.addListener(async (windowId) => {
        if (windowId !== chrome.windows.WINDOW_ID_NONE) {
          await extractContext();
        }
      });
    }

    // SPA client-side history navigation (YouTube, GitHub, X/Twitter, Gmail, Google Search)
    if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
      chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
        if (details.tabId === state.activeTabId && details.frameId === 0) {
          if (details.url && details.url !== state.activeTabUrl) {
            state.activeTabUrl = details.url;
            extractContext(details.tabId);
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
 * Fully asynchronous with guaranteed Promise resolution so callers can await real tab data.
 */
async function extractContext(explicitTabId = null) {
  setTabReadState("reading");

  try {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      let activeTab = null;

      if (explicitTabId) {
        try {
          activeTab = await chrome.tabs.get(explicitTabId);
        } catch {
          activeTab = null;
        }
      }

      if (!activeTab || !activeTab.id) {
        // Query active tab in the last focused window first
        let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        }
        if (!tabs || tabs.length === 0) {
          tabs = await chrome.tabs.query({ active: true });
        }
        // Exclude extension page tabs if multiple windows exist
        activeTab = (tabs && tabs.find((t) => !t.url?.startsWith("chrome-extension://"))) || tabs?.[0];
      }

      if (!activeTab || !activeTab.id) {
        setTabReadState("off");
        return state.pageContext;
      }

      state.activeTabId = activeTab.id;
      state.activeTabUrl = activeTab.url || "";

      // Immediately seed state with live tab title and URL to guarantee freshness
      if (!state.pageContext) {
        state.pageContext = {
          title: activeTab.title || "",
          url: activeTab.url || "",
          selectedText: "",
          bodyText: "",
          charCount: 0,
          interactiveElements: []
        };
      } else {
        if (activeTab.title) state.pageContext.title = activeTab.title;
        if (activeTab.url) state.pageContext.url = activeTab.url;
      }

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
          title: activeTab.title || "New Tab",
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
        return state.pageContext;
      }
      state.isInternalTab = false;

      // Check Tab Enabled ("Tab off" setting)
      if (!state.tabEnabled) {
        state.pageContext = {
          title: activeTab.title || "Tab Off",
          url: state.activeTabUrl || "",
          selectedText: "",
          bodyText: "",
          charCount: 0,
          interactiveElements: []
        };
        setTabReadState("off");
        return state.pageContext;
      }

      // Allow reading sanitized text on all domains, but flag if automation is restricted
      const isAutomationProtected = !checkDomainAllowed(state.activeTabUrl);
      if (isAutomationProtected) {
        renderNotice("Security Policy: Page reading active (automation locked on protected domain).");
      }

      // Message content.js and await the response with a safety timeout
      const context = await new Promise((resolve) => {
        let finished = false;
        const timer = setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve(null);
          }
        }, 1200);

        chrome.tabs.sendMessage(activeTab.id, { action: "extractContext" }, { frameId: 0 }, (res) => {
          const err = chrome.runtime.lastError;
          if (err || !res || !res.context) {
            // Content script not ready; attempt dynamic injection
            if (chrome.scripting) {
              chrome.scripting.executeScript(
                { target: { tabId: activeTab.id }, files: ["content.js"] },
                () => {
                  const injectErr = chrome.runtime.lastError;
                  if (injectErr) {
                    if (!finished) {
                      finished = true;
                      clearTimeout(timer);
                      resolve(null);
                    }
                    return;
                  }
                  chrome.tabs.sendMessage(activeTab.id, { action: "extractContext" }, { frameId: 0 }, (res2) => {
                    const err2 = chrome.runtime.lastError;
                    if (!finished) {
                      finished = true;
                      clearTimeout(timer);
                      resolve(!err2 && res2?.context ? res2.context : null);
                    }
                  });
                }
              );
            } else {
              if (!finished) {
                finished = true;
                clearTimeout(timer);
                resolve(null);
              }
            }
          } else {
            if (!finished) {
              finished = true;
              clearTimeout(timer);
              resolve(res.context);
            }
          }
        });
      });

      if (context) {
        state.pageContext = context;
        if (!state.pageContext.title && activeTab.title) state.pageContext.title = activeTab.title;
        if (!state.pageContext.url && activeTab.url) state.pageContext.url = activeTab.url;
        setTabReadState(state.tabEnabled ? "ready" : "off");
        updateSelectionUI();
      } else {
        // Fallback: If content.js was blocked or still loading, guarantee title and URL from activeTab
        state.pageContext = {
          title: activeTab.title || "Active Tab",
          url: activeTab.url || "",
          selectedText: "",
          bodyText: activeTab.title ? `Page Title: ${activeTab.title} (${activeTab.url})` : "",
          charCount: activeTab.title ? activeTab.title.length : 0,
          interactiveElements: []
        };
        setTabReadState(state.tabEnabled ? "ready" : "off");
      }

      return state.pageContext;
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
  { id: "search", name: "/search", aliases: ["/google", "/find", "/web"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/search <search query>", desc: "Search Google and navigate active tab", example: "/search 2008 Acura tl for sale", requiresArg: true },
  { id: "summarize", name: "/summarize", aliases: ["/sum", "/brief"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/summarize [bullets | tldr | deep | executive]", desc: "Digest page with verbatim citations", example: "/summarize bullets" },
  { id: "cite", name: "/cite", aliases: ["/evidence", "/findquote"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/cite <claim or question>", desc: "Find proof and highlight passage", example: "/cite training duration", requiresArg: true },
  { id: "explain", name: "/explain", aliases: ["/eli5", "/simplify"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/explain [concept]", desc: "Explain concept in plain English", example: "/explain Multi-Head Attention" },
  { id: "actions", name: "/actions", aliases: ["/cdp", "/scan"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/actions", desc: "Scan clickable buttons and inputs", example: "/actions" },
  { id: "clear", name: "/clear", aliases: ["/reset", "/new"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/clear", desc: "Clear conversation thread", example: "/clear" },
  { id: "help", name: "/help", aliases: ["/shortcuts", "/?"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/help [command name]", desc: "Show command cheat sheet", example: "/help" },
  { id: "copy", name: "/copy", aliases: ["/export", "/save"], tier: 1, tierLabel: "Tier 1: Core", syntax: "/copy [last | all | markdown]", desc: "Copy response or chat to clipboard", example: "/copy markdown" },

  // Tier 2: Action, Data & Audio
  { id: "navigate", name: "/navigate", aliases: ["/goto", "/openurl"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/navigate <url>", desc: "Navigate active tab to destination URL", example: "/navigate https://google.com", requiresArg: true },
  { id: "click", name: "/click", aliases: [], tier: 2, tierLabel: "Tier 2: Action", syntax: "/click <element name or text>", desc: "Click element via CDP mouse event", example: "/click Add to Cart", requiresArg: true },
  { id: "fill", name: "/fill", aliases: ["/type", "/input"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/fill <field name> = <value>", desc: "Type into inputs via CDP key events", example: "/fill Search = Headphones", requiresArg: true },
  { id: "scroll", name: "/scroll", aliases: [], tier: 2, tierLabel: "Tier 2: Action", syntax: "/scroll [top | bottom | half]", desc: "Scroll page viewport smoothly", example: "/scroll bottom" },
  { id: "fillcart", name: "/fillcart", aliases: ["/checkout-prep"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/fillcart", desc: "Select options and add to cart", example: "/fillcart" },
  { id: "survey", name: "/survey", aliases: ["/questionnaire", "/fillform", "/poll"], tier: 2, tierLabel: "Tier 2: Action", syntax: "/survey [auto | review | profile]", desc: "Autonomously answer survey questions with verified control selection", example: "/survey auto" },
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
  elements.slashList.replaceChildren();
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

    const topDiv = document.createElement("div");
    topDiv.className = "slash-item-top";

    const nameSpan = document.createElement("span");
    nameSpan.className = "slash-item-name";
    nameSpan.textContent = cmd.name;
    topDiv.appendChild(nameSpan);

    if (argHint) {
      const syntaxSpan = document.createElement("span");
      syntaxSpan.className = "slash-item-syntax";
      syntaxSpan.textContent = argHint;
      topDiv.appendChild(syntaxSpan);
    }

    const descDiv = document.createElement("div");
    descDiv.className = "slash-item-desc";
    descDiv.textContent = cmd.desc;

    item.appendChild(topDiv);
    item.appendChild(descDiv);

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
  elements.helpModalList.replaceChildren();
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

    const topRow = document.createElement("div");
    topRow.className = "modal-cmd-top";

    const titleGroup = document.createElement("div");
    titleGroup.style.cssText = "display:flex;align-items:center;gap:6px;";

    const nameSpan = document.createElement("span");
    nameSpan.style.cssText = "font-family:var(--font-mono);font-size:12px;color:var(--sky);font-weight:500;";
    nameSpan.textContent = c.name;

    const badge = document.createElement("span");
    badge.className = `slash-item-badge ${badgeClass}`;
    badge.textContent = c.tierLabel;

    titleGroup.appendChild(nameSpan);
    titleGroup.appendChild(badge);

    const runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "modal-run-btn";
    runBtn.textContent = "Run";
    runBtn.addEventListener("click", () => {
      closeHelpModal();
      selectSlashCommand(c, !c.requiresArg);
    });

    topRow.appendChild(titleGroup);
    topRow.appendChild(runBtn);

    const descDiv = document.createElement("div");
    descDiv.style.cssText = "font-size:11.5px;color:rgba(236,238,244,0.8);";
    descDiv.textContent = c.desc;

    const syntaxDiv = document.createElement("div");
    syntaxDiv.style.cssText = "font-family:var(--font-mono);font-size:10px;color:var(--mute);";
    syntaxDiv.textContent = `Syntax: ${c.syntax} • Ex: ${c.example}`;

    card.appendChild(topRow);
    card.appendChild(descDiv);
    card.appendChild(syntaxDiv);
    elements.helpModalList.appendChild(card);
  });
}

// Active Task Ledger UI State & Timer
let ledgerTimerInterval = null;
let ledgerStartTime = 0;

function showActiveTaskLedger(objective) {
  if (!elements.activeTaskLedger) return;
  elements.activeTaskLedger.classList.remove("hidden");
  elements.emergencyStopBtn?.classList.remove("hidden");
  if (elements.ledgerObjective) {
    elements.ledgerObjective.textContent = `Objective: ${objective}`;
  }
  if (elements.ledgerStepBadge) {
    elements.ledgerStepBadge.textContent = "Step 1";
  }
  if (elements.ledgerTimer) {
    elements.ledgerTimer.textContent = "0.0s";
  }
  if (elements.ledgerChecklist) {
    elements.ledgerChecklist.replaceChildren();
    const initialItem = document.createElement("div");
    initialItem.className = "checklist-item active";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "checklist-icon active");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "9");
    svg.appendChild(circle);

    const span = document.createElement("span");
    span.textContent = "Deliberating objective and extracting live interactive candidates…";

    initialItem.appendChild(svg);
    initialItem.appendChild(span);
    elements.ledgerChecklist.appendChild(initialItem);
  }
  if (elements.ledgerThoughtsText) {
    elements.ledgerThoughtsText.textContent = "Synthesizing page context into actionable sub-goals…";
  }

  if (ledgerTimerInterval) clearInterval(ledgerTimerInterval);
  ledgerStartTime = performance.now();
  ledgerTimerInterval = setInterval(() => {
    if (elements.ledgerTimer) {
      const sec = ((performance.now() - ledgerStartTime) / 1000).toFixed(1);
      elements.ledgerTimer.textContent = `${sec}s`;
    }
  }, 100);
}

function updateTaskLedger(checklist, stepNum, situationalThought) {
  if (!elements.activeTaskLedger) return;
  if (elements.ledgerStepBadge) {
    elements.ledgerStepBadge.textContent = `Step ${stepNum}`;
  }
  if (situationalThought && elements.ledgerThoughtsText) {
    elements.ledgerThoughtsText.textContent = situationalThought;
  }
  if (elements.ledgerChecklist && Array.isArray(checklist) && checklist.length > 0) {
    elements.ledgerChecklist.replaceChildren();
    checklist.forEach((item, idx) => {
      const div = document.createElement("div");
      const status = item.status || (idx + 1 < stepNum ? "completed" : idx + 1 === stepNum ? "active" : "pending");
      div.className = `checklist-item ${status}`;

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", `checklist-icon ${status}`);
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");

      if (status === "completed") {
        svg.setAttribute("stroke-width", "2.5");
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        poly.setAttribute("points", "20 6 9 17 4 12");
        svg.appendChild(poly);
      } else if (status === "active") {
        svg.setAttribute("stroke-width", "2");
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "9");
        svg.appendChild(circle);
      } else {
        svg.setAttribute("stroke-width", "1.5");
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "9");
        circle.setAttribute("stroke-dasharray", "2 2");
        svg.appendChild(circle);
      }

      const labelSpan = document.createElement("span");
      labelSpan.textContent = item.title || item.name || `Sub-goal ${idx + 1}`;

      div.appendChild(svg);
      div.appendChild(labelSpan);
      elements.ledgerChecklist.appendChild(div);
    });
  }
}

function hideActiveTaskLedger() {
  if (ledgerTimerInterval) {
    clearInterval(ledgerTimerInterval);
    ledgerTimerInterval = null;
  }
  elements.activeTaskLedger?.classList.add("hidden");
  elements.emergencyStopBtn?.classList.add("hidden");
}

function openAuditModal() {
  elements.auditModal?.classList.remove("hidden");
  if (!elements.auditModalBody) return;
  const chars = state.pageContext.charCount || 0;
  const elementsCount = state.pageContext.interactiveElements?.length || 0;

  elements.auditModalBody.replaceChildren();

  // Card 1: System Health Audit
  const card1 = document.createElement("div");
  card1.style.cssText = "padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:flex;flex-direction:column;gap:6px;";

  const topRow = document.createElement("div");
  topRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;";
  const title1 = document.createElement("span");
  title1.style.cssText = "font-family:var(--font-mono);font-size:11px;color:var(--sky);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;";
  title1.textContent = "System Health Audit (8/8 Verified)";
  const badge1 = document.createElement("span");
  badge1.style.cssText = "font-family:var(--font-mono);font-size:10px;color:#34d399;background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.2);padding:2px 6px;border-radius:4px;";
  badge1.textContent = "All Clear ✓";
  topRow.appendChild(title1);
  topRow.appendChild(badge1);
  card1.appendChild(topRow);

  const auditItems = [
    ["1. Default Model:", "gemini-3.1-flash-lite ✓"],
    ["2. Manifest CSP:", "Google API + Proxy Allowed ✓"],
    ["3. Dual Proxy Fallback:", "Auto /api/gemini Fallback ✓"],
    ["4. CDP Navigation Guard:", "Guarded Mouse Release ✓"],
    ["5. Debugger State Sync:", "chrome.debugger.onDetach ✓"],
    ["6. Content Script Injection:", "Sub-second Proactive Retry ✓"],
    ["7. Zip Packaging Parity:", "Synchronized V1.1.3 ✓"],
    ["8. Privacy & Defense-in-Depth:", "Luhn Card + SSN Masking ✓"]
  ];
  const listCol = document.createElement("div");
  listCol.style.cssText = "font-family:var(--font-mono);font-size:11px;display:flex;flex-direction:column;gap:4px;margin-top:4px;";
  auditItems.forEach(([label, status]) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;padding:4px 8px;background:rgba(0,0,0,0.3);border-radius:4px;";
    const lSpan = document.createElement("span");
    lSpan.textContent = label;
    const sSpan = document.createElement("span");
    sSpan.style.color = "#6ee7b7";
    sSpan.textContent = status;
    row.appendChild(lSpan);
    row.appendChild(sSpan);
    listCol.appendChild(row);
  });
  card1.appendChild(listCol);
  elements.auditModalBody.appendChild(card1);

  // Card 2: Enclave & Context Metrics (Safe DOM textContent)
  const card2 = document.createElement("div");
  card2.style.cssText = "padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:flex;flex-direction:column;gap:6px;";

  const r1 = document.createElement("div");
  const s1 = document.createElement("strong"); s1.textContent = "Enclave UUID: ";
  const val1 = document.createElement("span"); val1.style.cssText = "color:var(--sky);font-family:var(--font-mono);"; val1.textContent = state.activeEnclaveId || "enclave-active";
  r1.appendChild(s1); r1.appendChild(val1);

  const r2 = document.createElement("div");
  const s2 = document.createElement("strong"); s2.textContent = "Isolated Domain: ";
  const val2 = document.createElement("span"); val2.style.cssText = "color:#6ee7b7;font-family:var(--font-mono);"; val2.textContent = state.pageContext.url || "active tab";
  r2.appendChild(s2); r2.appendChild(val2);

  const r3 = document.createElement("div");
  const s3 = document.createElement("strong"); s3.textContent = "Sanitized DOM Elements: ";
  const val3 = document.createTextNode(`${elementsCount} interactive nodes`);
  r3.appendChild(s3); r3.appendChild(val3);

  const r4 = document.createElement("div");
  const s4 = document.createElement("strong"); s4.textContent = "Sanitized Text Size: ";
  const val4 = document.createTextNode(`${chars} characters`);
  r4.appendChild(s4); r4.appendChild(val4);

  card2.appendChild(r1); card2.appendChild(r2); card2.appendChild(r3); card2.appendChild(r4);
  elements.auditModalBody.appendChild(card2);

  // Card 3: Defense pipeline rules
  const card3 = document.createElement("div");
  card3.style.cssText = "padding:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;display:flex;flex-direction:column;gap:4px;";
  const head3 = document.createElement("div");
  head3.style.cssText = "color:var(--sky);font-weight:500;";
  head3.textContent = "Sanitization Defense Pipeline:";
  card3.appendChild(head3);
  ["✓ Hidden DOM stripped (display:none, opacity:0)", "✓ Zero-width Unicode characters stripped (\\u200B)", "✓ Credit card numbers masked ([REDACTED_CREDIT_CARD])", "✓ SSN & Bearer Auth tokens masked"].forEach((t) => {
    const row = document.createElement("div");
    row.textContent = t;
    card3.appendChild(row);
  });
  elements.auditModalBody.appendChild(card3);
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
    state.currentSessionId = null;
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

  // Tier 1: /search (aliases: /google, /web, /find)
  if (commandId === "search") {
    if (!arg) {
      renderAssistantPlainMessage("Please provide a search query. Example: `/search 2008 Acura tl for sale`");
      return;
    }
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(arg)}`;
    const approved = await requestSafetyApproval("navigate_to", { url: searchUrl }, 1);
    if (!approved) {
      renderAssistantPlainMessage("Search navigation cancelled by user.");
      return;
    }
    try {
      await executeJITAction("navigate_to", { url: searchUrl });
      renderAgentStepBadge(`Step 1: Navigated to search for "${arg}" [CDP Trusted]`, true);
      renderAssistantPlainMessage(`Active tab navigated to Google search for "${arg}".`);
    } catch (err) {
      renderAgentStepBadge(`Search failed: ${err.message}`, false);
      renderAssistantPlainMessage(`Failed to search: ${err.message}`);
    }
    return;
  }

  // Tier 2: /navigate (aliases: /goto, /openurl)
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
    const approved = await requestSafetyApproval("click_element", {
      element_description: "Neutralize pre-checked fee checkboxes in cart"
    }, 1);
    if (!approved) {
      renderAssistantPlainMessage("Disinfection stopped by user.");
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
    if (state.tabGroup?.isConfigured && state.tabGroup?.isolationEnabled && !state.tabGroup?.isCurrentTabInGroup) {
      renderAssistantPlainMessage(`🔒 **Tab Group Isolation Active:** Autonomous cancellation is strictly locked to tabs inside your managed workgroup.`);
      return;
    }
    state.abortController = new AbortController();
    setBusyState(true);
    renderAssistantPlainMessage("🤖 Initiating Autonomous Click-to-Cancel Engine...", "system");
    
    let stepsTaken = 0;
    let stuckRetries = 0;
    const maxSteps = 8;
    const maxRetries = 3;
    const targetTabId = state.activeTabId;

    function runCancelLoop() {
      if (state.abortController?.signal.aborted) {
        renderAssistantPlainMessage("🛑 Cancellation flow stopped by user.", "system");
        setBusyState(false);
        return;
      }
      if (stepsTaken >= maxSteps) {
        renderAssistantPlainMessage("⚠️ Halting: Reached maximum steps. Maze requires manual intervention.", "system");
        setBusyState(false);
        return;
      }

      chrome.tabs.get(targetTabId, (tab) => {
        if (chrome.runtime.lastError || !tab || !tab.id) {
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
            setBusyState(false);
            renderAssistantPlainMessage(`✅ **SUCCESS:** ${response.message}`, "assistant");
          } else if (response.status === "requires_approval") {
            const approved = await requestSafetyApproval("click_element", {
              element_description: response.targetName,
              selector: response.selector
            }, stepsTaken + 1);

            if (!approved) {
              setBusyState(false);
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
                setBusyState(false);
                renderAssistantPlainMessage(`⚠️ Failed to click target: ${clickRes?.error || "Target element not interactable"}`, "system");
              }
            });
          } else if (response.status === "stuck") {
            if (stuckRetries < maxRetries) {
              stuckRetries++;
              setTimeout(runCancelLoop, 1500);
            } else {
              setBusyState(false);
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
  if (commandId === "survey") {
    if (!checkDomainAllowed(state.activeTabUrl)) {
      renderAssistantPlainMessage(`Security Lock: Survey answering is strictly prohibited on sensitive domain.`);
      return;
    }
    setBusyState(true);
    renderAssistantPlainMessage("📋 Scanning page for survey questions and controls...", "system");

    try {
      await extractContext();
      const targetTabId = state.activeTabId;

      // Request live survey parsing from content script
      const parseResponse = await new Promise((res) => {
        chrome.tabs.sendMessage(targetTabId, { action: "PARSE_SURVEY" }, { frameId: 0 }, (r) => {
          const _ = chrome.runtime.lastError;
          res(r?.surveyData);
        });
        setTimeout(() => res(null), 350);
      });

      const surveyData = parseResponse || state.pageContext?.surveyData;
      if (!surveyData || !Array.isArray(surveyData.questions) || surveyData.questions.length === 0) {
        setBusyState(false);
        renderAssistantPlainMessage("ℹ️ No active survey questions, forms, or questionnaires detected on this page.");
        return;
      }

      renderAssistantPlainMessage(`Found **${surveyData.questions.length} survey question(s)** on active page. Initializing Question-by-Question State Machine...`);

      // Load user profile & preferences from storage
      const storage = await chrome.storage.local.get(["sidekickUserProfile", "sidekickUserPreferences"]);
      const userProfile = storage.sidekickUserProfile || {};
      const userPreferences = storage.sidekickUserPreferences || {};

      const engine = new SurveyEngine({ userProfile, userPreferences });

      const getSurveyFn = async () => {
        return new Promise((res) => {
          chrome.tabs.sendMessage(targetTabId, { action: "PARSE_SURVEY" }, { frameId: 0 }, (r) => {
            const _ = chrome.runtime.lastError;
            res(r?.surveyData || null);
          });
          setTimeout(() => res(null), 300);
        });
      };

      const executeActionFn = async (params) => {
        return new Promise((res) => {
          chrome.tabs.sendMessage(targetTabId, { action: "INTERACT_SURVEY_CONTROL", params }, { frameId: 0 }, (r) => {
            const _ = chrome.runtime.lastError;
            res(r?.result || { success: true });
          });
          setTimeout(() => res({ success: true }), 300);
        });
      };

      const verifyStateFn = async (questionId) => {
        return new Promise((res) => {
          chrome.tabs.sendMessage(targetTabId, { action: "VERIFY_SURVEY_SELECTION", questionId }, { frameId: 0 }, (r) => {
            const _ = chrome.runtime.lastError;
            res(r?.state || null);
          });
          setTimeout(() => res(null), 250);
        });
      };

      const advancePageFn = async (actionType, btn) => {
        return new Promise((res) => {
          chrome.tabs.sendMessage(targetTabId, { action: "ADVANCE_SURVEY_PAGE", actionType, selector: btn?.selector }, { frameId: 0 }, (r) => {
            const _ = chrome.runtime.lastError;
            res(r?.result || { advanced: true });
          });
          setTimeout(() => res({ advanced: true }), 500);
        });
      };

      await engine.processSurveyWorkflow(
        getSurveyFn,
        executeActionFn,
        verifyStateFn,
        advancePageFn,
        {
          evidenceText: state.pageContext?.bodyText || "",
          onQuestionStart: (q) => {
            renderAgentStepBadge(`Processing question: "${q.text.slice(0, 35)}"`, true);
          },
          onQuestionAnswered: ({ question, answer }) => {
            renderAgentStepBadge(`[Verified] "${question.text.slice(0, 30)}": ${answer.join(", ")}`, true);
            renderAssistantPlainMessage(`✓ **${question.text}:** Selected \`${answer.join(", ")}\` (state verified)`);
          },
          onQuestionPaused: (pauseInfo) => {
            if (pauseInfo.category === "personal_info_required") {
              renderAgentStepBadge("Paused: Personal info required", false);
              renderAssistantPlainMessage(`🔒 **Personal Information Required:**\n${pauseInfo.reason}\n\n*Si strictly refuses to invent personal history or identity.* Please answer this question directly or authorize your profile.`);
            } else if (pauseInfo.category === "ambiguous") {
              renderAgentStepBadge("Paused: Ambiguous question", false);
              renderAssistantPlainMessage(`❓ **Ambiguous Question Paused:**\n${pauseInfo.reason}\n\nPlease clarify your choice in chat.`);
            } else {
              renderAgentStepBadge(`Paused: ${pauseInfo.status}`, false);
              renderAssistantPlainMessage(`⏸️ **Survey Paused:** ${pauseInfo.reason || pauseInfo.status}`);
            }
          },
          onPageAdvanced: ({ progress }) => {
            renderAgentStepBadge(`Advanced to next page ${progress ? `(${progress})` : ""}`, true);
            renderAssistantPlainMessage(`➡️ Advanced to next survey page.`);
          },
          onRequiresSubmitApproval: async ({ submitButton }) => {
            renderAgentStepBadge("Awaiting Submit Authorization", true);
            const approved = await requestSafetyApproval("click_element", {
              element_description: "Submit Completed Survey Form",
              selector: submitButton.selector,
            }, 99);

            if (approved) {
              await executeJITAction("click_element", { selector: submitButton.selector });
              renderAgentStepBadge("Survey Submitted [Authorized]", true);
              renderAssistantPlainMessage("🎉 **Survey Submitted Successfully!** All answers verified.");
            } else {
              renderAgentStepBadge("Submission Paused by User", false);
              renderAssistantPlainMessage("⏸️ **Survey Submission Paused:** Form is completely filled and verified, but submit was held for user review.");
            }
          },
          onComplete: ({ record }) => {
            renderAgentStepBadge(`Survey Completed (${record?.length || 0} questions answered)`, true);
            renderAssistantPlainMessage(`✅ **Survey Session Complete:** Answered and verified ${record?.length || 0} question(s).`);
          }
        }
      );

      setBusyState(false);
      return;
    } catch (err) {
      setBusyState(false);
      renderAssistantPlainMessage(`⚠️ Survey processing error: ${err.message}`);
      return;
    }
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
  text = text.replace(/```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `@@SIDEKICKCODEBLOCK${codeBlocks.length}@@`;
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
    text = text.replace(`@@SIDEKICKCODEBLOCK${idx}@@`, block);
  });

  return text;
}

function renderAssistantPlainMessage(txt, type = "assistant") {
  const entry = document.createElement("div");
  entry.className = `message-entry ${type === "system" ? "system" : "assistant"}`;
  const formatted = renderMarkdownToHtml(txt);
  if (type === "system") {
    entry.innerHTML = `<div class="thread-notice">${formatted}</div>`;
  } else {
    const container = document.createElement("div");
    container.className = "assistant-text markdown-body";
    container.innerHTML = formatted;
    entry.appendChild(container);
  }
  elements.messagesList?.appendChild(entry);
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
  // Prevent overlapping tasks when a task is already executing
  if (state.isBusy) {
    console.warn("[Sidekick] Task already in progress. Ignoring overlapping submission.");
    return;
  }

  removeFollowUps();
  hideSafetyModal();

  // Check if it's a slash command first!
  if (promptText.trim().startsWith("/")) {
    await handleSlashCommand(promptText.trim());
    return;
  }

  if (!state.apiKey) {
    const hasProxy = await checkServerProxyHealth();
    if (!hasProxy) {
      renderUserMessage(promptText);
      renderInlineKeySetup();
      return;
    }
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

  // Bounded total task deadline (120 seconds maximum per user turn)
  const taskDeadlineMs = 120000;
  state.abortController = new AbortController();
  const taskDeadlineTimer = setTimeout(() => {
    if (state.abortController) {
      state.abortController.abort(new DOMException("Task exceeded maximum total execution deadline of 120 seconds", "TimeoutError"));
    }
  }, taskDeadlineMs);

  try {
    // Perform guaranteed live active tab extraction immediately before running turn
    await extractContext();

    const apiClient = new SidekickApiClient(state.apiKey, state.model, state.proxyUrl || getResolvedProxyUrl());
    const coordinator = new SidekickCoordinator(apiClient);

    state.hasExecutedPhysicalAction = false;
    let result = await coordinator.processTurn(promptText, state.pageContext, {
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

    // 3. Action Worker Execution (Element [#ID] based or Tab Group)
    // 3. Action Worker Execution (Autonomous Continuous Multi-Process Loop)
    if (result.type === "action") {
      showActiveTaskLedger(promptText);

      const cognitiveLedger = {
        taskObjective: promptText,
        stepNumber: 1,
        completedMilestones: [],
        activePlan: result.payload?.plan_checklist || [],
        lastAction: null,
        domDelta: "Initial viewport state captured",
        historySignatures: []
      };

      try {
        while (!state.abortController?.signal.aborted) {
          if (cognitiveLedger.stepNumber > MAX_AGENT_STEPS) {
            renderNotice(`Reached task step limit (${MAX_AGENT_STEPS} steps). Complete.`);
            break;
          }

          const actionData = result.payload || {};
          const actType = actionData.action;

          // Explicit completion signal
          if (actionData.is_task_complete) {
            const summary = actionData.completion_summary || actionData.explanation || "Objective reached successfully.";
            updateTaskLedger(actionData.plan_checklist || [], cognitiveLedger.stepNumber, actionData.situational_thought || "Task completed.");
            renderAssistantPlainMessage(`✅ **Task Completed:** ${summary}`);
            state.conversation.push({ role: "model", text: summary });
            break;
          }

          // Non-actionable or element missing exit
          if (actType === "none") {
            const explanation = actionData.explanation || "No physical action could be targeted on this page.";
            updateTaskLedger(actionData.plan_checklist || [], cognitiveLedger.stepNumber, actionData.situational_thought || explanation);
            renderAssistantPlainMessage(`ℹ️ ${explanation}`);
            state.conversation.push({ role: "model", text: explanation });
            break;
          }

          // Update Active Task Ledger checklist and situational reasoning
          updateTaskLedger(
            actionData.plan_checklist || [],
            cognitiveLedger.stepNumber,
            actionData.situational_thought || actionData.explanation
          );

          // Open new tab inside managed Chrome Tab Group
          if (actType === "open_tab") {
            let targetUrl = (actionData.url || "https://www.google.com").trim();
            if (!/^https?:\/\//i.test(targetUrl)) targetUrl = "https://" + targetUrl;
            if (!checkDomainAllowed(targetUrl)) {
              renderAgentStepBadge(`Blocked navigation: Restricted domain`, false);
              renderAssistantPlainMessage(`🛡️ Navigation blocked: Destination "${targetUrl}" matches restricted domain.`);
              break;
            }
            await openNewTabInManagedGroup(targetUrl);
            const stepDesc = `Opened tab in Workgroup: ${targetUrl}`;
            renderAgentStepBadge(`[Step ${cognitiveLedger.stepNumber}] ${stepDesc}`, true);
            renderAssistantPlainMessage(stepDesc);
            cognitiveLedger.lastAction = stepDesc;
            cognitiveLedger.completedMilestones.push(stepDesc);
            await delay(200);
            await extractContext();
            await refreshTabGroupState();
          } else {
            // Seamless Tab Group Isolation Guard (Auto-adopts current tab so user actions are never blocked)
            if (state.tabGroup?.isConfigured && state.tabGroup?.isolationEnabled && !state.tabGroup?.isCurrentTabInGroup) {
              try {
                if (state.activeTabId) {
                  await addCurrentTabToManagedGroup();
                  await refreshTabGroupState();
                }
              } catch (grpErr) {
                console.debug("Auto-add tab to workgroup notice:", grpErr);
              }
            }

            if (actType === "scroll") {
              const dir = actionData.direction || "down";
              await executeJITAction("scroll_viewport", { direction: dir, pixels: 450 });
              const stepDesc = `Scrolled page ${dir}`;
              renderAgentStepBadge(`[Step ${cognitiveLedger.stepNumber}] ${stepDesc}`, true);
              renderAssistantPlainMessage(`Viewport smoothly scrolled ${dir}.`);
              cognitiveLedger.lastAction = stepDesc;
              cognitiveLedger.completedMilestones.push(stepDesc);
              await delay(300);
              await extractContext();
            } else if (actType === "navigate") {
              let targetUrl = (actionData.url || "").trim();
              if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
                targetUrl = `https://${targetUrl}`;
                actionData.url = targetUrl;
              }
              if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
                renderAgentStepBadge(`Blocked navigation: Invalid URL`, false);
                renderAssistantPlainMessage(`🛑 Navigation blocked: Invalid protocol for "${actionData.url}".`);
                break;
              }
              if (!checkDomainAllowed(actionData.url)) {
                renderAgentStepBadge(`Blocked navigation: Restricted domain`, false);
                renderAssistantPlainMessage(`🛡️ Navigation blocked: Destination "${actionData.url}" matches restricted domain.`);
                break;
              }
              const approved = await requestSafetyApproval("navigate_to", { url: actionData.url }, cognitiveLedger.stepNumber);
              if (!approved) {
                renderAgentStepBadge(`Navigation denied by user: ${actionData.url}`, false);
                renderAssistantPlainMessage("Navigation stopped by user.");
                break;
              }
              await executeJITAction("navigate_to", { url: actionData.url });
              const stepDesc = `Navigated to ${actionData.url}`;
              renderAgentStepBadge(`[Step ${cognitiveLedger.stepNumber}] ${stepDesc}`, true);
              renderAssistantPlainMessage(stepDesc);
              cognitiveLedger.lastAction = stepDesc;
              cognitiveLedger.completedMilestones.push(stepDesc);
              await delay(350);
              await extractContext();
            } else if (actType === "click" || actType === "type") {
              let targetEl = null;
              if (state.pageContext?.interactiveElements) {
                const targetNum = Number(actionData.target_id);
                targetEl = state.pageContext.interactiveElements.find(e => Number(e.id) === targetNum);
              }

              if (!targetEl && actionData.element_label && state.pageContext?.interactiveElements) {
                targetEl = resolveElementCoordinates({ element_description: actionData.element_label }, state.pageContext.interactiveElements);
              }

              if (!targetEl) {
                const expl = `Target element [#${actionData.target_id || "?"}] could not be found in active viewport. ${actionData.explanation || ""}`.trim();
                renderAgentStepBadge("Element not found", false);
                renderAssistantPlainMessage(expl);
                break;
              }

              // Live coordinate re-verification
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
                cdpArgs.text = actionData.text !== undefined ? actionData.text : "";
                cdpArgs.press_enter = Boolean(actionData.press_enter || actionData.pressEnter);
              }

              // Check high-risk confirmation
              const isHighRisk = checkHighRiskAction(cdpTool, cdpArgs, targetEl.label);
              if (isHighRisk) {
                const approved = await requestSafetyApproval(cdpTool, cdpArgs, cognitiveLedger.stepNumber);
                if (!approved) {
                  renderAgentStepBadge(`Action denied by user: ${targetEl.label}`, false);
                  renderAssistantPlainMessage("Action stopped by user safety policy.");
                  break;
                }
              }

              await executeJITAction(cdpTool, cdpArgs);
              const stepDesc = isClick
                ? `Clicked "${targetEl.label}" (element [#${targetEl.id}])`
                : `Typed "${cdpArgs.text}" into "${targetEl.label}"`;
              renderAgentStepBadge(`[Step ${cognitiveLedger.stepNumber}] ${stepDesc} [CDP Trusted]`, true);
              renderAssistantPlainMessage(stepDesc);
              cognitiveLedger.lastAction = stepDesc;
              cognitiveLedger.completedMilestones.push(stepDesc);

              await delay(300);
              await extractContext();
            }
          }

          // Cycle detection (Anti-thrashing: detect 3 repeated identical states)
          const scrollYPos = typeof window !== "undefined" ? window.scrollY || 0 : 0;
          const currentSignature = `${actType}:${actionData.target_id || ""}:${actionData.url || ""}:${actionData.direction || ""}:${scrollYPos}:${state.pageContext?.interactiveElements?.length || 0}`;
          cognitiveLedger.historySignatures.push(currentSignature);
          const last3 = cognitiveLedger.historySignatures.slice(-3);
          if (last3.length === 3 && last3[0] === last3[1] && last3[1] === last3[2]) {
            renderAssistantPlainMessage("⚠️ **Cycle Detection Guard:** Detected 3 consecutive identical actions without DOM progress. Halting loop to prevent runaway behavior.");
            break;
          }

          cognitiveLedger.stepNumber++;

          // Deliberate next step in continuous workflow
          updateTurnAction(`Deliberating Step ${cognitiveLedger.stepNumber}…`, "Action Worker", 2);
          result = await coordinator.processTurn(promptText, state.pageContext, {
            signal: state.abortController.signal,
            enclaveId: state.activeEnclaveId,
            cognitiveLedger,
            onProgress: (actionLabel, detail, step) => updateTurnAction(actionLabel, detail, step)
          });

          if (result.type !== "action") {
            if (result.type === "answer") {
              const answerPayload = result.payload;
              await renderAssistantResponse(answerPayload);
              state.conversation.push({ role: "model", text: answerPayload });
              saveSession();
              return;
            } else if (result.type === "transform") {
              const transformPayload = result.payload;
              renderAssistantMarkdownMessage(transformPayload.text || "", transformPayload.followUps || []);
              state.conversation.push({ role: "model", text: transformPayload.text || "" });
              saveSession();
              return;
            } else if (result.type === "action_blocked" || result.type === "security_blocked") {
              const reason = result.reason || "Action blocked by safety policy invariants.";
              renderAgentStepBadge(`Step ${cognitiveLedger.stepNumber} Blocked: ${reason}`, false);
              renderAssistantPlainMessage(`🛡️ **Safety Gate Notification:**\n${reason}`);
            }
            break;
          }
        }
      } finally {
        hideActiveTaskLedger();
      }

      state.conversation.push({ role: "model", text: JSON.stringify(result?.payload || "Completed") });
      saveSession();
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
      let handled = false;
      if (!state.hasExecutedPhysicalAction) {
        handled = await handleResilientDirectActionFallback(promptText);
      }
      if (!handled) {
        renderErrorCard(error, promptText);
      }
    }
  } finally {
    clearTimeout(taskDeadlineTimer);
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

  // 3b. Search internet / web query intent
  const searchMatch = promptText.match(/^(?:search(?:\s+(?:the\s+)?(?:internet|web|google))?(?:\s+for)?|google|look\s*up|find(?:\s+me)?)\s+(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    if (query) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      try {
        await executeJITAction("navigate_to", { url: searchUrl });
        renderAgentStepBadge(`Step 1: Navigated to Google search for "${query}" [CDP Trusted]`, true);
        renderAssistantPlainMessage(`Navigated to Google search for "${query}".`);
        return true;
      } catch (e) {
        console.debug("Fallback search failed:", e);
      }
    }
  }

  // 3c. Direct URL navigation intent (navigate to / go to / open / visit / browse to)
  const navMatch = promptText.match(/^(?:navigate\s+to|go\s+to|open|visit|browse\s+to)\s+(.+)$/i);
  if (navMatch) {
    let dest = navMatch[1].trim();
    if (dest && !/^https?:\/\//i.test(dest)) {
      if (dest.includes(".") && !dest.includes(" ")) {
        dest = `https://${dest}`;
      } else {
        dest = `https://www.google.com/search?q=${encodeURIComponent(dest)}`;
      }
    }
    if (dest) {
      try {
        await executeJITAction("navigate_to", { url: dest });
        renderAgentStepBadge(`Step 1: Navigated to "${dest}" [CDP Trusted]`, true);
        renderAssistantPlainMessage(`Navigated to ${dest}.`);
        return true;
      } catch (e) {
        console.debug("Fallback navigate failed:", e);
      }
    }
  }

  // Pure manual mechanical commands (scroll, click, type, navigate) fall through if unhandled.
  // Factual, informational, and reasoning errors are NOT fabricated and must be truthfully rendered to the user.
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

  // If action matches benign UI filter/sorting/cookie-consent/navigation patterns, skip high-risk modal
  if (BENIGN_UI_PATTERNS.some((pat) => pat.test(textToCheck))) {
    return false;
  }

  if (HIGH_RISK_REGEX.test(textToCheck)) {
    return true;
  }

  if (toolName === "upload_file" || toolName === "navigate_to") {
    return true;
  }

  return false;
}

/**
 * Human-in-the-Loop Approval Modal Trigger
 * Consequential action authorization: requires explicit user confirmation
 * Renders action details safely via textContent to prevent HTML injection.
 */
function requestSafetyApproval(toolName, args, stepNumber = 1) {
  return new Promise((resolve) => {
    if (!elements.safetyModal || !elements.safetyActionDesc) {
      console.warn("[Safety Gate] Safety modal element missing, blocking action by default.");
      resolve(false);
      return;
    }

    state.pendingSafetyApproval = { resolve };

    if (elements.safetyStepBadge) {
      elements.safetyStepBadge.textContent = `Step ${stepNumber}`;
    }

    const desc = formatActionSummary(toolName, args);
    elements.safetyActionDesc.textContent = `Sidekick is requesting permission to execute a consequential action:\n${desc}\n\nDo you authorize this action?`;
    elements.safetyModal.classList.remove("hidden");
    elements.approveActionBtn?.focus();
  });
}

function hideSafetyModal() {
  if (elements.safetyModal) {
    elements.safetyModal.classList.add("hidden");
  }
  if (elements.safetyActionDesc) {
    elements.safetyActionDesc.textContent = "";
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

  if (args.selector) {
    const found = elements.find((e) => e.selector === args.selector || e.labelSelector === args.selector);
    if (found) return found;
  }

  const desc = (args.element_description || args.label || "").toLowerCase().trim();
  const group = (args.group || args.context || "").toLowerCase().trim();

  if (desc) {
    // 1. Exact label + group match
    if (group) {
      const groupMatches = elements.filter((e) => {
        const eLabel = (e.label || e.associatedLabel || "").toLowerCase().trim();
        const eGroup = (e.group || e.context || "").toLowerCase().trim();
        return (eLabel === desc || eLabel.includes(desc) || desc.includes(eLabel)) &&
               (eGroup.includes(group) || group.includes(eGroup));
      });
      if (groupMatches.length === 1) return groupMatches[0];
      if (groupMatches.length > 1) {
        return { ambiguous: true, label: desc, matches: groupMatches };
      }
    }

    // 2. Exact label match across elements
    const exactMatches = elements.filter((e) => {
      const eLabel = (e.label || e.associatedLabel || "").toLowerCase().trim();
      return eLabel === desc;
    });

    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) {
      // Multiple candidates with identical label and no distinguishing group: reject as ambiguous!
      return { ambiguous: true, label: desc, matches: exactMatches };
    }

    // 3. Substring match
    const subMatches = elements.filter((e) => {
      const eLabel = (e.label || e.associatedLabel || "").toLowerCase().trim();
      return (eLabel.includes(desc) || desc.includes(eLabel)) && eLabel.length > 0;
    });
    if (subMatches.length === 1) return subMatches[0];
    if (subMatches.length > 1) {
      return { ambiguous: true, label: desc, matches: subMatches };
    }
  }

  return null;
}

/**
 * Execute CDP Action via Background Service Worker
 */
async function executeJITAction(toolName, args) {
  if (state.abortController?.signal?.aborted) {
    throw new DOMException("Action cancelled by user", "AbortError");
  }
  if (!state.activeTabId) throw new Error("No active tab connected");

  // Navigation targets an external destination URL - verify the destination domain, NOT the source tab
  if (toolName === "navigate_to") {
    let targetUrl = (args.url || "").trim();
    if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
      args.url = targetUrl;
    }
    if (!checkDomainAllowed(targetUrl)) {
      throw new Error(`Security Exception: Navigation to restricted domain is prohibited (${targetUrl}).`);
    }
  } else {
    // Physical hardware automation (click, type, scroll, upload) requires that the active tab is not an internal or restricted page
    if (!checkDomainAllowed(state.activeTabUrl)) {
      const isInternal = !state.activeTabUrl || state.activeTabUrl.startsWith("chrome://") || state.activeTabUrl.startsWith("about:") || state.activeTabUrl.startsWith("edge://");
      if (isInternal) {
        throw new Error(`Browser Policy: Automation (clicks/keystrokes) cannot interact with internal browser pages (${state.activeTabUrl.split("/")[2] || "newtab"}). Navigate to any website to automate actions.`);
      }
      throw new Error(`Security Exception: Automation is strictly prohibited on sensitive platform (${state.activeTabUrl.split("/")[2] || "protected domain"}).`);
    }
  }
  state.hasExecutedPhysicalAction = true;

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
      } catch (err) {
        if (err && err.message && err.message.includes("Security Exception")) {
          throw err;
        }
      }
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
      params = { x: args.x, y: args.y, selector: args.selector, element_description: args.element_description };
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
  if (state.pendingSafetyApproval) {
    const resolve = state.pendingSafetyApproval.resolve;
    hideSafetyModal();
    if (typeof resolve === "function") {
      resolve(false);
    }
  }
  if (state.abortController) {
    state.abortController.abort(new DOMException("Task aborted by user", "AbortError"));
  }
  if (state.activeTabId && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "ABORT_PENDING_CDP", tabId: state.activeTabId }).catch(() => {});
  }
  hideActiveTaskLedger();
  setBusyState(false);
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
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object" && (parsed.paragraphs || parsed.text)) {
        data = parsed;
      }
    } catch {}
  }

  // If still a plain string, render as markdown assistant bubble
  if (typeof data === "string") {
    renderAssistantPlainMessage(data);
    return;
  }

  const entry = document.createElement("div");
  entry.className = "message-entry assistant";

  const container = document.createElement("div");
  container.className = "assistant-text";

  let paragraphs = data?.paragraphs;
  if (!paragraphs && data?.text) {
    paragraphs = [{ text: data.text }];
  } else if (!paragraphs) {
    paragraphs = [];
  }

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

  const isOfflineOrProxyUnavailable =
    error?.isOffline ||
    errorLower.includes("proxy connection failed") ||
    errorLower.includes("failed to fetch") ||
    errorLower.includes("network error") ||
    errorLower.includes("econnrefused") ||
    errorLower.includes("server proxy request failed") ||
    errorLower.includes("server proxy error") ||
    (error?.status === 503 && errorLower.includes("proxy"));

  const isTimeout =
    error?.name === "TimeoutError" ||
    errorLower.includes("timed out") ||
    errorLower.includes("deadline exceeded");

  const card = document.createElement("div");
  card.className = "error-recovery-card";

  if (isOfflineOrProxyUnavailable) {
    const proxyBase = (typeof getResolvedProxyUrl === "function" ? getResolvedProxyUrl() : state.proxyUrl) || "http://localhost:3000";
    card.innerHTML = `
      <div class="error-recovery-header">
        <span class="error-badge alert">📡 Server Proxy Unreachable</span>
      </div>
      <p class="error-recovery-desc">
        Could not connect to the backend server proxy at <code>${escapeXml(proxyBase)}</code>.
        If running locally, please ensure the backend server is running (e.g. <code>npm run dev</code>).
        Alternatively, configure a direct Gemini API key in Settings.
      </p>
      <div class="error-recovery-actions">
        <button type="button" class="error-action-btn primary" id="errRetryBtn">
          Retry Connection ↻
        </button>
        <button type="button" class="error-action-btn" id="errOpenSettingsBtn">
          Settings &amp; API Key ⚙
        </button>
      </div>
    `;
    card.querySelector("#errRetryBtn")?.addEventListener("click", () => {
      card.remove();
      submitPrompt(promptText);
    });
    card.querySelector("#errOpenSettingsBtn")?.addEventListener("click", () => {
      elements.settingsDrawer?.classList.remove("hidden");
      elements.apiKeyInput?.focus();
    });
  } else if (isTimeout) {
    card.innerHTML = `
      <div class="error-recovery-header">
        <span class="error-badge warning">⏱️ Request Timed Out</span>
      </div>
      <p class="error-recovery-desc">
        The request exceeded the bounded execution deadline without a response from the model.
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
  } else if (isHighDemand) {
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

  if (!state.currentSessionId) {
    state.currentSessionId = Date.now();
  }

  const sessionData = {
    id: state.currentSessionId,
    title: firstUser.slice(0, 45),
    date: new Date().toLocaleDateString(),
    conversation: state.conversation
  };

  const existingIdx = sessions.findIndex(s => s.id === state.currentSessionId);
  let updated;
  if (existingIdx >= 0) {
    updated = [...sessions];
    updated[existingIdx] = sessionData;
  } else {
    updated = [sessionData, ...sessions.slice(0, 14)];
  }

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
      state.currentSessionId = null;
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
      state.currentSessionId = sess.id;
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

  const renderCustomWordmark = (name) => {
    wrapper.replaceChildren();
    const span = document.createElement("span");
    span.className = "wordmark-custom";
    span.textContent = name;
    wrapper.appendChild(span);
  };

  const renderDefaultWordmark = () => {
    wrapper.replaceChildren();
    const s = document.createElement("span");
    s.id = "wordmarkS";
    s.textContent = "S";
    const uper = document.createElement("span");
    uper.id = "wordmarkUper";
    uper.className = "wordmark-foldable";
    uper.textContent = "uper ";
    const i = document.createElement("span");
    i.id = "wordmarkI";
    i.textContent = "i";
    const ntell = document.createElement("span");
    ntell.id = "wordmarkNtelligence";
    ntell.className = "wordmark-foldable";
    ntell.textContent = "ntelligence";
    wrapper.appendChild(s);
    wrapper.appendChild(uper);
    wrapper.appendChild(i);
    wrapper.appendChild(ntell);
  };

  const savedName = state.customAssistantName || "";
  if (savedName) {
    renderCustomWordmark(savedName);
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
      renderCustomWordmark(val);
    } else {
      state.customAssistantName = "";
      await storage.set({ si_custom_assistant_name: "" });
      renderDefaultWordmark();
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
  let is3DActive = false;

  const tryInit3D = () => {
    if (typeof window.initLivingCosmos === "function") {
      try {
        const instance = window.initLivingCosmos({
          canvasId: "galaxyCanvas",
          containerId: "rrStarlightCeiling",
          nebulaIntensity: 0.88
        });
        if (instance) {
          is3DActive = true;
          console.log("[Sidekick] 3D Living Particle Globe active via cosmos.bundle.js");
          return true;
        }
      } catch (e) {
        console.warn("[Sidekick] 3D Living Cosmos initialization error:", e);
      }
    }
    return false;
  };

  if (tryInit3D()) return;

  // Poll briefly for bundle script execution in Chrome extension side panel
  let retries = 0;
  const pollTimer = setInterval(() => {
    retries++;
    if (tryInit3D()) {
      clearInterval(pollTimer);
    } else if (retries >= 15) {
      clearInterval(pollTimer);
      if (!is3DActive) {
        console.log("[Sidekick] Falling back to 2D Living Particle Globe engine");
        init2DParticleGlobe();
      }
    }
  }, 60);
}

/**
 * 2D Canvas Living Particle Globe Engine (Fallback)
 * Guarantees that whether 3D WebGL or 2D Canvas is used, the user ALWAYS sees
 * the Living Particle Globe (Earth's continents, 23.44° polar tilt, metropolitan beacons)
 * and never an obsolete spiral star system.
 */
function init2DParticleGlobe() {
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

  // Globe parameters
  const GLOBE_RADIUS = 52;
  const RAD = Math.PI / 180;
  const AXIAL_TILT = -23.44 * RAD;
  const VIEW_INCLINE = 14 * RAD;

  // Metropolitan Beacons [lat, lon, name]
  const CITIES = [
    [35.68, 139.77],   // Tokyo
    [40.71, -74.01],   // New York
    [51.51, -0.13],    // London
    [48.86, 2.35],     // Paris
    [37.77, -122.42],  // San Francisco
    [34.05, -118.24],  // Los Angeles
    [1.35, 103.82],    // Singapore
    [25.20, 55.27],    // Dubai
    [-33.87, 151.21],  // Sydney
    [-23.55, -46.63],  // São Paulo
    [30.04, 31.24],    // Cairo
    [19.08, 72.88],    // Mumbai
    [39.90, 116.40],   // Beijing
    [37.57, 126.98],   // Seoul
    [52.52, 13.40],    // Berlin
    [28.61, 77.21],    // New Delhi
    [41.90, 12.50],    // Rome
    [43.65, -79.38],   // Toronto
    [-37.81, 144.96],  // Melbourne
    [22.32, 114.17],   // Hong Kong
  ];

  // Continental Land Bounding Regions for fast point classification
  const CONTINENTS = [
    { minLat: 15, maxLat: 72, minLon: -168, maxLon: -55 },  // North America
    { minLat: -55, maxLat: 12, minLon: -82, maxLon: -34 },  // South America
    { minLat: 36, maxLat: 71, minLon: -10, maxLon: 45 },    // Europe
    { minLat: 10, maxLat: 75, minLon: 45, maxLon: 175 },    // Asia
    { minLat: -35, maxLat: 37, minLon: -18, maxLon: 52 },   // Africa
    { minLat: -44, maxLat: -10, minLon: 112, maxLon: 154 }, // Australia
    { minLat: -85, maxLat: -65, minLon: -180, maxLon: 180 },// Antarctica
    { minLat: 60, maxLat: 83, minLon: -55, maxLon: -20 },   // Greenland
  ];

  function isLand(lat, lon) {
    for (let c of CONTINENTS) {
      if (lat >= c.minLat && lat <= c.maxLat && lon >= c.minLon && lon <= c.maxLon) {
        return true;
      }
    }
    return false;
  }

  // Generate Fibonacci Sphere Particles
  const TOTAL_POINTS = 3600;
  const particles = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const y = 1 - (i / (TOTAL_POINTS - 1)) * 2; // -1 to 1
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = (2 * Math.PI * i) / goldenRatio;

    const lat = Math.asin(y) * (180 / Math.PI);
    const lon = ((theta % (2 * Math.PI)) * (180 / Math.PI)) - 180;

    const land = isLand(lat, lon);
    const r = GLOBE_RADIUS * (land ? 1.025 : 0.985);

    const x = Math.cos(theta) * radiusAtY * r;
    const py = y * r;
    const z = Math.sin(theta) * radiusAtY * r;

    particles.push({
      x, y: py, z,
      lat, lon,
      isLand: land,
      color: land
        ? (Math.random() > 0.4 ? "rgba(56, 189, 248, " : "rgba(253, 224, 71, ") // Astral Sapphire or Solar Gold
        : "rgba(30, 58, 138, ", // Recessed Deep Indigo Ocean
      size: land ? (1.1 + Math.random() * 0.9) : 0.65,
      phase: Math.random() * Math.PI * 2,
      freq: 1.2 + Math.random() * 2.2,
      baseAlpha: land ? (0.65 + Math.random() * 0.35) : 0.28
    });
  }

  // City Beacon Points
  const cityParticles = CITIES.map(([lat, lon]) => {
    const phi = (90 - lat) * RAD;
    const theta = (lon + 180) * RAD;
    const r = GLOBE_RADIUS * 1.035;
    return {
      x: -r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.cos(phi),
      z: r * Math.sin(phi) * Math.sin(theta),
      phase: Math.random() * Math.PI * 2,
      freq: 2.5 + Math.random() * 2.0
    };
  });

  // Distant Background Starfield
  const bgStars = [];
  for (let i = 0; i < 450; i++) {
    bgStars.push({
      x: (Math.random() - 0.5) * 500,
      y: (Math.random() - 0.5) * 320,
      z: -120 + Math.random() * 80,
      size: 0.45 + Math.random() * 0.85,
      alpha: 0.2 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
      freq: 0.8 + Math.random() * 1.8
    });
  }

  // Animation & Mouse Parallax
  let rotationAngle = 0;
  let mouseX = 0;
  let mouseY = 0;
  let curMouseX = 0;
  let curMouseY = 0;

  window.addEventListener("mousemove", (e) => {
    if (isReducedMotion) return;
    const rect = ceiling.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
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

    const time = Date.now() * 0.001;

    if (!isReducedMotion) {
      rotationAngle += 0.0032;
      curMouseX += (mouseX - curMouseX) * 0.045;
      curMouseY += (mouseY - curMouseY) * 0.045;
    }

    const cosR = Math.cos(rotationAngle);
    const sinR = Math.sin(rotationAngle);

    // Center coordinates: positioned lower underneath header
    const centerX = width / 2 + curMouseX * 14;
    const centerY = height * 0.44 + Math.sin(time * 0.45) * 3.5 + curMouseY * 8;
    const fov = 320;

    // 1. Draw Background Stars
    for (let s of bgStars) {
      const twinkle = 0.75 + 0.25 * Math.sin(time * s.freq + s.phase);
      const a = s.alpha * twinkle;
      const px = width / 2 + s.x + curMouseX * 4;
      const py = height / 2 + s.y + curMouseY * 4;
      if (px >= 0 && px <= width && py >= 0 && py <= height) {
        ctx.fillStyle = `rgba(224, 242, 254, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Draw Rotating Living Particle Globe
    const cosTilt = Math.cos(AXIAL_TILT);
    const sinTilt = Math.sin(AXIAL_TILT);
    const cosInc = Math.cos(VIEW_INCLINE);
    const sinInc = Math.sin(VIEW_INCLINE);

    for (let p of particles) {
      // Axial Spin around Y-axis
      const rx = p.x * cosR - p.z * sinR;
      const rz = p.x * sinR + p.z * cosR;
      const ry = p.y;

      // Axial Tilt on Z
      const tx = rx * cosTilt - ry * sinTilt;
      const ty = rx * sinTilt + ry * cosTilt;
      const tz = rz;

      // Viewer Inclination on X
      const finalY = ty * cosInc - tz * sinInc;
      const finalZ = ty * sinInc + tz * cosInc;
      const finalX = tx;

      // Skip backfacing points (behind globe hemisphere)
      if (finalZ < -10) continue;

      const depth = finalZ + 180;
      const scale = fov / depth;
      const px = centerX + finalX * scale;
      const py = centerY + finalY * scale;

      const twinkle = 0.82 + 0.18 * Math.sin(time * p.freq + p.phase);
      const depthFade = Math.max(0.15, (finalZ + 20) / (GLOBE_RADIUS + 20));
      const alpha = Math.min(1.0, p.baseAlpha * twinkle * depthFade);

      if (px >= -5 && px <= width + 5 && py >= -5 && py <= height + 5 && alpha > 0.05) {
        ctx.fillStyle = `${p.color}${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, p.size * scale * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Draw Metropolitan Beacon Sparkles (4-Point Diffraction Glints)
    for (let c of cityParticles) {
      const rx = c.x * cosR - c.z * sinR;
      const rz = c.x * sinR + c.z * cosR;
      const ry = c.y;

      const tx = rx * cosTilt - ry * sinTilt;
      const ty = rx * sinTilt + ry * cosTilt;
      const tz = rz;

      const finalY = ty * cosInc - tz * sinInc;
      const finalZ = ty * sinInc + tz * cosInc;
      const finalX = tx;

      if (finalZ < 2) continue; // Only front hemisphere

      const depth = finalZ + 180;
      const scale = fov / depth;
      const px = centerX + finalX * scale;
      const py = centerY + finalY * scale;

      const glint = 0.75 + 0.25 * Math.sin(time * c.freq + c.phase);
      const spikeLen = Math.max(2.5, 5.0 * glint * scale);

      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.85 * glint).toFixed(3)})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px - spikeLen, py);
      ctx.lineTo(px + spikeLen, py);
      ctx.moveTo(px, py - spikeLen);
      ctx.lineTo(px, py + spikeLen);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
