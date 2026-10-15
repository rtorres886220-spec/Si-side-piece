import JSZip from "jszip";
import fs from "fs";
import path from "path";

export interface PackagingValidationResult {
  valid: boolean;
  fileCount: number;
  totalUncompressedBytes: number;
  archiveSizeBytes: number;
  manifestVersion: string;
  files: string[];
}

/**
 * Validates extension sources, compiles ZIP archive, and performs
 * post-packaging integrity checks.
 *
 * FAILS LOUDLY (process.exit(1)) if any required file or manifest constraint is violated.
 */
export async function validateAndPackExtension(options: {
  rootDir?: string;
  outputPath?: string;
  silent?: boolean;
} = {}): Promise<PackagingValidationResult> {
  const rootDir = options.rootDir || process.cwd();
  const publicDir = path.join(rootDir, "public");
  const outputPath = options.outputPath || path.join(publicDir, "sidekick-extension.zip");
  const silent = Boolean(options.silent);

  const log = (msg: string) => {
    if (!silent) console.log(msg);
  };

  log("==================================================");
  log("  SIDEKICK MV3 EXTENSION PACKAGING & VALIDATION   ");
  log("==================================================");

  // 1. Verify public directory exists
  if (!fs.existsSync(publicDir)) {
    throw new Error(`[pack-extension] CRITICAL: Extension source directory '${publicDir}' does not exist.`);
  }

  // 2. Parse and Validate manifest.json
  const manifestPath = path.join(publicDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[pack-extension] CRITICAL: Required file missing: ${manifestPath}`);
  }

  let manifest: any;
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`[pack-extension] CRITICAL: manifest.json is invalid JSON: ${err.message}`);
  }

  if (manifest.manifest_version !== 3) {
    throw new Error(`[pack-extension] CRITICAL: manifest.json must specify manifest_version: 3 (got ${manifest.manifest_version})`);
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    throw new Error("[pack-extension] CRITICAL: manifest.json missing valid 'name' field");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("[pack-extension] CRITICAL: manifest.json missing valid 'version' field");
  }
  if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    throw new Error("[pack-extension] CRITICAL: manifest.json missing 'permissions' array");
  }
  if (!manifest.side_panel?.default_path) {
    throw new Error("[pack-extension] CRITICAL: manifest.json missing 'side_panel.default_path'");
  }
  if (!manifest.background?.service_worker) {
    throw new Error("[pack-extension] CRITICAL: manifest.json missing 'background.service_worker'");
  }

  log(`[VALIDATION 1/5] manifest.json verified: ${manifest.name} v${manifest.version} (MV3)`);

  // 3. Collect & Verify Root Extension Files
  const rootRequiredFiles = [
    "manifest.json",
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    "sidepanel.css",
    "sidepanel.js",
    "content.js",
    "cosmos.bundle.js",
    "privacy.html",
  ];

  for (const relFile of rootRequiredFiles) {
    const full = path.join(publicDir, relFile);
    if (!fs.existsSync(full)) {
      throw new Error(`[pack-extension] CRITICAL: Required root extension file missing: ${full}`);
    }
    const stat = fs.statSync(full);
    if (stat.size === 0) {
      throw new Error(`[pack-extension] CRITICAL: Required extension file is 0 bytes: ${full}`);
    }
  }

  // Verify cosmos.bundle.js has substantive size (> 50KB) proving compilation from src/cosmosEngine.ts
  const cosmosStat = fs.statSync(path.join(publicDir, "cosmos.bundle.js"));
  if (cosmosStat.size < 50000) {
    throw new Error(
      `[pack-extension] CRITICAL: cosmos.bundle.js is unexpectedly small (${cosmosStat.size} bytes). Run 'npm run build:cosmos' first.`
    );
  }

  log(`[VALIDATION 2/5] All 8 core extension files verified (cosmos.bundle.js: ${cosmosStat.size} bytes)`);

  // 4. Validate HTML Script & Link References
  const sidepanelHtmlPath = path.join(publicDir, manifest.side_panel.default_path);
  const sidepanelHtml = fs.readFileSync(sidepanelHtmlPath, "utf-8");

  // Extract <script src="...">
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let scriptMatch: RegExpExecArray | null;
  const referencedScripts: string[] = [];
  while ((scriptMatch = scriptRegex.exec(sidepanelHtml)) !== null) {
    referencedScripts.push(scriptMatch[1]);
  }

  for (const scriptSrc of referencedScripts) {
    const full = path.join(publicDir, scriptSrc);
    if (!fs.existsSync(full)) {
      throw new Error(`[pack-extension] CRITICAL: sidepanel.html references missing script: ${scriptSrc} (full path: ${full})`);
    }
  }

  log(`[VALIDATION 3/5] sidepanel.html referenced scripts verified: ${referencedScripts.join(", ")}`);

  // 5. Verify Multi-Agent Modules
  const requiredAgents = [
    "apiClient.js",
    "coordinator.js",
    "critic.js",
    "gate.js",
    "retriever.js",
    "router.js",
    "surveyEngine.js",
    "workers.js",
  ];

  const agentsDir = path.join(publicDir, "agents");
  if (!fs.existsSync(agentsDir)) {
    throw new Error(`[pack-extension] CRITICAL: public/agents directory is missing: ${agentsDir}`);
  }

  for (const agentFile of requiredAgents) {
    const full = path.join(agentsDir, agentFile);
    if (!fs.existsSync(full)) {
      throw new Error(`[pack-extension] CRITICAL: Required multi-agent module missing: ${full}`);
    }
    const stat = fs.statSync(full);
    if (stat.size === 0) {
      throw new Error(`[pack-extension] CRITICAL: Agent file is 0 bytes: ${full}`);
    }
  }

  log(`[VALIDATION 4/5] All 7 client-side multi-agent modules verified in public/agents/`);

  // 6. Verify Icons & Fonts
  const requiredIcons = [16, 32, 48, 128];
  const iconsDir = path.join(publicDir, "icons");
  if (!fs.existsSync(iconsDir)) {
    throw new Error(`[pack-extension] CRITICAL: public/icons directory is missing: ${iconsDir}`);
  }
  for (const size of requiredIcons) {
    const iconName = `icon${size}.png`;
    const full = path.join(iconsDir, iconName);
    if (!fs.existsSync(full)) {
      throw new Error(`[pack-extension] CRITICAL: Required icon missing: ${full}`);
    }
  }

  const fontsDir = path.join(publicDir, "fonts");
  const fontFiles: string[] = [];
  if (fs.existsSync(fontsDir)) {
    for (const f of fs.readdirSync(fontsDir)) {
      if (f.endsWith(".woff2")) {
        fontFiles.push(f);
      }
    }
  }

  log(`[VALIDATION 5/5] Visual assets verified: 4 icons, ${fontFiles.length} fonts`);

  // 7. Assemble ZIP Archive
  const zip = new JSZip();

  // Root files
  for (const file of rootRequiredFiles) {
    zip.file(file, fs.readFileSync(path.join(publicDir, file)));
  }

  // Agents folder
  const zipAgentsFolder = zip.folder("agents");
  for (const agentFile of requiredAgents) {
    zipAgentsFolder?.file(agentFile, fs.readFileSync(path.join(agentsDir, agentFile)));
  }

  // Icons folder
  const zipIconsFolder = zip.folder("icons");
  for (const size of requiredIcons) {
    const iconName = `icon${size}.png`;
    zipIconsFolder?.file(iconName, fs.readFileSync(path.join(iconsDir, iconName)));
  }

  // Fonts folder
  if (fontFiles.length > 0) {
    const zipFontsFolder = zip.folder("fonts");
    for (const font of fontFiles) {
      zipFontsFolder?.file(font, fs.readFileSync(path.join(fontsDir, font)));
    }
  }

  // README with clear ChromeOS / Chromebook installation instructions
  const readmeContent = `# Sidekick - Chrome DevTools Protocol (CDP) Browser Companion (Manifest V3)

Enterprise-grade browser companion with Just-In-Time (JIT) CDP hardware automation, click-to-locate citations, and defense-in-depth security.

---

## 💻 Installation on Chromebook (ChromeOS):

1. **Download the ZIP**: Download \`sidekick-extension.zip\` to your Chromebook.
2. **Extract Archive (CRITICAL for ChromeOS)**:
   - Open the **Files** app on your Chromebook.
   - Right-click \`sidekick-extension.zip\` and select **"Extract all"** (or create a folder named \`Sidekick\` under **"My files"** or **"Downloads"** and copy all files into it).
   - *Note: Do NOT try to load directly from the mounted zip drive in the sidebar; it must be extracted into a regular folder.*
3. **Open Extensions Page**:
   - In Google Chrome, open a new tab and navigate to: \`chrome://extensions\`
4. **Enable Developer Mode**:
   - In the top-right corner of \`chrome://extensions\`, toggle **Developer mode** to ON.
   *(Note: This is standard extension developer mode in Chrome; no OS wipe or BIOS developer mode is required).*
5. **Load the Extension**:
   - Click the **"Load unpacked"** button in the top-left corner.
   - Select your extracted \`Sidekick\` folder (the folder containing \`manifest.json\`).
6. **Set Up Gemini API Key**:
   - Click the **Sidekick** extension icon in your Chrome toolbar or side panel.
   - On first launch, enter your free Gemini API key (starts with \`AIzaSy...\`) from [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Default model is **\`gemini-3.5-flash-lite\`** (with auto-fallback to \`gemini-3.1-flash-lite\` and \`gemini-flash-latest\`).

---

## ⚡ Important Notes for Chromebook Users:
- **School / Managed Chromebooks**: If your Chromebook is enrolled in an enterprise or school management program, administrators may disable "Developer mode" in \`chrome://extensions\` or block the \`debugger\` permission. On personal Chromebooks, this is fully unlocked.
- **Chrome Protected Pages**: Chrome strictly prohibits all extensions from automating internal pages like \`chrome://extensions\`, \`chrome://settings\`, or the Chrome Web Store. Navigate to any regular website (e.g., Wikipedia, GitHub, news) to activate Sidekick.
- **Chromebook Apps**: Sidekick controls Chrome browser tabs. It cannot interact with separate Android apps from Google Play or Linux Crostini desktop apps.
`;

  zip.file("README.md", readmeContent);

  // Generate ZIP NodeBuffer
  const outBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  // 8. POST-PACKAGING INTEGRITY VALIDATION
  log("Validating generated ZIP archive structure…");
  const reloadedZip = await JSZip.loadAsync(outBuffer);
  const zipFileNames = Object.keys(reloadedZip.files).filter((k) => !reloadedZip.files[k].dir);

  // Check manifest inside ZIP
  const zipManifestEntry = reloadedZip.file("manifest.json");
  if (!zipManifestEntry) {
    throw new Error("[pack-extension] CRITICAL: manifest.json missing inside generated ZIP");
  }
  const zipManifestText = await zipManifestEntry.async("text");
  const zipParsedManifest = JSON.parse(zipManifestText);
  if (zipParsedManifest.version !== manifest.version) {
    throw new Error(
      `[pack-extension] CRITICAL: Version mismatch in ZIP manifest (${zipParsedManifest.version} vs ${manifest.version})`
    );
  }

  // Ensure all 7 agents are in the ZIP
  for (const ag of requiredAgents) {
    const entry = reloadedZip.file(`agents/${ag}`);
    if (!entry) {
      throw new Error(`[pack-extension] CRITICAL: agents/${ag} is missing inside generated ZIP`);
    }
  }

  // Ensure cosmos engine is in the ZIP
  const zipCosmos = reloadedZip.file("cosmos.bundle.js");
  if (!zipCosmos) {
    throw new Error("[pack-extension] CRITICAL: cosmos.bundle.js missing inside generated ZIP");
  }

  // Ensure all icons are in the ZIP
  for (const s of requiredIcons) {
    const entry = reloadedZip.file(`icons/icon${s}.png`);
    if (!entry) {
      throw new Error(`[pack-extension] CRITICAL: icons/icon${s}.png missing inside generated ZIP`);
    }
  }

  // Calculate uncompressed bytes
  let totalUncompressedBytes = 0;
  for (const name of zipFileNames) {
    const entry = reloadedZip.files[name];
    const data = await entry.async("nodebuffer");
    totalUncompressedBytes += data.length;
    if (data.length === 0) {
      throw new Error(`[pack-extension] CRITICAL: Zero-byte file inside generated ZIP: ${name}`);
    }
  }

  // 9. Write to output destination
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, outBuffer);

  log(`[SUCCESS] Release archive generated: ${outputPath}`);
  log(`  • Compressed size:   ${outBuffer.length.toLocaleString()} bytes`);
  log(`  • Uncompressed size: ${totalUncompressedBytes.toLocaleString()} bytes`);
  log(`  • Packaged files:    ${zipFileNames.length} files`);
  log("==================================================");

  return {
    valid: true,
    fileCount: zipFileNames.length,
    totalUncompressedBytes,
    archiveSizeBytes: outBuffer.length,
    manifestVersion: manifest.version,
    files: zipFileNames,
  };
}

// Execution entry point: ensure process exits with non-zero code on failure
if (process.argv[1] && process.argv[1].endsWith("pack-extension.ts")) {
  validateAndPackExtension().catch((err) => {
    console.error("\n❌ [pack-extension] CRITICAL PACKAGING FAILURE:\n", err.message || err);
    process.exit(1);
  });
}
