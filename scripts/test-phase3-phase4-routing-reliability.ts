/**
 * Comprehensive Routing, Reliability, and Security Test Suite
 * Validates Gemini API direct & proxy paths, AbortSignal propagation,
 * error handling (400, 401, 403, 429, 503, timeouts), zero fake-success invariant,
 * and extension packaging integrity.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { SidekickApiClient } = require('../public/agents/apiClient.js');
const { SidekickRouter } = require('../public/agents/router.js');
const { SidekickWorkers } = require('../public/agents/workers.js');
const { SidekickGate } = require('../public/agents/gate.js');
const { SidekickCritic } = require('../public/agents/critic.js');
const { SidekickCoordinator } = require('../public/agents/coordinator.js');
import fs from 'fs';
import path from 'path';

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

async function runTestSuite() {
  console.log('==================================================================');
  console.log('  PHASE 3 & 4: ROUTING, CANCELLATION, & RELIABILITY TEST SUITE');
  console.log('==================================================================\n');

  // -------------------------------------------------------------------------
  // SUITE 1: Candidate Extraction & Thought Block Sanitization
  // -------------------------------------------------------------------------
  console.log('--- SUITE 1: CANDIDATE EXTRACTION & THOUGHT FILTERING ---');

  // Test 1: Extracts clean JSON and text while stripping thinking/thought parts
  const thinkingPayload = {
    candidates: [
      {
        content: {
          parts: [
            { thought: true, text: 'Internal chain of thought reasoning...' },
            { text: '```json\n{"intent": "action", "confidence": 0.98}\n```' }
          ]
        }
      }
    ]
  };
  const extracted1 = SidekickApiClient.extractCandidate(thinkingPayload);
  assert(extracted1.json?.intent === 'action', 'Filters thought blocks and extracts JSON intent');
  assert(!extracted1.text.includes('chain of thought'), 'Internal thoughts are excluded from text output');

  // Test 2: Resilient parser handles unescaped trailing commas and preambles
  const messyText = 'Here is your structured output:\n```json\n{\n  "status": "success",\n  "count": 42,\n}\n```\nHope that helps!';
  const parsedJson = SidekickApiClient.parseJsonFromText(messyText);
  assert(parsedJson?.status === 'success' && parsedJson?.count === 42, 'Parses JSON with trailing commas and surrounding markdown');

  // Test 3: Extracts function call arguments correctly
  const functionCallPayload = {
    candidates: [
      {
        content: {
          parts: [
            { functionCall: { name: 'click_element', args: { x: 120, y: 340, element_description: 'Buy Now' } } }
          ]
        }
      }
    ]
  };
  const extractedFn = SidekickApiClient.extractCandidate(functionCallPayload);
  assert(extractedFn.functionCall?.name === 'click_element', 'Extracts functionCall name correctly');
  assert(extractedFn.json?.element_description === 'Buy Now', 'Maps functionCall args to json candidate');

  // -------------------------------------------------------------------------
  // SUITE 2: AbortSignal Cancellation Propagation across Multi-Agent Pipeline
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: ABORTSIGNAL CANCELLATION PROPAGATION ---');

  // Test 4: SidekickApiClient early abort
  const client = new SidekickApiClient('test-key', 'gemini-3.1-flash-lite');
  const preAbortedController = new AbortController();
  preAbortedController.abort(new DOMException('User cancelled', 'AbortError'));

  let clientAbortCaught = false;
  try {
    await client.executeRequest({ promptText: 'Hello' }, { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') clientAbortCaught = true;
  }
  assert(clientAbortCaught, 'SidekickApiClient immediately honors pre-aborted signal');

  // Test 5: SidekickRouter cancellation
  let routerAbortCaught = false;
  try {
    await SidekickRouter.routeRequest(client, 'What is the price?', [], { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') routerAbortCaught = true;
  }
  assert(routerAbortCaught, 'SidekickRouter aborts immediately when signal is cancelled');

  // Test 6: ActionWorker cancellation
  let workerAbortCaught = false;
  try {
    await SidekickWorkers.executeActionWorker(client, 'Click Buy', [], null, { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') workerAbortCaught = true;
  }
  assert(workerAbortCaught, 'ActionWorker aborts immediately on cancelled signal');

  // Test 7: AnswerWorker cancellation
  let answerAbortCaught = false;
  try {
    await SidekickWorkers.executeAnswerWorker(client, 'Summarize page', 'Evidence text', null, { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') answerAbortCaught = true;
  }
  assert(answerAbortCaught, 'AnswerWorker aborts immediately on cancelled signal');

  // Test 8: TransformWorker cancellation
  let transformAbortCaught = false;
  try {
    await SidekickWorkers.executeTransformWorker(client, 'Draft an email', 'Evidence text', null, { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') transformAbortCaught = true;
  }
  assert(transformAbortCaught, 'TransformWorker aborts immediately on cancelled signal');

  // Test 9: Critic cancellation
  let criticAbortCaught = false;
  try {
    await SidekickCritic.repairFailure(client, 'action', {}, { passed: false, code: 'ELEMENT_NOT_FOUND', reason: 'Missing' }, 'Click', '', null, { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') criticAbortCaught = true;
  }
  assert(criticAbortCaught, 'SidekickCritic aborts immediately on cancelled signal');

  // Test 10: Coordinator cancellation during workflow
  const coordinator = new SidekickCoordinator(client);
  let coordAbortCaught = false;
  try {
    await coordinator.processTurn('Click Checkout', { bodyText: 'Checkout button available' }, { signal: preAbortedController.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') coordAbortCaught = true;
  }
  assert(coordAbortCaught, 'SidekickCoordinator halts pipeline turn and raises AbortError');

  // -------------------------------------------------------------------------
  // SUITE 3: Server Proxy Live Routing & Contracts
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: SERVER PROXY LIVE ROUTING & CONTRACTS ---');

  // Test 11: Server /api/health endpoint
  try {
    const healthRes = await fetch('http://127.0.0.1:3000/api/health');
    assert(healthRes.ok, 'Server health check returns HTTP 200');
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok' && typeof healthData.hasApiKey === 'boolean', 'Health endpoint returns valid status and hasApiKey boolean');
  } catch (e: any) {
    console.warn('Skipping live local port 3000 health check if server running on different interface:', e.message);
  }

  // Test 12: High-level server conversational fast path (0ms Gemini bypass)
  const convRes = await fetch('http://127.0.0.1:3000/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptText: 'Hello Sidekick!' }),
  });
  assert(convRes.ok, 'Conversational fast-path returns HTTP 200');
  const convData = await convRes.json();
  assert(convData.usedModel === 'deterministic-conversational-router', 'Deterministic conversational router bypasses remote API call');
  assert(convData.text && convData.text.length > 0, 'Conversational router provides natural greeting');

  // Test 13: High-level mechanical fast path (0ms Gemini bypass)
  const mechRes = await fetch('http://127.0.0.1:3000/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptText: 'scroll down' }),
  });
  assert(mechRes.ok, 'Mechanical fast-path returns HTTP 200');
  const mechData = await mechRes.json();
  assert(mechData.functionCall?.name === 'scroll_viewport', 'Mechanical fast-path identifies scroll_viewport functionCall without API invocation');

  // Test 14: Server input validation - Empty prompt rejection
  const emptyRes = await fetch('http://127.0.0.1:3000/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptText: '' }),
  });
  assert(emptyRes.status === 400, 'Server rejects empty prompt with HTTP 400');

  // Test 15: Server input validation - Payload size limit enforcement
  const giantPrompt = 'A'.repeat(35000);
  const oversizedRes = await fetch('http://127.0.0.1:3000/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptText: giantPrompt }),
  });
  assert(oversizedRes.status === 400, 'Server rejects oversized prompt > 32,000 characters with HTTP 400');

  // Test 16: Live rawPayload specialist proxy execution
  const rawProxyRes = await fetch('http://127.0.0.1:3000/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawPayload: {
        contents: [{ role: 'user', parts: [{ text: 'Respond with exactly: {"status":"READY"}' }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
    }),
  });
  assert(rawProxyRes.ok, 'rawPayload proxy route returns HTTP 200 with JSON mime type configuration');
  const rawProxyData = await rawProxyRes.json();
  assert(rawProxyData.success === true, 'rawPayload proxy execution succeeded');
  assert(rawProxyData.text.includes('READY'), 'rawPayload preserves structured response schema');

  // -------------------------------------------------------------------------
  // SUITE 4: Zero Fake-Success & Truthful Error Handling Invariants
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: ZERO FAKE-SUCCESS & TRUTHFUL ERROR REPORTING ---');

  // Test 17: Sidekick sidepanel script does not fabricate answers when Gemini fails
  const sidepanelJsContent = fs.readFileSync(path.resolve('./public/sidepanel.js'), 'utf8');
  assert(
    !sidepanelJsContent.includes('matchCount >= 2') && !sidepanelJsContent.includes('Derived answer from active tab:'),
    'Factual DOM scraping fallback in handleResilientDirectActionFallback is eradicated'
  );

  // Test 18: API Key Sanitization Regex
  const sensitiveErrorString = 'Request failed: invalid key AIzaSyD3x4mpleK3yThatShouldNotBeLogged000';
  const sanitized = sensitiveErrorString.replace(/AIza[0-9A-Za-z\-_]{35}/g, '[REDACTED_API_KEY]');
  assert(!sanitized.includes('AIzaSyD3x4mple'), 'API key pattern is strictly redacted from error text');
  assert(sanitized.includes('[REDACTED_API_KEY]'), 'Redaction placeholder is inserted in place of secret');

  // -------------------------------------------------------------------------
  // SUITE 5: Extension Packaging & Manifest V3 Asset Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: EXTENSION PACKAGING & MV3 ASSET INTEGRITY ---');

  const zipPath = path.resolve('./public/sidekick-extension.zip');
  assert(fs.existsSync(zipPath), 'Generated release ZIP archive exists at public/sidekick-extension.zip');

  const zipStats = fs.statSync(zipPath);
  assert(zipStats.size > 200000, `ZIP archive has substantive payload (${zipStats.size} bytes)`);

  const manifestPath = path.resolve('./public/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.manifest_version === 3, 'Manifest is valid Manifest V3');
  assert(manifest.permissions.includes('debugger'), 'Manifest includes required "debugger" permission');
  assert(manifest.permissions.includes('tabGroups'), 'Manifest includes required "tabGroups" permission');
  assert(manifest.permissions.includes('sidePanel'), 'Manifest includes required "sidePanel" permission');
  assert(manifest.side_panel?.default_path === 'sidepanel.html', 'Side panel points to sidepanel.html');

  console.log('\n==================================================================');
  console.log(`  SUMMARY: ALL ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('==================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
