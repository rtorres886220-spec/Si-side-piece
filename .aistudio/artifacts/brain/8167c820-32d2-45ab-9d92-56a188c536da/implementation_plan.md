# High-Fidelity Celestial Star System: Parity & Verification Architecture

An exhaustive architectural and visual enhancement plan guaranteeing 100% visual parity, optical elegance, and rock-solid performance between Google AI Studio and the live unpacked Chrome extension side panel.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Chrome Extension Parity Verification**:
> To guarantee that the star system looks and behaves **identically** in the live Chrome extension as it does in Google AI Studio:
> 1. **Single Source of Truth (`src/stellarCore.ts`)**: We will extract the procedural texture generators, stellar distribution math, color palettes, and diffraction spike shaders into a shared engine module. Both the React component (`GalaxyStarSystem.tsx`) and the extension engine (`cosmosEngine.ts`) will import from this exact same core.
> 2. **Automated Bundle & Packaging Pipeline**: Updating the engine automatically compiles `public/cosmos.bundle.js` via esbuild and re-packs `public/sidekick-extension.zip`.
> 3. **Chrome Side Panel Constraints**: Calibrated for standard 400px side panel widths, dynamic drag-resize via `ResizeObserver`, high-DPR (Retina/4K) sub-pixel precision, and instant zero-CPU tab sleep via the Page Visibility API.

- **Confirmed Palette**: Deep Obsidian (`#07080b`) canvas with luminous Astral Sapphire spiral arms and a warm golden core nucleus.
- **Confirmed Optics**: Delicate 4-point cross diffraction spikes on top 0.5% elite foreground stars; dark interstellar dust lanes for 3D depth.
- **Confirmed Motion**: Silky 3D parallax with damped exponential follow and low-power tab suspension.

---

### 1. Overview & Parity Verification

#### Why Differences Often Occur & How We Prevent Them
| Risk Factor in Chrome Extension | Google AI Studio Environment | Chrome Extension Side Panel | Solution for 100% Visual Parity |
| :--- | :--- | :--- | :--- |
| **Code Divergence** | React component in Vite (`GalaxyStarSystem.tsx`) | IIFE bundle (`cosmos.bundle.js` in `sidepanel.html`) | Shared `src/stellarCore.ts` module imported by both; esbuild compiles it into the extension bundle. |
| **Viewport & Scaling** | Embedded container in desktop window | Fixed 400px side panel with user drag-resize | Responsive `ResizeObserver` updating aspect ratio and renderer size synchronously in both. |
| **Display Density** | Browser window pixel ratio | Chrome extension side panel zoom / Retina DPR | Sub-pixel DPR clamping: `Math.min(window.devicePixelRatio, 2.0)` on both canvas contexts. |
| **Background Scrim / Mask** | React JSX inline mask and scrim | CSS classes in `sidepanel.css` (`.rr-starlight-ceiling`, `.rr-starlight-scrim`) | Identical CSS gradient stops and mask rules synchronized across both styles. |
| **Power / Background Throttling** | Continuous tab animation | Chrome aggressively throttles background extension tabs | Explicit `visibilitychange` listener pauses render loop when sidepanel is inactive (0% GPU/CPU). |

---

### 2. User Experience & Visual Design

#### A. Color Palette & Stellar Spectral Distribution
- **Obsidian Deep Space (`#07080b`)**: True astronomical black background ensuring maximum contrast and dynamic range.
- **Galactic Core Bulge (~5,000 stars)**:
  - Central nucleus: Brilliant white core (`#ffffff`).
  - Ellipsoidal bulge: Warm solar and amber stars (`#fff7ed`, `#fef08a`, `#fcd34d`), evoking dense ancient stellar populations.
- **Logarithmic Spiral Arms (~16,000 stars)**:
  - Young stellar nurseries: Radiant sapphire and cyan stars (`#1e40af`, `#38bdf8`, `#93c5fd`).
  - Interstellar dust lanes: Realistic gaps and absorption silhouettes along the arm edges, giving the disk authentic volumetric structure.
- **Deep Halo & Globular Clusters (~3,000 stars)**:
  - Distant silver halo stars (`#e2e8f0`) creating immense spatial scale.

#### B. Optical Texture Realism & Diffraction Spikes
- **Standard Star Texture (128x128 Canvas)**:
  - Pinpoint sub-pixel Airy disk core with steep exponential falloff (zero oversized blurry or milky circles).
- **Elite Beacon Star Texture (256x256 Canvas)**:
  - Crisp, delicate 4-point cross diffraction spikes (anamorphic telescope glint) with soft central lens flare.
  - Assigned exclusively to the nearest ~50 foreground stars (0.3% of total stars), creating dramatic photographic focal depth without clutter.
- **Volumetric Nebular Dust (256x256 Canvas)**:
  - Soft, Gaussian multi-spectral indigo and sapphire clouds blended additively at low opacity (`0.12 - 0.18`) with gentle breathing oscillation.

#### C. Smooth Half-Height Dissolve
- The star system is strictly bound to the upper 50% of the viewport.
- Masked with an 8-stop smooth ease gradient (`100% -> 92% -> 72% -> 42% -> 18% -> 4% -> 0%`), dissolving invisibly into the obsidian chat area with zero hard cutoffs.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Shared Core Engine Architecture (`src/stellarCore.ts`)**
  - *Chosen Approach*: Extract all mathematical formulas (logarithmic spiral angles, ellipsoidal bulge math, texture canvas painters, color interpolators, and shader/material settings) into `src/stellarCore.ts`.
  - *Why*: Eliminates accidental drift between the React component and the Chrome extension bundle. Any visual tweak in the shared core instantly updates both.
  - *Alternatives Considered*: Maintaining duplicate code in `GalaxyStarSystem.tsx` and `cosmosEngine.ts`. Rejected due to risk of visual discrepancies between AI Studio and Chrome.

- **Decision 2: Diffraction Spikes on Elite Foreground Stars Only**
  - *Chosen Approach*: Only 40–60 stars closest to the camera receive diffraction spikes via a dedicated high-priority point cloud layer.
  - *Why*: Prevents visual noise; creates authentic James Webb / Hubble telescope depth of field.

- **Decision 3: Battery-Friendly Tab Sleep**
  - *Chosen Approach*: Hook into `document.addEventListener("visibilitychange")` to cancel and resume `requestAnimationFrame`.
  - *Why*: Guarantees zero battery drain or CPU lag when Chrome tabs are in the background.

---

### 4. Technical Architecture & Build Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                        src/stellarCore.ts                              │
│   - Procedural Pinpoint Airy Core Texture Generator                    │
│   - Procedural 4-Point Anamorphic Diffraction Texture Generator        │
│   - Procedural Soft Volumetric Sapphire Nebula Texture Generator       │
│   - 4-Tier Logarithmic Spiral & Core Bulge Mathematical Geometry       │
│   - True Astronomical Spectral Color Gradients (Obsidian -> Sapphire)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│      src/GalaxyStarSystem.tsx       │   │         src/cosmosEngine.ts         │
│     (React Three.js Component)      │   │       (Standalone WebGL Engine)     │
│   - Used in src/App.tsx             │   │   - Used for Chrome Extension       │
│   - Live in Google AI Studio Web    │   │   - Bundled via esbuild into IIFE   │
└──────────────────┬──────────────────┘   └──────────────────┬──────────────────┘
                   │                                         │
                   │                                         ▼ [npm run build:cosmos]
                   │                              ┌─────────────────────────────────────┐
                   │                              │       public/cosmos.bundle.js       │
                   │                              │   - Loaded in public/sidepanel.html │
                   │                              └──────────────────┬──────────────────┘
                   │                                                 │
                   │                                                 ▼ [npm run pack:extension]
                   ▼                                      ┌─────────────────────────────────────┐
┌─────────────────────────────────────┐                   │    public/sidekick-extension.zip    │
│       Google AI Studio Web          │                   │   - Ready for "Load Unpacked" in    │
│        (Instant Parity)             │                   │     chrome://extensions             │
└─────────────────────────────────────┘                   └─────────────────────────────────────┘
```

#### Verification Steps

1. **Phase 1: Build Shared Stellar Core (`src/stellarCore.ts`)**:
   - Create standard Airy star texture, elite diffraction spike texture, and volumetric sapphire dust texture generators.
   - Implement multi-tier particle buffers (Elite diffraction beacons, Warm core bulge, Sapphire spiral arms, Distant halo).
2. **Phase 2: Update React Component (`src/GalaxyStarSystem.tsx`)**:
   - Wire `GalaxyStarSystem.tsx` to consume `stellarCore.ts`.
   - Verify layout, aspect ratio, and visual rendering in `src/App.tsx`.
3. **Phase 3: Update Extension Engine (`src/cosmosEngine.ts`)**:
   - Wire `cosmosEngine.ts` to consume `stellarCore.ts`.
   - Verify resize handling, DPR capping, and `visibilitychange` lifecycle.
4. **Phase 4: Synchronize Extension HTML & CSS (`public/sidepanel.*`)**:
   - Ensure `public/sidepanel.css` masks and scrims exactly mirror the React component styles.
   - Run `npm run build:cosmos` to generate updated `public/cosmos.bundle.js`.
   - Run `npm run pack:extension` to generate updated `public/sidekick-extension.zip`.
5. **Phase 5: Automated Build & Parity Test**:
   - Run `npm run lint` and `npm run build` to verify clean compilation with zero warnings or errors.
   - Confirm identical visual rendering, color grading, diffraction spikes, and 60 FPS performance in both preview modes.
