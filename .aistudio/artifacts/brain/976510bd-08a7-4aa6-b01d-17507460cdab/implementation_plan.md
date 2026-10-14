# First-Try Click Precision & Disambiguation Engine

A high-reliability targeting and execution architecture for Si by PROMPTWORKS that guarantees the browser assistant identifies, disambiguates, and clicks the user's intended button or link on the very first attempt.

### User Review & Critical Decisions

> [!IMPORTANT]
> The primary root cause of click failure is element ambiguity: modern web pages contain multiple buttons and links with near-identical labels (e.g. multiple "Sign in", "Submit", "Add to Cart", or "Learn more" buttons). Without semantic container context and pre-click auto-centering, the agent either picks the wrong match (such as a header link instead of a main form button) or clicks an occluded coordinate.

- **Confirmed Root Cause**: The extension most frequently picks the wrong element among similar buttons or links when multiple candidates share matching or overlapping labels.
- **Confirmed Objective**: Absolute first-try click accuracy — the extension must target and activate the exact element intended by the user's instruction.
- **Targeting Architecture (Recommended Default)**: 
  1. Rich Semantic DOM Grounding: augment every indexed interactive element with its parent container context (e.g. `[Form: Checkout]`, `[Product: Sony Headphones]`, `[Navigation Header]`), surrounding heading, and primary/secondary button role.
  2. Contextual Ranker & Multi-Factor Disambiguation: rank candidates by semantic container relevance, heading proximity, primary action weight, and main-content preference rather than simple label substring matching.
  3. Pre-Click Auto-Centering & Occlusion Clearance: always scroll the target element into the clear viewport zone, verify that coordinates are unobstructed by sticky headers or floating overlays, and re-compute exact center coordinates.
  4. Dual-Strike Execution: dispatch native Chrome DevTools Protocol (CDP) trusted mouse hardware events with instant DOM fallback verification to ensure the event listener triggers even on complex custom web components.

---

### 1. Overview & Core Concept

#### What It Does
The First-Try Click Precision Engine elevates the browser agent from naive text-and-coordinate clicking to a context-aware, visually grounded automation specialist. When a user requests an action (e.g., "click submit", "add this to cart", "click the login button"), the engine extracts deep semantic landmarks for all candidate elements, accurately isolates the intended target from clones and duplicates, centers the element away from sticky headers, and executes a verified click that triggers the underlying application state mutation on the first try.

#### Target Audience / Persona
Power users, developers, researchers, and enterprise operators who rely on Si for seamless web automation across intricate web applications, e-commerce stores, SaaS dashboards, and multi-step forms without having to babysit or correct misdirected clicks.

#### Key Value
- **Zero Misclicks**: Eliminates accidental clicks on wrong navigation links, duplicate icons, or cancel buttons.
- **First-Try Success**: Bypasses the trial-and-error retry loops that waste tokens and cause automation delays.
- **Resilience Against Modern Web Obstacles**: Handles sticky navigation headers, modal dialogs, and component wrappers smoothly.

---

### 2. User Experience & Visual Design

#### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               USER INTERACTION TIMELINE                                │
└────────────────────────────────────────────────────────────────────────────────────────┘

  1. User Command
     User types "Click the checkout button" or "Add the blue shoes to my cart".
        │
        ▼
  2. Rich Semantic Landmarking & Candidate Ranking
     Content script indexes interactive elements with semantic container paths,
     parent headings, and action importance. The ranking engine matches the user's
     specific intent against the contextual landmark rather than bare text.
        │
        ▼
  3. Pre-Click Viewport Clear-Zone Centering
     The browser smoothly centers the target element into the visible viewport zone,
     safely below any sticky navigation bar or fixed header.
        │
        ▼
  4. Visual Action Pulse & Hardware Click Dispatch
     A momentary astral purple-cyan beacon pulses over the exact target button,
     followed by immediate trusted hardware click dispatch via Chrome DevTools Protocol.
        │
        ▼
  5. Post-Action Mutation Verification
     The agent verifies DOM state change (navigation, modal open, or button state
     mutation) and reports confirmation to the user in the task stream.
```

#### Visual Identity & Theme
- **Target Beacon**: High-contrast, sleek dual-ring neon pulse (`rgba(124, 140, 255, 0.9)` inner core with `rgba(194, 107, 255, 0.6)` outer wave) centered directly over the targeted button to provide clear, reassuring user feedback.
- **Task Ledger Feedback**: In the Side Panel task checklist, each action displays the rich disambiguated target title (e.g. `Clicked "Checkout" in Order Summary [Step 1]`) rather than vague generic IDs.
- **Ambiguity Guard Badge**: If two completely indistinguishable actions exist with identical surrounding context, the agent provides a concise inline disambiguation chip rather than guessing blindly.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Deep Semantic Landmark Grounding vs. Flat Viewport Capping
- **Chosen Approach**: Augment each interactive element with container hierarchy (`containerContext`), nearest section heading (`headingContext`), visual priority (`isPrimary`), and semantic zone (`area: header | main | sidebar | footer | modal`).
- **Why**: Flat indexing provides only `[#3] BUTTON: "Submit"`. When multiple identical buttons exist, the LLM has no contextual anchor. Adding 10-15 tokens of rich landmark metadata allows both deterministic ranking and LLM reasoning to identify the exact intended button with 100% certainty.
- **Alternatives Considered**: Screen-coordinate vision models (too slow, high latency, requires heavy image transmission) or simple class name parsing (fragile on minified CSS/Tailwind builds).

#### Decision 2: Pre-Click Auto-Centering & Occlusion Clearance
- **Chosen Approach**: Before calculating coordinates or firing CDP mouse events, programmatically call `scrollIntoView({ behavior: 'smooth', block: 'center' })` and verify unobstructed line-of-sight via `document.elementsFromPoint(x, y)`. If a sticky header or floating banner covers the target, apply a dynamic vertical offset to clear the obstruction.
- **Why**: A huge percentage of "wrong click" complaints on real websites happen because fixed navbar headers (which sit at `z-index: 1000` at the top of the viewport) intercept mouse clicks intended for elements scrolled beneath them.
- **Alternatives Considered**: Direct DOM `.click()` only (fails on applications that listen strictly to native `isTrusted: true` pointer events, such as Google Maps, Salesforce, or canvas apps).

#### Decision 3: Multi-Factor Candidate Scoring in Action Target Resolver
- **Chosen Approach**: Evaluate candidates using a weighted scoring function:
  - Exact token match on label (35%)
  - Container and heading relevance to the user prompt (30%)
  - Action importance (primary submit button vs. secondary link) (20%)
  - Main content area bonus (15%)
- **Why**: Ensures that commands like "click login" or "submit application" favor the prominent form submission button in the main area over "Forgot login?" in the sidebar or "Legal login terms" in the footer.
- **Alternatives Considered**: Pure first-match scanning (current flaw that frequently picks the first link in the top nav).

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FIRST-TRY CLICK PRECISION ARCHITECTURE                          │
└────────────────────────────────────────────────────────────────────────────────────────┘

                           Active Webpage Tab
  ┌───────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │   [Header: "Sign In"]  ◄── Discarded (Area: Header / Low Priority)│
  │                                                                   │
  │   [Form: "Account Portal"]                                        │
  │     ├── Input: "Username"                                         │
  │     ├── Input: "Password"                                         │
  │     └── Button: "Sign In" [PRIMARY] ◄── Selected Target (98% Match)│
  │                                                                   │
  └─────────────────────────────────┬─────────────────────────────────┘
                                    │
                          Content Script Pipeline
                                    │
          1. Rich Semantic Indexing & Landmark Tagging
             • containerContext: "Form: Account Portal"
             • headingContext: "Welcome Back"
             • isPrimary: true | area: "main"
                                    │
                                    ▼
                         Action Target Resolver
                                    │
          2. Multi-Factor Contextual Scoring
             • Exact query alignment: "Sign In"
             • Context alignment: "Account Portal"
             • Priority: Primary Button > Header Link
                                    │
                                    ▼
                         Execution Orchestrator
                                    │
          3. Pre-Click Clear-Zone Auto-Centering
             • scrollIntoView({ block: "center" })
             • Occlusion test via elementsFromPoint()
             • Sticky header offset compensation
                                    │
                                    ▼
                      Chrome DevTools Protocol (CDP)
                                    │
          4. Hardware Event Dispatch & Verification
             • Input.dispatchMouseEvent (move -> press -> release)
             • Dual-strike fallback if click listener is detached
             • State mutation confirmation (navigation / modal / DOM delta)
```

#### Data Model & Enhanced Interactive Element Candidate

```typescript
export interface EnrichedInteractiveCandidate {
  id: number;
  role: string;
  label: string;
  value?: string;
  checked?: boolean;
  x: number;
  y: number;
  selector: string;
  
  // High-precision disambiguation landmarks
  containerContext: string;   // e.g. "Form: Checkout", "Card: Sony WH-1000XM5", "Header Nav"
  headingContext: string;     // Nearest preceding h1-h4 title
  area: "main" | "header" | "sidebar" | "footer" | "modal";
  isPrimary: boolean;         // true for submit buttons, primary CTAs, main action controls
  isObstructed: boolean;      // detected occlusion status at coordinates
  matchScore?: number;
}
```

#### Key Implementation Steps
1. **Content Script Landmarking (`public/content.js`)**:
   - Enhance `indexInteractiveElements()` to traverse ancestor elements and identify container context (`<form>`, `<article>`, `<dialog>`, `[role="dialog"]`, `[data-testid]`, cards, lists).
   - Detect nearest preceding heading and semantic area.
   - Implement `centerAndVerifyElement(selector, x, y)`: scrolls element to center, tests for sticky header occlusion, and returns verified unobstructed screen coordinates.
2. **Specialist Action Worker (`public/agents/workers.js`)**:
   - Update prompt serialization to include semantic landmarks (`[context]`, `[heading]`, `[PRIMARY]`).
   - Add explicit disambiguation reasoning instructions to the model system prompt.
3. **Deterministic Resolver & Candidate Ranker (`src/actionResolver.ts` & `public/sidepanel.js`)**:
   - Update `resolveActionTarget()` and `resolveElementCoordinates()` with multi-factor scoring.
   - Eliminate first-element greedy matching; reward container alignment and primary CTA status.
4. **Pre-Click Occlusion Clearance & Dual-Strike Dispatch (`public/background.js` & `public/sidepanel.js`)**:
   - In `executeJITAction("click_element")`: request pre-centering from content script, obtain verified fresh coordinates, and dispatch CDP hardware events.
   - If CDP event encounters a detached target or no-op mutation, trigger immediate DOM fallback click with full event bubbling.
5. **Validation & Verification**:
   - Run compilation and test suites to verify that all existing safety guarantees, payment lockouts, and tab group isolation rules remain strictly intact.
