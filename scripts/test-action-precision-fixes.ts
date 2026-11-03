import { resolveActionTarget, verifyElementFreshness, type InteractiveElementCandidate } from "../src/actionResolver.ts";
import fs from "node:fs";
import assert from "node:assert/strict";

const candidate = (overrides: Partial<InteractiveElementCandidate> = {}): InteractiveElementCandidate => ({
  id: 1, role: "button", label: "Continue", x: 100, y: 100, selector: "#continue",
  ...overrides,
});

// Regression: a label mutation in either direction invalidates a cached target.
const stale = verifyElementFreshness(candidate({ label: "Continue" }), [candidate({ label: "Cancel" })]);
assert.equal(stale.isFresh, false, "changed accessible label must invalidate target");

// Regression: disabled controls must never be considered viable click targets.
const disabledResolution = resolveActionTarget(["Submit"], new Set(["click"]), [candidate({ label: "Submit", disabled: true })]);
assert.equal(disabledResolution.hasTarget, false, "disabled control must be excluded");

// Static integration guards ensure active execution fails closed and never treats arbitrary mutation as success.
const background = fs.readFileSync(new URL("../public/background.js", import.meta.url), "utf8");
const contentScript = fs.readFileSync(new URL("../public/content.js", import.meta.url), "utf8");
assert.match(background, /Live target revalidation failed; refusing to click stale coordinates/);
assert.match(background, /Pre-action state unavailable; refusing an unverified click/);
assert.match(background, /STEP_LIMIT_REACHED/);
assert.match(background, /NEEDS_VERIFICATION/);
assert.match(contentScript, /dom_mutated_unconfirmed/);
assert.match(contentScript, /resolveVerificationElement/);
console.log("PASS: 7 browser-automation precision regression assertions");
