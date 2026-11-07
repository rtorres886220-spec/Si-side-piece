import test from "node:test";
import assert from "node:assert/strict";

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const doctor = require("../public/agents/doctor.js");

test("SidekickDoctor: checkTabEligibility correctly identifies restricted and valid URLs", () => {
  // Test chrome internal pages
  const extCheck = doctor.checkTabEligibility({ url: "chrome://extensions", title: "Extensions" });
  assert.equal(extCheck.eligible, false);
  assert.equal(extCheck.status, "FAIL");
  assert.equal(extCheck.category, "RESTRICTED_BROWSER_PAGE");
  assert.ok(extCheck.suggestedUrl);

  const newTabCheck = doctor.checkTabEligibility({ url: "chrome://newtab", title: "New Tab" });
  assert.equal(newTabCheck.eligible, false);
  assert.equal(newTabCheck.status, "FAIL");

  const blankCheck = doctor.checkTabEligibility({ url: "about:blank", title: "" });
  assert.equal(blankCheck.eligible, false);
  assert.equal(blankCheck.status, "FAIL");

  // Test Chrome Web Store
  const webstoreCheck = doctor.checkTabEligibility({ url: "https://chromewebstore.google.com/detail/xyz", title: "Web Store" });
  assert.equal(webstoreCheck.eligible, false);
  assert.equal(webstoreCheck.status, "FAIL");
  assert.equal(webstoreCheck.category, "CHROME_WEBSTORE_RESTRICTED");

  // Test banking / financial denylist
  const chaseCheck = doctor.checkTabEligibility({ url: "https://www.chase.com/login", title: "Chase" });
  assert.equal(chaseCheck.eligible, false);
  assert.equal(chaseCheck.status, "WARN");
  assert.equal(chaseCheck.category, "SENSITIVE_FINANCIAL_DENYLIST");

  const paypalCheck = doctor.checkTabEligibility({ url: "https://paypal.com/signin", title: "PayPal" });
  assert.equal(paypalCheck.eligible, false);
  assert.equal(paypalCheck.category, "SENSITIVE_FINANCIAL_DENYLIST");

  // Test valid public web pages
  const wikiCheck = doctor.checkTabEligibility({ url: "https://en.wikipedia.org/wiki/Artificial_intelligence", title: "AI - Wikipedia" });
  assert.equal(wikiCheck.eligible, true);
  assert.equal(wikiCheck.status, "PASS");
  assert.equal(wikiCheck.category, "ELIGIBLE");

  const googleCheck = doctor.checkTabEligibility({ url: "https://www.google.com/search?q=sidekick", title: "Google Search" });
  assert.equal(googleCheck.eligible, true);
  assert.equal(googleCheck.status, "PASS");
});

test("SidekickDoctor: testApiKey flags missing or malformed keys without external network calls", async () => {
  // Missing key
  const emptyRes = await doctor.testApiKey("");
  assert.equal(emptyRes.valid, false);
  assert.equal(emptyRes.status, "FAIL");
  assert.equal(emptyRes.category, "MISSING_KEY");

  // Malformed key (not starting with AIzaSy)
  const malformedRes = await doctor.testApiKey("sk-1234567890abcdef");
  assert.equal(malformedRes.valid, false);
  assert.equal(malformedRes.status, "WARN");
  assert.equal(malformedRes.category, "SUSPICIOUS_KEY_FORMAT");
});

test("SidekickDoctor: runFullPreflight produces structured report with ready status and checks", async () => {
  const report = await doctor.runFullPreflight({ apiKey: "" });
  assert.ok(report);
  assert.equal(typeof report.ready, "boolean");
  assert.equal(typeof report.failCount, "number");
  assert.equal(Array.isArray(report.checks), true);
  assert.equal(report.checks.length, 5);

  const keyCheck = report.checks.find((c: any) => c.id === "api_key");
  assert.ok(keyCheck);
  assert.equal(keyCheck.valid, false);

  const tabCheck = report.checks.find((c: any) => c.id === "target_tab");
  assert.ok(tabCheck);
});
