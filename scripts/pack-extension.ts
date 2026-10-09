import JSZip from "jszip";
import fs from "fs";
import path from "path";

async function packExtension() {
  const zip = new JSZip();

  const rootFiles = [
    "manifest.json",
    "background.js",
    "content.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "privacy.html",
  ];

  for (const file of rootFiles) {
    if (fs.existsSync(file)) {
      zip.file(file, fs.readFileSync(file));
    }
  }

  // agents folder
  const agentsFolder = zip.folder("agents");
  const agentFiles = fs.readdirSync("agents");
  for (const af of agentFiles) {
    const fullPath = path.join("agents", af);
    if (fs.statSync(fullPath).isFile()) {
      agentsFolder?.file(af, fs.readFileSync(fullPath));
    }
  }

  // icons folder
  const iconsFolder = zip.folder("icons");
  if (fs.existsSync("icons")) {
    const iconFiles = fs.readdirSync("icons");
    for (const icon of iconFiles) {
      const fullPath = path.join("icons", icon);
      if (fs.statSync(fullPath).isFile()) {
        iconsFolder?.file(icon, fs.readFileSync(fullPath));
      }
    }
  }

  // fonts folder
  const fontsFolder = zip.folder("fonts");
  if (fs.existsSync("fonts")) {
    const fontFiles = fs.readdirSync("fonts");
    for (const font of fontFiles) {
      const fullPath = path.join("fonts", font);
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
