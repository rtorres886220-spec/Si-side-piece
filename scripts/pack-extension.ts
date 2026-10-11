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

  const outBuffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync("public/sidekick-extension.zip", outBuffer);
  console.log("Successfully generated public/sidekick-extension.zip (size: " + outBuffer.length + " bytes)");
}

packExtension().catch(console.error);
