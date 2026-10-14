import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import JSZip from "jszip";
import { validateAndPackExtension } from "./pack-extension";

async function runPackagingTestSuite() {
  console.log("==================================================");
  console.log("  RUNNING EXTENSION PACKAGING & INTEGRITY TESTS   ");
  console.log("==================================================");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (!condition) {
      console.error(`❌ [FAIL] ${testName}`);
      throw new Error(`Test assertion failed: ${testName}`);
    }
    passed++;
    console.log(`✓ [PASS] ${testName}`);
  }

  // TEST 1: Baseline Packaging of Live Extension Sources
  console.log("\n--- [SUITE 1] Live Authoritative Packaging & Manifest Validation ---");
  const result = await validateAndPackExtension({ silent: true });
  assert(result.valid === true, "Packaging script completes with valid status");
  assert(result.manifestVersion === "1.1.3", "Manifest version is parsed correctly (v1.1.3)");
  assert(result.fileCount >= 27, `Package contains all required files (found ${result.fileCount})`);
  assert(fs.existsSync("public/sidekick-extension.zip"), "Generated release ZIP exists at public/sidekick-extension.zip");

  // TEST 2: Deep ZIP Structure & Content Verification
  console.log("\n--- [SUITE 2] Release ZIP Structural Integrity ---");
  const zipBuffer = fs.readFileSync("public/sidekick-extension.zip");
  const loadedZip = await JSZip.loadAsync(zipBuffer);

  const manifestEntry = loadedZip.file("manifest.json");
  assert(manifestEntry !== null, "ZIP archive contains manifest.json");
  const zipManifest = JSON.parse(await manifestEntry!.async("text"));
  assert(zipManifest.manifest_version === 3, "ZIP manifest declares manifest_version: 3");
  assert(zipManifest.side_panel?.default_path === "sidepanel.html", "ZIP manifest specifies sidepanel.html");
  assert(zipManifest.background?.service_worker === "background.js", "ZIP manifest specifies background.js");
  assert(zipManifest.permissions.includes("debugger"), "ZIP manifest includes 'debugger' permission");
  assert(zipManifest.permissions.includes("sidePanel"), "ZIP manifest includes 'sidePanel' permission");
  assert(zipManifest.permissions.includes("tabGroups"), "ZIP manifest includes 'tabGroups' permission");

  // Verify all 7 agent files in agents/ inside ZIP
  const requiredAgents = [
    "apiClient.js",
    "coordinator.js",
    "critic.js",
    "gate.js",
    "retriever.js",
    "router.js",
    "workers.js"
  ];
  for (const ag of requiredAgents) {
    const entry = loadedZip.file(`agents/${ag}`);
    assert(entry !== null, `ZIP archive contains agents/${ag}`);
    const data = await entry!.async("nodebuffer");
    assert(data.length > 500, `agents/${ag} inside ZIP is non-empty (${data.length} bytes)`);
  }

  // Verify 3D particle cosmos bundle
  const cosmosEntry = loadedZip.file("cosmos.bundle.js");
  assert(cosmosEntry !== null, "ZIP archive contains cosmos.bundle.js");
  const cosmosData = await cosmosEntry!.async("nodebuffer");
  assert(cosmosData.length > 50000, `cosmos.bundle.js inside ZIP has authentic compiled size (${cosmosData.length} bytes)`);

  // Verify icons
  for (const size of [16, 32, 48, 128]) {
    const iconEntry = loadedZip.file(`icons/icon${size}.png`);
    assert(iconEntry !== null, `ZIP archive contains icons/icon${size}.png`);
  }

  // Verify README
  const readmeEntry = loadedZip.file("README.md");
  assert(readmeEntry !== null, "ZIP archive contains README.md with Chromebook setup instructions");
  const readmeText = await readmeEntry!.async("text");
  assert(readmeText.includes("Chromebook"), "README.md contains Chromebook setup details");

  // TEST 3: Negative Failure Testing (Missing files MUST fail the build)
  console.log("\n--- [SUITE 3] Negative Testing: Missing Required Files Fail The Build ---");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidekick-pack-fail-test-"));

  try {
    // Scenario A: Missing manifest.json
    fs.mkdirSync(path.join(tempDir, "public"), { recursive: true });
    let failedManifest = false;
    try {
      await validateAndPackExtension({ rootDir: tempDir, silent: true });
    } catch (e: any) {
      failedManifest = true;
      assert(e.message.includes("manifest.json"), "Missing manifest.json triggers explicit error");
    }
    assert(failedManifest, "Packaging strictly fails when manifest.json is missing");

    // Scenario B: Missing agent module
    // Copy public dir to tempDir, but remove one agent
    fs.cpSync("public", path.join(tempDir, "public"), { recursive: true });
    const victimAgent = path.join(tempDir, "public/agents/coordinator.js");
    fs.unlinkSync(victimAgent);

    let failedAgent = false;
    try {
      await validateAndPackExtension({ rootDir: tempDir, silent: true });
    } catch (e: any) {
      failedAgent = true;
      assert(e.message.includes("coordinator.js"), "Missing agent file triggers explicit error naming the missing file");
    }
    assert(failedAgent, "Packaging strictly fails when any agent module is missing");

    // Scenario C: Missing cosmos bundle
    const victimCosmos = path.join(tempDir, "public/cosmos.bundle.js");
    if (fs.existsSync(victimCosmos)) fs.unlinkSync(victimCosmos);
    // restore coordinator.js first
    fs.copyFileSync("public/agents/coordinator.js", victimAgent);

    let failedCosmos = false;
    try {
      await validateAndPackExtension({ rootDir: tempDir, silent: true });
    } catch (e: any) {
      failedCosmos = true;
      assert(e.message.includes("cosmos.bundle.js"), "Missing cosmos.bundle.js triggers explicit error");
    }
    assert(failedCosmos, "Packaging strictly fails when cosmos.bundle.js is missing");

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // TEST 4: Subprocess Exit Code Verification
  console.log("\n--- [SUITE 4] CLI Subprocess Non-Zero Exit Code Verification ---");
  const stdout = execSync("npx tsx scripts/pack-extension.ts", { encoding: "utf-8" });
  assert(stdout.includes("Release archive generated"), "CLI command executes with exit code 0 on valid sources");

  console.log("\n==================================================");
  console.log(`  EXTENSION PACKAGING TESTS COMPLETE: ${passed}/${total} PASSED  `);
  console.log("==================================================");
}

runPackagingTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
