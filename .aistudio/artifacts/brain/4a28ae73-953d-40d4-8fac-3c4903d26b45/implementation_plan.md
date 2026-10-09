# Multi-Agent Browser Companion Pipeline (MV3 Client-Side Architecture)

A multi-agent pipeline designed for native Chrome Extension Manifest V3 execution, engineered to eliminate Flash-Lite failure modes—false refusals, coordinate drift, fabricated numbers, and format mismatches—while delivering reliable 1–3s performance with step-by-step progress feedback.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following revisions have been incorporated directly from architectural review:
> - **Runtime Target**: Pure Manifest V3 client-side architecture (`sidepanel.js`, `background.js`, `content.js`). No dead server proxy routes (`/api/gemini`); direct calls to `https://generativelanguage.googleapis.com` via client-stored API keys.
> - **Triage & Routing**: Retain regex strictly for trivial single-operation mechanical commands (e.g. `scroll down`); replace broad regex classification with a single compact Router+Retriever model call.
> - **Three-Worker Topology**: Expanded from two to three specialized workers: **Action Worker** (target element IDs), **Answer Worker** (grounded with receipts), and **Transform Worker** (open synthesis, rewriting, drafting, analysis).
> - **Discrete Retrieval Stage**: Dedicated evidence ranking and section selection with full-page fallback to prevent false "unverified" answers caused by naive chunk truncation.
> - **Quality Invariants at the Gate**: Gate validates both security and answer quality: non-empty check, normalized quote matching (handling punctuation/redactions), anti-lazy refusal check (rejecting "not found" when page text has query terms), and number integrity verification.
> - **Element-ID Action Targeting**: Automation worker outputs target `[#ID]` instead of unreliable pixel coordinates; client JS resolves fresh coordinates from live DOM elements directly prior to CDP dispatch.
> - **Realistic Expectations**: Engineered for realistic 1–3s end-to-end latency with transparent UI progress states ("Retrieving...", "Synthesizing...", "Verifying...").

---

## 1. Overview & Core Concept

- **What It Does**: Replaces Sidekick's monolithic, regex-heavy logic with a modular, client-side multi-agent system running directly inside the Chrome Extension MV3 runtime. Requests flow through a compact Router+Retriever, execute via a specialized worker, pass through deterministic safety and quality gates, and engage a focused Critic loop only when an invariant fails.
- **Runtime Environment**: Plain vanilla JavaScript modules loaded directly in the extension's sidepanel and background service worker. Compatible with Chrome MV3 Content Security Policy (connect-src restricted to `https://generativelanguage.googleapis.com`).
- **Core Value**: Turns `gemini-3.1-flash-lite` into a dependable browser companion by eliminating hallucinated numbers, coordinate drift, and false "cannot verify" refusals without requiring heavy frontier model latency or server infrastructure.

---

## 2. Multi-Agent Topology & Execution Workflow

```
                                [User Prompt]
                                      │
                                      ▼
                   ┌──────────────────────────────────────┐
                   │    Mechanical Bypass (Zero-LLM)      │
                   │  (Strict regex: "scroll down", etc.) │
                   └──────────────────┬───────────────────┘
                                      │ (If not mechanical)
                                      ▼
                   ┌──────────────────────────────────────┐
                   │        1. Router + Retriever         │
                   │   • Model: gemini-3.1-flash-lite     │
                   │   • Tiny call: Intent & Section IDs  │
                   │   • Fallback: Full page if no match  │
                   └──────────────────┬───────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ 2A. Action Worker│        │ 2B. Answer Worker│        │2C.TransformWorker│
│ • Element [#ID]  │        │ • Verbatim quote │        │ • Open synthesis │
│   target choice  │        │   receipts       │        │ • Rewrite/draft/ │
│ • No raw coords  │        │ • Strict bounds  │        │   eval/summary   │
│ • Tool: act_id   │        │ • Tool: answer   │        │ • Tool: transform│
└────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     │
                                     ▼
                   ┌──────────────────────────────────────┐
                   │   3. Deterministic Invariant Gate    │
                   │                                      │
                   │ [Safety Invariants]                  │
                   │  • Payment/password input lockout    │
                   │  • Fresh DOM target existence check  │
                   │                                      │
                   │ [Quality Invariants]                 │
                   │  • Non-empty & answers prompt        │
                   │  • Anti-lazy: no refusal if query    │
                   │    keywords exist in section context │
                   │  • Number integrity: all digits/sums │
                   │    must appear in retrieved text     │
                   │  • Normalized quote verification     │
                   └──────────────────┬───────────────────┘
                                      │
                       ┌──────────────┴──────────────┐
                  [Passes]                       [Fails]
                       │                             │
                       ▼                             ▼
           ┌──────────────────────┐      ┌───────────────────────┐
           │ 4. Physical Dispatch │      │ 5. Critic Agent Loop  │
           │ • Resolve [#ID] to   │      │ • Specific gate reason│
           │   live coords in DOM │      │ • One-shot repair     │
           │ • Dispatch via CDP   │      │ • Degrades gracefully │
           │ • Render markdown    │      └───────────┬───────────┘
           └──────────────────────┘                  │
                                           ┌─────────┴─────────┐
                                       [Repaired]          [Failed]
                                           │                   │
                                           ▼                   ▼
                                      [Dispatch]       [Mark Unverified]
```

---

## 3. Detailed Component Specifications

### 3.1. Router & Evidence Retriever (`agents/router.js` & `agents/retriever.js`)
- **Mechanical Fast Path**:
  - Handles strictly unambiguous commands with zero LLM calls: pure directional scroll (`scroll down`, `scroll up`, `top`, `bottom`).
- **Unified Router + Retriever Call**:
  - Instead of brittle multi-thousand line regexes, executes a single, fast Flash-Lite call with a structured output schema:
    - `intent`: `"action"` | `"answer"` | `"transform"`
    - `target_sections`: Array of integer section indices `[0, 2, 5]` that contain the relevant facts.
  - **Retrieval Fallback**: If the router returns an empty section list or zero matches for an informational prompt, the system automatically falls back to the full clean page text rather than truncating to arbitrary first-few chunks.

### 3.2. Three Specialized Workers (`agents/workers.js`)
1. **Action Worker (`executeActionWorker`)**:
   - Scope: Navigating, clicking buttons, filling text fields.
   - **Element-ID Targeting**: Does NOT ask Flash-Lite to estimate pixel coordinates `(x, y)`. The prompt supplies structured candidate elements: `[#12] button "Add to Cart"`. Flash-Lite outputs the target element ID: `{ action: "click", target_id: 12 }`.
   - **Stale Observation Guard**: Re-queries the live DOM via content script immediately prior to dispatch. If the element moved or disappeared (e.g. after scroll or modal open), coordinates are recomputed dynamically.
2. **Answer Worker (`executeAnswerWorker`)**:
   - Scope: Factual Q&A, specs, prices, terms, refund policies, author/date lookups.
   - Requires verbatim quotes. Enforces that claims are backed by receipts from the retrieved text.
3. **Transform Worker (`executeTransformWorker`)**:
   - Scope: General reasoning, rewriting, tone adjustments, translations, quizzes, summaries, and open evaluations (e.g. "is this deal worth it?", "draft a response to this post").
   - Does NOT impose false citation requirements, preventing the refusal bugs that currently plague non-factual conversational tasks.

### 3.3. Deterministic Invariant Gate (`agents/gate.js`)
A synchronous verification layer that tests every worker response before UI rendering or CDP dispatch:
- **Safety Invariants**:
  - Blocks any target matching credit card numbers, CVVs, passwords, or Stripe/PayPal embedded iframes.
  - Verifies that the targeted `target_id` exists in the live DOM and is currently visible.
- **Quality Invariants**:
  - **Anti-Lazy Refusal Check**: If the worker returns "The page does not mention this" or "Unverified", but the retrieved evidence contains high-frequency terms from the user query, the gate flags a *Lazy Refusal* failure.
  - **Number Integrity Check**: Extracts all numeric entities, currency amounts, percentages, and metrics from the worker's answer. Every number must match an identical number in the retrieved source text.
  - **Normalized Verbatim Grounding**: Normalizes quotes and source text (stripping markdown artifacts, punctuation variants, curly quotes, and repeated spaces) to avoid false failures caused by text sanitization.

### 3.4. Critic Verifier (`agents/critic.js`)
- **Trigger**: Runs *only* when the Invariant Gate returns a failure.
- **Operation**: Formats the exact gate failure reason (e.g., `Number "$49.99" not found in source text. Visible prices: "$79.00", "$120.00"` or `Quote normalization failed for paragraph 1`).
- **Constraint**: Exactly **one** targeted retry attempt with the error context injected.
- **Graceful Fallback**: If the critic cannot fix the issue on attempt 1, the response is delivered to the user with a clean, honest tag: *"Unverified: specific evidence missing from visible page"*, rather than failing silently or crashing.

---

## 4. Operational Hardening: Latency, Quota & UI

### 4.1. Network & 429/503 Resilience (`agents/apiClient.js`)
- **Serialized Execution**: Never trigger parallel API calls for the same turn; pipelined stages run sequentially.
- **Exponential Backoff with Jitter**: Automatically retries 429/503 status codes up to 3 attempts (`initialDelay: 750ms`, `factor: 2`, `jitter: ±250ms`).
- **Temporary Fallback Only**: If primary `gemini-3.1-flash-lite` experiences persistent 503 capacity issues, temporarily fall back for that single request to `gemini-3.8-flash`, without persisting the fallback across subsequent turns.

### 4.2. Upstream Fixes in Scope
- **Side Panel Markdown Rendering**: Integrate lightweight markdown parsing (bold, bulleted lists, code blocks, tables) instead of dumping unformatted plain text.
- **Content Script Text Extraction**: Fix the DOM crawler in `content.js` so it preserves visible structural text inside headings, tables, and lists without stripping essential content.
- **Progress Feedback UX**: Display active pipeline phases in the side panel status bar:
  - `Triage & Retrieval (0.3s)` $\to$ `Worker Synthesis (1.1s)` $\to$ `Quality Verification (0.1s)`

---

## 5. Quality Metrics & Validation Plan

### 5.1. Golden Evaluation Suite (`scripts/benchmark-multi-agent.js`)
Evaluate the pipeline against a test suite of representative pages:
1. **E-commerce Pricing**: Product with discounts, variant pricing, and fine-print fees (verifies number integrity and dark-pattern detection).
2. **Technical Documentation**: Multi-column API table with parameters and code snippets (verifies table extraction and verbatim quotes).
3. **News / Editorial**: Long-form article with author, date, and multiple topics (verifies retrieval section ranking and full-page fallback).
4. **Interactive Form / Search**: Search inputs, filter dropdowns, and pagination controls (verifies element-ID action resolution and CDP dispatch).
5. **Open Synthesis / Transform**: "Is this course worth it?", "Rewrite in 3 bullet points" (verifies Transform Worker handles non-citation tasks without refusing).

### 5.2. Core Tracking Metrics
- **False Refusal Rate**: Target $< 2\%$ (down from current high refusal rates).
- **Action Coordinate Drift**: $0\%$ (eliminated by element-ID live DOM binding).
- **Number Integrity Pass Rate**: $100\%$ of cited metrics exist in evidence.
- **Average Turn Latency**: Measured reality of $1.2\text{s} - 2.5\text{s}$ under typical network conditions.
- **API Calls per Turn**: Target $1.0 - 1.2$ calls on average (router+worker combined call on simple tasks; critic triggers only on $< 10\%$ edge cases).
