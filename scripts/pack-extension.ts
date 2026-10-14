import JSZip from "jszip";
import fs from "fs";
import path from "path";

async function packExtension() {
  const zip = new JSZip();

  const extensionFiles = [
    "manifest.json",
    "background.js",
    "content.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "cosmos.bundle.js",
    "privacy.html",
  ];

  for (const file of extensionFiles) {
    const fullPath = path.join("public", file);
    if (fs.existsSync(fullPath)) {
      zip.file(file, fs.readFileSync(fullPath));
    }
  }

  // agents folder
  const agentsFolder = zip.folder("agents");
  if (fs.existsSync("public/agents")) {
    const agentFiles = fs.readdirSync("public/agents");
    for (const af of agentFiles) {
      const fullPath = path.join("public/agents", af);
      if (fs.statSync(fullPath).isFile()) {
        agentsFolder?.file(af, fs.readFileSync(fullPath));
      }
    }
  }

  // icons folder
  const iconsFolder = zip.folder("icons");
  if (fs.existsSync("public/icons")) {
    const iconFiles = fs.readdirSync("public/icons");
    for (const icon of iconFiles) {
      const fullPath = path.join("public/icons", icon);
      if (fs.statSync(fullPath).isFile()) {
        iconsFolder?.file(icon, fs.readFileSync(fullPath));
      }
    }
  }

  // fonts folder
  const fontsFolder = zip.folder("fonts");
  if (fs.existsSync("public/fonts")) {
    const fontFiles = fs.readdirSync("public/fonts");
    for (const font of fontFiles) {
      const fullPath = path.join("public/fonts", font);
      if (fs.statSync(fullPath).isFile()) {
        fontsFolder?.file(font, fs.readFileSync(fullPath));
      }
    }
  }

  // Include comprehensive README.md with Chromebook / ChromeOS instructions
  zip.file(
    "README.md",
    `# Sidekick - Chrome DevTools Protocol (CDP) Browser Companion (Manifest V3)

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
   - Default model is **\`gemini-3.5-flash-lite\`** (with auto-fallback to \`gemini-3.1-flash-lite\`).

---

## ⚡ Important Notes for Chromebook Users:
- **School / Managed Chromebooks**: If your Chromebook is enrolled in an enterprise or school management program, administrators may disable "Developer mode" in \`chrome://extensions\` or block the \`debugger\` permission. On personal Chromebooks, this is fully unlocked.
- **Chrome Protected Pages**: Chrome strictly prohibits all extensions from automating internal pages like \`chrome://extensions\`, \`chrome://settings\`, or the Chrome Web Store. Navigate to any regular website (e.g., Wikipedia, GitHub, news) to activate Sidekick.
- **Chromebook Apps**: Sidekick controls Chrome browser tabs. It cannot interact with separate Android apps from Google Play or Linux Crostini desktop apps.
`
  );

  const outBuffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync("public/sidekick-extension.zip", outBuffer);
  console.log("Successfully generated public/sidekick-extension.zip (size: " + outBuffer.length + " bytes)");
}

packExtension().catch(console.error);
