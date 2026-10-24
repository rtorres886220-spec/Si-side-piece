# Robust Survey Automation Engine & Multi-Frame Precision Targeting

A comprehensive overhaul of Sidekick's autonomous browser agent to reliably discover, ground, and interact with complex survey components, cross-origin iframes, custom-styled form controls, and dynamic layouts without occlusion errors or coordinate drift.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core architectural decisions are locked in based on confirmed requirements:
> - **Multi-Frame Iframe Architecture**: Set `all_frames: true` in the extension manifest, remove subframe execution guards for agent actions, and track frame hierarchies to translate frame-relative coordinates into top-level viewport space for Chrome DevTools Protocol (CDP) mouse dispatch.
> - **Custom-Styled Input Indexing**: Index visually hidden (`opacity: 0`) radio and checkbox inputs through their associated labels/containers, and detect non-semantic elements with `cursor: pointer` or interactive ARIA roles.
> - **Pre-Click Re-Verification & Occlusion Safety**: Re-measure coordinates immediately prior to `mousePressed`; abort or re-target if the element shifted or is occluded by an overlay.
> - **Single Persistent CDP Session**: Attach the debugger once per automation session rather than attaching and detaching on every single click, eliminating viewport resizing and layout reflow caused by Chrome's debugging infobar.
> - **Spatial Grounding for Vision Model**: Include coordinates `(x, y, width, height)` and visual markers in the prompt and screenshot to enable unambiguous matching between visual buttons and target IDs.

- **Confirmed Decision 1**: Subframe content scripts collect interactive nodes across all frames; the background script reconciles cumulative offsets.
- **Confirmed Decision 2**: Elements with `opacity: 0` inherit coordinates and click targets from their visible `<label>` or surrogate wrapper.
- **Confirmed Decision 3**: Debugger lifecycle is tied to agent session start and stop events, preventing viewport thrashing.

---

## 1. Overview & Core Concept

### What It Does
This system allows the autonomous agent to seamlessly automate complex multi-page web forms and surveys (e.g., Qualtrics, Alchemer, Survey Junkie, Cint, Typeform). It penetrates nested iframes, identifies custom CSS-styled checkboxes/radios, re-verifies coordinates immediately prior to physical click dispatch, and equips Gemini with precise spatial grounding to distinguish duplicate buttons.

### Target Audience & Persona
Users relying on Sidekick for browser workflow automation, automated research, accessibility assistance, and repetitive multi-step web forms where traditional automation scripts fail due to iframes and dynamic DOM changes.

### Key Value
- **Zero Blind Clicks**: Surveys embedded in iframes become fully visible and addressable.
- **Flawless Radio/Checkbox Selection**: Modern survey styling no longer hides form options from the agent.
- **Reflow Immunity**: Dynamic page animations and question shifts no longer cause clicks to land in empty space.
- **Stable Viewport**: Eliminating per-action CDP attach/detach cycles prevents Chrome's debugging infobar from causing layout shifts.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Survey Initiation**:
   - User opens the Sidekick side panel and prompts the agent to start or resume a survey.
   - Sidekick attaches CDP once for the session. The status badge indicates active automation.
2. **Multi-Frame Discovery & Observation**:
   - The top page and all survey iframes are scanned simultaneously.
   - Elements inside iframes are tagged with unified IDs (e.g., `[f1_button_1]`, `[f2_radio_3]`).
   - The screenshot is augmented with spatial coordinates so Gemini can cross-reference what it sees with exact button IDs.
3. **Pre-Click Validation**:
   - Before mouse dispatch, the agent re-verifies that the target button is still in position and not covered by a consent gate or modal.
   - The visible cursor glides smoothly to the updated centroid and performs a trusted click.
4. **Session Teardown**:
   - When the task completes or user triggers emergency stop (`Esc`), the CDP debugger cleanly detaches once.

### Interactive Feedback & Status Indicators
- **Panel Status Stream**: Displays live target resolution, frame origin, and verification checks.
- **Occlusion Alerts**: If a modal overlay appears, Sidekick explicitly notes that the target is occluded and prioritizes the overlay's dismiss button.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Frame Offset Translation Strategy
- **Chosen Approach**: Content script runs in all frames (`all_frames: true`), measures local bounding rectangles, and the background coordinator combines iframe positions from the frame tree to translate coordinates into top-level window pixels.
- **Why**: Survey platforms frequently host questions in cross-origin iframes (e.g., survey routers redirecting to Cint or Decipher). Browser security boundaries prevent the top frame from directly querying cross-origin iframe DOMs; running in all frames with top-level coordinate translation overcomes this barrier cleanly.
- **Alternatives Considered**: Vision-only blind clicking without DOM IDs (unreliable across varying screen resolutions and zoom levels) or same-origin piercing only (fails completely on 3rd-party hosted survey iframes).

### Decision 2: Session-Level vs. Action-Level CDP Attachment
- **Chosen Approach**: Attach the debugger once when `start()` is invoked, hold the connection across loop iterations, and detach in `stop()`, `finish()`, or upon tab navigation.
- **Why**: Each `chrome.debugger.attach` triggers Chrome's top infobar ("Sidekick started debugging this browser"), which compresses the viewport by ~36px and triggers CSS reflow on `100vh` layouts. Detaching immediately after every click causes the infobar to flicker and reflow the page continuously.
- **Alternatives Considered**: Attaching per-action (current buggy behavior) or relying purely on synthetic DOM events (untrusted events rejected by modern survey frameworks).

### Decision 3: Custom Form Control Resolution (Opacity 0 Inputs)
- **Chosen Approach**: When encountering `<input type="radio">` or `<input type="checkbox">` with `opacity: 0`, resolve its target to the associated `<label>` (via `for` attribute, parent label, or adjacent sibling wrapper). Use the label's bounding box and visibility status.
- **Why**: Modern survey frameworks (Qualtrics, Material UI, Tailwind) hide the raw HTML input and style a surrogate `<span>` or `<label>` over it. Filtering out `opacity: 0` elements drops the entire question option unless the label is adopted.
- **Alternatives Considered**: Forcing `opacity: 1` via CSS mutation (breaks page layout and can trigger anti-bot integrity checks).

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CHROME ACTIVE TAB                                │
│                                                                             │
│  ┌───────────────────────────────┐     ┌─────────────────────────────────┐  │
│  │ Top-Level Window              │     │ Survey Iframe (Subframe)        │  │
│  │ content.js (all_frames: true) │     │ content.js (all_frames: true)   │  │
│  │ - Top-level DOM nodes         │     │ - Survey questions & radios     │  │
│  │ - Iframe viewport bounds      │     │ - Opacity: 0 input label lookup │  │
│  │ - Frame ID: 0                 │     │ - Frame ID: N                   │  │
│  └───────────────┬───────────────┘     └────────────────┬────────────────┘  │
│                  │                                      │                   │
│                  └───────────────────┬──────────────────┘                   │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Content Script Message Aggregator                                     │  │
│  │ - Combines top-level & subframe element lists                         │  │
│  │ - Calculates absolute top-level coordinates (frameX + localX)         │  │
│  │ - Indexes cursor: pointer and ARIA roles                              │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND SERVICE WORKER                              │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ AutonomousAgentEngine                                                 │  │
│  │ 1. Persistent CDP Session: attach debugger ONCE at session start      │  │
│  │ 2. Spatial Summary: IDs include [x, y, w, h] + zone context           │  │
│  │ 3. Gemini Multimodal Vision: screenshot + spatial element manifest     │  │
│  │ 4. Pre-Click Re-Verification: queries reverifyCoordinates before click│  │
│  │ 5. Occlusion Abort: halts click if target is covered by modal backdrop│  │
│  │ 6. Dispatches Input.dispatchMouseEvent to translated coordinates      │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SIDEPANEL UI CLIENT                               │
│  - Displays live thought process, active frame indicators, and checklist    │
│  - Instant emergency stop [Esc] detaches CDP and terminates session         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component & State Mapping

| Component | Responsibility | Key State & Data Handled |
| :--- | :--- | :--- |
| **Manifest & Framing** | Injects script across all subframes | `all_frames: true`, host permissions for all URLs |
| **DOM Harvester** (`content.js`) | Inspects DOM in all frames, links hidden inputs to labels, detects pointer cursors | Interactive candidate list with `frameId`, `assocLabelRect`, and `cursor` style |
| **Frame Coordinate Translator** | Translates frame-local rects to page viewport coordinates | Cumulative `(parentOffset.x + local.x, parentOffset.y + local.y)` |
| **Session CDP Manager** (`background.js`) | Maintains persistent debugger connection per session | `activeDebuggerTabId`, attached session lifecycle |
| **JIT Pre-Click Verifier** (`background.js` + `content.js`) | Hit-tests and verifies coordinates immediately before mouse down | `isOccluded`, `isStale`, `driftDelta`, re-measured `(x, y)` |
| **Spatial Model Grounder** | Generates element summaries with geometry and visual anchors | Formatted element descriptions with bounding box tuples and spatial tags |

---

## 5. Implementation Roadmap

### Step 1: Manifest & Frame Permeability
- Update `manifest.json` content script configuration to `"all_frames": true`.
- Remove the strict top-frame guard in `content.js` message handler for DOM extraction, element query, and coordinate resolution actions.
- Add frame identification metadata to content script responses (`frameId`, `isTopFrame`).

### Step 2: Hidden Input & Non-Semantic Interactive Indexing
- In `content.js`: Enhance `isInteractiveCandidate` to inspect `window.getComputedStyle(el).cursor === "pointer"`.
- Support custom radios/checkboxes with `opacity: 0`: resolve their target bounding box through associated `<label>` tags (via `for` attribute or ancestor label) or custom styled child spans.
- Include interactive ARIA roles (`role="radio"`, `role="checkbox"`, `role="button"`, `role="option"`, `role="tab"`).

### Step 3: Persistent CDP Debugger Session Lifecycle
- In `background.js`: Refactor CDP attachment to happen once when `AutonomousAgentEngine.start()` begins.
- Maintain `attachedLocally` across loop steps.
- Cleanly detach the debugger in `AutonomousAgentEngine.stop()`, on completion, on error, or when tab navigation occurs.
- Eliminate the per-action attach/detach cycle and stop infobar reflow thrashing.

### Step 4: Pre-Click Coordinate Re-Verification & Occlusion Guard
- In `background.js`: Immediately prior to calling `Input.dispatchMouseEvent (mousePressed)`, invoke `reverifyCoordinates` in the appropriate frame.
- If the element's position moved by >5px due to animation or reflow, update the click coordinates.
- If the hit test detects an overlay or modal backdrop occluding the target, do not blind-click: log the occlusion and redirect agent attention to dismiss the modal.

### Step 5: Spatial Linking & Coordinate Summary for Gemini Vision
- Format `elementsSummary` with spatial coordinates: `[button_1] BUTTON: "Next" (x: 450, y: 820, w: 120, h: 40) [Bottom Area]`.
- Provide spatial quadrant anchors (Top-Left, Center, Bottom Action Bar) so the multimodal vision model can unequivocally match visual buttons in the screenshot with their corresponding IDs.
