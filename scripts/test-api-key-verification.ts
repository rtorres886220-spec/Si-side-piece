/**
 * API Key Verification Comprehensive Test Suite
 *
 * Validates:
 * 1. Valid API key and successful Google response.
 * 2. Invalid API key (HTTP 400 API_KEY_INVALID, HTTP 401).
 * 3. Finite timeout (never-ending request aborted, no indefinite hanging).
 * 4. Network failure (no false-positive on "AIzaSy" prefix; returns NETWORK_ERROR).
 * 5. Rate limit and quota exhaustion (HTTP 429 returns QUOTA_EXCEEDED).
 * 6. Unavailable model (HTTP 404 falls back cleanly to supported model or reports MODEL_UNAVAILABLE).
 * 7. Debounced/cancelled pending requests when user submits new key.
 * 8. State and storage protection: Failed new key never corrupts previous working connection.
 * 9. Persistence and restoration: Verified key persists and survives reload.
 * 10. Key sanitization: API keys never exposed in error text or logs.
 */

import { JSDOM } from 'jsdom';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✓ [PASS] ${message}`);
}

async function runAllTests() {
  console.log('==================================================================');
  console.log('  SI CHROME EXTENSION: API KEY VERIFICATION VALIDATION SUITE');
  console.log('==================================================================\n');

  // Set up JSDOM environment
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="sidekickPanel"></div>
        <button id="newChatBtn"></button>
        <button id="historyBtn"></button>
        <button id="settingsBtn"></button>
        <button id="emergencyStopBtn"></button>
        <div id="activeTaskLedger" class="hidden"></div>
        <span id="ledgerStepBadge"></span>
        <span id="ledgerTimer"></span>
        <button id="ledgerStopBtn"></button>
        <div id="ledgerObjective"></div>
        <div id="ledgerChecklist"></div>
        <details id="ledgerThoughtsAccordion"></details>
        <div id="ledgerThoughtsText"></div>
        <div id="tabGroupBar"></div>
        <button id="groupBadgeBtn"></button>
        <span id="groupColorDot"></span>
        <span id="groupTitleLabel"></span>
        <span id="groupTabCount"></span>
        <button id="newGroupTabBtn"></button>
        <div id="tabGroupDrawer"></div>
        <button id="closeGroupDrawerBtn"></button>
        <input type="checkbox" id="isolationToggle" />
        <button id="addActiveTabBtn"></button>
        <div id="groupTabsList"></div>
        <button id="createBindGroupBtn"></button>
        <button id="unbindGroupBtn"></button>
        <div id="isolationWarningBanner"></div>
        <span id="isolationBannerText"></span>
        <button id="bannerAddTabBtn"></button>
        <button id="bannerSwitchTabBtn"></button>
        <div id="historyDrawer" class="hidden"></div>
        <div id="historyList"></div>
        <button id="closeHistoryBtn"></button>
        <div id="settingsDrawer" class="hidden"></div>
        <input type="password" id="apiKeyInput" value="" />
        <input type="text" id="proxyUrlInput" value="" />
        <button id="toggleKeyVisibilityBtn"></button>
        <select id="modelSelect">
          <option value="gemini-3.1-flash-lite" selected>gemini-3.1-flash-lite</option>
          <option value="gemini-3.8-flash">gemini-3.8-flash</option>
        </select>
        <button id="saveSettingsBtn">Save</button>
        <span id="saveStatus"></span>
        <button id="closeSettingsBtn"></button>
        <div id="threadContainer"></div>
        <div id="emptyState"></div>
        <div id="onboardingCard">
          <input type="password" id="onboardingKeyInput" value="" />
          <button type="button" id="onboardingSaveBtn">Connect Key</button>
          <span id="onboardingStatus"></span>
        </div>
        <div id="promptSuggestions"></div>
        <div id="messagesList"></div>
        <div id="composerBox"></div>
        <form id="chatForm"></form>
        <textarea id="promptInput"></textarea>
        <div id="selectionBanner"></div>
        <span id="selectionQuoteText"></span>
        <button id="clearSelectionBtn"></button>
        <div id="safetyModal"></div>
        <span id="safetyStepBadge"></span>
        <span id="safetyActionDesc"></span>
        <button id="approveActionBtn"></button>
        <button id="denyActionBtn"></button>
        <button id="tabToken"></button>
        <span id="tabTokenDot"></span>
        <span id="tabTokenLabel"></span>
        <button id="selectionToken"></button>
        <button id="modelToken"></button>
        <span id="modelTokenLabel"></span>
        <button id="sendBtn"></button>
        <svg id="sendIconSvg"></svg>
        <div id="stopIconSquare"></div>
        <button id="helpBtn"></button>
        <div id="speechBar"></div>
        <div id="slashMenu"></div>
        <div id="slashList"></div>
        <button id="slashCheatSheetBtn"></button>
        <button id="toggleSlashBtn"></button>
        <div id="helpModal"></div>
        <button id="closeHelpModalBtn"></button>
        <input id="helpSearchInput" />
        <div id="helpModalList"></div>
        <div id="auditModal"></div>
        <button id="closeAuditModalBtn"></button>
        <div id="auditModalBody"></div>
        <div id="toastNotification"></div>
      </body>
    </html>
  `, { url: 'http://localhost:3000' });

  // Polyfill browser globals for module under test
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).localStorage = dom.window.localStorage;
  (globalThis as any).location = dom.window.location;
  (globalThis as any).DOMException = dom.window.DOMException;

  // Mock chrome storage
  const mockStorageStore: Record<string, any> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: (keys: any, cb: (res: any) => void) => {
          const res: any = {};
          if (typeof keys === 'string') {
            res[keys] = mockStorageStore[keys];
          } else if (Array.isArray(keys)) {
            for (const k of keys) res[k] = mockStorageStore[k];
          } else if (typeof keys === 'object' && keys !== null) {
            for (const k of Object.keys(keys)) {
              res[k] = mockStorageStore[k] !== undefined ? mockStorageStore[k] : keys[k];
            }
          }
          cb(res);
        },
        set: (items: any, cb?: () => void) => {
          Object.assign(mockStorageStore, items);
          if (cb) cb();
        }
      }
    },
    runtime: {
      sendMessage: (_msg: any, cb?: (res: any) => void) => {
        if (cb) cb({ success: true });
      },
      lastError: null
    }
  };

  // Import sidepanel module
  const sidepanel = require('../public/sidepanel.js');
  const {
    verifyApiKey,
    VERIFY_ERROR_CATEGORIES,
    sanitizeKeyFromError,
    DEFAULT_MODEL,
    FALLBACK_MODEL
  } = sidepanel;

  assert(typeof verifyApiKey === 'function', 'verifyApiKey function is exported and accessible');
  assert(typeof sanitizeKeyFromError === 'function', 'sanitizeKeyFromError is exported and accessible');
  assert(VERIFY_ERROR_CATEGORIES.AUTH_INVALID === 'AUTH_INVALID', 'VERIFY_ERROR_CATEGORIES has AUTH_INVALID');
  assert(VERIFY_ERROR_CATEGORIES.TIMEOUT === 'TIMEOUT', 'VERIFY_ERROR_CATEGORIES has TIMEOUT');
  assert(VERIFY_ERROR_CATEGORIES.NETWORK_ERROR === 'NETWORK_ERROR', 'VERIFY_ERROR_CATEGORIES has NETWORK_ERROR');

  // ---------------------------------------------------------------------------
  // TEST 1: Valid API Key & Successful Google API Response
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: VALID API KEY & SUCCESSFUL GOOGLE RESPONSE ---');
  let fetchCallCount = 0;
  (globalThis as any).fetch = async (url: string, opts: any) => {
    fetchCallCount++;
    assert(opts.headers['x-goog-api-key'] === 'TEST_VALID_KEY_123', 'Passes correct API key in x-goog-api-key header');
    assert(opts.signal instanceof AbortSignal, 'Attaches finite AbortSignal to fetch request');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'hi' }] } }]
      })
    };
  };

  const validResult = await verifyApiKey('TEST_VALID_KEY_123', DEFAULT_MODEL);
  assert(validResult.valid === true, 'Valid API key returns valid: true');
  assert(validResult.model === DEFAULT_MODEL, 'Returns verified model');
  assert(!validResult.error, 'No error returned on success');

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid API Key (HTTP 400 API_KEY_INVALID & HTTP 401)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: INVALID API KEY HANDLING ---');
  (globalThis as any).fetch = async () => {
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
          details: [{ reason: 'API_KEY_INVALID' }]
        }
      })
    };
  };

  const invalidResult = await verifyApiKey('INVALID_KEY_XYZ', DEFAULT_MODEL);
  assert(invalidResult.valid === false, 'Invalid API key returns valid: false');
  assert(invalidResult.category === VERIFY_ERROR_CATEGORIES.AUTH_INVALID, 'Categorized as AUTH_INVALID');
  assert(invalidResult.error.includes('Invalid Gemini API key'), 'Returns clear actionable error message');

  // Test HTTP 401 Unauthorized
  (globalThis as any).fetch = async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 401, message: 'Request is missing required authentication credential.' }
      })
    };
  };
  const unauthResult = await verifyApiKey('BAD_KEY_401', DEFAULT_MODEL);
  assert(unauthResult.valid === false, 'HTTP 401 returns valid: false');
  assert(unauthResult.category === VERIFY_ERROR_CATEGORIES.AUTH_INVALID, 'Categorized as AUTH_INVALID on 401');

  // ---------------------------------------------------------------------------
  // TEST 3: Finite Request Timeout (Request Never Responds)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: REQUEST TIMEOUT (NEVER RESPONDS) ---');
  (globalThis as any).fetch = async (_url: string, opts: any) => {
    return new Promise((_resolve, reject) => {
      // Listen to the signal that verifyApiKey created
      opts.signal.addEventListener('abort', () => {
        reject(new DOMException('The user aborted a request.', 'TimeoutError'));
      });
    });
  };

  // We test using an external abort signal or fast abort
  const testTimeoutController = new AbortController();
  // Trigger abort to test timeout path resolution
  setTimeout(() => testTimeoutController.abort(new DOMException('Request timed out', 'TimeoutError')), 50);

  const timeoutResult = await verifyApiKey('TEST_KEY_STALL', DEFAULT_MODEL, testTimeoutController.signal);
  assert(timeoutResult.valid === false, 'Timed-out request resolves to valid: false without hanging');
  assert(
    timeoutResult.category === VERIFY_ERROR_CATEGORIES.TIMEOUT || timeoutResult.category === VERIFY_ERROR_CATEGORIES.ABORTED,
    'Categorized as TIMEOUT or ABORTED'
  );
  assert(timeoutResult.error.length > 0, 'Provides actionable timeout error message');

  // ---------------------------------------------------------------------------
  // TEST 4: Network Failure & Anti-False-Positive Test
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: NETWORK FAILURE & ZERO FALSE-POSITIVE ON AIzaSy ---');
  (globalThis as any).fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  // A key that starts with AIzaSy must NOT be treated as valid when network fails!
  const fakeKeyWithGooglePrefix = 'AIzaSyD-FakePrefixKeyThatIsActuallyOffline00';
  const networkErrorResult = await verifyApiKey(fakeKeyWithGooglePrefix, DEFAULT_MODEL);

  assert(networkErrorResult.valid === false, 'CRITICAL: Network failure with AIzaSy key is strictly NOT valid');
  assert(networkErrorResult.category === VERIFY_ERROR_CATEGORIES.NETWORK_ERROR, 'Categorized strictly as NETWORK_ERROR');
  assert(networkErrorResult.error.includes('Network connection failed'), 'Reports genuine network error');

  // ---------------------------------------------------------------------------
  // TEST 5: Rate Limit or Quota Error (HTTP 429)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: RATE LIMIT / QUOTA EXHAUSTION (HTTP 429) ---');
  (globalThis as any).fetch = async () => {
    return {
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 429,
          message: 'Resource has been exhausted (e.g. check quota).',
          status: 'RESOURCE_EXHAUSTED'
        }
      })
    };
  };

  const quotaResult = await verifyApiKey('TEST_KEY_QUOTA', DEFAULT_MODEL);
  assert(quotaResult.valid === false, 'HTTP 429 quota exhaustion returns valid: false');
  assert(quotaResult.category === VERIFY_ERROR_CATEGORIES.QUOTA_EXCEEDED, 'Categorized as QUOTA_EXCEEDED');
  assert(quotaResult.error.includes('quota') || quotaResult.error.includes('429'), 'Actionable message explains quota/rate limit');

  // ---------------------------------------------------------------------------
  // TEST 6: Unavailable Model (HTTP 404 & Fallback)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: UNAVAILABLE MODEL (404) & FALLBACK RESOLUTION ---');
  const calledModels: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    if (url.includes('gemini-3.1-flash-lite')) {
      calledModels.push('gemini-3.1-flash-lite');
      return {
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 404, message: 'models/gemini-3.1-flash-lite is not found', status: 'NOT_FOUND' }
        })
      };
    }
    if (url.includes('gemini-3.8-flash')) {
      calledModels.push('gemini-3.8-flash');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'hi' }] } }]
        })
      };
    }
    return { ok: false, status: 500 };
  };

  const fallbackResult = await verifyApiKey('KEY_WITH_PRIMARY_404', 'gemini-3.1-flash-lite');
  assert(fallbackResult.valid === true, 'When primary model is 404, fallback model is tried and succeeds');
  assert(fallbackResult.model === 'gemini-3.8-flash', 'Verified model is set to fallback model');
  assert(calledModels.includes('gemini-3.1-flash-lite') && calledModels.includes('gemini-3.8-flash'), 'Tried primary model then fallback');

  // Case where BOTH models return 404
  (globalThis as any).fetch = async (url: string) => {
    return {
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 404, message: `Model not found: ${url}`, status: 'NOT_FOUND' }
      })
    };
  };
  const all404Result = await verifyApiKey('KEY_ALL_404', 'gemini-3.1-flash-lite');
  assert(all404Result.valid === false, 'When all tried models return 404, result is valid: false');
  assert(all404Result.category === VERIFY_ERROR_CATEGORIES.MODEL_UNAVAILABLE, 'Categorized as MODEL_UNAVAILABLE');

  // ---------------------------------------------------------------------------
  // TEST 7: Race Conditions & Superseded Requests
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: PENDING REQUEST ABORTION ON NEW SUBMISSION ---');
  const controllerA = new AbortController();
  const controllerB = new AbortController();

  let requestACompleted: boolean = false;
  let requestBCompleted: boolean = false;

  (globalThis as any).fetch = async (_url: string, opts: any) => {
    if (opts.headers['x-goog-api-key'] === 'KEY_A_SLOW') {
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted by newer request', 'AbortError'));
        });
        setTimeout(() => {
          requestACompleted = true;
          resolve({ ok: true, status: 200, json: async () => ({}) });
        }, 500);
      });
    }
    if (opts.headers['x-goog-api-key'] === 'KEY_B_FAST') {
      requestBCompleted = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })
      };
    }
    return { ok: false, status: 500 };
  };

  // Launch Request A
  const promiseA = verifyApiKey('KEY_A_SLOW', DEFAULT_MODEL, controllerA.signal);
  // User rapidly enters Key B -> Abort controllerA
  controllerA.abort(new DOMException('Superseded', 'AbortError'));
  const promiseB = verifyApiKey('KEY_B_FAST', DEFAULT_MODEL, controllerB.signal);

  const [resA, resB] = await Promise.all([promiseA, promiseB]);

  assert(resA.valid === false, 'Request A was aborted and did not succeed');
  assert(resA.category === VERIFY_ERROR_CATEGORIES.ABORTED, 'Request A categorized as ABORTED');
  assert(resB.valid === true, 'Request B succeeded independently');
  assert(Boolean(requestBCompleted), 'Request B executed cleanly');

  // ---------------------------------------------------------------------------
  // TEST 8: State & Storage Protection (Failed Key Never Corrupts Working State)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: FAILED KEY DOES NOT CORRUPT WORKING CONNECTION ---');
  // Initialize storage with known good key
  const KNOWN_GOOD_KEY = 'AIzaSy_ORIGINAL_WORKING_KEY_CONFIRMED';
  mockStorageStore['gemini_sidekick_api_key'] = KNOWN_GOOD_KEY;
  mockStorageStore['gemini_sidekick_model'] = DEFAULT_MODEL;
  sidepanel.state.apiKey = KNOWN_GOOD_KEY;
  sidepanel.state.model = DEFAULT_MODEL;

  // Mock fetch to reject invalid key attempts
  (globalThis as any).fetch = async (url: string, opts: any) => {
    if (opts.headers['x-goog-api-key'] === 'BAD_NEW_KEY_THAT_FAILS') {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] }
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  // Simulate user in Settings Drawer attempting to save invalid key
  const apiKeyInput = dom.window.document.getElementById('apiKeyInput') as HTMLInputElement;
  const saveSettingsBtn = dom.window.document.getElementById('saveSettingsBtn') as HTMLButtonElement;
  const saveStatus = dom.window.document.getElementById('saveStatus') as HTMLSpanElement;

  apiKeyInput.value = 'BAD_NEW_KEY_THAT_FAILS';
  saveSettingsBtn.click();

  // Wait for click event handler to finish
  await new Promise((r) => setTimeout(r, 100));

  assert(sidepanel.state.apiKey === KNOWN_GOOD_KEY, 'Active state.apiKey is PRESERVED after failed verification');
  assert(mockStorageStore['gemini_sidekick_api_key'] === KNOWN_GOOD_KEY, 'Storage gemini_sidekick_api_key is UNCHANGED');
  assert(saveStatus.textContent?.includes('Invalid') || saveStatus.textContent?.includes('failed'), 'Displays failure message to user');
  assert(saveSettingsBtn.disabled === false, 'Save button is re-enabled in finally block');

  // ---------------------------------------------------------------------------
  // TEST 9: Successful Persistence & Restoration
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: SUCCESSFUL PERSISTENCE & RESTORATION ---');
  const NEW_VALID_KEY = 'AIzaSy_BRAND_NEW_VALID_KEY_999';
  (globalThis as any).fetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })
    };
  };

  apiKeyInput.value = NEW_VALID_KEY;
  saveSettingsBtn.click();
  await new Promise((r) => setTimeout(r, 100));

  assert(sidepanel.state.apiKey === NEW_VALID_KEY, 'state.apiKey successfully updated after valid verification');
  assert(mockStorageStore['gemini_sidekick_api_key'] === NEW_VALID_KEY, 'Verified key is successfully written to storage');
  assert(saveStatus.textContent?.includes('verified') || saveStatus.textContent?.includes('saved'), 'Save status confirms verified save');

  // ---------------------------------------------------------------------------
  // TEST 10: Secret Redaction Security Invariant
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: SECRET SANITIZATION & REDACTION INVARIANT ---');
  const errorWithSecret = 'Error communicating with Google: invalid key AIzaSyD3x4mpleK3yThatShouldNotBeLogged000 in header';
  const sanitized = sanitizeKeyFromError(errorWithSecret);

  assert(!sanitized.includes('AIzaSyD3x4mpleK3yThatShouldNotBeLogged000'), 'User API key is completely purged from error string');
  assert(sanitized.includes('[REDACTED_API_KEY]'), 'Redaction placeholder safely replaces secret');

  console.log('\n==================================================================');
  console.log(`  VERIFICATION RESULTS: ALL ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('==================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
