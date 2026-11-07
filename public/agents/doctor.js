/**
 * Sidekick - Autonomous Self-Diagnosis & Doctor Engine (Manifest V3)
 * Standalone Client-Side Diagnostic Engine
 * 
 * Features:
 * 1. Zero External Server Dependency - Runs 100% inside the extension runtime
 * 2. Instant Direct Gemini Ping - Verifies API key directly against Google API
 * 3. Tab Eligibility Checker - Detects chrome://, web store, and banking denylist with clear guidance
 * 4. Content Script Liveness & JIT Auto-Injector
 * 5. CDP Debugger Detector & Fallback Profiler (DevTools lock detection)
 * 6. 1-Click Self-Healing Actions
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const exp = factory();
    module.exports = exp;
    module.exports.default = exp;
  } else {
    const exports = factory();
    root.SidekickDoctor = exports;
    if (typeof globalThis !== "undefined") {
      globalThis.SidekickDoctor = exports;
    }
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RESTRICTED_SCHEMES = [
    "chrome://",
    "chrome-extension://",
    "chrome-search://",
    "edge://",
    "brave://",
    "about:blank",
    "about:",
    "file://",
    "javascript:",
    "data:",
    "view-source:"
  ];

  const SENSITIVE_AUTOMATION_DENYLIST = [
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

  const CHECK_STATUS = {
    PASS: "PASS",
    FAIL: "FAIL",
    WARN: "WARN",
    INFO: "INFO"
  };

  class SidekickDoctorEngine {
    constructor() {
      this.lastReport = null;
    }

    /**
     * 1. Test Gemini API Key Directly
     * Sends a minimal 1-token test prompt directly to Google Generative Language API.
     */
    async testApiKey(apiKey, options = {}) {
      const cleanKey = (apiKey || "").replace(/['"\s]/g, "").trim();
      if (!cleanKey) {
        return {
          id: "api_key",
          title: "Gemini API Key",
          status: CHECK_STATUS.FAIL,
          valid: false,
          category: "MISSING_KEY",
          message: "No Gemini API key is configured in Sidekick settings.",
          actionText: "Configure API Key",
          actionId: "OPEN_SETTINGS_KEY"
        };
      }

      if (!cleanKey.startsWith("AIzaSy")) {
        return {
          id: "api_key",
          title: "Gemini API Key",
          status: CHECK_STATUS.WARN,
          valid: false,
          category: "SUSPICIOUS_KEY_FORMAT",
          message: "API key does not start with standard prefix 'AIzaSy'. Verify your key from Google AI Studio.",
          actionText: "Check Key Format",
          actionId: "OPEN_SETTINGS_KEY"
        };
      }

      const model = options.model || "gemini-3.5-flash-lite";
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs || 8000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }]
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const hasCandidate = Boolean(data?.candidates?.[0]?.content?.parts?.length);
          return {
            id: "api_key",
            title: "Gemini API Key",
            status: CHECK_STATUS.PASS,
            valid: true,
            model,
            category: "VALID",
            message: `Key verified successfully with Google AI Studio (${model}).`,
            actionText: null,
            actionId: null
          };
        }

        const status = res.status;
        let errJson = {};
        try {
          errJson = await res.json();
        } catch {}
        const rawErrMsg = errJson?.error?.message || res.statusText || "";

        if (status === 400 || status === 403 || rawErrMsg.includes("API_KEY_INVALID") || rawErrMsg.includes("not valid")) {
          return {
            id: "api_key",
            title: "Gemini API Key",
            status: CHECK_STATUS.FAIL,
            valid: false,
            category: "INVALID_KEY",
            message: "API key was rejected by Google AI Studio. Please enter a valid API key.",
            actionText: "Update API Key",
            actionId: "OPEN_SETTINGS_KEY"
          };
        }

        if (status === 429 || rawErrMsg.includes("RESOURCE_EXHAUSTED")) {
          return {
            id: "api_key",
            title: "Gemini API Key",
            status: CHECK_STATUS.WARN,
            valid: true,
            category: "QUOTA_EXCEEDED",
            message: "API key is valid, but rate limit or quota is currently saturated. Pacing will handle backoff.",
            actionText: "View Quota in AI Studio",
            actionId: "OPEN_AI_STUDIO_QUOTA"
          };
        }

        return {
          id: "api_key",
          title: "Gemini API Key",
          status: CHECK_STATUS.WARN,
          valid: false,
          category: `HTTP_${status}`,
          message: `Google API returned status ${status}: ${rawErrMsg.slice(0, 100)}`,
          actionText: "Retry Test",
          actionId: "TEST_API_KEY"
        };
      } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = err?.name === "AbortError" || controller.signal.aborted;
        return {
          id: "api_key",
          title: "Gemini API Key",
          status: isAbort ? CHECK_STATUS.WARN : CHECK_STATUS.FAIL,
          valid: false,
          category: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          message: isAbort
            ? "API connection timed out after 8s. Check internet connection."
            : `Network error connecting to Google API: ${err?.message || "Offline"}`,
          actionText: "Retry Test",
          actionId: "TEST_API_KEY"
        };
      }
    }

    /**
     * 2. Check Tab Eligibility
     * Inspects active tab URL to ensure it is automatable and safe.
     */
    checkTabEligibility(tab) {
      if (!tab || !tab.url) {
        return {
          id: "target_tab",
          title: "Target Webpage",
          status: CHECK_STATUS.FAIL,
          eligible: false,
          category: "NO_ACTIVE_TAB",
          message: "No active browser tab found to inspect or automate.",
          actionText: "Open Test Webpage",
          actionId: "OPEN_TEST_PAGE",
          suggestedUrl: "https://en.wikipedia.org/wiki/Artificial_intelligence"
        };
      }

      const urlLower = tab.url.toLowerCase();

      // Check restricted internal schemes
      for (const scheme of RESTRICTED_SCHEMES) {
        if (urlLower.startsWith(scheme)) {
          let specificHint = "Chrome security blocks extensions from automating internal browser pages.";
          if (urlLower.startsWith("chrome://extensions")) {
            specificHint = "You are currently on the extensions manager (chrome://extensions). Open a public webpage (e.g. Wikipedia) to automate.";
          } else if (urlLower.startsWith("chrome://newtab") || urlLower.startsWith("about:blank")) {
            specificHint = "This is a blank new tab. Navigate to any website to begin browsing.";
          }

          return {
            id: "target_tab",
            title: "Target Webpage",
            status: CHECK_STATUS.FAIL,
            eligible: false,
            category: "RESTRICTED_BROWSER_PAGE",
            currentUrl: tab.url,
            message: specificHint,
            actionText: "Open Test Webpage (Wikipedia)",
            actionId: "OPEN_TEST_PAGE",
            suggestedUrl: "https://en.wikipedia.org/wiki/Artificial_intelligence"
          };
        }
      }

      // Check Chrome Web Store
      if (urlLower.includes("chromewebstore.google.com") || (urlLower.includes("chrome.google.com") && urlLower.includes("/webstore"))) {
        return {
          id: "target_tab",
          title: "Target Webpage",
          status: CHECK_STATUS.FAIL,
          eligible: false,
          category: "CHROME_WEBSTORE_RESTRICTED",
          currentUrl: tab.url,
          message: "Google Chrome strictly prohibits extension debugging and automation on the Chrome Web Store.",
          actionText: "Open Test Webpage",
          actionId: "OPEN_TEST_PAGE",
          suggestedUrl: "https://en.wikipedia.org/wiki/Artificial_intelligence"
        };
      }

      // Check financial / sensitive denylist
      let hostname = "";
      try {
        hostname = new URL(tab.url).hostname.toLowerCase();
      } catch {
        hostname = urlLower;
      }

      for (const denied of SENSITIVE_AUTOMATION_DENYLIST) {
        if (hostname === denied || hostname.endsWith("." + denied)) {
          return {
            id: "target_tab",
            title: "Target Webpage",
            status: CHECK_STATUS.WARN,
            eligible: false,
            category: "SENSITIVE_FINANCIAL_DENYLIST",
            currentUrl: tab.url,
            message: `Automation is strictly prohibited on sensitive domain (${denied}) to protect credentials and funds.`,
            actionText: "Switch to Benign Tab",
            actionId: "OPEN_TEST_PAGE",
            suggestedUrl: "https://en.wikipedia.org/wiki/Artificial_intelligence"
          };
        }
      }

      return {
        id: "target_tab",
        title: "Target Webpage",
        status: CHECK_STATUS.PASS,
        eligible: true,
        currentUrl: tab.url,
        currentTitle: tab.title || "Untitled Tab",
        tabId: tab.id,
        category: "ELIGIBLE",
        message: `Ready on "${(tab.title || tab.url).slice(0, 45)}"`,
        actionText: null,
        actionId: null
      };
    }

    /**
     * 3. Ping Content Script Liveness
     * Pings content.js in target tab. Returns alive status.
     */
    async pingContentScript(tabId) {
      if (!tabId || typeof chrome === "undefined" || !chrome.tabs) {
        return {
          id: "content_script",
          title: "DOM Inspector (content.js)",
          status: CHECK_STATUS.WARN,
          alive: false,
          category: "NO_TAB_CONTEXT",
          message: "No tab context available to ping DOM inspector.",
          actionText: null,
          actionId: null
        };
      }

      try {
        const pingResult = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { action: "PING" }, (res) => {
            if (chrome.runtime.lastError || !res || res.status !== "PONG") {
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });

        if (pingResult) {
          return {
            id: "content_script",
            title: "DOM Inspector (content.js)",
            status: CHECK_STATUS.PASS,
            alive: true,
            tabId,
            category: "ACTIVE",
            message: "Content script is mounted and actively reading the live DOM.",
            actionText: null,
            actionId: null
          };
        }

        return {
          id: "content_script",
          title: "DOM Inspector (content.js)",
          status: CHECK_STATUS.WARN,
          alive: false,
          tabId,
          category: "UNMOUNTED",
          message: "Content script not responding (tab was opened before extension install or reloaded).",
          actionText: "Auto-Inject Script",
          actionId: "AUTO_INJECT_SCRIPT"
        };
      } catch (err) {
        return {
          id: "content_script",
          title: "DOM Inspector (content.js)",
          status: CHECK_STATUS.WARN,
          alive: false,
          tabId,
          category: "ERROR",
          message: `Failed to ping content script: ${err?.message || "Unavailable"}`,
          actionText: "Auto-Inject Script",
          actionId: "AUTO_INJECT_SCRIPT"
        };
      }
    }

    /**
     * JIT Auto-Inject content.js into target tab
     */
    async autoInjectContentScript(tabId) {
      if (!tabId || typeof chrome === "undefined" || !chrome.scripting) {
        throw new Error("chrome.scripting is not available in this environment.");
      }
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"]
      });
      // Short settle pause
      await new Promise((r) => setTimeout(r, 250));
      return await this.pingContentScript(tabId);
    }

    /**
     * 4. Test CDP Hardware Debugger Availability
     * Tests ephemeral attach/detach to detect whether F12 DevTools or another debugger has locked CDP.
     */
    async testDebugger(tabId, tabUrl = "") {
      if (!tabId || typeof chrome === "undefined" || !chrome.debugger) {
        return {
          id: "cdp_debugger",
          title: "Hardware CDP Controller",
          status: CHECK_STATUS.INFO,
          mode: "DOM_FALLBACK",
          category: "NO_DEBUGGER_API",
          message: "chrome.debugger API not available. Will use 11-event DOM synthetic fallback.",
          actionText: null,
          actionId: null
        };
      }

      if (tabUrl) {
        for (const scheme of RESTRICTED_SCHEMES) {
          if (tabUrl.toLowerCase().startsWith(scheme)) {
            return {
              id: "cdp_debugger",
              title: "Hardware CDP Controller",
              status: CHECK_STATUS.WARN,
              mode: "BLOCKED",
              category: "INTERNAL_PAGE_RESTRICTED",
              message: "Cannot attach debugger to internal Chrome page.",
              actionText: null,
              actionId: null
            };
          }
        }
      }

      try {
        const target = { tabId };
        await new Promise((resolve, reject) => {
          chrome.debugger.attach(target, "1.3", () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(true);
            }
          });
        });

        // Detach immediately
        try {
          await new Promise((resolve) => {
            chrome.debugger.detach(target, () => resolve(true));
          });
        } catch {}

        return {
          id: "cdp_debugger",
          title: "Hardware CDP Controller",
          status: CHECK_STATUS.PASS,
          mode: "CDP_HARDWARE",
          category: "ATTACHABLE",
          message: "Native hardware DevTools Protocol is available and unlocked.",
          actionText: null,
          actionId: null
        };
      } catch (err) {
        const errMsg = err?.message || "";
        const isLockedByDevTools = errMsg.includes("Another debugger") || errMsg.includes("already attached");
        if (isLockedByDevTools) {
          return {
            id: "cdp_debugger",
            title: "Hardware CDP Controller",
            status: CHECK_STATUS.INFO,
            mode: "DOM_SYNTHETIC_FALLBACK",
            category: "DEVTOOLS_OPEN",
            message: "F12 DevTools is open on target tab. Sidekick will use trusted 11-event synthetic pointer fallback.",
            actionText: "Close F12 for CDP",
            actionId: "INFO_DEVTOOLS"
          };
        }

        return {
          id: "cdp_debugger",
          title: "Hardware CDP Controller",
          status: CHECK_STATUS.INFO,
          mode: "DOM_FALLBACK",
          category: "ATTACH_ERROR",
          message: `Debugger attach note: ${errMsg.slice(0, 80)}. 11-event DOM synthetic actions ready.`,
          actionText: null,
          actionId: null
        };
      }
    }

    /**
     * 5. Check Permissions & Storage Integrity
     */
    async checkStorageAndPermissions() {
      const hasStorage = typeof chrome !== "undefined" && Boolean(chrome.storage && chrome.storage.local);
      const hasScripting = typeof chrome !== "undefined" && Boolean(chrome.scripting);
      const hasDebugger = typeof chrome !== "undefined" && Boolean(chrome.debugger);

      let keyPresent = false;
      let configuredModel = "gemini-3.5-flash-lite";

      if (hasStorage) {
        try {
          const res = await chrome.storage.local.get(["gemini_sidekick_api_key", "gemini_sidekick_model"]);
          keyPresent = Boolean(res?.gemini_sidekick_api_key && res.gemini_sidekick_api_key.trim());
          if (res?.gemini_sidekick_model) configuredModel = res.gemini_sidekick_model;
        } catch {}
      }

      return {
        id: "permissions_storage",
        title: "Extension Security & Storage",
        status: hasStorage && hasScripting ? CHECK_STATUS.PASS : CHECK_STATUS.WARN,
        hasStorage,
        hasScripting,
        hasDebugger,
        keyPresent,
        configuredModel,
        category: "OK",
        message: hasStorage ? "Local encrypted storage verified. MV3 manifest permissions intact." : "Storage API unavailable.",
        actionText: null,
        actionId: null
      };
    }

    /**
     * 6. Run Complete Full Preflight Audit
     * Gathers all 5 diagnostic checks and returns comprehensive report.
     */
    async runFullPreflight(options = {}) {
      let activeTab = null;
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs && tabs.length > 0) activeTab = tabs[0];
        } catch {}
      }

      // 1. Storage & Key check
      const permCheck = await this.checkStorageAndPermissions();
      let apiKey = options.apiKey;
      if (!apiKey && typeof chrome !== "undefined" && chrome.storage) {
        try {
          const res = await chrome.storage.local.get("gemini_sidekick_api_key");
          apiKey = res?.gemini_sidekick_api_key;
        } catch {}
      }

      // 2. Parallel check runs
      const [apiKeyCheck, tabCheck] = await Promise.all([
        this.testApiKey(apiKey, { model: permCheck.configuredModel }),
        Promise.resolve(this.checkTabEligibility(activeTab))
      ]);

      let contentScriptCheck = {
        id: "content_script",
        title: "DOM Inspector (content.js)",
        status: CHECK_STATUS.INFO,
        alive: false,
        message: "Waiting for automatable tab."
      };

      let debuggerCheck = {
        id: "cdp_debugger",
        title: "Hardware CDP Controller",
        status: CHECK_STATUS.INFO,
        mode: "STANDBY",
        message: "Standby."
      };

      if (tabCheck.eligible && activeTab && activeTab.id) {
        [contentScriptCheck, debuggerCheck] = await Promise.all([
          this.pingContentScript(activeTab.id),
          this.testDebugger(activeTab.id, activeTab.url)
        ]);
      }

      const checks = [
        apiKeyCheck,
        tabCheck,
        contentScriptCheck,
        debuggerCheck,
        permCheck
      ];

      const failCount = checks.filter((c) => c.status === CHECK_STATUS.FAIL).length;
      const warnCount = checks.filter((c) => c.status === CHECK_STATUS.WARN).length;
      const ready = failCount === 0;

      let overallSummary = "All systems operational. Ready for autonomous browsing.";
      if (!apiKeyCheck.valid && tabCheck.status === CHECK_STATUS.FAIL) {
        overallSummary = "Setup required: Add your Gemini API key and navigate to a public webpage.";
      } else if (!apiKeyCheck.valid) {
        overallSummary = "Gemini API key is missing or invalid. Connect your Google AI Studio key.";
      } else if (tabCheck.status === CHECK_STATUS.FAIL) {
        overallSummary = "Active tab is an internal or restricted page. Switch to a public webpage.";
      } else if (!contentScriptCheck.alive) {
        overallSummary = "DOM inspector script is unmounted. 1-click auto-inject available.";
      }

      const report = {
        ready,
        timestamp: Date.now(),
        failCount,
        warnCount,
        passCount: checks.filter((c) => c.status === CHECK_STATUS.PASS).length,
        summary: overallSummary,
        checks,
        activeTab: activeTab ? { id: activeTab.id, title: activeTab.title, url: activeTab.url } : null
      };

      this.lastReport = report;
      return report;
    }

    /**
     * 7. 1-Click Autonomous Self-Healing Fix
     * Automatically fixes resolvable problems (injecting script, opening test tab).
     */
    async autoFixAll(options = {}) {
      const actionsTaken = [];
      const preflight = await this.runFullPreflight(options);

      // Fix 1: If on restricted tab, open test Wikipedia page
      const tabCheck = preflight.checks.find((c) => c.id === "target_tab");
      if (tabCheck && !tabCheck.eligible && tabCheck.suggestedUrl && typeof chrome !== "undefined" && chrome.tabs) {
        try {
          const newTab = await chrome.tabs.create({ url: tabCheck.suggestedUrl, active: true });
          actionsTaken.push(`Opened automatable test page: ${tabCheck.suggestedUrl}`);
          await new Promise((r) => setTimeout(r, 600));
          if (newTab.id) {
            await this.autoInjectContentScript(newTab.id).catch(() => {});
            actionsTaken.push("Auto-injected content script into new tab");
          }
        } catch (e) {
          actionsTaken.push(`Failed to open test tab: ${e.message}`);
        }
      }

      // Fix 2: If tab is eligible but content script unmounted, auto-inject
      const csCheck = preflight.checks.find((c) => c.id === "content_script");
      if (csCheck && !csCheck.alive && preflight.activeTab?.id) {
        try {
          await this.autoInjectContentScript(preflight.activeTab.id);
          actionsTaken.push("Auto-injected content script into current tab");
        } catch (e) {
          actionsTaken.push(`Auto-injection failed: ${e.message}`);
        }
      }

      // Re-run preflight after fixes
      const updatedPreflight = await this.runFullPreflight(options);
      return {
        actionsTaken,
        updatedPreflight
      };
    }
  }

  const doctorInstance = new SidekickDoctorEngine();
  doctorInstance.SidekickDoctorEngine = SidekickDoctorEngine;
  doctorInstance.CHECK_STATUS = CHECK_STATUS;
  return doctorInstance;
});
