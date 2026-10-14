# Sidekick - Chrome DevTools Protocol (CDP) Browser Companion (Manifest V3)

Enterprise-grade browser companion with Just-In-Time (JIT) CDP hardware automation, click-to-locate citations, and defense-in-depth security.

---

## 💻 Installation on Chromebook (ChromeOS):

1. **Download the ZIP**: Click the **Download** icon in the simulator header or download `sidekick-extension.zip`.
2. **Extract Archive (CRITICAL for ChromeOS)**:
   - Open the **Files** app on your Chromebook.
   - Right-click `sidekick-extension.zip` and select **"Extract all"** (or create a folder named `Sidekick` under **"My files"** or **"Downloads"** and copy all files into it).
   - *Note: Do NOT try to load directly from the mounted zip drive in the sidebar; it must be extracted into a regular folder.*
3. **Open Extensions Page**:
   - In Google Chrome, open a new tab and navigate to: `chrome://extensions`
4. **Enable Developer Mode**:
   - In the top-right corner of `chrome://extensions`, toggle **Developer mode** to ON.
   *(Note: This is standard extension developer mode in Chrome; no OS wipe or BIOS developer mode is required).*
5. **Load the Extension**:
   - Click the **"Load unpacked"** button in the top-left corner.
   - Select your extracted `Sidekick` folder (the folder containing `manifest.json`).
6. **Set Up Gemini API Key**:
   - Click the **Sidekick** extension icon in your Chrome toolbar or side panel.
   - On first launch, enter your free Gemini API key (starts with `AIzaSy...`) from [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Default model is **`gemini-3.5-flash-lite`** (with auto-fallback to `gemini-3.1-flash-lite`).

---

## ⚡ Important Notes for Chromebook Users:
- **School / Managed Chromebooks**: If your Chromebook is enrolled in an enterprise or school management program, administrators may disable "Developer mode" in `chrome://extensions` or block the `debugger` permission. On personal Chromebooks, this is fully unlocked.
- **Chrome Protected Pages**: Chrome strictly prohibits all extensions from automating internal pages like `chrome://extensions`, `chrome://settings`, or the Chrome Web Store. Navigate to any regular website (e.g., Wikipedia, GitHub, news) to activate Sidekick.
- **Chromebook Apps**: Sidekick controls Chrome browser tabs. It cannot interact with separate Android apps from Google Play or Linux Crostini desktop apps.
