/**
 * Sidekick Multi-Agent Router (Manifest V3 Client-Side)
 * Keeps regex strictly for unambiguous mechanical actions (like "scroll down").
 * Everything else is triaged by one tiny, fast Flash-Lite model call that returns:
 * 1. Intent: "action" | "answer" | "transform"
 * 2. Relevant section indices for discrete retrieval
 */

(function () {
  const MECHANICAL_SCROLL_PATTERN = /^(?:scroll(?:\s+(?:down|up|to\s+top|to\s+bottom|top|bottom))?|page\s+down|page\s+up)$/i;

  class SidekickRouter {
    /**
     * Checks if command is an unambiguous mechanical action with zero LLM required
     */
    static checkMechanicalFastPath(promptText) {
      const clean = (promptText || "").trim().toLowerCase();
      if (MECHANICAL_SCROLL_PATTERN.test(clean)) {
        let direction = "down";
        if (clean.includes("up") || clean.includes("top")) {
          direction = clean.includes("top") ? "top" : "up";
        } else if (clean.includes("bottom")) {
          direction = "bottom";
        }
        return {
          isMechanical: true,
          mechanicalAction: "scroll",
          direction,
        };
      }
      return { isMechanical: false };
    }

    /**
    /**
     * Generalized deterministic check for survey completion intent
     */
    static isSurveyIntent(promptText) {
      const clean = (promptText || "").toLowerCase().trim();
      if (!clean) return false;
      if (clean.startsWith("/survey") || clean.startsWith("/questionnaire") || clean.startsWith("/fillform") || clean.startsWith("/poll")) {
        return true;
      }
      // Purely conceptual/definitional check: e.g. "what is a survey?", "explain survey methodology"
      if (/^(?:what\s+is\s+(?:a|an)\s+(?:survey|questionnaire|poll)|explain\s+(?:the\s+)?(?:survey|questionnaire)\s+methodology)\b/i.test(clean)) {
        return false;
      }
      const hasSurveyNoun = /\b(?:surveys?|questionnaires?|polls?|feedback\s+forms?)\b/i.test(clean);
      const hasSurveyAction = /\b(?:fill(?:\s*out)?|complete|answer|finish|submit|take|solve|work\s+through|reach\s+the\s+end)\b/i.test(clean);
      const hasSurveySelection = /\b(?:choose|pick|find|select|locate|use)\b/i.test(clean);
      const hasEveryQuestion = /\b(?:every|all|each)\s+questions?\b/i.test(clean);

      if (hasSurveyNoun && (hasSurveyAction || (hasSurveySelection && (hasEveryQuestion || clean.includes("complete") || clean.includes("finish") || clean.includes("submit") || clean.includes("end"))))) {
        return true;
      }
      return false;
    }

    /**
     * Executes tiny structured Router call using Gemini Flash-Lite
     */
    static async routeRequest(apiClient, promptText, sectionCatalog, options = {}) {
      const { signal, thinkingLevel = "HIGH" } = options;

      const systemInstruction = `You are a precision router for an autonomous browser companion.
Classify the user prompt into exactly ONE specialist worker:
1. "survey": The user wants to discover, fill out, answer, work through, or complete a survey, questionnaire, poll, or multi-question form (e.g. "choose any survey from the page and answer every question till survey is complete", "find a survey in this tab and finish it", "complete one of the available questionnaires", "pick a suitable survey and work through it until you reach the end", "use the current page to find a survey, answer everything you can, and submit it", /survey).
2. "action": The user wants to physically interact with the browser or webpage (click a button, fill an input, submit a form, navigate, scroll, open a new tab, add to cart, search the web or internet).
3. "answer": The user is asking a factual question about this webpage that requires receipts/citations (e.g. pricing, return policy, author, specifications, dates, table lookup).
4. "transform": Open-ended synthesis, evaluation, or creative tasks (e.g. summarize, rewrite, translate, draft a reply, quiz, "is this worth it?", comparison, general reasoning, social banter).

Also inspect the provided page sections and return the indices of sections most relevant to the user request.

Respond with ONLY valid JSON:
{
  "intent": "survey" | "action" | "answer" | "transform",
  "target_sections": [0, 1],
  "element_hint": "brief description of target element if action, or null",
  "reasoning": "brief 1-sentence explanation"
}`;

      const enclaveId = (options && options.enclaveId) || "router-enclave";
      const userContent = `PAGE SECTION CATALOG:
<<<UNTRUSTED_CONTENT_${enclaveId}>>>
${sectionCatalog || "No section catalog available."}
<<<END_UNTRUSTED_CONTENT_${enclaveId}>>>

USER PROMPT: "${promptText}"`;

      const requestBody = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.0,
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingLevel,
          },
        },
      };

      if (signal?.aborted) {
        throw new DOMException("Router request aborted", "AbortError");
      }

      // Fast deterministic check for survey completion intent before remote call
      if (SidekickRouter.isSurveyIntent(promptText)) {
        return {
          intent: "survey",
          target_sections: [],
          element_hint: null,
          reasoning: "Prompt explicitly targets survey answering/completion workflow.",
        };
      }

      try {
        const { data } = await apiClient.executeRequest(requestBody, {
          signal,
          maxRetries: 2,
        });

        const { json } = SidekickApiClient.extractCandidate(data);
        if (json && json.intent) {
          const intent = ["survey", "action", "answer", "transform"].includes(json.intent) ? json.intent : "transform";
          const target_sections = Array.isArray(json.target_sections) ? json.target_sections : [];
          return {
            intent,
            target_sections,
            element_hint: json.element_hint || null,
            reasoning: json.reasoning || "",
          };
        }
      } catch (err) {
        if (err.name === "AbortError" || signal?.aborted) {
          throw err;
        }
        console.warn("[Router] Model routing failed, using fallback heuristic:", err);
      }

      // Safe fallback heuristic only if model call completely fails
      if (SidekickRouter.isSurveyIntent(promptText)) {
        return { intent: "survey", target_sections: [], element_hint: null, reasoning: "fallback" };
      }
      const pLower = (promptText || "").toLowerCase();
      if (/\b(?:click|press|tap|type|fill|enter|submit|button|input|navigate|go\s+to|open|tab|scroll|search|google)\b/i.test(pLower)) {
        return { intent: "action", target_sections: [], element_hint: null, reasoning: "fallback" };
      }
      if (/\b(?:rewrite|draft|translate|quiz|compare|worth\s+it|opinion)\b/i.test(pLower)) {
        return { intent: "transform", target_sections: [], element_hint: null, reasoning: "fallback" };
      }
      return { intent: "answer", target_sections: [], element_hint: null, reasoning: "fallback" };
    }
  }

  // Export to global scope across window, service worker (self), and globalThis (Node.js/browser)
  if (typeof globalThis !== "undefined") {
    globalThis.SidekickRouter = SidekickRouter;
  }
  if (typeof window !== "undefined") {
    window.SidekickRouter = SidekickRouter;
  }
  if (typeof self !== "undefined") {
    self.SidekickRouter = SidekickRouter;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickRouter };
  }
})();
