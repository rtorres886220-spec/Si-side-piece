/**
 * Deterministic Action Target Resolver & Candidate Ranker for Sidekick
 *
 * Rules:
 * - Deterministic scoring of DOM elements against action target terms.
 * - If exactly 1 clear candidate exists: Direct Execution (0 Gemini calls!).
 * - If ambiguous: filters and prepares <= 5 candidates for Flash-Lite semantic selection.
 * - Enforces zero-trust payment widget and sensitive field lockouts.
 * - Re-verifies live coordinates and viewport bounds.
 */

export interface InteractiveElementCandidate {
  id: number;
  role: string;
  label: string;
  x: number;
  y: number;
  selector?: string;
  matchScore?: number;
  ariaLabel?: string;
  accessibleName?: string;
  disabled?: boolean;
  tagName?: string;
  context?: string;
  group?: string;
  associatedLabel?: string;
  inputSelector?: string;
  labelSelector?: string;
  inputType?: string;
  checked?: boolean;
  selected?: boolean;
  value?: string;
  options?: Array<{ value: string; text: string; selected?: boolean }>;
  isIntercepted?: boolean;
  interceptedBy?: string;
}

export interface ActionResolutionResult {
  isUnambiguous: boolean;
  isAmbiguous: boolean;
  hasTarget: boolean;
  directTarget: InteractiveElementCandidate | null;
  candidates: InteractiveElementCandidate[];
  rejectionReason?: string;
  isConsequential?: boolean;
  requiresConfirmation?: boolean;
  consequentialReason?: string;
}

export interface FreshnessVerification {
  isFresh: boolean;
  driftPx: number;
  reason?: string;
  freshCandidate?: InteractiveElementCandidate;
}

const PAYMENT_KEYWORDS = [
  "stripe", "paypal", "braintree", "credit-card", "cardnumber",
  "cvv", "cvc", "exp-date", "cc-number", "payment-widget", "checkout-card"
];

const CONSEQUENTIAL_KEYWORDS = [
  "submit", "send", "post", "tweet", "publish", "share",
  "buy", "purchase", "order", "place order", "checkout", "subscribe", "upgrade", "pay",
  "delete", "remove", "destroy", "drop", "erase", "trash", "purge", "clear all",
  "change password", "reset password", "deactivate", "close account", "terminate",
  "transfer", "wire", "withdraw", "authorize", "grant access", "revoke"
];

export function isConsequentialAction(
  actionType: string,
  target: { label?: string; role?: string; selector?: string; ariaLabel?: string },
  additionalText?: string
): { isConsequential: boolean; reason?: string } {
  const combined = `${actionType || ""} ${target.label || ""} ${target.role || ""} ${target.selector || ""} ${target.ariaLabel || ""} ${additionalText || ""}`.toLowerCase();

  // Benign UI exemptions
  if (/\b(?:filter|filters|sort|sorting|cookie|cookies|continue\s+reading|next\s+page|theme|view|learn\s+more)\b/i.test(combined)) {
    return { isConsequential: false };
  }

  for (const kw of CONSEQUENTIAL_KEYWORDS) {
    const wordRegex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (wordRegex.test(combined)) {
      return {
        isConsequential: true,
        reason: `Consequential action detected: "${kw}" on target [${target.label || actionType}]`,
      };
    }
  }

  return { isConsequential: false };
}

export function verifyElementFreshness(
  candidate: InteractiveElementCandidate,
  currentLiveElements: InteractiveElementCandidate[],
  maxDriftPx = 25
): FreshnessVerification {
  if (!currentLiveElements || currentLiveElements.length === 0) {
    return { isFresh: false, driftPx: 0, reason: "Live interactive element index is empty (DOM reloaded or blank)." };
  }

  // 1. Match by unique selector or ID
  const matched = currentLiveElements.find((el) =>
    (candidate.selector && el.selector && el.selector === candidate.selector) ||
    el.id === candidate.id
  );

  if (!matched) {
    return { isFresh: false, driftPx: 0, reason: `Target element [#${candidate.id}] was removed from the active DOM (stale reference).` };
  }

  // 2. Coordinate drift check
  const dx = Math.abs(matched.x - candidate.x);
  const dy = Math.abs(matched.y - candidate.y);
  const drift = Math.sqrt(dx * dx + dy * dy);

  if (drift > maxDriftPx) {
    return {
      isFresh: false,
      driftPx: Math.round(drift),
      reason: `Element moved by ${Math.round(drift)}px due to page scroll or layout shift.`,
      freshCandidate: matched,
    };
  }

  // 3. Label/role mutation check
  const normOld = (candidate.label || "").toLowerCase().trim();
  const normNew = (matched.label || "").toLowerCase().trim();
  if (normOld && normNew && normOld !== normNew && !normNew.includes(normOld) && !normOld.includes(normNew)) {
    return {
      isFresh: false,
      driftPx: Math.round(drift),
      reason: `Element accessible label changed from "${candidate.label}" to "${matched.label}".`,
      freshCandidate: matched,
    };
  }

  return {
    isFresh: true,
    driftPx: Math.round(drift),
    freshCandidate: matched,
  };
}

export function isElementRestricted(el: { label?: string; role?: string; selector?: string }): boolean {
  const combined = `${el.label || ""} ${el.role || ""} ${el.selector || ""}`.toLowerCase();
  return PAYMENT_KEYWORDS.some((kw) => combined.includes(kw));
}

function cleanTerm(term: string): string {
  return (term || "").toLowerCase().trim().replace(/['"\`]/g, "");
}

function computeSimilarity(label: string, term: string): number {
  const l = label.toLowerCase().trim();
  const t = term.toLowerCase().trim();

  if (!l || !t) return 0;
  if (l === t) return 1.0;

  // Exact word boundary match
  const wordRegex = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (wordRegex.test(l)) return 0.95;

  // Substring match
  if (l.includes(t)) {
    const ratio = t.length / l.length;
    return Math.max(0.7, Math.min(0.9, 0.7 + ratio * 0.2));
  }

  // Reverse substring (e.g. user typed "Sign in to account" and button is "Sign in")
  if (t.includes(l) && l.length >= 3) {
    const ratio = l.length / t.length;
    return Math.max(0.65, Math.min(0.85, 0.65 + ratio * 0.2));
  }

  // Token overlap Jaccard & full containment
  const lClean = l.replace(/[^a-z0-9\s]/g, " ").trim();
  const tClean = t.replace(/[^a-z0-9\s]/g, " ").trim();
  const lTokens = new Set(lClean.split(/\s+/).filter((w) => w.length > 0));
  const tTokens = new Set(tClean.split(/\s+/).filter((w) => w.length > 0));
  if (lTokens.size === 0 || tTokens.size === 0) return 0;

  let intersection = 0;
  for (const tok of tTokens) {
    if (lTokens.has(tok)) intersection++;
  }
  const union = new Set([...lTokens, ...tTokens]).size;

  // If every token in the search term is present in the label (e.g. "buy now widget b" in "buy now - widget b ($29)")
  if (intersection === tTokens.size && tTokens.size >= 2) {
    return 0.92;
  }

  return intersection / union;
}

export function resolveActionTarget(
  targetTerms: string[],
  actionTypes: Set<string>,
  elements: InteractiveElementCandidate[],
  viewportBounds = { width: 1920, height: 1080 }
): ActionResolutionResult {
  // If no action or pure scroll, no DOM target element required
  if (actionTypes.has("scroll") && actionTypes.size === 1) {
    return {
      isUnambiguous: true,
      isAmbiguous: false,
      hasTarget: false,
      directTarget: null,
      candidates: [],
    };
  }

  if (!elements || elements.length === 0) {
    return {
      isUnambiguous: false,
      isAmbiguous: false,
      hasTarget: false,
      directTarget: null,
      candidates: [],
      rejectionReason: "No interactive elements available in current viewport.",
    };
  }

  // Filter out payment widgets and out-of-bounds elements
  const safeElements = elements.filter((el) => {
    // Disabled controls are not actionable targets.
    if (el.disabled) return false;
    if (isElementRestricted(el)) return false;
    if (el.x < 0 || el.y < 0 || el.x > viewportBounds.width || el.y > viewportBounds.height) {
      return false;
    }
    return true;
  });

  if (safeElements.length === 0) {
    return {
      isUnambiguous: false,
      isAmbiguous: false,
      hasTarget: false,
      directTarget: null,
      candidates: [],
      rejectionReason: "All matching elements were restricted or out-of-viewport.",
    };
  }

  // If user provided no specific target term (e.g. "click something", "press the button")
  if (!targetTerms || targetTerms.length === 0) {
    return {
      isUnambiguous: false,
      isAmbiguous: true,
      hasTarget: true,
      directTarget: null,
      candidates: safeElements.slice(0, 5),
    };
  }

  // Score candidates against all target terms
  const scoredCandidates: Array<{ element: InteractiveElementCandidate; score: number }> = [];

  for (const el of safeElements) {
    let maxScore = 0;
    for (const rawTerm of targetTerms) {
      const term = cleanTerm(rawTerm);
      if (!term) continue;
      let score = computeSimilarity(el.label, term);
      if (el.associatedLabel) {
        const assocScore = computeSimilarity(el.associatedLabel, term);
        if (assocScore > score) score = assocScore;
      }
      if (score > maxScore) maxScore = score;
    }

    // Question / section group matching bonus (Strictly disambiguates repeated labels like 'Next', 'Select', 'Yes' across groups)
    if (el.group || el.context) {
      const groupText = cleanTerm(`${el.group || ""} ${el.context || ""}`);
      for (const rawTerm of targetTerms) {
        const term = cleanTerm(rawTerm);
        if (term.length >= 3 && (groupText.includes(term) || term.includes(groupText))) {
          maxScore += 0.40;
          break;
        }
      }
    }

    // Option text match bonus for select elements
    if (el.options && Array.isArray(el.options)) {
      for (const opt of el.options) {
        for (const rawTerm of targetTerms) {
          const term = cleanTerm(rawTerm);
          if (term.length >= 2) {
            const optScore = computeSimilarity(opt.text || opt.value, term);
            if (optScore > 0.6) {
              maxScore = Math.max(maxScore, optScore + 0.15);
            }
          }
        }
      }
    }

    // Role bonus for specific action types
    if (actionTypes.has("type") && (el.role.includes("input") || el.role.includes("text"))) {
      maxScore += 0.05;
    } else if (actionTypes.has("click") && (el.role.includes("button") || el.role.includes("link") || el.role.includes("radio") || el.role.includes("checkbox"))) {
      maxScore += 0.02;
    } else if ((actionTypes.has("select") || actionTypes.has("select_option") || actionTypes.has("click")) && (el.role.includes("select") || el.role.includes("combobox") || el.role.includes("dropdown"))) {
      maxScore += 0.08;
    }

    if (maxScore > 0.35) {
      scoredCandidates.push({
        element: { ...el, matchScore: Math.round(maxScore * 100) / 100 },
        score: maxScore,
      });
    }
  }

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  if (scoredCandidates.length === 0) {
    // Fallback: provide top 5 general candidates if no high-confidence match
    return {
      isUnambiguous: false,
      isAmbiguous: true,
      hasTarget: true,
      directTarget: null,
      candidates: safeElements.slice(0, 5),
    };
  }

  const best = scoredCandidates[0];
  const secondBest = scoredCandidates[1];

  // Unambiguous condition:
  // 1. Single candidate found with score >= 0.65, OR
  // 2. Best candidate has score >= 0.85 and significantly outscores second best (gap >= 0.25)
  // CRITICAL: If second candidate is within 0.20 score difference or has near-identical label, it is ambiguous!
  const isCloseContender = secondBest && (best.score - secondBest.score < 0.20);
  const isClearSingle = scoredCandidates.length === 1 && best.score >= 0.65;
  const isDominantWinner = !isCloseContender && best.score >= 0.85 && (!secondBest || best.score - secondBest.score >= 0.25);

  if ((isClearSingle || isDominantWinner) && !isCloseContender) {
    const actTypeStr = Array.from(actionTypes).join(" ");
    const consCheck = isConsequentialAction(actTypeStr, best.element);

    return {
      isUnambiguous: true,
      isAmbiguous: false,
      hasTarget: true,
      directTarget: best.element,
      candidates: [best.element],
      isConsequential: consCheck.isConsequential,
      requiresConfirmation: consCheck.isConsequential,
      consequentialReason: consCheck.reason,
    };
  }

  // Multiple plausible candidates: ambiguous, requires Flash-Lite semantic choice or explicit user clarification
  return {
    isUnambiguous: false,
    isAmbiguous: true,
    hasTarget: true,
    directTarget: null,
    candidates: scoredCandidates.slice(0, 5).map((sc) => sc.element),
    rejectionReason: isCloseContender ? `Multiple similar targets found: "${best.element.label}" and "${secondBest?.element.label}". Clarification required.` : undefined,
  };
}

export function validateModelActionSelection(
  target: number | { id?: number; x?: number; y?: number; element_description?: string; selector?: string },
  allowedCandidates: InteractiveElementCandidate[]
): { isValid: boolean; validatedTarget: InteractiveElementCandidate | null; isConsequential?: boolean; requiresConfirmation?: boolean; consequentialReason?: string; error?: string } {
  if (!allowedCandidates || allowedCandidates.length === 0) {
    return {
      isValid: false,
      validatedTarget: null,
      error: "No allowed candidates available for model action validation.",
    };
  }

  let match: InteractiveElementCandidate | undefined;

  if (typeof target === "number") {
    match = allowedCandidates.find((c) => c.id === target);
  } else if (target && typeof target === "object") {
    if (target.id !== undefined) {
      match = allowedCandidates.find((c) => c.id === target.id);
    }
    if (!match && target.selector) {
      match = allowedCandidates.find((c) => c.selector === target.selector);
    }
    if (!match && target.x !== undefined && target.y !== undefined) {
      // Coordinate proximity check: must match within bounding area (default 50px delta)
      match = allowedCandidates.find((c) => Math.abs(c.x - (target.x ?? 0)) <= 50 && Math.abs(c.y - (target.y ?? 0)) <= 50);
    }
    if (!match && target.element_description) {
      const descLower = target.element_description.toLowerCase().trim();
      match = allowedCandidates.find((c) => (c.label || "").toLowerCase().includes(descLower) || descLower.includes((c.label || "").toLowerCase()));
    }
  }

  if (!match) {
    const targetDesc = typeof target === "number" ? `[#${target}]` : JSON.stringify(target);
    return {
      isValid: false,
      validatedTarget: null,
      error: `Model selected target ${targetDesc}, which does not match any validated candidate element or verified coordinates.`,
    };
  }

  if (isElementRestricted(match)) {
    return {
      isValid: false,
      validatedTarget: null,
      error: `Security violation: Model selected element [#${match.id}] that intersects with payment widgets.`,
    };
  }

  if (match.disabled) {
    return {
      isValid: false,
      validatedTarget: null,
      error: `Element [#${match.id}] "${match.label}" is currently disabled in the DOM.`,
    };
  }

  const consCheck = isConsequentialAction("click", match);

  return {
    isValid: true,
    validatedTarget: match,
    isConsequential: consCheck.isConsequential,
    requiresConfirmation: consCheck.isConsequential,
    consequentialReason: consCheck.reason,
  };
}

/**
 * Re-identifies a target element from a fresh live DOM candidate list
 * after a rerender, dynamic shift, or failed postcondition verification.
 */
export function reIdentifyTarget(
  targetSpec: {
    id?: number;
    selector?: string;
    label?: string;
    associatedLabel?: string;
    role?: string;
    group?: string;
    context?: string;
    inputSelector?: string;
    labelSelector?: string;
  },
  freshElements: InteractiveElementCandidate[]
): { found: boolean; candidate: InteractiveElementCandidate | null; reason?: string } {
  if (!freshElements || freshElements.length === 0) {
    return { found: false, candidate: null, reason: "Live element index is empty" };
  }

  // 1. Selector match
  if (targetSpec.selector) {
    const bySel = freshElements.find((e) => e.selector === targetSpec.selector);
    if (bySel && !bySel.disabled) return { found: true, candidate: bySel };
  }

  // 2. Exact Label + Group match
  const targetLabel = cleanTerm(targetSpec.label || targetSpec.associatedLabel || "");
  const targetGroup = cleanTerm(targetSpec.group || targetSpec.context || "");

  if (targetLabel && targetGroup) {
    const groupMatches = freshElements.filter((e) => {
      const eLabel = cleanTerm(e.label || e.associatedLabel || "");
      const eGroup = cleanTerm(e.group || e.context || "");
      return eLabel === targetLabel && (eGroup.includes(targetGroup) || targetGroup.includes(eGroup));
    });
    if (groupMatches.length === 1 && !groupMatches[0].disabled) {
      return { found: true, candidate: groupMatches[0] };
    }
  }

  // 3. Exact Label + Role match
  if (targetLabel) {
    const labelMatches = freshElements.filter((e) => {
      const eLabel = cleanTerm(e.label || e.associatedLabel || "");
      const roleMatches = !targetSpec.role || e.role.includes(targetSpec.role) || targetSpec.role.includes(e.role);
      return eLabel === targetLabel && roleMatches && !e.disabled;
    });
    if (labelMatches.length === 1) {
      return { found: true, candidate: labelMatches[0] };
    }
    if (labelMatches.length > 1) {
      return {
        found: false,
        candidate: null,
        reason: `Ambiguous target: Multiple elements match label "${targetSpec.label}". Clarification required.`
      };
    }
  }

  return { found: false, candidate: null, reason: "Target could not be re-identified in fresh DOM" };
}

/**
 * Classifies an interaction failure to determine intelligent, evidence-driven recovery strategy.
 */
export function classifyInteractionFailure(
  action: string,
  target: InteractiveElementCandidate,
  postVerification: { outcome?: string; reason?: string; isIntercepted?: boolean; interceptedBy?: string }
): {
  type: "INTERCEPTED_BY_OVERLAY" | "DEAD_CLICK" | "STALE_TARGET" | "VALUE_MISMATCH" | "STATE_UNCHANGED" | "UNKNOWN";
  recoverable: boolean;
  strategy: "SCROLL_AND_RETRY" | "CLICK_LABEL_ALTERNATIVE" | "DIRECT_DOM_FALLBACK" | "REIDENTIFY_TARGET" | "WAIT_AND_REVERIFY" | "ABORT";
  reason: string;
} {
  const reason = postVerification?.reason || "Post-action verification failed";

  if (postVerification?.isIntercepted || (postVerification?.outcome === "intercepted") || reason.includes("intercepted") || target.isIntercepted) {
    return {
      type: "INTERCEPTED_BY_OVERLAY",
      recoverable: true,
      strategy: "DIRECT_DOM_FALLBACK",
      reason: `Target was intercepted by pointer overlay (${postVerification?.interceptedBy || target.interceptedBy || "sticky element"}). Applying direct DOM interaction fallback.`
    };
  }

  if (postVerification?.outcome === "delayed" || reason.includes("delayed") || reason.includes("pending") || reason.includes("asynchronously")) {
    return {
      type: "STATE_UNCHANGED",
      recoverable: true,
      strategy: "WAIT_AND_REVERIFY",
      reason: "Action feedback is delayed or asynchronous. Performing bounded wait and re-verifying."
    };
  }

  if (target.role.includes("radio") || target.role.includes("checkbox") || (target.tagName && target.tagName.toLowerCase() === "input")) {
    return {
      type: "STATE_UNCHANGED",
      recoverable: true,
      strategy: "CLICK_LABEL_ALTERNATIVE",
      reason: "Input state was not updated by direct click. Retrying via associated visible label target."
    };
  }

  if (postVerification?.outcome === "no_op" || reason.includes("no DOM mutation") || reason.includes("completely unchanged")) {
    return {
      type: "DEAD_CLICK",
      recoverable: true,
      strategy: "DIRECT_DOM_FALLBACK",
      reason: "Dead click detected (UI state did not mutate). Retrying with direct DOM event sequence."
    };
  }

  if (reason.includes("stale") || reason.includes("no longer exists") || reason.includes("detached")) {
    return {
      type: "STALE_TARGET",
      recoverable: true,
      strategy: "REIDENTIFY_TARGET",
      reason: "Target element became stale due to DOM rerender. Re-identifying in live DOM."
    };
  }

  if (action === "type" && reason.includes("mismatch")) {
    return {
      type: "VALUE_MISMATCH",
      recoverable: true,
      strategy: "DIRECT_DOM_FALLBACK",
      reason: "Input value did not persist. Retrying via direct property setter + input event."
    };
  }

  return {
    type: "UNKNOWN",
    recoverable: false,
    strategy: "ABORT",
    reason
  };
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).resolveActionTarget = resolveActionTarget;
  (globalThis as any).validateModelActionSelection = validateModelActionSelection;
  (globalThis as any).reIdentifyTarget = reIdentifyTarget;
  (globalThis as any).classifyInteractionFailure = classifyInteractionFailure;
  (globalThis as any).isConsequentialAction = isConsequentialAction;
  (globalThis as any).verifyElementFreshness = verifyElementFreshness;
}

