# Sidekick Precision & Resilience Remediation Architecture [APPROVED & EXECUTING]

A comprehensive technical blueprint and remediation report resolving the 7 core operational blockers in the Sidekick Chrome Extension, eliminating element staleness, unhandled loop stalling, persona trap disqualifications, CDP race conditions, and MV3 service worker state evaporation.

***

## Status: Approved by User — Execution in Progress

- **Survey Persona Policy**: Automated persona execution preserved with triple-layer attention check and foil-detection shield.
- **Element Resolution**: Multi-factor fingerprint locator (CSS structural path, normalized text, tag/role, and spatial coordinates).
- **Execution Policy**: Zero-stall continuous execution mandate with active scroll exploration and Critic re-prompting.
- **CDP Engine**: Session-locked debugger management with 6-event synthetic dispatch fallback.
- **Router Precision**: Temperature 0.0 classification with strict typed schemas.
- **Evidence Guard**: Bounded 2,500 token retrieval with verbatim bracketed receipt enforcement.
- **State Persistence**: Durable `chrome.storage.session` cognitive ledger synchronization.

---

## 1. Execution Phases & Targeted Files

1. **`public/content.js`**:
   - Multi-factor element fingerprinting (`id`, `tag`, `role`, `normalizedText`, `selectorPath`, `relativeCoords`).
   - Resilient dynamic re-resolution (`resolveTargetElement`) preventing stale ID errors on SPA re-renders.
   - Authentic 6-event synthetic dispatch sequence (`pointerover` -> `pointerdown` -> `mousedown` -> `focus` -> `pointerup` -> `mouseup` -> `click`).
   - Dynamic page stabilization detector with network & DOM MutationObserver settling.

2. **`public/agents/coordinator.js`**:
   - Dynamic stabilization delay replacing arbitrary 350ms wait.
   - Zero-stall active scroll exploration when elements are not immediately visible.
   - Multi-turn Critic recovery injecting concrete failure feedback into cognitive ledger.

3. **`public/agents/surveyEngine.js`**:
   - Triple-layer trap & foil detection (instruction traps, negative qualifiers, impossible foil items).
   - Strict container-scoped matrix row/column isolation.
   - Consequential submit authorization protection.

4. **`public/background.js`**:
   - Session-locked CDP debugger lifecycle with navigation reconnect.
   - Durable ledger persistence to `chrome.storage.session`.

5. **`public/agents/router.js` & `public/agents/workers.js`**:
   - Temperature 0.0 classification.
   - Strict action schema validation rejecting ambiguous synonym coercions.
   - Bounded evidence retrieval preventing hallucinated citations.

6. **Packaging & Verification**:
   - Re-build cosmos engine and re-bundle extension via `scripts/pack-extension.ts`.
   - Run verification test suites.
