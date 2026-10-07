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
}

export interface ActionResolutionResult {
  isUnambiguous: boolean;
  isAmbiguous: boolean;
  hasTarget: boolean;
  directTarget: InteractiveElementCandidate | null;
  candidates: InteractiveElementCandidate[];
  rejectionReason?: string;
}

const PAYMENT_KEYWORDS = [
  "stripe", "paypal", "braintree", "credit-card", "cardnumber",
  "cvv", "cvc", "exp-date", "cc-number", "payment-widget", "checkout-card"
];

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

  // Token overlap Jaccard
  const lTokens = new Set(l.split(/\s+/).filter((w) => w.length > 2));
  const tTokens = new Set(t.split(/\s+/).filter((w) => w.length > 2));
  if (lTokens.size === 0 || tTokens.size === 0) return 0;

  let intersection = 0;
  for (const tok of tTokens) {
    if (lTokens.has(tok)) intersection++;
  }
  const union = new Set([...lTokens, ...tTokens]).size;
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
      const score = computeSimilarity(el.label, term);
      if (score > maxScore) maxScore = score;
    }

    // Role bonus for specific action types
    if (actionTypes.has("type") && (el.role.includes("input") || el.role.includes("text"))) {
      maxScore += 0.05;
    } else if (actionTypes.has("click") && (el.role.includes("button") || el.role.includes("link"))) {
      maxScore += 0.02;
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
  const isClearSingle = scoredCandidates.length === 1 && best.score >= 0.65;
  const isDominantWinner = best.score >= 0.85 && (!secondBest || best.score - secondBest.score >= 0.25);

  if (isClearSingle || isDominantWinner) {
    return {
      isUnambiguous: true,
      isAmbiguous: false,
      hasTarget: true,
      directTarget: best.element,
      candidates: [best.element],
    };
  }

  // Multiple plausible candidates: ambiguous, requires Flash-Lite semantic choice
  return {
    isUnambiguous: false,
    isAmbiguous: true,
    hasTarget: true,
    directTarget: null,
    candidates: scoredCandidates.slice(0, 5).map((sc) => sc.element),
  };
}

export function validateModelActionSelection(
  selectedId: number,
  allowedCandidates: InteractiveElementCandidate[]
): { isValid: boolean; validatedTarget: InteractiveElementCandidate | null; error?: string } {
  const match = allowedCandidates.find((c) => c.id === selectedId);
  if (!match) {
    return {
      isValid: false,
      validatedTarget: null,
      error: `Model selected element ID [#${selectedId}], which is not in the validated candidate set.`,
    };
  }

  if (isElementRestricted(match)) {
    return {
      isValid: false,
      validatedTarget: null,
      error: `Security violation: Model selected element [#${selectedId}] that intersects with payment widgets.`,
    };
  }

  return {
    isValid: true,
    validatedTarget: match,
  };
}
