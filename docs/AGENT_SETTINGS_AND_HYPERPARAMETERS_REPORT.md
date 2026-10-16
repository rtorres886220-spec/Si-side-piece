# Sidekick Autonomous Multi-Agent Pipeline: Settings & Hyperparameters Specification Report

**Document ID:** `SK-REPORT-AGENT-CONFIG-2026`  
**Classification:** Engineering Specification & Runtime Audit  
**Target Environment:** Chrome DevTools Protocol (CDP) / Manifest V3 Extension & AI Studio Backend  

---

## Executive Summary

This report provides an exhaustive, component-by-component audit of all agents, workers, gates, and schedulers comprising the Sidekick architecture. It covers exact model bindings, temperature settings, top-p, thinking levels, tool calling modes, retry cascades, safety enclaves, and execution thresholds across both the Manifest V3 client runtime (`/public/agents/`) and the full-stack server proxy (`/server.ts`, `/src/`).

---

## 1. Master Agent Configuration Matrix

| Agent / Sub-System | Primary Model | Fallback Model | Temp | Top P | Thinking Level | Response Format | Tool / Function Mode |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Mechanical Bypass** | *Zero-LLM (Regex)* | N/A | N/A | N/A | N/A | Direct DOM Action | Pure Deterministic (0ms) |
| **Deterministic Router** | *Zero-LLM / Grammar* | `gemini-3.1-flash-lite` | `0.1 – 0.5` | `0.95` | `LOW` / `HIGH` | `application/json` | Schema-constrained JSON |
| **Discrete Retriever** | *Heuristic Indexer* | N/A | N/A | N/A | N/A | Text / Section Chunks | Token-budgeted windowing |
| **Action Worker** | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | `0.1 – 0.2` | `0.95` | `LOW` | `application/json` or Tool Call | Element `[#ID]` + CDP Tools |
| **Answer Worker** | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | `0.1 – 0.2` | `0.95` | `LOW` | `application/json` | `finish_task` with receipts |
| **Transform Worker** | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | `0.5 – 0.7` | `0.95` | `LOW` / `HIGH` | `application/json` | Open synthesis Markdown |
| **Deterministic Invariant Gate** | *Zero-LLM Invariant* | N/A | N/A | N/A | N/A | Boolean / Audit Code | Hard regex & AST checks |
| **Critic Verifier** | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | `0.1 – 0.2` | `0.95` | `LOW` | `application/json` | One-shot targeted repair |
| **Server Unified Orchestrator** | `gemini-3.5-flash-lite` | Cascade (see §8) | `0.5` | `0.95` | `HIGH` | Tool / JSON | `AUTO` Multi-tool dispatch |

---

## 2. Per-Agent Deep Dive & Setting Rationale

### 2.1 Stage 0: Mechanical Bypass & Deterministic Intent Router
* **Files:** `/public/agents/router.js`, `/src/deterministicRouter.ts`
* **Execution Mode:** Hybrid (Deterministic Regex Fast-Path $\to$ Flash-Lite Classification).
* **Settings:**
  * **Temperature:** `0.1` (Recommended) / `0.5` (Current default in client router).
  * **Top P:** `0.95`.
  * **Thinking Level:** `LOW` (Minimizes routing latency to <250ms).
  * **Output Schema:**
    ```json
    {
      "intent": "action" | "answer" | "transform",
      "target_sections": [0, 1],
      "element_hint": "string or null",
      "reasoning": "brief 1-sentence explanation"
    }
    ```
* **Rationale:** A low temperature (`0.1`) prevents stochastic classification drift between "answer" (factual Q&A) and "transform" (open synthesis). Mechanical queries (e.g. `scroll down`, `page up`) bypass model inference entirely at 0ms.

---

### 2.2 Stage 1: Discrete Evidence Retriever
* **Files:** `/public/agents/retriever.js`, `/src/adaptiveEvidenceRetriever.ts`
* **Execution Mode:** Deterministic Section Parser & Catalog Generator.
* **Settings & Budgets:**
  * **Max Section Catalog Items:** `25` sections (to keep router prompt concise).
  * **Evidence Text Ceiling:** `60,000` characters (`maxChars: 60000`).
  * **Fallback Behavior:** If `target_sections` is empty or no section matches, falls back to full cleaned page text rather than failing or returning partial context.
  * **Active Selection Priority:** Selected text is prepended at index 0 with `[Active User Selection]`.
  * **Deduplication:** Automatic suppression if user selection is already present within the extracted DOM section.

---

### 2.3 Stage 2A: Action Worker
* **Files:** `/public/agents/workers.js`, `/src/actionResolver.ts`
* **Role:** Directs physical browser automation via Chrome DevTools Protocol (CDP).
* **Settings:**
  * **Primary Model:** `gemini-3.5-flash-lite` (Fallback: `gemini-3.1-flash-lite`).
  * **Temperature:** `0.1` (Required for deterministic coordinate targeting).
  * **Top P:** `0.95`.
  * **Thinking Level:** `LOW`.
  * **Function Calling Mode:** `AUTO` or JSON Schema.
  * **Max Visible Candidates:** Top `45` interactive elements (`[#ID]` list).
  * **Post-Action Settle Delay:** `350ms` (for DOM mutation & network reflow).
  * **Cycle Detection Threshold:** Halts if `3` identical consecutive action signatures occur without DOM progression.
* **Security Enclave Policy:**
  * All candidates wrapped in `<<<UNTRUSTED_CONTENT_${enclaveId}>>>`.
  * Sensitive field lockout against credit cards, CVVs, passwords, SSNs (`SENSITIVE_INPUT_PATTERNS`).

---

### 2.4 Stage 2B: Answer Worker (Factual Q&A)
* **Files:** `/public/agents/workers.js`, `/src/groundingEngine.ts`
* **Role:** Answers factual queries with verifiable proof and verbatim quote receipts.
* **Settings:**
  * **Primary Model:** `gemini-3.5-flash-lite` (Fallback: `gemini-3.1-flash-lite`).
  * **Temperature:** `0.1` (Crucial to eliminate hallucinated numbers/dates).
  * **Top P:** `0.95`.
  * **Thinking Level:** `LOW`.
  * **Output Schema:**
    ```json
    {
      "paragraphs": [
        {
          "text": "Factual statement...",
          "citations": [{ "quote": "verbatim substring", "label": "Source label" }]
        }
      ],
      "unverifiedClaims": []
    }
    ```
* **Invariants Enforced:**
  1. **Anti-Lazy Rule:** Disallows "the page does not say" if relevant terms exist in retrieved evidence.
  2. **1-to-1 Quote Fidelity:** Citations must be exact verbatim substrings.
  3. **Number Integrity:** Every monetary figure, percentage, date, and metric must exist in the source text.

---

### 2.5 Stage 2C: Transform Worker (Synthesis & Creative)
* **Files:** `/public/agents/workers.js`
* **Role:** Summarization, translation, code refactoring, opinion breakdowns, deal evaluations ("is this worth it?").
* **Settings:**
  * **Primary Model:** `gemini-3.5-flash-lite` (Fallback: `gemini-3.1-flash-lite`).
  * **Temperature:** `0.5 – 0.7` (Permits stylistic versatility and cognitive reasoning).
  * **Top P:** `0.95`.
  * **Thinking Level:** `LOW` or `HIGH` depending on analytical complexity.
  * **Citation Requirement:** Explicitly zero false citations required (no hallucinated quotes for subjective opinions).

---

### 2.6 Stage 3: Deterministic Invariant Gate
* **Files:** `/public/agents/gate.js`
* **Role:** Zero-LLM safety and quality barrier that intercepts output before display/execution.
* **Settings & Rules:**
  * **Quote Normalization:** Strips smart quotes, normalizes dashes, compresses whitespace, enables 85% sliding phrase threshold.
  * **Number Extraction:** `NUMBER_REGEX` parses currency, percentages, counts, metrics.
  * **Lockout Patterns:** `credit_card`, `cvv`, `stripe`, `paypal`, `password`, `ssn`.
  * **Anti-Lazy Refusal Check:** If refusal keywords trigger while $\ge 2$ query terms are present in evidence $\to$ Gate flags `lazy_refusal`.

---

### 2.7 Stage 4: Critic Verifier Loop
* **Files:** `/public/agents/critic.js`
* **Role:** Targeted repair agent that fires **only** upon gate violation.
* **Settings:**
  * **Temperature:** `0.1` (Deterministic repair).
  * **Max Invocations:** Exactly `1` single retry attempt per turn (prevents infinite loops).
  * **Security Violation Handling:** Security lockouts (e.g., payment fields) are non-repairable and trigger immediate hard blocking (`isBlockedBySecurity: true`).
  * **Graceful Degradation:** If repair fails second gate check, actions are blocked completely (`isBlocked: true`), and answer workers degrade to explicit unverified warnings.

---

## 3. Rate Limiter, Schedulers & Timeout Policies

### 3.1 Network & HTTP Timeouts (`server.ts` & `undici`)
* **Dispatcher Timeouts:**
  * `headersTimeout`: `300,000ms` (5 minutes)
  * `bodyTimeout`: `300,000ms` (5 minutes)
  * `connectTimeout`: `60,000ms` (1 minute)
  * `keepAliveTimeout`: `30,000ms`
* **Max Payload Body Size:** `10mb` (`express.json({ limit: '10mb' })`).

### 3.2 Client Resilient Retry & Jitter (`public/agents/apiClient.js`)
* **Base API:** `https://generativelanguage.googleapis.com/v1beta/models`
* **Max Retries:** `3` attempts.
* **Initial Delay:** `750ms`.
* **Backoff Multiplier:** `2x` exponential backoff.
* **Jitter Formula:** $\pm 25\%$ randomized spread (`(Math.random() - 0.5) * 0.5 * delayMs`).
* **Transient Status Codes:** `429` (Rate Limit) and `503` (Service Unavailable).
* **Non-Persisted Failover:** If retries exhaust on primary model, attempts one emergency call to `gemini-3.1-flash-lite` without overwriting user settings.

---

## 4. Operational Recommendations & Next Steps

1. **Temperature Synchronization:** Ensure all action-oriented workers remain locked at `0.1 – 0.2` to eliminate hallucinated target coordinates and invalid integer IDs.
2. **Thinking Level Alignment:** Keep `thinkingLevel: "LOW"` for real-time interactive DOM actions (<500ms TTFT), and reserve `thinkingLevel: "HIGH"` for complex deep multi-table evidence auditing.
3. **Status:** Pipeline configurations, invariants, and fallback models are verified and active across all endpoints.

*Awaiting next instructions.*
