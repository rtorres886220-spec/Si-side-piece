# High-Reasoning Interface Copy & Voice Architecture for Si by PROMPTWORKS

A precision-engineered copy and interaction language architecture for Si by PROMPTWORKS, replacing passive, verbose, or legacy naming with razor-sharp, high-intelligence phrasing calibrated for executive command, autonomous execution, and effortless human-agent coordination.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Strategic Copy Choices**:
> 1. **Empty-State Headline**: Direct, concise executive framing: **`Direct Si on this page.`**
> 2. **Composer Placeholder**: Short, direct, high-intelligence command prompt: **`Direct Si, or / for actions…`** (or ultra-minimal **`Direct Si or type /…`**).
> 3. **Brand Identity Preservation**: Keep the core product identity anchored strictly to **Si by PROMPTWORKS** without intrusive renaming or gimmicky unfolding expansion, maintaining full harmony with existing extension configurations.
> 4. **Safety & Verification Terminology**: Shift from robotic jargon ("Consequential Action Safety Gate", "Deny Action") to authoritative executive clarity: **"Human Verification Required"** with **"Authorize Action"** and **"Decline"**.

- **Confirmed Decision 1**: Empty-state headline set to *"Direct Si on this page."*
- **Confirmed Decision 2**: Primary composer placeholder set to ultra-short, authoritative *"Direct Si, or / for actions…"*.
- **Confirmed Decision 3**: Tab group name streamlined from legacy *"Sidekick Workgroup"* to *"Si Workgroup"*.
- **Confirmed Decision 4**: Continuous autonomous task tracker cognitive section upgraded to *"Cognitive Trace & DOM Observation"*.

---

## 1. Overview & Core Concept

- **What It Does**: Standardizes every text surface across the Si extension side panel and simulator into a cohesive, high-intellect voice: confident, concise, zero-fluff, and engineered for high-velocity browsing and complex DOM automation.
- **Target Audience / Persona**: Power users, researchers, engineers, and knowledge workers who rely on autonomous browser agents to perform high-stakes tasks without cognitive friction or patronizing AI tropes.
- **Key Value**: Replaces generic AI chatbot clichés ("What can I help you with today?") with crisp, directive executive phrasing that reflects deep competence, rapid task execution, and clear human-in-the-loop oversight.

---

## 2. Comprehensive Interface Copy Matrix

```
┌─────────────────────────────────┬──────────────────────────────────┬──────────────────────────────────────────┐
│ Interface Surface               │ Current Copy                     │ High-Reasoning Recommended Copy          │
├─────────────────────────────────┼──────────────────────────────────┼──────────────────────────────────────────┤
│ 1. Header Wordmark              │ S[uper ]I[ntelligence]           │ Sⁱ • PROMPTWORKS                         │
│ 2. Tab Group Bar Badge          │ Sidekick Workgroup               │ Si Workgroup                             │
│ 3. Empty State Headline         │ What should we do with this page?│ Direct Si on this page.                  │
│ 4. Empty State Action Chips     │ Agent Behavior Audit, Consumer...│ [Synthesize Claims] [Extract Data] [Audit]│
│ 5. Onboarding Title & Desc      │ Welcome to Sidekick              │ Welcome to Si                            │
│                                 │ Connect free Gemini API key...   │ Connect your Gemini key to activate…     │
│ 6. Composer Textarea            │ Ask, automate, or type /...      │ Direct Si, or / for actions…             │
│ 7. Composer Subtext             │ Engineered for Agentic...        │ Engineered for Agentic Intelligence • PW │
│ 8. Task Ledger Process Badge    │ Autonomous Process               │ Autonomous Workflow                      │
│ 9. Task Ledger Thoughts Title   │ Cognitive Reasoning & DOM State  │ Cognitive Trace & DOM Observation        │
│ 10. Safety Gate Header          │ ⚠ Consequential Action Approval  │ Verification Required                    │
│ 11. Safety Gate Primary Action  │ Approve & Execute                │ Authorize Action                         │
│ 12. Safety Gate Reject Action   │ Deny Action                      │ Decline                                  │
│ 13. Isolation Warning           │ Tab outside Sidekick Group       │ Tab outside Si Workgroup. Locked.        │
└─────────────────────────────────┴──────────────────────────────────┴──────────────────────────────────────────┘
```

### Visual Identity & Tone Guidelines
- **Zero Pill / Anti-Slop Discipline**: Never use condescending robotic pleasantries ("I'm happy to help you with that!"). The interface communicates with dense, precise operational nouns and imperative verbs.
- **Micro-Copy Density**: Status indicators and badges remain under 3 words (e.g., `Step 1`, `4.2s elapsed`, `DOM Verified`, `Grounded (100%)`).
- **Typography Pairing**: Monospace font (`GeistMono-300`, `font-mono`) exclusively for technical signals, timing, and selector paths; clean grotesque (`Geist-400`, `Geist-VariableFont`) for executive instructions and user communications.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Imperative "Direct" vs. Subservient "Ask"
- **Chosen Approach**: Use **"Direct Si"** throughout empty state and composer.
- **Why**: An agentic browser assistant performs active DOM navigation, form population, tabular extraction, and tab grouping. "Direct" sets the correct mental model of delegating an objective to an autonomous operator, whereas "Ask" falsely implies a purely conversational chat model.
- **Alternatives Considered**: "Command Si" (felt excessively militaristic) and "Instruct Si" (felt slightly pedagogical). "Direct" strikes the ideal balance of executive leadership and natural fluency.

### Decision 2: Short, Smart Composer Placeholder
- **Chosen Approach**: `Direct Si, or / for actions…` (6 words, 28 characters).
- **Why**: In side panels constrained to 360px–420px width, lengthy placeholders truncate or wrap onto multiple lines, creating visual clutter. This short phrasing cleanly guides the user to both natural language prompting and the slash command registry.
- **Alternatives Considered**: `State intent or type /…` (too abstract), `Ask, automate, or type / for commands…` (too verbose, wraps at 380px width).

### Decision 3: "Authorize Action" vs "Approve & Execute"
- **Chosen Approach**: `Authorize Action` for the positive button and `Decline` for the negative button.
- **Why**: "Authorize" carries the exact legal and technical weight of delegating agentic capability over external user state (clicking purchase buttons, sending emails, mutating data). It is clean, decisive, and prevents accidental misclicks.

---

## 4. Technical Architecture & Surface Mapping

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Si Interface Copy Surfaces                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────┐         ┌───────────────────────────────┐
│ Chrome Extension Panel        │         │ AI Studio Simulator           │
│ (public/sidepanel.html & .js) │         │ (src/App.tsx)                 │
├───────────────────────────────┤         ├───────────────────────────────┤
│ • #wordmarkWrapper            │         │ • Header Brand Title          │
│ • #groupTitleLabel            │         │ • Tab Group Chip Header       │
│ • #emptyState .empty-headline │         │ • Simulator Empty State       │
│ • #promptInput [placeholder]  │         │ • Simulator Composer Input    │
│ • #composerSubtextSlot        │         │ • Footer Signature            │
│ • #safetyModal .safety-gate-* │         │ • Consequential Modal Copy    │
│ • #ledgerThoughtsSummary      │         │ • Autonomous Ledger UI        │
└───────────────────────────────┘         └───────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Packaging Pipeline: scripts/pack-extension.ts & public/manifest.json   │
│ Guaranteed 100% parity between unpacked extension and studio simulator │
└────────────────────────────────────────────────────────────────────────┘
```

### Execution Steps Upon Approval:
1. Update `public/sidepanel.html` with calibrated copy across header, empty state, composer placeholder, task ledger, and safety gate.
2. Update `public/sidepanel.js` strings (default ledger text, toast messages, tooltips, and tab group naming).
3. Mirror all updated strings in `src/App.tsx` to maintain 1:1 parity in the simulator.
4. Execute `npm run pack-extension` and run verification suites to confirm build integrity and pack validity.
