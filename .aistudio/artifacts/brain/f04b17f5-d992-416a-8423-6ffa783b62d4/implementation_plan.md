# Sidekick Web-to-Extension Absolute Parity & Synchronization Plan

This plan establishes a rigorous, end-to-end strategy to guarantee that the downloadable real Chrome extension (`sidekick-extension.zip` and unpacked `public/` directory) and the web preview simulator (`src/App.tsx`) deliver identical functionality, identical visual rendering, identical versioning, and identical multi-agent execution guarantees.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> In accordance with your explicit directive ("give me the report and have a real high effort plan but do not make any changes yet"), **zero source files or code assets are modified during this turn**. This plan serves as the approved blueprint for subsequent execution once you authorize proceeding.

- **Confirmed Decision 1 (Scope & Fidelity)**: Full package, line-by-line parity across all layers—manifest declaration, background service worker, side panel UI, 3D starlight WebGL globe, multi-agent engine, and ZIP packaging.
- **Confirmed Decision 2 (Zero In-Repo Report Pollution)**: As requested, the audit report is presented exclusively in the live session and not committed into the codebase or `/docs`.
- **Confirmed Decision 3 (No Premature Edits)**: All code modifications are deferred until the user reviews the audit report and approves execution.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates all discrepancies between the in-browser React simulator and the native Chrome Manifest V3 side panel extension.
- **Target Persona**: Power users running Sidekick unpacked in Google Chrome / ChromeOS who expect the installed extension to look, feel, and perform identically to what is displayed in the web preview.
- **Key Value**: 100% parity across UI components, autonomous agent loops, CDP hardware dispatchers, diagnostic doctor suites, and ZIP packaging pipelines.

---

## 2. User Experience & Visual Design

- **Visual Alignment**: The real Chrome side panel (`public/sidepanel.html`, `public/sidepanel.css`, `public/sidepanel.js`) and the React simulator (`src/App.tsx`) share the exact same 400px column layout, obsidian dark theme (`#07080b`), 3D particle sphere starlight ceiling (`cosmos.bundle.js`), frosted glass header, editable `Super Intelligence` / `Sⁱ` wordmark, and choreographic conic input border.
- **System Doctor Parity**: Both environments feature the 5-point preflight diagnostic drawer (Gemini Key, Tab Eligibility, Content Script Handshake, CDP Hardware Access, Storage Health) with zero mock fallbacks.
- **Active Task Ledger**: Identical step counters, stopwatch timers, live checklist items, and cognitive thought accordions.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Synchronize In-Memory Fallback Constants with Authoritative Files**
  - *Chosen Approach*: Update `MANIFEST_CONTENT` and `BACKGROUND_CONTENT` inside `src/App.tsx` so they match `public/manifest.json` (including `"alarms"` permission and `"minimum_chrome_version": "116"`) and `public/background.js` (including multi-tab routing and rate-limiting).
  - *Why*: Prevents any divergence if client-side fetches fail or when viewing files in the in-app "Code" tab.
- **Decision 2: Authoritative Single-Source ZIP Distribution**
  - *Chosen Approach*: Ensure the download button in `src/App.tsx` exclusively delivers the authoritative pre-built `public/sidekick-extension.zip` verified by `scripts/pack-extension.ts`, aligning the in-browser fallback ZIP generator with the identical 29-file manifest and Chromebook installation instructions.
  - *Why*: Eliminates file omissions (e.g. missing Chromebook extraction instructions or font bundles) on browser download.
- **Decision 3: Multi-Agent Module Integration Verification**
  - *Chosen Approach*: Verify and document that all 9 agent modules in `public/agents/` are either cleanly imported or harmonized with `public/background.js` and `public/sidepanel.html` without redundant dead code.
  - *Why*: Ensures strict MV3 compliance without bundling unused artifacts.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI Studio Web App                               │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
│  │   React Simulator (App.tsx)  │    │   Prebuilt Extension ZIP     │  │
│  │   - 3D GalaxyStarSystem.tsx  │    │   (sidekick-extension.zip)   │  │
│  │   - Synchronized Constants   │    │   - 29 verified files        │  │
│  └──────────────┬───────────────┘    └──────────────▲───────────────┘  │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ Download Action                   │ Pack Script
                  ▼                                   │ (scripts/pack-extension.ts)
┌─────────────────────────────────────────────────────┴──────────────────┐
│              Real Chrome Extension (public/ Directory)                 │
│  ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ manifest.json v1.1.3 │  │ background.js    │  │ sidepanel.html   │  │
│  │ (MV3, alarms, CDP)   │  │ (Autonomous SW)  │  │ & sidepanel.js   │  │
│  └──────────────────────┘  └──────────────────┘  └──────────────────┘  │
│  ┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ cosmos.bundle.js     │  │ agents/ (9 files)│  │ content.js       │  │
│  │ (551 KB 3D WebGL)    │  │ (Doctor, Survey) │  │ (Hit-Test Guard) │  │
│  └──────────────────────┘  └──────────────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Planned Execution Steps (Post-Approval):
1. **Audit Alignment**: Update `MANIFEST_CONTENT` in `src/App.tsx` to include `"alarms"` and `"minimum_chrome_version": "116"`.
2. **Background Constant Sync**: Update `BACKGROUND_CONTENT` in `src/App.tsx` to reflect the multi-tab and keep-alive features of `public/background.js`.
3. **ZIP Fallback README Sync**: Update the fallback README in `src/App.tsx` to include the verified Chromebook setup guide.
4. **Build & Package Verification**: Run `npm run pack:extension` and verify `public/sidekick-extension.zip` integrity with all 44 automated tests.
5. **Compilation & Linting**: Execute `compile_applet` and `lint_applet` to guarantee zero syntax or type regressions.
