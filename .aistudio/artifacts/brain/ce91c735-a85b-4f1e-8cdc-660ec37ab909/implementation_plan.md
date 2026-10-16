# 3D Globe Visual Calibration & Prompt Optimization Plan

Analyze the reference image on a micro level and optimize the 3D particle globe parameters and generation prompt to achieve exact visual parity (night-side city lights, sapphire-cyan coastlines, atmospheric blue rim halo) while making the globe appear slightly smaller in the viewport.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the target aesthetic: an exact night map with a blue rim halo inside Google AI Studio.

- **Confirmed Decision 1**: Exact night map with luminous blue/cyan continent point clusters, dark ocean bathymetry, and 4-point diffraction city beacons.
- **Confirmed Decision 2**: Scale down the globe radius and adjust camera distance to make the globe look slightly smaller and more centered in the viewport.

---

## 1. Overview & Core Concept

- **What It Does**: Calibrates the 3D particle globe (`src/stellarCore.ts` and `src/GalaxyStarSystem.tsx`) to match the reference image's exact micro-level aesthetic (dense glowing metropolitan nodes, sapphire-cyan landmasses, radiant blue atmospheric shell) and reduces scale by ~15% (`sphereRadius` 42.0 → 36.0, camera distance 142 → 165).
- **Target Audience**: Users experiencing the Gemini Sidekick interface who desire a compact, hyper-realistic celestial globe.
- **Key Value**: Exact visual match to the reference image with perfect 60 FPS performance and verified rendering.

---

## 2. User Experience & Visual Design

- **Key Visual Adjustments**:
  - *Globe Scale*: Reduced radius (`sphereRadius: 36.0` instead of `42.0`) and increased camera depth (`z: 165` instead of `142`) so the globe appears slightly smaller with a more spacious surrounding celestial starfield.
  - *Atmospheric Rim Glow*: Enhanced auroral shell brightness and color gradient to match the vibrant blue rim halo in the reference image.
  - *City Beacons & Night Lights*: High-precision 4-point diffraction glints on major metropolitan centers (Tokyo, New York, London, etc.) matching the pinprick cluster density of the reference image.

---

## 3. Technical Architecture & Modifications

```
┌──────────────────────────────────────────────┐
│  src/stellarCore.ts                          │
│  - Adjust sphereRadius (42.0 -> 36.0)        │
│  - Tune continent & city color ramps         │
│  - Calibrate atmosphere particle density     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  src/GalaxyStarSystem.tsx                    │
│  - Adjust camera distance (z: 142 -> 165)    │
│  - Adjust heightPercent / container layout   │
└──────────────────────────────────────────────┘
```

- **Exact Prompt / Configuration Blueprint**:
  - Provides the precise prompt and parameter specifications that guarantee this exact visual result.
