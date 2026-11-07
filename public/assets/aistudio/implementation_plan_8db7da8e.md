# Anthropic-Grade Self-Diagnosis & Autonomous Self-Healing Blueprint

## 1. Problem Analysis: Why the Extension Fails & Why You Were Left Guessing

When running Sidekick as an unpacked Chrome Extension, four silent failure modes make it seem like "nothing works" without giving any clear indication of what is wrong:

1. **Hidden Dependency on Localhost Server**:
   - By default, if no Gemini API key is entered into Settings, the extension attempts to proxy requests through `http://localhost:3000/api/gemini`.
   - In a downloaded Chrome extension, users do not have a local Node.js server running on port 3000. Every prompt fails silently with `Failed to fetch`, leaving the user in the dark.
   - Even the existing diagnostic tool (`~` backtick) was hardcoded to call `http://localhost:3000/api/health` and `http://localhost:3000/api/diagnostic-chat`, so the diagnostic tool itself failed when offline!
2. **Restricted Chrome Internal Pages (`chrome://`)**:
   - If the user opens the side panel while on `chrome://extensions`, `chrome://newtab`, or the Chrome Web Store, Chrome's sandbox security strictly forbids content script injection and CDP debugger attachment.
   - Instead of a clear warning like *"Chrome blocks extensions from automating internal pages"*, the extension previously hung or printed obscure console exceptions.
3. **Uninjected Content Scripts on Existing Tabs**:
   - Tabs opened before the extension was installed do not have `content.js` running. The extension tried to send messages, received `Receiving end does not exist`, and stalled.
4. **No Visible Diagnostic HUD**:
   - Diagnostics were hidden behind a keyboard shortcut (`` ` `` / `~`) instead of having a prominent, 1-click "Doctor" button on the UI with visual health badges and automated fix actions.

---

## 2. What Anthropic Does (Claude Computer Use / Agent Sandbox Architecture)

Anthropic solves this problem in Claude's Computer Use agent through a **transparent triage & self-healing hierarchy**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PREFLIGHT DOCTOR (STANDALONE)                   │
├────────────────────────────────────────────────────────────────────────┤
│  1. Check API Key & Connection (Direct ping to Gemini endpoint)        │
│  2. Check Active Tab URL (Detect chrome://, webstore, or blank page)   │
│  3. Check Content Script Liveness (Ping content.js; JIT re-inject)     │
│  4. Check CDP Debugger Availability (Detect DevTools lock / fallback)  │
│  5. Check Extension Permissions & Storage Integrity                    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Failures detected
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        1-CLICK AI SELF-HEALER                          │
├────────────────────────────────────────────────────────────────────────┤
│  • Missing API Key?  ──► Instant in-drawer key entry & live test       │
│  • Restricted URL?   ──► "Open Test Page (Wikipedia / Google)" button   │
│  • Missing Script?   ──► Dynamic JIT chrome.scripting.executeScript     │
│  • CDP Locked?       ──► Seamless fallback to 11-event DOM synthetic   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Active task runtime
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        TRANSPARENT FLIGHT RECORDER                     │
├────────────────────────────────────────────────────────────────────────┤
│  • Visible status bar showing exact sub-agent state and failures       │
│  • Root-cause error cards in plain English (never raw stack traces)    │
│  • Auto-retry and auto-repair without resetting user conversation      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Steps

### Phase 1: Client-Side Standalone Diagnostic Engine (`public/agents/doctor.js`)
- Create a dedicated `SidekickDoctor` module that runs **100% inside the extension runtime** with zero external server dependencies:
  1. **`testApiKey(apiKey)`**: Sends a 1-token test prompt (`"hi"`) directly to `https://generativelanguage.googleapis.com`. Returns status: `VALID`, `INVALID_KEY`, `QUOTA_EXCEEDED`, or `OFFLINE`.
  2. **`checkTabEligibility(tab)`**: Validates tab URL. Flags `chrome://`, `chrome-extension://`, `edge://`, `about:blank`, and `chromewebstore.google.com` with friendly guidance and a 1-click link to open an automatable tab.
  3. **`pingContentScript(tabId)`**: Pings `content.js`. If unmounted, provides an automatic `autoInject(tabId)` method using `chrome.scripting.executeScript`.
  4. **`testDebugger(tabId)`**: Tests `chrome.debugger.attach`. Detects whether another DevTools session is attached and reports whether CDP hardware control or DOM synthetic fallback will be used.
  5. **`runFullPreflight()`**: Aggregates all checks into a clean report: `{ ready: boolean, checks: [...] }`.

### Phase 2: Doctor HUD & Preflight Banner in Side Panel (`public/sidepanel.html` & `public/sidepanel.js`)
- **Prominent "🩺 Doctor" Navigation Button**: Add a visible button to the top header in `sidepanel.html`.
- **Preflight Alert Banner**:
  - Automatically display a banner if the user has no API key saved or is viewing an un-automatable page.
  - Provide a 1-click **"Configure API Key"** button that opens a clean key input modal with instant verification.
  - Provide a 1-click **"Open Test Webpage"** button if on `chrome://` pages.
- **Diagnostic Drawer**:
  - Shows 5 real-time green/red check indicators.
  - Includes a **"Run Diagnostic Test"** button and an **"Auto-Fix All"** button.
- **Root-Cause Error Cards in Chat**:
  - If a user sends a prompt and an error occurs, instead of a silent stall or cryptic error, insert an intelligent **Diagnostic Card**:
    - *Clear summary* (e.g. "Gemini API Key Missing" or "Target Page Inaccessible").
    - *Explanation* of why it happened.
    - *Actionable Button* (e.g. "Enter API Key", "Switch to Automatable Tab", "Re-inject Content Script").

### Phase 3: Standalone API Fallback in Background Engine (`public/background.js`)
- In `BackgroundGeminiClient.executeInference`:
  - If `apiKey` is missing and `proxyUrl` is unreachable, do not stall or retry in a black hole.
  - Immediately return a structured `CONFIG_ERROR`: *"Gemini API Key is not configured. Please open Sidekick Settings (or Doctor) and enter your Google AI Studio API key to enable autonomous browsing."*
  - Broadcast a `DOCTOR_ALERT` event to the sidepanel so the diagnostic modal pops up with the fix highlighted.

### Phase 4: Autonomous Self-Healing for Mid-Task Failures (`public/background.js`)
- If content script communication drops during navigation: automatically re-inject `content.js` and resume without user intervention.
- If CDP debugger attachment is refused (e.g., user has Chrome DevTools open): automatically downgrade to the 11-event synthetic pointer fallback and notify the user with a gentle toast rather than aborting.

### Phase 5: Build, Package & Verify
- Run `npm run pack:extension` to generate the updated `public/sidekick-extension.zip`.
- Run all test suites (`npm test`).
- Verify visual UI and Doctor drawer using Playwright browser capture.
