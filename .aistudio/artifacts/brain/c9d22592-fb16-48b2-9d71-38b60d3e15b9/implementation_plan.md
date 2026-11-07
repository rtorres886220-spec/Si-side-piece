# Sidekick Autonomous Agent: Enterprise Reliability & Zero-Retry Execution Plan

This revised implementation plan provides an exhaustive, production-grade architectural specification to permanently eliminate automation stalls, new-tab disconnection bugs, false occlusion lockouts, and repetitive retry loops in the Sidekick extension.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Per your strict mandate ("errors and mistakes and retrys are not an option ever... no halfassness or ai slop allowed"), this plan designs out trial-and-error retrying entirely by enforcing deterministic state verification, intelligent auto-tab switching, and true hit-test ancestor validation.

- **Confirmed Decision 1**: **Autonomous New-Tab & Window Redirection (`chrome.tabs.onCreated` & `chrome.tabs.onUpdated`)**: The engine will automatically detect when a survey link opens a new tab (`target="_blank"` or popup), instantly re-target `this.tabId`, auto-group the tab into the `"Si"` workgroup, re-inject `content.js`, attach CDP, and resume the agent loop seamlessly without user intervention.
- **Confirmed Decision 2**: **True Ancestor-Aware Hit-Testing (Zero False Occlusion)**: Rewriting `elementFromPoint` occlusion logic so that child spans, badges, SVG icons, and wrapper divs inside survey cards are correctly recognized as part of the target element (via `.contains()` checks), preventing false-positive occlusion aborts.
- **Confirmed Decision 3**: **Deterministic State-Diff Verification & Zero Retry Loops**: Eliminating retry loops completely by tracking pre-action vs post-action DOM mutation versions and URL state. If an action fails to alter the DOM or URL, the engine instantly escalates to alternative coordinate centers, programmatic scrolls, or direct trusted event dispatch rather than hammering the same click.
- **Confirmed Decision 4**: **System Doctor PING/PONG Handshake**: Implementing the missing `{ action: "PING" }` / `{ status: "PONG" }` listener in `content.js` to ensure 100% health reporting in System Doctor.

---

## 1. Overview & Core Concept

- **What It Does**: Upgrades the Sidekick Autonomous Agent Engine (`public/background.js`) and Content Script (`public/content.js`) into a fault-tolerant, deterministic browser automation runtime.
- **Target Audience**: Power users running complex 15-point surveys and multi-page workflows requiring absolute execution fidelity.
- **Key Value**: 100% first-try precision across window/tab navigations with zero manual intervention, zero stuck loops, and zero false error states.

---

## 2. User Experience & Visual Design

- **Zero-Friction Tab Following**: When a survey redirects to a third-party domain (e.g. CPX Research, TheoremReach, BitLabs) in a new tab, the sidepanel instantly updates its status badge (`"Switching automation context to new survey tab..."`) and continues step execution instantly.
- **Crystal-Clear Health Dashboard**: System Doctor reports active DOM Inspector status with a solid `PASS` state via a robust background-content PING handshake.
- **Deterministic Progress Ledger**: The step ledger clearly displays visual verification badges (`👁️ Visual Check`) and checklist progress without getting stuck in step 9/50.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Proactive Tab-Creation Interception**
  - *Chosen Approach*: Register background listeners on `chrome.tabs.onCreated` and `chrome.tabs.onUpdated` specifically scoped to the active agent session. When a new tab spawns from the current automation tab, re-route execution instantly.
  - *Why*: Survey networks routinely open providers in new tabs. Tying execution strictly to the initial tab caused the agent to operate blindly on the background page.
- **Decision 2: Hierarchical Ancestor Occlusion Validation**
  - *Chosen Approach*: Replace strict element-equality hit-testing with hierarchical containment (`targetEl.contains(topEl) || topEl.contains(targetEl) || topEl === targetEl`).
  - *Why*: Survey cards contain rich inner markup. Strict equality (`topEl !== targetEl`) caused wrappers to be flagged as "occluded by overlay", freezing the agent.
- **Decision 3: State-Diff Verification vs Blind Retries**
  - *Chosen Approach*: Capture a pre-action state snapshot (`docMutationVersion`, scroll position, URL). After dispatching an action, verify that either the DOM mutated or the URL changed. If stagnant, enforce an immediate alternate strategy (scroll or structural re-query) instead of repeating the identical click.
  - *Why*: Completely eliminates retry loops and ensures forward progress.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Sidepanel & User Interface                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         (START_AGENT_LOOP / State)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AutonomousAgentEngine (Service Worker)            │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ Tab Creation Intercept │  │ State-Diff Verification & Anti-Loop  │  │
│  │ (chrome.tabs.onCreated)│  │ (Prevents stagnant repeat clicks)    │  │
│  └────────────────────────┘  └──────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       (executeCDPActionOnTab / PING)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Content Script (public/content.js)                 │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ PING / PONG Handshake  │  │ Hierarchical Ancestor Hit-Testing    │  │
│  │ (System Doctor pass)   │  │ (Eliminates false occlusion blocks)  │  │
│  └────────────────────────┘  └──────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Modules & Execution Flow:
1. **Multi-Tab Orchestration (`public/background.js`)**:
   - Monitors `chrome.tabs.onCreated` and `chrome.tabs.onUpdated`.
   - Automatically tracks tab ID lineage during an active agent session.
2. **Hit-Test Occlusion Guard (`public/content.js`)**:
   - Validates `document.elementFromPoint` against target element and its parent/child tree.
3. **Anti-Loop State Guard (`public/background.js`)**:
   - Tracks execution fingerprints. If a target ID and action type repeat without state mutation, forces an adaptive fallback (scroll / alternate query).
4. **Health Handshake (`public/content.js`)**:
   - Responds to `{ action: "PING" }` with `{ status: "PONG" }` for System Doctor.
