# Sidekick Extension Comprehensive Audit & Remediation Plan (Gemini 3.6 Flash Revision)

Comprehensive remediation plan to fix all verified defects in the Sidekick Chrome Extension codebase, with primary model updated to **Gemini 3.6 Flash** while keeping all thinking levels and temperature settings unchanged.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Model Update**: Update primary model constant from `gemini-3.5-flash-lite` to `gemini-3.6-flash`.
> - **Settings Lock**: Preserve all existing thinking levels and temperature settings exactly as configured across all agents, router, critic, and coordinator.
> - **Targeted Fixes**: Apply all verified multi-step automation fixes (`const result`, ledger forwarding, cycle detection, step cap), security hardening (payment lockout unswallow, exact hostname deny-list, isolation fail-closed), and content extraction reliability patches.

***

## 1. Overview & Core Concept

Sidekick is an autonomous browser companion operating via Chrome DevTools Protocol (CDP) and Manifest V3. This plan details the surgical code fixes required to make the multi-step continuous loop robust, secure, and resilient against DOM mutations and transient errors—powered by **Gemini 3.6 Flash** with preserved thinking and temperature settings.

***

## 2. Key Product Decisions & Trade-Offs

- **Decision 1: Model Upgrade with Preserved Inference Parameters**:
  - Update `DEFAULT_MODEL` / `PRIMARY_MODEL` to `"gemini-3.6-flash"`.
  - Keep all thinking levels (`thinkingLevel: "HIGH"`) and temperature (`temperature: 0.5`) settings identical to current codebase defaults.
- **Decision 2: Multi-Step Loop State Machine**:
  - Replace `const result` with `let result` in `sidepanel.js` to eliminate the fatal `TypeError: Assignment to constant variable` after Step 1.
  - Forward `cognitiveLedger` from `sidepanel.js` -> `coordinator.processTurn` -> `SidekickWorkers.executeActionWorker`.
  - Guard `handleResilientDirectActionFallback` so it only fires if `stepNumber === 1` and zero physical actions were executed.
  - Enforce `cognitiveLedger.stepNumber <= MAX_AGENT_STEPS` in the `while` loop condition.
- **Decision 3: Zero-Trust Security Hardening**:
  - Un-swallow payment lockout in `executeJITAction`, propagate exceptions to the UI, and forward `element_description` to `background.js`.
  - Fix domain deny-list matching from `url.includes(denied)` to strict hostname matching (`new URL(url).hostname === d || hostname.endsWith("." + d)`).
  - Make Tab Group isolation fail closed.
  - Ensure "Tab off" toggle actually prevents page text extraction and transmission.
  - Fix `/cancel` to enforce tab group isolation and connect to the active abort controller.
  - Fix `/disinfect` to exclude radio buttons (`input[type="radio"]`) and require user confirmation.
- **Decision 4: Content Extraction & DOM Reliability**:
  - Fix `isVisible` in `content.js` to avoid treating `clip-path: inset(0px)` or `display: contents` as hidden.
  - Include attributes (`class`, `aria-expanded`, `open`, `hidden`) in the `MutationObserver`.
  - Include `.value` and `.checked` state in indexed interactive elements so the model sees completed input states.
  - Implement React native value setter for DOM typing fallback.
  - Ensure scroll triggers `delay` and `extractContext`.

***

## 3. Technical Architecture & Component Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CHROME DEVTOOLS AUTOMATION PIPELINE                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
               User Prompt / Slash Command (/click, /fill, /cancel)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Sidekick Sidepanel Controller (sidepanel.js)                                │
│  - Active Model: gemini-3.6-flash (fallback: gemini-3.1-flash-lite)          │
│  - "Tab off" Guard: Blocks extraction when disabled                          │
│  - let result: Reassignable across multi-step continuous loop                │
│  - Hard Step Cap: Breaks when stepNumber > MAX_AGENT_STEPS                   │
│  - Cognitive Ledger: Passes taskObjective, milestones, and step context      │
│  - Post-action Navigation Wait: Awaits complete page readiness              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Multi-Agent Coordination Engine (agents/coordinator.js)                    │
│  - Stage 1: Router Agent (agents/router.js) [Temp & Thinking Unchanged]     │
│  - Stage 2: Specialist Worker (agents/workers.js) [Consumes Cognitive Ledger]│
│  - Stage 3: Deterministic Gate (agents/gate.js) [Word-boundary matching]   │
│  - Stage 4: Critic Repair (agents/critic.js) [Temp & Thinking Unchanged]    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                        CDP Tool Arguments & Selectors
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  JIT Execution & Security Defense Layer (sidepanel.js & background.js)       │
│  - executeJITAction: Re-throws payment block, passes element_description    │
│  - Approval Gate: Esc/Abort clears state.pendingSafetyApproval              │
│  - Exact Hostname Deny-List Check: Blocks subdomains without false positives│
│  - Strict Isolation: Fails closed when unconfigured or tab group missing    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Content Script & DOM Engine (content.js)                                   │
│  - isVisible: Correct clip-path & display:contents handling                 │
│  - MutationObserver: Watches class/open/aria-expanded attributes            │
│  - Element Indexer: Includes sanitized value, checked state, CSS fixed pos  │
│  - DOM Fallback: Uses React prototype setter for controlled inputs          │
│  - /disinfect: Excludes radios and guards user plan selections              │
└─────────────────────────────────────────────────────────────────────────────┘
```

***

## 4. Implementation Steps

### Step 1: Model Update (`sidepanel.js` & `agents/apiClient.js`)
1. In `sidepanel.js`, update `DEFAULT_MODEL = "gemini-3.6-flash"`.
2. In `agents/apiClient.js`, update `PRIMARY_MODEL = "gemini-3.6-flash"`.
3. Keep all temperature and thinking level settings unchanged in `router.js`, `workers.js`, and `critic.js`.

### Step 2: Multi-Step Automation Core (`sidepanel.js` & `agents/coordinator.js`)
1. Change `const result` to `let result` in `sidepanel.js` (line 3116).
2. Wire `cognitiveLedger` through `coordinator.processTurn(promptText, pageContext, { ..., cognitiveLedger })` to `SidekickWorkers.executeActionWorker`.
3. Add hard step cap check `if (cognitiveLedger.stepNumber > MAX_AGENT_STEPS) { renderNotice("Reached maximum step limit."); break; }` in the while loop.
4. Update cycle detection signature to include viewport scroll position so repeated downward scrolling does not prematurely halt.
5. In the `scroll` action branch, add `await delay(300); await extractContext();`.
6. Fix `handleResilientDirectActionFallback` so it only executes if `stepsTaken === 0` and no CDP/DOM action was executed.
7. Deduplicate rendering: when the router flips to `answer` or `transform` mid-loop, break and return without falling through to double render blocks.
8. Treat `actType === "none"` appropriately (show notice/explanation, not `✅ **Task Completed**` unless `actionData.is_task_complete` is true).
9. Report gate and critic failures mid-loop to the user instead of silent break.

### Step 3: JIT Action, Safety & Isolation (`sidepanel.js` & `background.js`)
1. In `sidepanel.js` `executeJITAction`, remove empty `catch {}` around the payment lockout throw, rethrow security exceptions, and forward `element_description` to `background.js`.
2. In `background.js`, ensure `descToCheck` receives `element_description` and does not block legitimate search input for typing.
3. In `sidepanel.js` emergency stop / Esc handlers, resolve `state.pendingSafetyApproval` with `false` and hide safety modal.
4. Make Tab Group isolation fail closed in `background.js` when isolation is enabled.
5. In `sidepanel.js` domain deny-list check, parse URLs with `new URL(url).hostname` and match exact domains/subdomains, clearing stale context on hit.
6. Connect `state.tabEnabled`: when false ("Tab off"), return an empty/sanitized context and do not extract page DOM.
7. Fix `/cancel` to check Tab Group isolation, bind to the active abort controller, and use `isVisible` check on candidate buttons.
8. Support Enter key and input clearing in CDP type action.

### Step 4: Content Extraction & DOM Fidelity (`content.js`)
1. Fix `isVisible`: remove `clipPath.includes("0px")` false-positive; support `display: contents` subtrees.
2. Update `MutationObserver` in `content.js` to observe attributes (`class`, `aria-expanded`, `open`, `hidden`).
3. In `indexInteractiveElements`, check `getComputedStyle(el).position` for `fixed`/`sticky` rather than only `el.style.position`.
4. Include `value: el.value` and `checked: el.checked` on indexed interactive elements.
5. In `executeDOMFallback` for typing, use `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` to support React-controlled inputs.
6. Fix `/disinfect` to target checkboxes only (exclude `input[type="radio"]`).

### Step 5: API Client Resilience & Untrusted Enclaves (`agents/apiClient.js`, `agents/router.js`, `agents/workers.js`)
1. In `agents/apiClient.js`, clone response before reading error text (`res.clone().text()`), and only retry on HTTP 429 and 503.
2. In `agents/router.js`, wrap catalog in cryptographic enclave delimiters.
3. In `agents/workers.js`, enclose active page title and URL within the untrusted enclave delimiter.

### Step 6: Verification & Packaging
1. Run `pack-extension.ts` to update `public/sidekick-extension.zip`.
2. Run test scripts (`scripts/hard-validation-audit.ts` / `scripts/comprehensive-benchmark.ts`).
3. Verify compilation with `compile_applet`.
