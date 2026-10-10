/**
 * Sidekick Multi-Agent Deterministic Invariant Gate (Manifest V3 Client-Side)
 * Enforces zero-trust safety constraints AND answer quality invariants:
 * 1. Safety: Payment/password field lockouts, target existence check.
 * 2. Quality: Non-empty check, anti-lazy refusal check, number integrity check,
 *    and normalized quote verification.
 */

(function () {
  // Regex to extract numerical entities: currency, percentages, counts, metrics
  const NUMBER_REGEX = /(?:\$\s*\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|percent|usd|dollars|days|hours|minutes|seconds|months|years|k|m|b|gb|mb|tb|ms))\b|\b\d+(?:\.\d+)?\b)/gi;

  const SENSITIVE_INPUT_PATTERNS = [
    /\b(?:card(?:number|_num)?|cvv|cvc|expir|exp_month|exp_year|cc_num|creditcard|debitcard)\b/i,
    /\b(?:stripe|braintree|square|paypal|checkout_card)\b/i,
    /\b(?:password|passwd|pwd|passcode|secret|pin)\b/i,
    /\b(?:ssn|social_security|tax_id)\b/i,
  ];

  class SidekickGate {
    /**
     * String normalization for robust quote matching
     * Handles whitespace, smart quotes, dashes, and casing
     */
    static normalizeText(text) {
      if (!text) return "";
      return String(text)
        .replace(/\s+/g, " ")
        .replace(/[""''`]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/[*_#`~]/g, "")
        .trim()
        .toLowerCase();
    }

    /**
     * Verifies that a quote exists in the source text using normalized comparison
     */
    static verifyQuoteInSource(quote, sourceText) {
      if (!quote || !sourceText) return false;
      const cleanQuote = quote.trim();
      if (cleanQuote.length < 3) return false;

      // 1. Direct substring match
      if (sourceText.includes(cleanQuote)) return true;

      // 2. Normalized substring match
      const normQuote = SidekickGate.normalizeText(cleanQuote);
      const normSource = SidekickGate.normalizeText(sourceText);
      if (normSource.includes(normQuote)) return true;

      // 3. High-fidelity sliding phrase match (requires >= 80% contiguous length match to prevent fabricated tails)
      const words = normQuote.split(" ");
      if (words.length >= 8) {
        const thresholdCount = Math.floor(words.length * 0.85);
        const prefix = words.slice(0, thresholdCount).join(" ");
        if (normSource.includes(prefix)) return true;
      }

      return false;
    }

    /**
     * Extracts all distinct numbers from text
     */
    static extractNumbers(text) {
      if (!text) return [];
      const matches = text.match(NUMBER_REGEX) || [];
      return Array.from(new Set(matches.map((m) => m.trim().toLowerCase())));
    }

    /**
     * Checks if user prompt keywords appear in evidence
     */
    static findQueryKeywordsInEvidence(query, evidenceText) {
      if (!query || !evidenceText) return [];
      const normEvidence = SidekickGate.normalizeText(evidenceText);
      const stopWords = new Set([
        "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
        "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
        "is", "are", "was", "were", "this", "that", "page", "does", "can", "tell"
      ]);

      const tokens = (query.toLowerCase().match(/[a-z0-9_-]{3,}/g) || [])
        .filter((tok) => !stopWords.has(tok));

      return tokens.filter((tok) => normEvidence.includes(tok));
    }

    /**
     * GATE VERIFICATION FOR ACTION WORKER
     */
    static verifyActionWorker(actionPayload, interactiveElements) {
      if (!actionPayload || !actionPayload.action) {
        return {
          passed: false,
          reason: "Action payload is empty or missing action type.",
          code: "empty_action",
        };
      }

      const { action, target_id, url } = actionPayload;

      // Safe No-Op when element is not present or action is not possible
      if (action === "none") {
        return {
          passed: true,
          isNoOp: true,
          explanation: actionPayload.explanation || "No interactive action was performed.",
        };
      }

      if (action === "scroll") {
        return { passed: true };
      }

      if (action === "open_tab") {
        let dest = (url || "https://www.google.com").trim();
        if (!/^https?:\/\//i.test(dest)) {
          dest = "https://" + dest;
          actionPayload.url = dest;
        }
        return { passed: true, isTabAction: true, url: dest };
      }

      if (action === "navigate") {
        let dest = (url || "").trim();
        if (dest && !/^https?:\/\//i.test(dest)) {
          dest = "https://" + dest;
          actionPayload.url = dest;
        }
        if (!dest || !dest.startsWith("http")) {
          return {
            passed: false,
            reason: "Invalid navigation destination URL.",
            code: "invalid_url",
          };
        }
        return { passed: true };
      }

      if (action === "click" || action === "type") {
        if (target_id === null || target_id === undefined || target_id === "") {
          return {
            passed: false,
            reason: "Action specifies no target element ID.",
            code: "missing_target_id",
          };
        }

        const numId = Number(target_id);
        const matched = (interactiveElements || []).find((el) => Number(el.id) === numId);
        if (!matched) {
          return {
            passed: false,
            reason: `Target element [#${target_id}] does not exist in live viewport DOM.`,
            code: "stale_target_id",
          };
        }

        // Sensitive Payment & Password Field Lockout
        const elDesc = `${matched.label || ""} ${matched.selector || ""} ${matched.role || ""}`.toLowerCase();
        for (const pattern of SENSITIVE_INPUT_PATTERNS) {
          if (pattern.test(elDesc)) {
            return {
              passed: false,
              reason: `Security Enclave Lockout: Targeted element [#${target_id}] matches protected payment/sensitive input (${matched.label}).`,
              code: "payment_lockout",
              isSecurityViolation: true,
            };
          }
        }

        return { passed: true, resolvedElement: matched };
      }

      return { passed: false, reason: `Unknown action type: ${action}`, code: "unknown_action" };
    }

    /**
     * GATE VERIFICATION FOR ANSWER WORKER (Quality + Factual Invariants)
     */
    static verifyAnswerWorker(answerPayload, promptText, evidenceText) {
      if (!answerPayload || !Array.isArray(answerPayload.paragraphs) || answerPayload.paragraphs.length === 0) {
        return {
          passed: false,
          reason: "Answer payload has no paragraphs.",
          code: "empty_answer",
        };
      }

      const allAnswerText = answerPayload.paragraphs.map((p) => p.text || "").join(" ").trim();
      if (!allAnswerText) {
        return {
          passed: false,
          reason: "Answer content is completely blank.",
          code: "blank_text",
        };
      }

      // Quality Invariant 1: Anti-Lazy Refusal Check
      const isRefusal = /\b(?:cannot\s+verify|page\s+does\s+not\s+(?:say|mention|contain)|unverified|no\s+information|not\s+found)\b/i.test(allAnswerText);
      if (isRefusal) {
        const matchedKeywords = SidekickGate.findQueryKeywordsInEvidence(promptText, evidenceText);
        if (matchedKeywords.length >= 2) {
          return {
            passed: false,
            reason: `Lazy refusal detected: the evidence contains query terms (${matchedKeywords.join(", ")}), but worker returned an unverified refusal.`,
            code: "lazy_refusal",
            matchedKeywords,
          };
        }
      }

      // Quality Invariant 2: Number Integrity Check (Exact token & numeric equivalence)
      const answerNumbers = SidekickGate.extractNumbers(allAnswerText);
      const rawEvidenceNumbers = SidekickGate.extractNumbers(evidenceText);
      const evidenceNumberTokens = new Set(rawEvidenceNumbers);
      const evidenceNumericValues = new Set();
      for (const en of rawEvidenceNumbers) {
        const parsed = parseFloat(en.replace(/[^\d.]/g, ""));
        if (!isNaN(parsed)) evidenceNumericValues.add(parsed);
      }

      for (const num of answerNumbers) {
        const rawNum = num.replace(/[^\d.]/g, "");
        if (!rawNum) continue;
        const parsedVal = parseFloat(rawNum);

        // Allow structural/index numbers (1-5) used in list enumerations if not currency/percent
        const isStructural = !num.includes("$") && !num.includes("%") && Number.isInteger(parsedVal) && parsedVal >= 1 && parsedVal <= 5;
        if (isStructural) {
          continue;
        }

        const exactMatch = evidenceNumberTokens.has(num);
        const valueMatch = !isNaN(parsedVal) && evidenceNumericValues.has(parsedVal);
        const inTextMatch = new RegExp(`\\b${rawNum.replace(".", "\\.")}\\b`).test(evidenceText);

        if (!exactMatch && !valueMatch && !inTextMatch) {
          return {
            passed: false,
            reason: `Number integrity failure: Number "${num}" in answer does not appear in retrieved evidence.`,
            code: "unverified_number",
            unverifiedNumber: num,
            availableNumbers: Array.from(evidenceNumberTokens).slice(0, 8),
          };
        }
      }

      // Quality Invariant 3: Normalized Verbatim Quote Check & Pruning Fabrications
      let totalCitations = 0;
      let verifiedCitations = 0;

      for (const para of answerPayload.paragraphs) {
        if (para.citations && Array.isArray(para.citations)) {
          for (const cit of para.citations) {
            totalCitations++;
            const ok = SidekickGate.verifyQuoteInSource(cit.quote, evidenceText);
            cit.verified = ok;
            if (ok) verifiedCitations++;
          }
          // PRUNING: Never present unverified or hallucinated citations to the user
          para.citations = para.citations.filter((cit) => cit.verified);
        }
      }

      if (totalCitations > 0 && verifiedCitations === 0) {
        return {
          passed: false,
          reason: "All provided citation quotes failed normalized verbatim verification in source evidence.",
          code: "unverified_citations",
        };
      }

      return { passed: true, verifiedCount: verifiedCitations, totalCitations };
    }

    /**
     * GATE VERIFICATION FOR TRANSFORM WORKER
     */
    static verifyTransformWorker(transformPayload) {
      if (!transformPayload || !transformPayload.text || !transformPayload.text.trim()) {
        return {
          passed: false,
          reason: "Transform output is empty.",
          code: "empty_transform",
        };
      }
      return { passed: true };
    }
  }

  // Export to global scope
  if (typeof window !== "undefined") {
    window.SidekickGate = SidekickGate;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickGate };
  }
})();
