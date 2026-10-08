/**
 * Deterministic Intent Router for Sidekick Browser Companion
 * Zero LLM invocation — 100% deterministic grammar & regex analysis.
 *
 * Classifies requests into:
 * 1. "conversational" - greetings, social banter, identity, capability queries
 * 2. "pure_action" - browser automation commands (scroll, click, type, navigate)
 * 3. "informational" - page questions, data extraction, summaries, table lookups
 * 4. "hybrid" - commands combining both action and information
 * 5. "ambiguous" - semantic action commands requiring choice (e.g., "find the cheapest one and buy it")
 */

export interface RouterResult {
  intent: "conversational" | "pure_action" | "informational" | "hybrid" | "ambiguous";
  actionTypes: Set<"click" | "type" | "scroll" | "navigate" | "upload">;
  targetTerms: string[];
  typeTextPayload?: { text: string; fieldDesc?: string; pressEnter?: boolean };
  scrollPayload?: { direction: "down" | "up" | "top" | "bottom"; pixels?: number };
  navigatePayload?: { url: string };
  isSemanticSelection: boolean; // e.g. "cheapest", "first", "best", "highest rated"
  isBroadSummary: boolean;
  requiresDomElements: boolean;
  requiresPageEvidence: boolean;
  isConversationalOnly: boolean;
  hasGreeting: boolean;
  hasAction: boolean;
  hasInformationQuery: boolean;
}

const GREETING_PATTERNS = [
  /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|greetings|howdy|yo)[\s,!.?]*$/i,
  /^(?:how\s+are\s+you(?:\s+doing)?|how's\s+it\s+going|what's\s+up)[\s,!.?]*$/i,
  /^(?:thank\s+you|thanks(?:\s+a\s+lot)?|bye|goodbye|see\s+ya)[\s,!.?]*$/i,
  /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name)[\s,!.?]*$/i,
];

const ASSISTANT_CAPABILITY_PATTERNS = [
  /\bwhat\s+can\s+you\s+do\b/i,
  /\bwhat\s+(?:are\s+you\s+able|are\s+you\s+capable\s+of)\b/i,
  /\bwhat\s+do\s+you\s+do\b/i,
  /\bhow\s+can\s+you\s+help\b/i,
  /\bwhat\s+can\s+you\s+automate\b/i,
  /\bwhat\s+(?:tasks|actions|things)\s+can\s+you\s+do\b/i,
  /\bwhat\s+can\s+you\s+do\s+on\s+your\s+own\b/i,
  /\bhow\s+are\s+you\s+different\b/i,
  /\bwhat\s+makes\s+you\s+different\b/i,
  /\bwhat\s+can\s+you\s+do\s+that\s+other\b/i,
  /\bwhat\s+else\s+can\s+you\s+do\b/i,
  /\bhow\s+do\s+you\s+work\b/i,
  /\bexplain\s+how\s+you\s+work\b/i,
];

const CONCEPTUAL_GENERAL_PATTERNS = [
  /\bwhat\s+does\s+it\s+mean\s+when\b/i,
  /\bwhat\s+does\s+["'].*?["']\s+mean\b/i,
  /\bexplain\s+(?:what|how)\s+(?!this\s+page|the\s+page|this\s+table|the\s+author)\b/i,
  /\b(?:what\s+is|what\s+are)\s+(?:phishing|malware|ransomware|cookies|dark\s+patterns?|arbitrage|seo|a\s+llm|prompt\s+injection)\b/i,
];

const PAGE_SPECIFIC_PATTERNS = [
  /\b(?:this|the)\s+(?:page|article|site|website|paper|document|table|text|author|tab|score|bleu|model|benchmark|gpu|price|cost|product)\b/i,
  /\b(?:on\s+this\s+page|in\s+this\s+document|on\s+this\s+site|from\s+this\s+page)\b/i,
  /\b(?:summarize|extract|quote|citations?|table|pricing|bleu)\b/i,
];

const SEMANTIC_SELECTION_PATTERNS = [
  /\b(?:cheapest|lowest\s+price|most\s+expensive|best|highest\s+rated|top\s+rated|popular|first\s+available|second|recommended)\b/i,
  /\b(?:find\s+(?:the\s+)?[a-z0-9_\-\s]{1,30}?\s+and\s+(?:click|buy|select))\b/i,
  /\b(?:pick\s+one|choose\s+for\s+me|select\s+the\s+best)\b/i,
];

const INFO_PATTERNS = [
  /\b(?:who|what|when|where|why|which|whose)\b/i,
  /\b(?:how\s+much|how\s+many|how\s+fast|how\s+long|how\s+often)\b/i,
  /\b(?:is\s+there|are\s+there|does\s+this|did\s+|was\s+|were\s+|can\s+you\s+find|tell\s+me\s+about)\b/i,
  /\b(?:summarize|summary|overview|explain|outline|describe|extract|quote|define|table|pricing|price|cost|score|bleu|author|date)\b/i,
  /\b(?:compare|difference|findings|results|methodology|specifications|specs|terms)\b/i,
];

export function routeUserRequest(prompt: string): RouterResult {
  const p = (prompt || "").trim();
  const pLower = p.toLowerCase();

  // 1. Detect Greeting
  const hasGreeting = GREETING_PATTERNS.some((pat) => pat.test(pLower));

  // 2. Detect Action Intents
  const actionTypes = new Set<"click" | "type" | "scroll" | "navigate" | "upload">();
  const targetTerms: string[] = [];
  let typeTextPayload: { text: string; fieldDesc?: string; pressEnter?: boolean } | undefined;
  let scrollPayload: { direction: "down" | "up" | "top" | "bottom"; pixels?: number } | undefined;
  let navigatePayload: { url: string } | undefined;

  // Exclude queries that merely ask *about* an action button/link
  const isAskingAboutAction = /(?:what\s+(?:does|is)\s+(?:the\s+)?(?:[a-z0-9_\-\s]{1,30})?(?:button|link|control)\s+(?:do|mean|for)|how\s+(?:do\s+I|to)\s+(?:click|scroll|type)|explain\s+(?:what\s+)?(?:the\s+)?(?:button|link)\s+does)/i.test(
    pLower
  );

  // Scroll actions
  const scrollMatch = pLower.match(/(?:^|\b)scroll(?:\s+(down|up|to\s+top|to\s+bottom|top|bottom))?(?:[\s,!.?]|$)/i);
  if (scrollMatch) {
    actionTypes.add("scroll");
    const rawDir = (scrollMatch[1] || "").replace("to ", "").trim();
    const dir = (rawDir === "up" || rawDir === "top" || rawDir === "bottom" ? rawDir : "down") as "down" | "up" | "top" | "bottom";
    scrollPayload = { direction: dir, pixels: 450 };
  }

  // Click actions: imperative commands targeting an element
  if (!isAskingAboutAction) {
    const clickMatch = pLower.match(
      /(?:\b)(?:click|press|tap)(?:\s+on)?(?:\s+the)?\s+([a-z0-9_\-\"\'\s]{1,40}?)(?=(?:\s+and\b|\s+then\b|[.,!?]|$))/i
    );
    if (clickMatch) {
      actionTypes.add("click");
      const target = clickMatch[1]
        .replace(/["']/g, "")
        .replace(/\b(?:button|link|item|tab)\b/g, "")
        .trim();
      if (target) targetTerms.push(target);
    }
  }

  // Type / Fill actions
  if (!isAskingAboutAction) {
    const typeMatch = p.match(
      /(?:\b)(?:type|enter|fill|input)\s+(?:["'](.*?)["']\s+(?:in|into|on)\s+(?:the\s+)?([a-z0-9_\-\s]{1,30})|(?:in|into|on)\s+(?:the\s+)?([a-z0-9_\-\s]{1,30})\s+(?:["'](.*?)["']|with\s+(?:["']?(.*?)["']?)))/i
    );
    if (typeMatch) {
      actionTypes.add("type");
      const text = (typeMatch[1] || typeMatch[4] || typeMatch[5] || "").trim();
      const fieldDesc = (typeMatch[2] || typeMatch[3] || "").trim();
      if (text) {
        typeTextPayload = { text, fieldDesc, pressEnter: true };
        if (fieldDesc) targetTerms.push(fieldDesc);
      }
    } else if (/(?:\b)(?:type|enter|fill|input)\b/i.test(pLower) && /(?:search|input|field|form|box)/i.test(pLower)) {
      actionTypes.add("type");
      const simpleTextMatch = p.match(/(?:type|enter|fill)\s+["']([^"']+)["']/i);
      if (simpleTextMatch) {
        typeTextPayload = { text: simpleTextMatch[1].trim(), pressEnter: true };
      }
    }
  }

  // Navigate actions
  const navMatch = p.match(/(?:\b)(?:navigate\s+to|go\s+to|open)\s+(https?:\/\/[^\s]+)/i);
  if (navMatch) {
    actionTypes.add("navigate");
    navigatePayload = { url: navMatch[1].trim() };
  }

  // Upload actions
  if (/(?:\b)(?:upload\s+file|attach\s+file)\b/i.test(pLower)) {
    actionTypes.add("upload");
  }

  const hasAction = actionTypes.size > 0;

  // 3. Detect Informational / Query Intent
  const isBroadSummary = /(?:^|\b)(?:summarize(?:\s+(?:the\s+)?entire\s+page|\s+this\s+page|\s+all)?|overview|entire\s+page|whole\s+document|table\s+of\s+contents|brief\s+summary)(?:[\s,!.?]|$)/i.test(
    pLower
  );

  let hasInformationQuery = isBroadSummary || INFO_PATTERNS.some((pat) => pat.test(pLower));

  // If greeting is present, check if query remains once greeting is stripped
  if (hasGreeting) {
    const strippedGreeting = pLower
      .replace(/^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|greetings|howdy)[,\s.!]*/i, "")
      .replace(/^(?:how\s+are\s+you(?:\s+doing)?|how's\s+it\s+going|what's\s+up)[,\s.!]*/i, "")
      .replace(/^(?:thank\s+you|thanks(?:\s+a\s+lot)?|bye|goodbye|see\s+ya)[,\s.!]*/i, "")
      .replace(/^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|explain\s+yourself)[,\s.!]*/i, "")
      .trim();

    if (strippedGreeting.length === 0) {
      hasInformationQuery = false;
    }
  }

  // 4. Detect Semantic Ambiguity in Actions (e.g., "find the cheapest one and buy it")
  const isSemanticSelection = SEMANTIC_SELECTION_PATTERNS.some((pat) => pat.test(pLower));

  // 4b. Detect General / Assistant Capability Queries (not about the active tab's page content)
  const isAssistantCapability = ASSISTANT_CAPABILITY_PATTERNS.some((pat) => pat.test(pLower));
  const isConceptual = CONCEPTUAL_GENERAL_PATTERNS.some((pat) => pat.test(pLower));
  const isPageSpecific = PAGE_SPECIFIC_PATTERNS.some((pat) => pat.test(pLower));
  const isGeneralOrSelfQuery = (isAssistantCapability || isConceptual) && !isPageSpecific && !hasAction;

  if (isGeneralOrSelfQuery) {
    hasInformationQuery = false;
  }

  // 5. Synthesize Intent
  let intent: "conversational" | "pure_action" | "informational" | "hybrid" | "ambiguous" = "informational";

  if (isGeneralOrSelfQuery) {
    intent = "conversational";
  } else if (isSemanticSelection && hasAction) {
    intent = "ambiguous";
  } else if (hasAction && hasInformationQuery) {
    intent = "hybrid";
  } else if (hasAction) {
    intent = hasGreeting ? "hybrid" : "pure_action";
  } else if (hasInformationQuery) {
    intent = hasGreeting ? "hybrid" : "informational";
  } else if (hasGreeting) {
    intent = "conversational";
  } else {
    intent = "informational";
  }

  const isConversationalOnly = intent === "conversational";

  return {
    intent,
    actionTypes,
    targetTerms,
    typeTextPayload,
    scrollPayload,
    navigatePayload,
    isSemanticSelection,
    isBroadSummary,
    requiresDomElements: intent === "pure_action" || intent === "hybrid" || intent === "ambiguous",
    requiresPageEvidence: (intent === "informational" || intent === "hybrid" || intent === "ambiguous") && !isGeneralOrSelfQuery,
    isConversationalOnly,
    hasGreeting: hasGreeting && !isGeneralOrSelfQuery,
    hasAction,
    hasInformationQuery,
  };
}
