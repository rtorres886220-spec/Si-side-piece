import * as THREE from "three";
import {
  createPinpointStarTexture,
  createDiffractionStarTexture,
  createVolumetricNebulaTexture,
  generateStellarArchitecture,
  applyTwinkleShader,
  updateTwinkleUniforms,
} from "./stellarCore";

/**
 * High-Fidelity 3D Living Particle Globe Engine for Chrome Extension Side Panel.
 * 
 * 100% Identical Parity with Google AI Studio Web View:
 * 1. Continents drawn as thousands of individual points on a slowly rotating sphere.
 * 2. Earth's authentic 23.44-degree polar axial tilt with weightless floating drift.
 * 3. Major metropolitan beacons (Tokyo, London, NYC, Paris, Sydney, etc.) with 4-point diffraction glints.
 * 4. Coordinate graticules (Equator, Tropics, Meridians) and recessed oceanic bathymetry.
 * 5. Atmospheric auroral outer shell and distant celestial background starfield.
 * 6. Progressive multi-stop ease mask dissolving gracefully into the chat panel.
 * 7. Page Visibility API suspension (0% GPU/CPU when hidden).
 */

export function initLivingCosmos(options: {
  canvasId?: string;
  containerId?: string;
  nebulaIntensity?: number;
} = {}) {
  const canvasId = options.canvasId || "galaxyCanvas";
  const containerId = options.containerId || "rrStarlightCeiling";
  const nebulaIntensity = options.nebulaIntensity !== undefined ? options.nebulaIntensity : 0.88;

  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const container = document.getElementById(containerId) as HTMLElement | null;

  if (!canvas || !container) {
    console.warn("[CosmosEngine] Canvas or container element not found:", { canvasId, containerId });
    return null;
  }

  // Accessibility: check for reduced motion
  let isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handleMotionChange = (e: MediaQueryListEvent) => {
    isReducedMotion = e.matches;
  };
  motionQuery.addEventListener("change", handleMotionChange);

  let width = container.clientWidth || 400;
  let height = container.clientHeight || 300;

  // 1. Scene, Atmospheric Cosmic Fog & Perspective Camera
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07080b, 0.0015);

  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1600);
  camera.position.set(0, 8, 142);
  camera.lookAt(0, -6, 0);

  // 2. High-Performance WebGL Renderer with High-DPR Clamping
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    renderer.setClearColor(0x000000, 0);
  } catch (err) {
    console.error("[CosmosEngine] WebGL initialization failed:", err);
    return null;
  }

  // 3. Shared Optical Procedural Textures
  const pinpointStarTexture = createPinpointStarTexture();
  const diffractionStarTexture = createDiffractionStarTexture();
  const nebulaTexture = createVolumetricNebulaTexture();

  // 4. Generate Particle Globe Geometry
  const globeData = generateStellarArchitecture({
    sphereRadius: 42.0,
    totalSphereSamples: 32000,
    atmosphereCount: 700,
    backgroundStarCount: 1400,
  });

  // 5. Continent Land Particles (Luminous Astral Sapphire, Cyan & Warm Gold)
  const continentGeometry = new THREE.BufferGeometry();
  continentGeometry.setAttribute("position", new THREE.BufferAttribute(globeData.continentPositions, 3));
  continentGeometry.setAttribute("color", new THREE.BufferAttribute(globeData.continentColors, 3));
  continentGeometry.setAttribute("size", new THREE.BufferAttribute(globeData.continentSizes, 1));
  continentGeometry.setAttribute("aPhase", new THREE.BufferAttribute(globeData.continentPhases, 1));
  continentGeometry.setAttribute("aFreq", new THREE.BufferAttribute(globeData.continentFreqs, 1));

  const continentMaterial = new THREE.PointsMaterial({
    size: 1.75,
    vertexColors: true,
    map: pinpointStarTexture,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  applyTwinkleShader(continentMaterial, "continent");

  const continentPoints = new THREE.Points(continentGeometry, continentMaterial);

  // 6. Oceanic Bathymetry & Graticule Particles (Recessed, Deep Indigo & Cyan Rings)
  const oceanGeometry = new THREE.BufferGeometry();
  oceanGeometry.setAttribute("position", new THREE.BufferAttribute(globeData.oceanPositions, 3));
  oceanGeometry.setAttribute("color", new THREE.BufferAttribute(globeData.oceanColors, 3));
  oceanGeometry.setAttribute("size", new THREE.BufferAttribute(globeData.oceanSizes, 1));
  oceanGeometry.setAttribute("aPhase", new THREE.BufferAttribute(globeData.oceanPhases, 1));
  oceanGeometry.setAttribute("aFreq", new THREE.BufferAttribute(globeData.oceanFreqs, 1));

  const oceanMaterial = new THREE.PointsMaterial({
    size: 1.1,
    vertexColors: true,
    map: pinpointStarTexture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const oceanPoints = new THREE.Points(oceanGeometry, oceanMaterial);

  // 7. Elite Metropolitan Beacons (4-Point Anamorphic Diffraction Glints)
  const cityGeometry = new THREE.BufferGeometry();
  cityGeometry.setAttribute("position", new THREE.BufferAttribute(globeData.cityPositions, 3));
  cityGeometry.setAttribute("color", new THREE.BufferAttribute(globeData.cityColors, 3));
  cityGeometry.setAttribute("size", new THREE.BufferAttribute(globeData.citySizes, 1));
  cityGeometry.setAttribute("aPhase", new THREE.BufferAttribute(globeData.cityPhases, 1));
  cityGeometry.setAttribute("aFreq", new THREE.BufferAttribute(globeData.cityFreqs, 1));

  const cityMaterial = new THREE.PointsMaterial({
    size: 5.4,
    vertexColors: true,
    map: diffractionStarTexture,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  applyTwinkleShader(cityMaterial, "city");

  const cityPoints = new THREE.Points(cityGeometry, cityMaterial);

  // 8. Atmospheric Auroral Outer Shell
  const atmoGeometry = new THREE.BufferGeometry();
  atmoGeometry.setAttribute("position", new THREE.BufferAttribute(globeData.atmoPositions, 3));
  atmoGeometry.setAttribute("color", new THREE.BufferAttribute(globeData.atmoColors, 3));

  const atmoMaterial = new THREE.PointsMaterial({
    size: 14.0 * nebulaIntensity,
    vertexColors: true,
    map: nebulaTexture,
    transparent: true,
    opacity: 0.16 * nebulaIntensity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const atmoPoints = new THREE.Points(atmoGeometry, atmoMaterial);

  // 9. Deep Space Background Celestial Starfield (Stationary in universe)
  const bgStarGeometry = new THREE.BufferGeometry();
  bgStarGeometry.setAttribute("position", new THREE.BufferAttribute(globeData.bgStarPositions, 3));
  bgStarGeometry.setAttribute("color", new THREE.BufferAttribute(globeData.bgStarColors, 3));
  bgStarGeometry.setAttribute("size", new THREE.BufferAttribute(globeData.bgStarSizes, 1));
  bgStarGeometry.setAttribute("aPhase", new THREE.BufferAttribute(globeData.bgStarPhases, 1));
  bgStarGeometry.setAttribute("aFreq", new THREE.BufferAttribute(globeData.bgStarFreqs, 1));

  const bgStarMaterial = new THREE.PointsMaterial({
    size: 1.25,
    vertexColors: true,
    map: pinpointStarTexture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  applyTwinkleShader(bgStarMaterial, "bgstar");

  const bgStarPoints = new THREE.Points(bgStarGeometry, bgStarMaterial);
  scene.add(bgStarPoints);

  // 10. Globe Axial Tilt & Spin Assemblies
  const globeTiltGroup = new THREE.Group();
  globeTiltGroup.rotation.z = THREE.MathUtils.degToRad(-23.44);
  globeTiltGroup.rotation.x = THREE.MathUtils.degToRad(14.0);
  globeTiltGroup.position.set(0, -6, 0);

  const globeSpinGroup = new THREE.Group();
  globeSpinGroup.add(continentPoints);
  globeSpinGroup.add(oceanPoints);
  globeSpinGroup.add(cityPoints);

  globeTiltGroup.add(globeSpinGroup);
  globeTiltGroup.add(atmoPoints);
  scene.add(globeTiltGroup);

  // 11. Damped Mouse Parallax Tracking
  let targetCameraX = 0;
  let targetCameraY = 8;
  let currentCameraX = 0;
  let currentCameraY = 8;

  const handleMouseMove = (e: MouseEvent) => {
    if (isReducedMotion) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    targetCameraX = normX * 16;
    targetCameraY = 8 + normY * 10;
  };

  window.addEventListener("mousemove", handleMouseMove, { passive: true });

  // 12. Responsive Resize Observer
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const cr = entry.contentRect;
      if (cr.width > 0 && cr.height > 0) {
        width = cr.width;
        height = cr.height;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    }
  });
  resizeObserver.observe(container);

  // 13. Low-Power Page Visibility Management
  let isRunning = true;
  let animationFrameId = 0;
  const clock = new THREE.Clock();

  const handleVisibilityChange = () => {
    if (document.hidden) {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
    } else {
      if (!isRunning) {
        isRunning = true;
        clock.getDelta();
        animate();
      }
    }
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // 14. 60 FPS Render & Planetary Animation Loop
  const animate = () => {
    if (!isRunning) return;
    animationFrameId = requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // Slow, majestic planetary axial rotation
    if (!isReducedMotion) {
      globeSpinGroup.rotation.y += delta * 0.048;
      atmoPoints.rotation.y += delta * 0.032;

      // Weightless vertical and lateral celestial drift (lower under header)
      globeTiltGroup.position.y = -6 + Math.sin(elapsedTime * 0.45) * 1.2;
      globeTiltGroup.position.x = Math.cos(elapsedTime * 0.32) * 0.6;
    }

    // Smooth camera parallax easing
    currentCameraX += (targetCameraX - currentCameraX) * 0.045;
    currentCameraY += (targetCameraY - currentCameraY) * 0.045;

    camera.position.x = currentCameraX;
    camera.position.y = currentCameraY;
    camera.lookAt(0, -6, 0);

    // Atmospheric auroral breathing
    atmoMaterial.opacity = (0.14 + Math.sin(elapsedTime * 0.75) * 0.035) * nebulaIntensity;

    // Subtle GPU twinkling across continents and metropolitan beacons
    updateTwinkleUniforms(continentMaterial, elapsedTime, isReducedMotion);
    updateTwinkleUniforms(cityMaterial, elapsedTime, isReducedMotion);
    updateTwinkleUniforms(bgStarMaterial, elapsedTime, isReducedMotion);

    renderer.render(scene, camera);
  };

  animate();

  console.log("[CosmosEngine] 3D Living Particle Globe initialized with full visual parity.");

  return {
    destroy: () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener("change", handleMotionChange);
      resizeObserver.disconnect();

      continentGeometry.dispose();
      continentMaterial.dispose();
      oceanGeometry.dispose();
      oceanMaterial.dispose();
      cityGeometry.dispose();
      cityMaterial.dispose();
      atmoGeometry.dispose();
      atmoMaterial.dispose();
      bgStarGeometry.dispose();
      bgStarMaterial.dispose();
      pinpointStarTexture.dispose();
      diffractionStarTexture.dispose();
      nebulaTexture.dispose();
      renderer.dispose();
    }
  };
}

if (typeof window !== "undefined") {
  (window as unknown as { initLivingCosmos: typeof initLivingCosmos }).initLivingCosmos = initLivingCosmos;
}
