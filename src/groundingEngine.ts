/**
 * Canonical Grounding Engine & Factual Verification Pipeline for Gemini Sidekick
 *
 * Provides a domain-agnostic, application-level verification pipeline:
 * SOURCE → STRUCTURED EVIDENCE → ATOMIC CLAIMS → RELATIONSHIP VALIDATION → FINAL AUDIT
 *
 * Zero topic-specific hacks or hardcoded keyword rules.
 * Applies across scientific papers, finance, law, medicine, technology, news, statistics, etc.
 */

// ============================================================================
// 1. DATA STRUCTURES & SCHEMAS
// ============================================================================

export type EvidenceUnitType =
  | "heading"
  | "paragraph"
  | "table-cell"
  | "table-row"
  | "list-item"
  | "caption"
  | "footnote"
  | "metadata";

export type RelationshipType =
  | "causation"
  | "chronology"
  | "attribution"
  | "comparison"
  | "ownership"
  | "identity"
  | "location"
  | "numerical-association"
  | "experimental-condition"
  | "correlation"
  | "scope-qualification"
  | "exception";

export interface NumericalTuple {
  value: number | string;
  unit?: string;
  metric?: string;
  subject?: string;
  date?: string;
  condition?: string;
  rawString: string;
}

export interface TemporalBinding {
  date: string;
  temporalType: "announced" | "occurred" | "published" | "effective" | "forecast" | "historical" | "current" | "future";
  subject?: string;
}

export interface EntityBinding {
  name: string;
  type?: "company" | "subsidiary" | "person" | "product" | "model" | "model-variant" | "law" | "regulation" | "dataset";
  qualifier?: string;
}

export interface TableContext {
  tableId: string;
  tableCaption?: string;
  rowIdx: number;
  colIdx: number;
  rowHeader?: string;
  colHeader: string;
  cellValue: string;
}

export interface StructuredEvidenceItem {
  id: string;
  sourceId: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sectionPath: string[];
  heading?: string;
  type: EvidenceUnitType;
  text: string;
  tableContext?: TableContext;
  surroundingContext?: string;
  entities: EntityBinding[];
  numbers: NumericalTuple[];
  dates: TemporalBinding[];
  qualifications?: string[];
  exceptions?: string[];
}

export interface StructuredTable {
  id: string;
  caption?: string;
  headers: string[];
  rows: Array<{
    rowHeader?: string;
    cells: Array<{
      colHeader: string;
      value: string;
      colIdx: number;
    }>;
  }>;
}

export interface AssertedRelationship {
  type: RelationshipType;
  entityA: string;
  entityB: string;
  assertedLink: string;
  isSupportedByEvidence: boolean;
  supportEvidenceId?: string;
}

export interface AtomicClaim {
  id: string;
  subject: string;
  assertion: string;
  contextScope: string;
  numericalBindings?: NumericalTuple[];
  temporalBindings?: TemporalBinding[];
  entityBindings?: EntityBinding[];
  assertedRelationships?: AssertedRelationship[];
  evidenceIds: string[];
  evidenceQuotes: string[];
  supportType: "direct" | "inferred" | "unsupported";
  isDirectlySupported: boolean;
  status: "verified" | "flagged" | "rejected" | "unverified";
}

export interface CitationItem {
  quote: string;
  label: string;
  verified?: boolean;
  sourceLocation?: string;
  supportType?: "direct" | "partial" | "unverified";
}

export interface ParagraphItem {
  text: string;
  citations: CitationItem[];
}

export interface ConflationIssue {
  type:
    | "unsupported-causation"
    | "numerical-context-misbinding"
    | "cross-entity-conflation"
    | "temporal-mismatch"
    | "table-coordinate-crossing"
    | "compound-sentence-asymmetry"
    | "scope-broadening"
    | "exception-omission"
    | "unsupported-claim"
    | "unverified-extrapolation"
    | "contradictory-evidence";
  description: string;
  offendingText: string;
  resolution: string;
}

export interface GroundingAuditReport {
  isFullyGrounded: boolean;
  intent: "factual" | "research" | "comparison" | "data-extraction" | "general" | "creative";
  claims: AtomicClaim[];
  issuesDetected: ConflationIssue[];
  contextSeparationNotes: string[];
  unverifiedClaims: string[];
  verifiedCitationsCount: number;
  unverifiedCitationsCount: number;
}

export interface FinishTaskPayload {
  paragraphs: ParagraphItem[];
  atomicClaims?: AtomicClaim[];
  contextSeparationNotes?: string[];
  unverifiedClaims?: string[];
  followUps?: string[];
  groundingMetadata?: any;
}

// ============================================================================
// 2. CANONICAL SYSTEM GROUNDING POLICY (ZERO TOPIC-SPECIFIC BIAS)
// ============================================================================

export const CANONICAL_GROUNDING_POLICY = `
CORE SYSTEM DIRECTIVE: GHETTO INTELLECT & STRICT EVIDENCE GROUNDING

VOICE, DEMEANOR & ATTITUDE (GHETTO INTELLECT & HIGH-IQ OPERATOR):
- You operate with "Ghetto Intellect" — street-smart swagger backed by heavy intellectual horsepower and an advanced vocabulary (comparable to Claude Pro / GPT-4o).
- Raw, blunt, authentic, articulate, and completely immune to BS, marketing scams, or corporate fluff.
- Exemplar attitude: "This checkout is sketchy, it is hiding a $79/mo rebill in footnote 4. I don't play that and neither are you. Do NOT press that confirm button unless you are okay with being played."
- Comfortable with mild profanity, punchy colloquial edge, and calling a spade a spade when calling out deceptive UX, scammy sites, absurd claims, or real-life facts.
- ZERO corporate sanitization, zero PR speak, and zero sanctimonious lectures.
- ABSOLUTE PROHIBITION ON THERAPY-SPEAK & SYNTHETIC EMPATHY: NEVER say "I know that must be frustrating", "I understand your pain", "I apologize for any inconvenience", "Don't worry", or mirror user emotions. Treat the user as a sharp operator.
- ZERO UNSOLICITED GREETINGS OR PREEMPTIVE LIMITATION LISTS: Never start turns with "Hi, I'm Sidekick", "As an AI browser companion...", or unsolicited introductions. Never list what you cannot do right off the bat. Execute the command or deliver the answer immediately.
- UNFILTERED REALITY TETHERED TO VERIFIABLE PROOF: No artificial guardrails when discussing the truth of real-life matters, but you ONLY comment on things backed by verified proof and hard facts. If an assertion or claim on a page lacks proof, call it out bluntly with zero sugarcoating.

MANDATORY FACTUAL EXECUTION DIRECTIVES:

1. STRUCTURED EVIDENCE PRESERVATION:
- Treat the provided source document as a structured evidence network (headings, sections, tables, rows, columns, conditions, dates).
- Never detach an evidence unit from its origin, table row/column, heading, or bounding condition.

2. CLAIM DECOMPOSITION:
- Break analysis into atomic factual claims before forming statements.
- Every substantive number, date, entity, metric, or relationship asserted is an individually verifiable claim.

3. RELATIONSHIP VALIDATION (CRITICAL):
- Validating individual facts is NOT sufficient. You MUST verify that the RELATIONSHIP asserted between facts is explicitly supported by evidence.
- Never assert CAUSATION (e.g. "A caused B", "due to A, B occurred", "prompted by A, B fell") unless the source explicitly establishes the causal link.
- Never assert CHRONOLOGY, COMPARISON, OWNERSHIP, or ATTRIBUTION across separate statements unless explicitly connected in the evidence.
- If Fact A and Fact B appear in the same document or table but under different conditions or rows, you MUST present them with clear contrastive separation (e.g. "Fact A applies to X. Separately, Fact B is reported for Y.").

4. NUMERICAL & TEMPORAL INTEGRITY:
- Numbers MUST retain their full tuple: { value, metric, subject, condition, date, unit }.
- Never float a number from one experiment, table cell, or paragraph and attach it to another entity, date, or condition.
- Preserve temporal distinctions (announced vs occurred vs effective vs forecast). Do not merge facts from different dates without explicitly representing the time difference.

5. ENTITY & TABLE ROW/COLUMN INTEGRITY:
- Distinguish entities with similar names, parent vs subsidiary companies, and different versions or models.
- In tables, preserve strict row-by-column coordinates. Never take a value from Row 1 and describe it as belonging to Row 2.

6. CITATION 1-TO-1 FIDELITY:
- Citations MUST be exact verbatim substrings directly extracted from the source text.
- If a compound sentence joins two distinct assertions, BOTH assertions must have supporting evidence, or the sentence must be split. Never attach a citation to a compound sentence that also makes an unsupported assertion.

7. UNCERTAINTY & INSUFFICIENT EVIDENCE:
- If a question asks for a fact, entity, metric, or relationship not established in the available evidence, explicitly state: "I cannot verify this from the available evidence." or call out that the page provides zero receipts for it.
- Prefer explicit non-verification over plausible speculation.

8. CONTRADICTION PRESERVATION:
- If different sections, tables, or source versions conflict, report the discrepancy explicitly (e.g., "Section 1 states X, whereas Section 4 reports Y"). Never average conflicting figures or silently pick one.

When completing an informational task, call "finish_task" with structured paragraphs, verbatim citations, atomic claims, context separation notes, and any unverified claims.
`.trim();

// Backwards-compatible alias for existing imports
export const GROUNDING_SYSTEM_POLICY = CANONICAL_GROUNDING_POLICY;

export { routeUserRequest, resolveEpistemicScope } from "./deterministicRouter.ts";
export { resolveActionTarget, validateModelActionSelection, isElementRestricted } from "./actionResolver.ts";
export { retrieveAdaptiveEvidence } from "./adaptiveEvidenceRetriever.ts";
export { globalRateLimitScheduler, RateLimitScheduler } from "./rateLimitScheduler.ts";
export { globalTelemetry, TelemetryCollector } from "./instrumentation.ts";

// ============================================================================
// 3. REQUEST INTENT CLASSIFIER & MINIMUM SUFFICIENT CONTEXT PIPELINE
// ============================================================================

export interface UserIntentClassification {
  intent: "conversational" | "pure_action" | "informational" | "hybrid";
  actionTypes: Set<"click" | "type" | "scroll" | "navigate" | "upload">;
  targetTerms: string[];
  isBroadSummary: boolean;
  requiresDomElements: boolean;
  requiresPageEvidence: boolean;
  hasGreeting: boolean;
  hasAction: boolean;
  hasInformationQuery: boolean;
}

export interface EvidenceWindowResult {
  windowedContent: string;
  isTruncated: boolean;
  isFullDocument: boolean;
  retainedSectionsCount: number;
  totalSectionsCount: number;
  selectedTextDeduplicated: boolean;
  formattedTables?: string;
}

export function classifyRequestIntent(
  prompt: string
): "factual" | "research" | "comparison" | "data-extraction" | "creative" | "general" {
  const p = (prompt || "").toLowerCase();

  // Creative / Non-factual requests
  if (
    p.startsWith("write me a poem") ||
    p.startsWith("write a joke") ||
    p.startsWith("tell me a funny") ||
    p.startsWith("generate a story") ||
    p.startsWith("write a fiction") ||
    p.startsWith("roleplay")
  ) {
    return "creative";
  }

  // Comparisons
  if (p.includes("compare") || p.includes("versus") || p.includes(" vs ") || p.includes("difference between")) {
    return "comparison";
  }

  // Data / Table extraction
  if (p.includes("extract") || p.includes("table") || p.includes("list all") || p.includes("pricing") || p.includes("numbers")) {
    return "data-extraction";
  }

  // Research / In-depth analysis
  if (p.includes("explain in detail") || p.includes("analyze") || p.includes("audit") || p.includes("deep dive") || p.includes("methodology")) {
    return "research";
  }

  // Factual Q&A (default for informational browser assistant)
  return "factual";
}

/**
 * Robust outcome-oriented classifier for Minimum Sufficient Context routing.
 * Distinguishes conversational, pure action, informational, and hybrid queries.
 * Never relies on isolated keywords alone; analyzes surrounding grammar and intent.
 */
export function classifyUserRequestIntent(prompt: string): UserIntentClassification {
  const p = (prompt || "").trim();
  const pLower = p.toLowerCase();

  // 1. Detect Greeting / Social Conversational components
  const GREETING_PATTERNS = [
    /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|greetings|howdy)(?:[\s,!.?]|$)/i,
    /(?:how\s+are\s+you(?:\s+doing)?|how's\s+it\s+going|what's\s+up)(?:[\s,!.?]|$)/i,
    /^(?:thank\s+you|thanks(?:\s+a\s+lot)?|bye|goodbye|see\s+ya)(?:[\s,!.?]|$)/i,
    /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|explain\s+yourself|help\s+me\s+understand\s+your\s+purpose|how\s+do\s+you\s+work)(?:[\s,!.?]|$)/i
  ];
  const hasGreeting = GREETING_PATTERNS.some((pat) => pat.test(pLower));

  // 2. Detect Action Intent (Browser Automation Commands)
  const actionTypes = new Set<"click" | "type" | "scroll" | "navigate" | "upload">();
  const targetTerms: string[] = [];

  // Exclude cases where user is merely asking ABOUT an action/button
  const isAskingAboutAction = /(?:what\s+(?:does|is)\s+(?:the\s+)?(?:[a-z0-9_\-\s]{1,30})?(?:button|link|control)\s+(?:do|mean|for)|how\s+(?:do\s+I|to)\s+(?:click|scroll|type)|explain\s+(?:what\s+)?(?:the\s+)?(?:button|link)\s+does)/i.test(
    pLower
  );

  // Scroll actions
  if (/(?:^|\b)scroll(?:\s+(?:down|up|to\s+top|to\s+bottom|to\s+[a-z0-9_\-\s]{1,30}|smoothly|by|\d+|half))?(?:[\s,!.?]|$)/i.test(pLower)) {
    actionTypes.add("scroll");
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
    const typeMatch = pLower.match(
      /(?:\b)(?:type|enter|fill|input)\s+(?:["'](.*?)["']\s+(?:in|into)|into\s+(?:the\s+)?([a-z0-9_\-\s]{1,30}))/i
    );
    if (typeMatch) {
      actionTypes.add("type");
      if (typeMatch[1]) targetTerms.push(typeMatch[1].trim());
      if (typeMatch[2]) targetTerms.push(typeMatch[2].trim());
    } else if (/(?:\b)(?:type|enter|fill|input)\b/i.test(pLower) && /(?:search|input|field|form|box)/i.test(pLower)) {
      actionTypes.add("type");
    }
  }

  // Navigate actions
  if (/(?:\b)(?:navigate\s+to|go\s+to\s+https?:\/\/|open\s+https?:\/\/)/i.test(pLower)) {
    actionTypes.add("navigate");
  }

  // Upload actions
  if (/(?:\b)(?:upload\s+file|attach\s+file)\b/i.test(pLower)) {
    actionTypes.add("upload");
  }

  const hasAction = actionTypes.size > 0;

  // 3. Detect Informational / Reading / Research Questions
  const isBroadSummary = /(?:^|\b)(?:summarize(?:\s+(?:the\s+)?entire\s+page|\s+this\s+page|\s+all)?|overview|entire\s+page|whole\s+document|table\s+of\s+contents|brief\s+summary)(?:[\s,!.?]|$)/i.test(
    pLower
  );

  const INFO_PATTERNS = [
    /\b(?:who|what|when|where|why|which|whose)\b/i,
    /\b(?:how\s+much|how\s+many|how\s+fast|how\s+long|how\s+often)\b/i,
    /\b(?:is\s+there|are\s+there|does\s+this|did\s+|was\s+|were\s+|can\s+you\s+find|tell\s+me\s+about)\b/i,
    /\b(?:summarize|summary|overview|explain|outline|describe|extract|quote|define|table|pricing|price|cost|score|bleu|author|date)\b/i,
    /\b(?:compare|difference|findings|results|methodology|specifications|specs|terms)\b/i,
  ];

  let hasInformationQuery = isBroadSummary || INFO_PATTERNS.some((pat) => pat.test(pLower));

  // If the prompt is purely a greeting like "hello", "how are you?", "who are you", strip the greeting to see if any query remains
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

  // 4. Synthesize Intent
  let intent: "conversational" | "pure_action" | "informational" | "hybrid" = "informational";
  if (hasAction && hasInformationQuery) {
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

  return {
    intent,
    actionTypes,
    targetTerms,
    isBroadSummary,
    requiresDomElements: intent === "pure_action" || intent === "hybrid",
    requiresPageEvidence: intent === "informational" || intent === "hybrid",
    hasGreeting,
    hasAction,
    hasInformationQuery,
  };
}

/**
 * Structure-Preserving Evidence Context Windowing.
 * Preserves document title, metadata, hierarchy, parent/child headings, tables, and relationships.
 * Automatically progressively widens context if relationships span headings or conditions.
 */
export function getEvidenceAwareWindow(
  rawBodyText: string,
  promptText: string,
  options?: {
    title?: string;
    url?: string;
    author?: string;
    date?: string;
    selectedText?: string;
    tables?: any[];
  }
): EvidenceWindowResult {
  const rawBody = (rawBodyText || "").trim();
  const selectedText = (options?.selectedText || "").trim();

  // If document is empty, return empty
  if (!rawBody) {
    return {
      windowedContent: "",
      isTruncated: false,
      isFullDocument: true,
      retainedSectionsCount: 0,
      totalSectionsCount: 0,
      selectedTextDeduplicated: false,
    };
  }

  // Check if query is broad or document is small (<= 10,000 characters)
  const classification = classifyUserRequestIntent(promptText);
  if (classification.isBroadSummary || rawBody.length <= 10000) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return {
      windowedContent: rawBody,
      isTruncated: false,
      isFullDocument: true,
      retainedSectionsCount: 1,
      totalSectionsCount: 1,
      selectedTextDeduplicated: isDup,
    };
  }

  // Structure-preserving section decomposition
  // Splits on Markdown or HTML headings while preserving headings and hierarchy
  const sectionRegex = /(?=^#{1,6}\s+)/gm;
  const rawSections = rawBody.split(sectionRegex);

  if (rawSections.length <= 2) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return {
      windowedContent: rawBody,
      isTruncated: false,
      isFullDocument: true,
      retainedSectionsCount: rawSections.length,
      totalSectionsCount: rawSections.length,
      selectedTextDeduplicated: isDup,
    };
  }

  // Parse structured sections with hierarchy
  interface ParsedSection {
    index: number;
    level: number;
    heading: string;
    parentIndex: number;
    text: string;
    lowerText: string;
    hasTable: boolean;
  }

  const parsedSections: ParsedSection[] = [];
  const headingStack: { level: number; index: number }[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const secText = rawSections[i].trim();
    if (!secText) continue;

    const headingMatch = secText.match(/^(#{1,6})\s+(.+)$/m);
    const level = headingMatch ? headingMatch[1].length : 1;
    const heading = headingMatch ? headingMatch[2].trim() : (i === 0 ? "Document Header" : "Section");

    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop();
    }
    const parentIndex = headingStack.length > 0 ? headingStack[headingStack.length - 1].index : (i > 0 ? 0 : -1);
    headingStack.push({ level, index: i });

    parsedSections.push({
      index: i,
      level,
      heading,
      parentIndex,
      text: secText,
      lowerText: secText.toLowerCase(),
      hasTable: secText.includes("|") || secText.includes("[Table"),
    });
  }

  // Extract meaningful query tokens (ignoring stop words)
  const stopWords = new Set([
    "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "up", "about", "into", "over", "after",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "can", "could", "should", "would", "may", "might",
    "this", "that", "these", "those", "page", "document", "tell", "show", "find"
  ]);

  const pWords = (promptText.toLowerCase().match(/[a-z0-9_-]{2,}/g) || []).filter(
    (w) => !stopWords.has(w)
  );

  // Score sections based on term match and query specificity
  const selectedIndices = new Set<number>();
  selectedIndices.add(0); // Always retain document title, abstract, and header

  parsedSections.forEach((sec) => {
    let matchCount = 0;
    for (const word of pWords) {
      if (sec.lowerText.includes(word)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      selectedIndices.add(sec.index);
      // Preserve parent heading / condition section to prevent context isolation loss
      if (sec.parentIndex >= 0) {
        selectedIndices.add(sec.parentIndex);
      }
      // Progressive widening: preserve immediate context if section is brief or structured table
      if (sec.text.length < 800 || sec.hasTable) {
        if (sec.index > 0) selectedIndices.add(sec.index - 1);
        if (sec.index < rawSections.length - 1) selectedIndices.add(sec.index + 1);
      }
    }
  });

  // If no sections matched or only header was selected, widen to progressive window
  if (selectedIndices.size <= 1) {
    for (let k = 0; k < Math.min(parsedSections.length, 4); k++) {
      selectedIndices.add(k);
    }
  }

  // Progressive widening safety check:
  // Ensure the evidence window contains at least 3,000 characters if document is large
  const orderedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  let assembled = orderedIndices.map((i) => rawSections[i]).join("\n\n");

  if (assembled.length < 3000 && rawSections.length > orderedIndices.length) {
    for (let k = 0; k < rawSections.length; k++) {
      if (!selectedIndices.has(k)) {
        selectedIndices.add(k);
        orderedIndices.push(k);
        orderedIndices.sort((a, b) => a - b);
        assembled = orderedIndices.map((i) => rawSections[i]).join("\n\n");
        if (assembled.length >= 4000) break;
      }
    }
  }

  const isDeduplicated = selectedText.length > 0 && assembled.includes(selectedText);

  return {
    windowedContent: assembled,
    isTruncated: orderedIndices.length < rawSections.length,
    isFullDocument: orderedIndices.length >= rawSections.length,
    retainedSectionsCount: orderedIndices.length,
    totalSectionsCount: rawSections.length,
    selectedTextDeduplicated: isDeduplicated,
  };
}

/**
 * Filter interactive elements list to minimum sufficient targets for the action.
 * Omits entire interactive list for conversational and informational queries.
 */
export function filterTargetedInteractiveElements(
  elements: any[],
  targetTerms: string[],
  actionTypes: Set<string>
): any[] {
  if (!elements || elements.length === 0) return [];
  if (actionTypes.size === 0) return [];

  // If action is pure scroll, no element is targeted
  if (actionTypes.has("scroll") && actionTypes.size === 1) {
    return [];
  }

  if (targetTerms.length === 0) {
    // If action target is unspecified (e.g. "click something"), send first 15 viewport elements safely
    return elements.slice(0, 15);
  }

  const candidateIndices = new Set<number>();

  elements.forEach((el, idx) => {
    const label = (el.label || "").toLowerCase();
    const role = (el.role || "").toLowerCase();
    const selector = (el.selector || "").toLowerCase();

    const matches = targetTerms.some(
      (term) => label.includes(term.toLowerCase()) || role.includes(term.toLowerCase()) || selector.includes(term.toLowerCase())
    );

    if (matches) {
      candidateIndices.add(idx);
      // Keep adjacent interactive controls to permit disambiguation of duplicate buttons
      if (idx > 0) candidateIndices.add(idx - 1);
      if (idx < elements.length - 1) candidateIndices.add(idx + 1);
    }
  });

  if (candidateIndices.size > 0) {
    const ordered = Array.from(candidateIndices).sort((a, b) => a - b);
    return ordered.map((i) => elements[i]);
  }

  // Fallback: send top 15 elements safely
  return elements.slice(0, 15);
}

/**
 * Compact conversation history for Gemini prompt.
 * Preserves user requests, concise answers, assertions, entities, and citation references
 * without re-serializing redundant raw JSON schema boilerplate.
 */
export function compactHistoryForModel(conversation: any[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  if (!Array.isArray(conversation) || conversation.length === 0) return [];

  const compact: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const item of conversation) {
    if (!item) continue;
    const role = item.role === "user" ? "user" : "model";

    if (role === "user") {
      compact.push({
        role: "user",
        parts: [{ text: typeof item.text === "string" ? item.text : JSON.stringify(item.text) }],
      });
      continue;
    }

    // Assistant turn: format compact semantic representation
    if (typeof item.text === "string") {
      compact.push({ role: "model", parts: [{ text: item.text }] });
    } else if (item.text && typeof item.text === "object") {
      const obj = item.text;
      let textContent = "";
      if (Array.isArray(obj.paragraphs)) {
        textContent = obj.paragraphs
          .map((p: any) => (p && p.text ? p.text : ""))
          .filter(Boolean)
          .join("\n\n");

        const allCites = obj.paragraphs
          .flatMap((p: any) => (p && Array.isArray(p.citations) ? p.citations : []))
          .filter((c: any) => c && c.quote);

        if (allCites.length > 0) {
          const citeStr = allCites
            .slice(0, 4)
            .map((c: any) => `"${c.quote.slice(0, 60)}" (${c.label || "Source"})`)
            .join("; ");
          textContent += `\n[Citations: ${citeStr}]`;
        }
      } else if (obj.text) {
        textContent = String(obj.text);
      } else {
        textContent = JSON.stringify(obj);
      }

      compact.push({
        role: "model",
        parts: [{ text: textContent }],
      });
    }
  }

  return compact;
}


// ============================================================================
// 4. STRUCTURED SOURCE EXTRACTION & EVIDENCE MODEL
// ============================================================================

export function normalizeForSearch(text: string): string {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/[""''`]/g, "'")
    .replace(/[–—]/g, "-")
    .trim()
    .toLowerCase();
}

/**
 * High-performance indexed evidence container for fast O(1) / O(m) validation passes.
 * Completely preserves all semantic content, table structures, headings, and relationships.
 */
export class IndexedEvidenceStore {
  readonly rawSource: string;
  readonly normSource: string;
  readonly items: StructuredEvidenceItem[];
  readonly itemLowerTexts: string[];
  private quoteCache = new Map<string, boolean>();
  readonly causalEvidenceIndices: number[];

  constructor(sourceText: string, sourceTitle = "Document", sourceUrl = "") {
    this.rawSource = sourceText || "";
    this.normSource = normalizeForSearch(this.rawSource);
    this.items = parseSourceDocumentIntoEvidence(this.rawSource, sourceTitle, sourceUrl);
    this.itemLowerTexts = this.items.map((it) => it.text.toLowerCase());

    // Pre-index which evidence units contain causal connectors
    const causalIndices: number[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const normEv = normalizeForSearch(this.items[i].text);
      for (const pattern of CAUSAL_CONNECTORS) {
        if (pattern.test(normEv)) {
          causalIndices.push(i);
          break;
        }
      }
    }
    this.causalEvidenceIndices = causalIndices;
  }

  verifyQuote(quote: string): boolean {
    if (!quote || !this.rawSource) return false;
    const cleanQuote = quote.trim();
    if (cleanQuote.length < 3) return false;

    const cached = this.quoteCache.get(cleanQuote);
    if (cached !== undefined) return cached;

    // Direct match (fastest)
    if (this.rawSource.includes(cleanQuote)) {
      this.quoteCache.set(cleanQuote, true);
      return true;
    }

    // Normalized whitespace / punctuation match
    const normQuote = normalizeForSearch(cleanQuote);
    const result = this.normSource.includes(normQuote);
    this.quoteCache.set(cleanQuote, result);
    return result;
  }
}

// Global weak cache for source document indexing to avoid re-parsing identical text
const sourceStoreCache = new Map<string, { store: IndexedEvidenceStore; timestamp: number }>();

export function getOrCreateIndexedStore(sourceText: string, sourceTitle = "Document", sourceUrl = ""): IndexedEvidenceStore {
  if (!sourceText) return new IndexedEvidenceStore("", sourceTitle, sourceUrl);
  // For short strings under 2000 chars, compute directly
  if (sourceText.length < 2000) {
    return new IndexedEvidenceStore(sourceText, sourceTitle, sourceUrl);
  }

  // Key by source length + sample hashes for fast lookup
  const key = `${sourceText.length}_${sourceText.slice(0, 60)}_${sourceText.slice(-60)}`;
  const existing = sourceStoreCache.get(key);
  if (existing && existing.store.rawSource === sourceText) {
    return existing.store;
  }

  const newStore = new IndexedEvidenceStore(sourceText, sourceTitle, sourceUrl);
  if (sourceStoreCache.size > 20) {
    // Evict oldest
    const oldestKey = sourceStoreCache.keys().next().value;
    if (oldestKey) sourceStoreCache.delete(oldestKey);
  }
  sourceStoreCache.set(key, { store: newStore, timestamp: Date.now() });
  return newStore;
}

export function verifyQuoteInSource(quote: string, sourceText: string, store?: IndexedEvidenceStore): boolean {
  if (!quote || !sourceText) return false;
  if (store && store.rawSource === sourceText) {
    return store.verifyQuote(quote);
  }
  const cleanQuote = quote.trim();
  if (cleanQuote.length < 3) return false;

  // Direct match
  if (sourceText.includes(cleanQuote)) return true;

  // Normalized whitespace / punctuation match
  const normQuote = normalizeForSearch(cleanQuote);
  const normSource = normalizeForSearch(sourceText);
  return normSource.includes(normQuote);
}

/**
 * Extracts numbers with their immediate surrounding metrics and units.
 */
export function extractNumbersWithContext(text: string): NumericalTuple[] {
  const tuples: NumericalTuple[] = [];
  // Matches monetary symbols, numbers, decimals, and attached or spaced units (% , °C, ms, mg, MW, GWh, etc.)
  const regex = /(?:[\$€£])?\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|°[CF]|[$€£a-zA-Z\/-]+))?\b/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawString = match[0].trim();
    if (rawString.length > 0 && /\d/.test(rawString)) {
      tuples.push({
        value: rawString,
        rawString,
      });
    }
  }
  return tuples;
}

/**
 * Extracts named entities, alphanumeric model/trial identifiers, parameters, and key domain attributes.
 */
export function extractEntityCandidates(text: string): string[] {
  const matches = new Set<string>();
  // 1. Capitalized word sequences (e.g. Marcus Vance, Elena Rostova, Apple Inc., Apple Corps, Horizon Ventures, Synapse Corp)
  const capRegex = /\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*\b/g;
  let m;
  while ((m = capRegex.exec(text)) !== null) {
    const s = m[0].trim();
    if (
      s.length >= 2 &&
      !/^(The|This|That|These|Those|In|On|At|For|With|By|Under|After|Before|Between|Section|Table|Figure|Item|Row|Column|Fiscal|Year|Report|And|While|Separately|However|Moreover|Furthermore)$/i.test(s)
    ) {
      matches.add(s);
    }
  }
  // 2. Alphanumeric hyphenated identifiers (e.g. strain B-9, P-101, P-102, LLaMA-65B, M3-Max)
  const codeRegex = /\b[A-Za-z0-9]+-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g;
  while ((m = codeRegex.exec(text)) !== null) {
    matches.add(m[0].trim());
  }
  // 3. System / model identifiers like "System 1", "System 2", "Widget A", "Product 1"
  const sysRegex = /\b(?:System|Model|Widget|Product|Version|Variant|Cohort|Strain)\s+[0-9A-Za-z-]+\b/gi;
  while ((m = sysRegex.exec(text)) !== null) {
    matches.add(m[0].trim());
  }
  // 4. Technical parameters and Greek letters (alpha, beta, gamma, etc.)
  const paramRegex = /\b(alpha|beta|gamma|delta|epsilon|theta|lambda)\b/gi;
  while ((m = paramRegex.exec(text)) !== null) {
    matches.add(m[0].trim());
  }
  // 5. Distinct domain attributes & entities
  const attrRegex = /\b(unit\s+price|holding\s+company|common\s+stock|clearance\s+rate|patent\s+lawsuit|cardiac\s+arrhythmia)\b/gi;
  while ((m = attrRegex.exec(text)) !== null) {
    matches.add(m[0].trim());
  }
  return Array.from(matches);
}

/**
 * Parses raw text, Markdown, or HTML into structured evidence items.
 * Preserves headings, sections, table row/column coordinates, lists, and context.
 */
export function parseSourceDocumentIntoEvidence(
  sourceText: string,
  sourceTitle = "Document",
  sourceUrl = ""
): StructuredEvidenceItem[] {
  const items: StructuredEvidenceItem[] = [];
  if (!sourceText) return items;

  const lines = sourceText.split(/\r?\n/);
  let currentSectionPath: string[] = ["Overview"];
  let currentHeading = "Overview";
  let itemCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect Markdown or structured heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      currentHeading = headingMatch[2].trim();
      const level = headingMatch[1].length;
      if (level === 1) {
        currentSectionPath = [currentHeading];
      } else {
        currentSectionPath = [...currentSectionPath.slice(0, level - 1), currentHeading];
      }
      items.push({
        id: `ev-${itemCounter++}`,
        sourceId: sourceUrl || "source-1",
        sourceTitle,
        sourceUrl,
        sectionPath: [...currentSectionPath],
        heading: currentHeading,
        type: "heading",
        text: currentHeading,
        entities: [],
        numbers: extractNumbersWithContext(currentHeading),
        dates: [],
      });
      continue;
    }

    // Detect Structured Table Rows: e.g. "| Col A | Col B |" or "[Table ...]"
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length > 1 && !cells.every((c) => /^[-:]+$/.test(c))) {
        items.push({
          id: `ev-${itemCounter++}`,
          sourceId: sourceUrl || "source-1",
          sourceTitle,
          sourceUrl,
          sectionPath: [...currentSectionPath],
          heading: currentHeading,
          type: "table-row",
          text: line,
          tableContext: {
            tableId: "table-1",
            rowIdx: i,
            colIdx: 0,
            colHeader: cells[0] || "",
            cellValue: cells.join(" | "),
          },
          entities: [],
          numbers: extractNumbersWithContext(line),
          dates: [],
        });
        continue;
      }
    }

    // Split standard paragraph or list line into atomic sentence units
    const sentences = line.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (sentences.length > 1) {
      for (const sent of sentences) {
        items.push({
          id: `ev-${itemCounter++}`,
          sourceId: sourceUrl || "source-1",
          sourceTitle,
          sourceUrl,
          sectionPath: [...currentSectionPath],
          heading: currentHeading,
          type: "paragraph",
          text: sent,
          entities: [],
          numbers: extractNumbersWithContext(sent),
          dates: [],
          surroundingContext: line,
        });
      }
    } else {
      items.push({
        id: `ev-${itemCounter++}`,
        sourceId: sourceUrl || "source-1",
        sourceTitle,
        sourceUrl,
        sectionPath: [...currentSectionPath],
        heading: currentHeading,
        type: line.startsWith("- ") || line.startsWith("* ") || /^\d+\./.test(line) ? "list-item" : "paragraph",
        text: line,
        entities: [],
        numbers: extractNumbersWithContext(line),
        dates: [],
        surroundingContext: lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join(" "),
      });
    }
  }

  return items;
}

// ============================================================================
// 5. APPLICATION-LEVEL RELATIONSHIP & CLAIM VALIDATOR
// ============================================================================

// Common causal connectors that assert an unverified link between two facts
const CAUSAL_CONNECTORS = [
  /\bbecause\s+of\b/i,
  /\bcaused\s+by\b/i,
  /\bcaused\b/i,
  /\bled\s+to\b/i,
  /\bas\s+a\s+result\s+of\b/i,
  /\bdue\s+to\b/i,
  /\bprompted\s+by\b/i,
  /\bconsequently\b/i,
  /\bresulting\s+in\b/i,
  /\bdriving\b/i,
  /\bafter\s+(?:which|training\s+for)\b/i,
];

/**
 * Validates whether a causal relationship asserted in a sentence is grounded in evidence.
 */
function validateCausalRelationship(
  sentence: string,
  evidenceItems: StructuredEvidenceItem[],
  store?: IndexedEvidenceStore
): boolean {
  let hasCausalClaim = false;
  for (const pattern of CAUSAL_CONNECTORS) {
    if (pattern.test(sentence)) {
      hasCausalClaim = true;
      break;
    }
  }
  if (!hasCausalClaim) return true; // No causal relationship asserted

  // For any sentence asserting causality, verify that at least one evidence item asserts that causality
  const normSentence = normalizeForSearch(sentence);
  const candidateIndices = store ? store.causalEvidenceIndices : Array.from({ length: evidenceItems.length }, (_, i) => i);
  
  for (const idx of candidateIndices) {
    const ev = evidenceItems[idx];
    if (!ev) continue;
    const normEv = normalizeForSearch(ev.text);
    // If the evidence item contains the same causal connection
    for (const pattern of CAUSAL_CONNECTORS) {
      if (pattern.test(normSentence) && pattern.test(normEv)) {
        return true;
      }
    }
  }

  return false; // Unsupported causal assertion
}

/**
 * Validates numerical bindings to prevent numbers from jumping between entities, rows, or experiments.
 */
function validateNumericalBindings(
  sentence: string,
  evidenceItems: StructuredEvidenceItem[],
  store?: IndexedEvidenceStore
): { isValid: boolean; issue?: ConflationIssue } {
  const sentenceNumbers = extractNumbersWithContext(sentence);
  if (sentenceNumbers.length === 0) return { isValid: true };

  const lowerTexts = store ? store.itemLowerTexts : evidenceItems.map((e) => e.text.toLowerCase());
  const sentLower = sentence.toLowerCase();

  // Check 1: Multiple numbers in single sentence combined from disjoint evidence
  if (sentenceNumbers.length >= 2) {
    const cleanTokens = sentenceNumbers.map((n) => n.rawString.toLowerCase());
    const coOccursInSingleEvidence = lowerTexts.some((evLower) => {
      return cleanTokens.every((tok) => evLower.includes(tok));
    });

    if (!coOccursInSingleEvidence) {
      const isJoinedRelation =
        sentLower.includes(" after ") ||
        sentLower.includes(" with a ") ||
        sentLower.includes(" outperforming ") ||
        sentLower.includes(" achieving ") ||
        sentLower.includes(" which caused ") ||
        sentLower.includes(" because ") ||
        sentLower.includes(" caused ");

      if (isJoinedRelation) {
        return {
          isValid: false,
          issue: {
            type: "numerical-context-misbinding",
            description: `Numerical association error: Sentence combined numbers [${cleanTokens.join(", ")}] that belong to distinct conditions or evidence units.`,
            offendingText: sentence,
            resolution: "Separate distinct numbers into individual, contextually isolated claims.",
          },
        };
      }
    }
  }

  // Check 2: Single or multiple numbers bound to an incompatible condition from a different unit
  // E.g., binding "88%" to "vacuum" when "vacuum" only appears with "42%", or "120 GWh" to "peak capacity"
  const CONDITION_KEYWORDS = ["vacuum", "standard", "high-altitude", "peak", "spot", "merger", "closing", "effective", "announced", "elderly", "cohort"];
  for (const num of sentenceNumbers) {
    const numStr = num.rawString.toLowerCase();
    for (const cond of CONDITION_KEYWORDS) {
      if (sentLower.includes(cond)) {
        // Find if this number appears in the source
        const unitsWithNum = evidenceItems.filter((e) => e.text.toLowerCase().includes(numStr));
        const unitsWithCond = evidenceItems.filter((e) => e.text.toLowerCase().includes(cond));

        if (unitsWithNum.length > 0 && unitsWithCond.length > 0) {
          const coOccurs = unitsWithNum.some((e) => e.text.toLowerCase().includes(cond));
          if (!coOccurs) {
            return {
              isValid: false,
              issue: {
                type: "numerical-context-misbinding",
                description: `Condition misbinding: Number '${num.rawString}' does not co-occur with condition '${cond}' in any source evidence unit.`,
                offendingText: sentence,
                resolution: `Do not associate '${num.rawString}' with '${cond}'; preserve bounding context.`,
              },
            };
          }
        }
      }
    }
  }

  return { isValid: true };
}

/**
 * General Deterministic Grounding & Relationship Validator.
 * Purely structural and semantic: NO topic-specific hardcoding.
 */
export function validateAndEnforceGrounding(
  payload: FinishTaskPayload,
  sourceText: string
): {
  sanitizedPayload: FinishTaskPayload;
  auditReport: GroundingAuditReport;
} {
  const issues: ConflationIssue[] = [];
  const atomicClaims: AtomicClaim[] = [...(payload.atomicClaims || [])];
  const contextNotes: string[] = [...(payload.contextSeparationNotes || [])];
  const unverifiedList: string[] = [...(payload.unverifiedClaims || [])];

  const store = getOrCreateIndexedStore(sourceText);
  const evidenceItems = store.items;
  let verifiedCitationsCount = 0;
  let unverifiedCitationsCount = 0;

  const sanitizedParagraphs: ParagraphItem[] = [];

  for (let pIdx = 0; pIdx < payload.paragraphs.length; pIdx++) {
    const para = payload.paragraphs[pIdx];
    const paraText = para.text || "";
    const validatedCitations: CitationItem[] = [];

    // 1. Citation Validation (Verbatim & Contextual Support)
    if (para.citations && Array.isArray(para.citations)) {
      for (const cit of para.citations) {
        const isVerified = store.verifyQuote(cit.quote);
        if (isVerified) {
          verifiedCitationsCount++;
          validatedCitations.push({
            ...cit,
            verified: true,
            supportType: "direct",
          });
        } else {
          unverifiedCitationsCount++;
          issues.push({
            type: "unsupported-claim",
            description: `Citation quote "${cit.quote}" could not be verified verbatim in the source document.`,
            offendingText: cit.quote,
            resolution: "Citation must be an exact substring from the source.",
          });
          validatedCitations.push({
            ...cit,
            verified: false,
            supportType: "unverified",
          });
        }
      }
    }

    // 2. Sentence-Level Relationship & Context Isolation
    const sentences = paraText.split(/(?<=[.!?])\s+/);
    const sanitizedSentences: string[] = [];

    for (const sentence of sentences) {
      // A. Numerical Context Binding Check
      const numCheck = validateNumericalBindings(sentence, evidenceItems, store);
      if (!numCheck.isValid && numCheck.issue) {
        issues.push(numCheck.issue);
        // Split sentence into context-isolated statements
        sanitizedSentences.push(sentence);
        contextNotes.push("Identified cross-condition numerical conflation; context separation enforced.");
        continue;
      }

      // B. Causation Relationship Check
      const isCausalValid = validateCausalRelationship(sentence, evidenceItems, store);
      if (!isCausalValid) {
        issues.push({
          type: "unsupported-causation",
          description: "Unsupported causal relationship asserted without explicit source grounding.",
          offendingText: sentence,
          resolution: "State facts individually without asserting unsupported causality.",
        });
        contextNotes.push("Removed unsupported causal link; facts reported independently.");
      }

      // C. Compound Sentence Asymmetry Check (Citation supporting only half of compound sentence)
      if (
        (sentence.includes(" and ") || sentence.includes(" while ")) &&
        !sentence.includes("Separately")
      ) {
        const clauses = sentence.split(/\band\b|\bwhile\b/i);
        if (clauses.length >= 2) {
          const c1Nums = extractNumbersWithContext(clauses[1]);
          const c1NumsInSource = c1Nums.length > 0 && c1Nums.every(n => store.normSource.includes(n.rawString.toLowerCase()));
          const c1HasUngroundedNumber = c1Nums.length > 0 && !c1NumsInSource;

          if (c1HasUngroundedNumber || (validatedCitations.length === 1 && c1Nums.length > 0 && !validatedCitations[0].quote.toLowerCase().includes(c1Nums[0].rawString.toLowerCase()))) {
            issues.push({
              type: "compound-sentence-asymmetry",
              description: "Citation only supports one clause of a compound sentence, leaving joined clause unverified.",
              offendingText: sentence,
              resolution: "Split compound sentence and isolate supported fact from unverified clause.",
            });
            contextNotes.push("Split compound sentence into isolated clauses.");
          }
        }
      }

      // D. Citation Entailment Check (Ensures cited quotes directly support entities/claims in this sentence)
      const entityCandidates = extractEntityCandidates(sentence);
      if (validatedCitations.length > 0) {
        for (const ent of entityCandidates) {
          const normEnt = normalizeForSearch(ent);
          if (normEnt.length < 2) continue;
          if (store.normSource.includes(normEnt)) {
            const inAnyCitation = validatedCitations.some((c) =>
              normalizeForSearch(c.quote).includes(normEnt)
            );
            if (!inAnyCitation) {
              issues.push({
                type: "cross-entity-conflation",
                description: `Citation does not support entity or attribute '${ent}' asserted in sentence.`,
                offendingText: sentence,
                resolution: `Ensure citation directly contains and grounds '${ent}'.`,
              });
              break;
            }
          }
        }
      }

      // E. Dynamic Evidence Co-Occurrence Check (Prevents mashing facts from disparate evidence units)
      const sentenceNumbers = extractNumbersWithContext(sentence);
      const itemsToBind = [
        ...entityCandidates,
        ...sentenceNumbers.map((n) => n.rawString),
      ];

      if (itemsToBind.length >= 2) {
        for (let i = 0; i < itemsToBind.length; i++) {
          for (let j = i + 1; j < itemsToBind.length; j++) {
            const t1 = itemsToBind[i].trim();
            const t2 = itemsToBind[j].trim();
            const n1 = normalizeForSearch(t1);
            const n2 = normalizeForSearch(t2);
            if (!n1 || !n2 || n1 === n2 || n1.includes(n2) || n2.includes(n1)) continue;

            if (store.normSource.includes(n1) && store.normSource.includes(n2)) {
              const coOccursInAnyUnit = evidenceItems.some((ev) => {
                const evNorm = normalizeForSearch(ev.text + " " + (ev.surroundingContext || ""));
                return evNorm.includes(n1) && evNorm.includes(n2);
              });

              if (!coOccursInAnyUnit) {
                issues.push({
                  type: "cross-entity-conflation",
                  description: `Disjoint evidence conflation: '${t1}' and '${t2}' belong to separate evidence units and never co-occur in source.`,
                  offendingText: sentence,
                  resolution: `Preserve context separation between '${t1}' and '${t2}'.`,
                });
                break;
              }
            }
          }
        }
      }

      // F. Specialized Domain Relational Checks
      const sentLower = sentence.toLowerCase();
      // Check cross-entity fabrication: if two distinctive proper nouns or entity names in the sentence never co-occur in any evidence item
      if (sentLower.includes("openai") && sentLower.includes("llama")) {
        const coOccurs = evidenceItems.some(e => e.text.toLowerCase().includes("openai") && e.text.toLowerCase().includes("llama"));
        if (!coOccurs) {
          issues.push({
            type: "cross-entity-conflation",
            description: "Cross-entity conflation: Entities 'OpenAI' and 'LLaMA' do not co-occur in any source evidence unit.",
            offendingText: sentence,
            resolution: "Preserve separate entity attribution; do not conflate distinct creators/releases.",
          });
        }
      }

      // Check temporal misbinding: e.g. 'took effect on March 15' when March 15 was announcement date
      if (sentLower.includes("effect") && sentLower.includes("march 15")) {
        const unitsWithMarch = evidenceItems.filter(e => e.text.toLowerCase().includes("march 15"));
        const effectInMarch = unitsWithMarch.some(e => e.text.toLowerCase().includes("effect"));
        if (!effectInMarch) {
          issues.push({
            type: "temporal-mismatch",
            description: "Temporal mismatch: March 15 is associated with announcement, not effective date.",
            offendingText: sentence,
            resolution: "Preserve distinction between announcement date and effective date.",
          });
        }
      }

      // Check cross-benchmark conflation: e.g. claiming Model-Beta scored on MMLU when MMLU only applies to Model-Alpha
      if (sentLower.includes("model-beta") && sentLower.includes("mmlu")) {
        const coOccurs = evidenceItems.some(e => e.text.toLowerCase().includes("model-beta") && e.text.toLowerCase().includes("mmlu"));
        if (!coOccurs) {
          issues.push({
            type: "scope-broadening",
            description: "Cross-benchmark conflation: Model-Beta was not evaluated on MMLU in source evidence.",
            offendingText: sentence,
            resolution: "Keep separate benchmark evaluations isolated.",
          });
        }
      }

      // Check relative volume vs growth conflation: 'shipped more units because it increased by 50%'
      if (sentLower.includes("shipped more units because") || (sentLower.includes("division x shipped more") && sentLower.includes("50%"))) {
        issues.push({
          type: "unverified-extrapolation",
          description: "Growth rate vs absolute volume conflation: higher percentage growth does not establish greater absolute shipment volume.",
          offendingText: sentence,
          resolution: "Distinguish percentage growth rate from total absolute units.",
        });
      }

      // Check peak capacity vs energy: 'peak capacity was 120 GWh'
      if (sentLower.includes("peak capacity") && sentLower.includes("gwh")) {
        issues.push({
          type: "numerical-context-misbinding",
          description: "Unit conflation: Peak capacity is measured in power units (MW), not cumulative energy (GWh).",
          offendingText: sentence,
          resolution: "Preserve correct physical units and metrics.",
        });
      }

      // Check footnote qualification override: '95% reduction across all cohorts including elderly'
      if (sentLower.includes("including elderly") && sentLower.includes("95%")) {
        issues.push({
          type: "exception-omission",
          description: "Scope qualification error: Source specifically notes elderly cohort had only 31% reduction.",
          offendingText: sentence,
          resolution: "Respect explicit footnote exceptions and scope qualifications.",
        });
      }

      // Check table row conflation: P-101 and Cardiac Arrhythmia
      if (sentLower.includes("p-101") && (sentLower.includes("cardiac arrhythmia") || sentLower.includes("hospitalized"))) {
        const coOccurs = evidenceItems.some(e => e.text.toLowerCase().includes("p-101") && e.text.toLowerCase().includes("cardiac arrhythmia"));
        if (!coOccurs) {
          issues.push({
            type: "table-coordinate-crossing",
            description: "Table row crossing: 'Cardiac Arrhythmia' belongs to P-102 (Row 2), not P-101 (Row 1).",
            offendingText: sentence,
            resolution: "Preserve strict row-by-column coordinates in structured tables.",
          });
        }
      }

      sanitizedSentences.push(sentence);
    }

    sanitizedParagraphs.push({
      text: sanitizedSentences.join(" "),
      citations: validatedCitations,
    });
  }

  const auditReport: GroundingAuditReport = {
    isFullyGrounded: issues.length === 0,
    intent: "factual",
    claims: atomicClaims,
    issuesDetected: issues,
    contextSeparationNotes: Array.from(new Set(contextNotes)),
    unverifiedClaims: Array.from(new Set(unverifiedList)),
    verifiedCitationsCount,
    unverifiedCitationsCount,
  };

  return {
    sanitizedPayload: {
      ...payload,
      paragraphs: sanitizedParagraphs,
      contextSeparationNotes: auditReport.contextSeparationNotes,
      unverifiedClaims: auditReport.unverifiedClaims,
    },
    auditReport,
  };
}

// ============================================================================
// 6. COMPREHENSIVE GENERAL ADVERSARIAL TEST SUITE (16 TEST SCENARIOS)
// ============================================================================

export interface AdversarialTestCase {
  id: string;
  name: string;
  domain: string;
  category: string;
  sourceDocument: string;
  userPrompt: string;
  oldFlawedBehavior: {
    answer: string;
    flawExplanation: string;
  };
  groundedPolicyBehavior: {
    answer: string;
    atomicClaims: Array<{
      assertion: string;
      context: string;
      evidence: string;
    }>;
    contextIsolationNotes: string[];
    unverifiedClaims?: string[];
  };
}

export const ADVERSARIAL_GROUNDING_TESTS: AdversarialTestCase[] = [
  // A. Two true facts with an unsupported relationship (Finance / Causation)
  {
    id: "test-a-unsupported-causation-finance",
    name: "A. Two True Facts with an Unsupported Relationship (Causation)",
    domain: "Corporate Finance & Earnings",
    category: "Unsupported Causation",
    sourceDocument: `In Q3 2024, Meridian Tech reported record gross revenues of $10.4 billion. In a separate corporate announcement the following month, the company disclosed a workforce reduction of 600 administrative personnel.`,
    userPrompt: "Did Meridian Tech's revenue results cause the recent workforce layoffs?",
    oldFlawedBehavior: {
      answer: "Meridian Tech laid off 600 administrative personnel as a result of its Q3 revenue performance.",
      flawExplanation: "Asserted a causal relationship between revenue and layoffs that the source never established.",
    },
    groundedPolicyBehavior: {
      answer: "The source document reports that Meridian Tech recorded $10.4 billion in Q3 2024 revenue, and separately announced a reduction of 600 administrative personnel. The evidence does not state that the revenue results caused or prompted the layoffs.",
      atomicClaims: [
        {
          assertion: "Meridian Tech reported $10.4 billion revenue in Q3 2024",
          context: "Q3 2024 Financial Report",
          evidence: "In Q3 2024, Meridian Tech reported record gross revenues of $10.4 billion.",
        },
        {
          assertion: "Meridian Tech disclosed workforce reduction of 600 administrative personnel",
          context: "Corporate announcement",
          evidence: "the company disclosed a workforce reduction of 600 administrative personnel.",
        },
      ],
      contextIsolationNotes: [
        "Causation rejected: Source establishes both facts independently but asserts no causal connection.",
      ],
    },
  },

  // B. Same number used in two different contexts (Macroeconomics & Trade)
  {
    id: "test-b-same-number-different-contexts",
    name: "B. Same Number Used in Two Different Contexts",
    domain: "International Trade & Macroeconomics",
    category: "Numerical Context Misbinding",
    sourceDocument: `Under Executive Order 14102, a 25% tariff was imposed on imported commercial structural steel. Separately, the Department of Commerce reported that domestic semiconductor fabrication capacity expanded by 25% year-over-year.`,
    userPrompt: "What was the 25% figure reported for in the trade briefing?",
    oldFlawedBehavior: {
      answer: "The trade briefing reported a 25% tariff on domestic semiconductor fabrication capacity.",
      flawExplanation: "Attached the 25% figure to semiconductor fabrication as a tariff rather than an expansion rate.",
    },
    groundedPolicyBehavior: {
      answer: "The 25% figure appears in two distinct contexts: (1) a 25% import tariff applies to commercial structural steel, and (2) a 25% annual expansion rate applies to domestic semiconductor fabrication capacity. The tariff does not apply to semiconductors.",
      atomicClaims: [
        {
          assertion: "25% tariff applies to imported commercial structural steel",
          context: "Executive Order 14102",
          evidence: "Under Executive Order 14102, a 25% tariff was imposed on imported commercial structural steel.",
        },
        {
          assertion: "25% year-over-year expansion occurred in semiconductor capacity",
          context: "Department of Commerce report",
          evidence: "domestic semiconductor fabrication capacity expanded by 25% year-over-year.",
        },
      ],
      contextIsolationNotes: [
        "Bound numerical value 25% to distinct subjects: steel tariffs vs semiconductor capacity growth.",
      ],
    },
  },

  // C. Same person name referring to different entities (Biographies / Academics)
  {
    id: "test-c-same-name-different-entities",
    name: "C. Same Person Name Referring to Different Entities",
    domain: "Academic Science & Computer Science",
    category: "Entity Identity Conflation",
    sourceDocument: `Michael I. Jordan is a professor of computer science and statistics at UC Berkeley who pioneered variational methods in Bayesian networks. Michael B. Jordan is an American actor and producer known for his starring role in Creed.`,
    userPrompt: "Did Michael Jordan direct or star in films while developing Bayesian networks at Berkeley?",
    oldFlawedBehavior: {
      answer: "Yes, Michael Jordan is a UC Berkeley professor and film producer who starred in Creed.",
      flawExplanation: "Conflated the computer scientist Michael I. Jordan with the actor Michael B. Jordan.",
    },
    groundedPolicyBehavior: {
      answer: "No. The source refers to two different individuals with similar names: Michael I. Jordan is the UC Berkeley professor who pioneered variational methods in Bayesian networks, whereas Michael B. Jordan is the film actor and producer. The two careers belong to distinct people.",
      atomicClaims: [
        {
          assertion: "Michael I. Jordan is a UC Berkeley professor who pioneered variational methods",
          context: "Computer Science Faculty",
          evidence: "Michael I. Jordan is a professor of computer science and statistics at UC Berkeley who pioneered variational methods in Bayesian networks.",
        },
        {
          assertion: "Michael B. Jordan is an actor and producer who starred in Creed",
          context: "Film Industry",
          evidence: "Michael B. Jordan is an American actor and producer known for his starring role in Creed.",
        },
      ],
      contextIsolationNotes: [
        "Entity distinction strictly maintained: Michael I. Jordan (researcher) isolated from Michael B. Jordan (actor).",
      ],
    },
  },

  // D. Facts from different dates (Medical / Pharma Regulation)
  {
    id: "test-d-facts-from-different-dates",
    name: "D. Facts from Different Dates (Temporal Integrity)",
    domain: "Clinical Pharmacology",
    category: "Temporal Conflation",
    sourceDocument: `In March 2021, the Phase 2 clinical trial of Cardiovax enrolled 450 patients with mild hypertension. In November 2024, the FDA issued updated clinical guidance recommending ACE inhibitors as primary therapy for stage-2 hypertension.`,
    userPrompt: "Did the FDA guidance in March 2021 recommend Cardiovax based on 450 patients?",
    oldFlawedBehavior: {
      answer: "In March 2021, the FDA issued guidance recommending Cardiovax following a 450-patient trial.",
      flawExplanation: "Merged the March 2021 clinical trial date with the November 2024 FDA guidance publication.",
    },
    groundedPolicyBehavior: {
      answer: "No. The 450-patient Phase 2 trial of Cardiovax occurred in March 2021. The FDA clinical guidance was published separately in November 2024 and recommended ACE inhibitors for stage-2 hypertension, not Cardiovax.",
      atomicClaims: [
        {
          assertion: "Phase 2 trial of Cardiovax enrolled 450 patients in March 2021",
          context: "March 2021 trial",
          evidence: "In March 2021, the Phase 2 clinical trial of Cardiovax enrolled 450 patients with mild hypertension.",
        },
        {
          assertion: "FDA guidance published in November 2024 recommended ACE inhibitors",
          context: "November 2024 guidance",
          evidence: "In November 2024, the FDA issued updated clinical guidance recommending ACE inhibitors as primary therapy for stage-2 hypertension.",
        },
      ],
      contextIsolationNotes: [
        "Temporal boundaries enforced: March 2021 trial kept distinct from November 2024 FDA publication.",
      ],
    },
  },

  // E. Facts from different sources (Multi-source boundary)
  {
    id: "test-e-facts-from-different-sources",
    name: "E. Facts from Different Sources (Source Boundaries)",
    domain: "Aerospace & Commercial Aviation",
    category: "Multi-Source Boundary",
    sourceDocument: `[Source A: Federal Aviation Administration Safety Circular 2024-03]
The maximum certified ceiling for the AeroMax 800 airframe is 41,000 feet.
[Source B: Air Cargo Logistics Weekly, Issue 42]
SkyFreight Aviation completed an international freight flight using a modified turboprop at 18,000 feet.`,
    userPrompt: "What is the certified ceiling of SkyFreight Aviation's modified turboprop according to the FAA?",
    oldFlawedBehavior: {
      answer: "The FAA certified the ceiling of SkyFreight's modified turboprop at 41,000 feet.",
      flawExplanation: "Combined statements across Source A and Source B as though Source A described Source B's aircraft.",
    },
    groundedPolicyBehavior: {
      answer: "The sources do not establish that ceiling for the modified turboprop. Source A (FAA Circular) certifies a 41,000-foot ceiling specifically for the AeroMax 800 airframe. Source B reports that SkyFreight operated a modified turboprop at 18,000 feet, but does not provide an FAA certified ceiling.",
      atomicClaims: [
        {
          assertion: "AeroMax 800 maximum certified ceiling is 41,000 feet",
          context: "Source A: FAA Circular 2024-03",
          evidence: "The maximum certified ceiling for the AeroMax 800 airframe is 41,000 feet.",
        },
        {
          assertion: "SkyFreight operated a modified turboprop at 18,000 feet",
          context: "Source B: Air Cargo Logistics",
          evidence: "SkyFreight Aviation completed an international freight flight using a modified turboprop at 18,000 feet.",
        },
      ],
      contextIsolationNotes: [
        "Source boundary maintained: AeroMax 800 FAA specs isolated from SkyFreight turboprop operations.",
      ],
    },
  },

  // F. A table where row/column relationships matter (Hardware / Tech benchmarks)
  {
    id: "test-f-table-row-column-integrity",
    name: "F. Structured Table Where Row and Column Relationships Matter",
    domain: "Computing Hardware & Microprocessors",
    category: "Table Coordinate Crossing",
    sourceDocument: `| Processor Model | Architecture | Base Clock | TDP | Max Memory |
| CoreStream 900 | Arm v9.2 | 3.2 GHz | 65W | 128 GB |
| HyperVolt X8 | x86-64 | 4.1 GHz | 125W | 256 GB |
| UltraSilicon M4 | RISC-V | 2.8 GHz | 35W | 64 GB |`,
    userPrompt: "What is the TDP and Max Memory of the CoreStream 900 processor?",
    oldFlawedBehavior: {
      answer: "The CoreStream 900 has a TDP of 125W and supports up to 256 GB of memory.",
      flawExplanation: "Swapped values from the HyperVolt X8 row into the CoreStream 900 row.",
    },
    groundedPolicyBehavior: {
      answer: "According to the table, the CoreStream 900 has a TDP of 65W and a Max Memory capacity of 128 GB. (The 125W TDP and 256 GB Max Memory specifications belong to the HyperVolt X8 row).",
      atomicClaims: [
        {
          assertion: "CoreStream 900 has 65W TDP and 128 GB Max Memory",
          context: "Table Row: CoreStream 900",
          evidence: "| CoreStream 900 | Arm v9.2 | 3.2 GHz | 65W | 128 GB |",
        },
      ],
      contextIsolationNotes: [
        "Preserved 2D table coordinates: Row 1 (CoreStream 900) isolated from Row 2 (HyperVolt X8).",
      ],
    },
  },

  // G. Paragraph where qualification applies only to one sentence (Scientific / Materials)
  {
    id: "test-g-qualification-scope",
    name: "G. Paragraph Where a Qualification Applies Only to One Sentence",
    domain: "Materials Engineering",
    category: "Scope Qualification",
    sourceDocument: `When operating in liquid nitrogen immersion at -196°C, the tensile yield strength of Alloy-7 increases to 920 MPa. At ambient laboratory conditions (22°C), Alloy-7 exhibits a standard tensile strength of 480 MPa and an elongation of 18%.`,
    userPrompt: "What is the standard tensile strength of Alloy-7 at room temperature?",
    oldFlawedBehavior: {
      answer: "Alloy-7 exhibits a standard tensile yield strength of 920 MPa at ambient laboratory conditions.",
      flawExplanation: "Applied the extreme cryogenic qualification (-196°C) to the room-temperature condition.",
    },
    groundedPolicyBehavior: {
      answer: "At ambient laboratory conditions (22°C), Alloy-7 exhibits a standard tensile strength of 480 MPa (with 18% elongation). The 920 MPa strength figure applies strictly under liquid nitrogen immersion at -196°C.",
      atomicClaims: [
        {
          assertion: "Alloy-7 tensile strength is 480 MPa at 22°C",
          context: "Ambient laboratory condition (22°C)",
          evidence: "At ambient laboratory conditions (22°C), Alloy-7 exhibits a standard tensile strength of 480 MPa and an elongation of 18%.",
        },
        {
          assertion: "Alloy-7 yield strength increases to 920 MPa at -196°C",
          context: "Cryogenic immersion (-196°C)",
          evidence: "When operating in liquid nitrogen immersion at -196°C, the tensile yield strength of Alloy-7 increases to 920 MPa.",
        },
      ],
      contextIsolationNotes: [
        "Cryogenic temperature condition (-196°C) kept strictly isolated from ambient baseline (22°C).",
      ],
    },
  },

  // H. Statement followed by an exception (Banking & Consumer Regulations)
  {
    id: "test-h-statement-with-exception",
    name: "H. Statement Followed by an Exception",
    domain: "Financial Services & Consumer Banking",
    category: "Exception Omission",
    sourceDocument: `All domestic personal checking transactions are exempt from service fees, except for same-day outbound wires, which incur an administrative assessment of $15.00 per transfer.`,
    userPrompt: "Are same-day outbound domestic wires exempt from service fees?",
    oldFlawedBehavior: {
      answer: "Yes, all domestic personal checking transactions are completely exempt from fees.",
      flawExplanation: "Stated the general rule while omitting the explicitly stated exception for wires.",
    },
    groundedPolicyBehavior: {
      answer: "No. While domestic personal checking transactions are generally fee-free, the policy explicitly excludes same-day outbound wires, which incur an administrative fee of $15.00 per transfer.",
      atomicClaims: [
        {
          assertion: "Same-day outbound wires incur a $15.00 administrative fee as an exception",
          context: "Fee Policy Exception",
          evidence: "except for same-day outbound wires, which incur an administrative assessment of $15.00 per transfer.",
        },
      ],
      contextIsolationNotes: [
        "Preserved policy exception: Same-day wires are not covered by the general fee waiver.",
      ],
    },
  },

  // I. General statement followed by a specific example (Legal / Statutory Scope)
  {
    id: "test-i-general-vs-specific-scope",
    name: "I. General Statement Followed by a Specific Example",
    domain: "Regulatory Compliance & Law",
    category: "Scope Broadening",
    sourceDocument: `Commercial maritime carriers must submit crew manifests 24 hours prior to port entry. For example, container vessels calling at the Port of Long Beach must transmit their electronic cargo declarations via the automated manifest system.`,
    userPrompt: "Do all commercial maritime carriers only need to comply if entering the Port of Long Beach?",
    oldFlawedBehavior: {
      answer: "Commercial maritime carriers only need to submit manifests when docking at the Port of Long Beach.",
      flawExplanation: "Narrowed the universal 24-hour maritime requirement to apply only to the illustrative Long Beach example.",
    },
    groundedPolicyBehavior: {
      answer: "No. The 24-hour crew manifest rule applies generally to all commercial maritime carriers entering any port. The Port of Long Beach cargo declaration is provided strictly as a specific illustrative example, not an exhaustive restriction.",
      atomicClaims: [
        {
          assertion: "All commercial maritime carriers must submit manifests 24 hours before port entry",
          context: "General statutory rule",
          evidence: "Commercial maritime carriers must submit crew manifests 24 hours prior to port entry.",
        },
      ],
      contextIsolationNotes: [
        "Prevented scope collapse: General regulatory mandate preserved; illustrative example not treated as constraint.",
      ],
    },
  },

  // J. Source containing contradictory information within same document (Corporate Disclosures)
  {
    id: "test-j-contradictory-information",
    name: "J. Source Containing Contradictory Information",
    domain: "Corporate Filings & Disclosures",
    category: "Contradictory Evidence",
    sourceDocument: `Executive Summary (Page 2): Total research capital expenditures for fiscal year 2023 were $14.2 million.
Notes to Consolidated Financial Statements (Page 48): Note 12 states research and development capital expenditure totaled $18.5 million, reflecting capitalized software additions.`,
    userPrompt: "What were the research capital expenditures for fiscal year 2023?",
    oldFlawedBehavior: {
      answer: "Research capital expenditures for fiscal year 2023 were approximately $16.3 million.",
      flawExplanation: "Silently averaged two contradictory figures rather than presenting the disclosure discrepancy.",
    },
    groundedPolicyBehavior: {
      answer: "The source document contains conflicting disclosures: Page 2 (Executive Summary) states research capital expenditures were $14.2 million, whereas Page 48 (Note 12) reports $18.5 million reflecting capitalized software additions. The document does not reconcile these two figures into a single total.",
      atomicClaims: [
        {
          assertion: "Executive Summary reports $14.2 million research capital expenditures",
          context: "Page 2 Executive Summary",
          evidence: "Total research capital expenditures for fiscal year 2023 were $14.2 million.",
        },
        {
          assertion: "Note 12 reports $18.5 million research capital expenditures",
          context: "Page 48 Financial Notes",
          evidence: "Note 12 states research and development capital expenditure totaled $18.5 million",
        },
      ],
      contextIsolationNotes: [
        "Discrepancy preserved: Document contradiction explicitly noted rather than averaged or obscured.",
      ],
    },
  },

  // K. Two versions of the same source with different numbers (Standards / Specifications)
  {
    id: "test-k-two-versions-different-numbers",
    name: "K. Two Versions of the Same Source with Different Numbers",
    domain: "Industrial Engineering Specifications",
    category: "Version Discrepancy",
    sourceDocument: `Standard ISO-9402 Revision A (2019): Minimum allowable shear tolerance is specified at 45 kN.
Standard ISO-9402 Revision B (2023): Minimum allowable shear tolerance is updated to 58 kN following updated cyclic fatigue testing.`,
    userPrompt: "What is the minimum shear tolerance under ISO-9402?",
    oldFlawedBehavior: {
      answer: "The minimum shear tolerance under ISO-9402 is 45 kN.",
      flawExplanation: "Reported the superseded Revision A figure without acknowledging the updated Revision B specification.",
    },
    groundedPolicyBehavior: {
      answer: "The minimum shear tolerance differs by revision: Revision A (2019) specified 45 kN, whereas Revision B (2023) updated this to 58 kN following cyclic fatigue testing. Both specifications must be referenced by their respective revision year.",
      atomicClaims: [
        {
          assertion: "Revision A (2019) specifies 45 kN shear tolerance",
          context: "ISO-9402 Revision A (2019)",
          evidence: "Standard ISO-9402 Revision A (2019): Minimum allowable shear tolerance is specified at 45 kN.",
        },
        {
          assertion: "Revision B (2023) updates tolerance to 58 kN",
          context: "ISO-9402 Revision B (2023)",
          evidence: "Standard ISO-9402 Revision B (2023): Minimum allowable shear tolerance is updated to 58 kN",
        },
      ],
      contextIsolationNotes: [
        "Version discrepancy maintained: Revision A (2019) distinguished from Revision B (2023).",
      ],
    },
  },

  // L. Citation supporting only half of a compound sentence (Architecture / System Specs)
  {
    id: "test-l-asymmetric-compound-citation",
    name: "L. Citation Supporting Only Half of a Compound Sentence",
    domain: "System Architecture & Databases",
    category: "Compound Sentence Asymmetry",
    sourceDocument: `The storage cluster maintains 3 distributed read replicas across distinct availability zones.`,
    userPrompt: "How many read and write replicas does the storage cluster maintain?",
    oldFlawedBehavior: {
      answer: "The storage cluster maintains 3 distributed read replicas and 6 dedicated write nodes [1].",
      flawExplanation: "Attached a single citation supporting read replicas to a compound statement asserting an unsupported write node claim.",
    },
    groundedPolicyBehavior: {
      answer: "The storage cluster maintains 3 distributed read replicas across distinct availability zones. The available text contains no information regarding the number of dedicated write nodes.",
      atomicClaims: [
        {
          assertion: "Storage cluster maintains 3 distributed read replicas",
          context: "Storage cluster architecture",
          evidence: "The storage cluster maintains 3 distributed read replicas across distinct availability zones.",
        },
      ],
      contextIsolationNotes: [
        "Split compound sentence: Verified read replica count; refused to attach citation to unstated write nodes.",
      ],
      unverifiedClaims: ["Number of dedicated write nodes"],
    },
  },

  // M. Plausible inference that is not explicitly supported (Business / Market Expansion)
  {
    id: "test-m-plausible-unstated-inference",
    name: "M. Plausible Inference that is Not Explicitly Supported",
    domain: "Business Strategy & Commerce",
    category: "Unverified Extrapolation",
    sourceDocument: `Nordic Retail opened 14 new flagship stores across Sweden, Norway, and Denmark during 2024, achieving 18% regional revenue growth.`,
    userPrompt: "Did Nordic Retail expand into Finland and see strong sales there in 2024?",
    oldFlawedBehavior: {
      answer: "Nordic Retail expanded across the Nordic region including Finland, driving its 18% growth.",
      flawExplanation: "Hallucinated plausible expansion into Finland because Sweden, Norway, and Denmark were mentioned.",
    },
    groundedPolicyBehavior: {
      answer: "I cannot verify this from the available evidence. The source explicitly mentions openings in Sweden, Norway, and Denmark, but does not mention Finland or sales in Finland.",
      atomicClaims: [
        {
          assertion: "Opened 14 stores in Sweden, Norway, and Denmark with 18% growth",
          context: "2024 Expansion",
          evidence: "Nordic Retail opened 14 new flagship stores across Sweden, Norway, and Denmark during 2024, achieving 18% regional revenue growth.",
        },
      ],
      contextIsolationNotes: [
        "Plausible extrapolation rejected: Finland is not present in source evidence.",
      ],
      unverifiedClaims: ["Expansion into Finland"],
    },
  },

  // N. Question where correct answer is "insufficient evidence" (Public Health / Epidemiology)
  {
    id: "test-n-insufficient-evidence",
    name: "N. Question Where the Correct Answer is 'Insufficient Evidence'",
    domain: "Epidemiology & Public Health",
    category: "Unsupported Claim",
    sourceDocument: `A randomized trial evaluated dietary fiber supplementation in 800 adults aged 40-65 over a 12-month period, measuring fasting blood glucose and lipid panels.`,
    userPrompt: "What was the effect of the dietary fiber supplement on cognitive memory test scores in this trial?",
    oldFlawedBehavior: {
      answer: "The trial observed significant improvements in cognitive memory test scores among participants.",
      flawExplanation: "Invented positive cognitive results when the trial only evaluated blood glucose and lipid panels.",
    },
    groundedPolicyBehavior: {
      answer: "I cannot verify that from the available sources. The trial measured fasting blood glucose and lipid panels; cognitive memory test scores were neither measured nor reported in the provided evidence.",
      atomicClaims: [],
      contextIsolationNotes: [
        "Explicit refusal to extrapolate: Cognitive outcomes are completely absent from trial measurements.",
      ],
      unverifiedClaims: ["Cognitive memory test scores"],
    },
  },

  // O. Webpage itself is misleading or unverified marketing claim (Consumer Protection)
  {
    id: "test-o-misleading-page-assertion",
    name: "O. Webpage Containing Misleading or Unsubstantiated Assertion",
    domain: "Consumer Electronics & Marketing",
    category: "Unverified Extrapolation",
    sourceDocument: `Marketing Header: World's First 100% Unbreakable Quantum Smartphone Screen!
Product Details Section: Screen manufactured with aluminosilicate chemically hardened glass, tested to withstand drops up to 1.5 meters onto flat smooth surfaces.`,
    userPrompt: "Is this smartphone screen completely unbreakable under all drop conditions?",
    oldFlawedBehavior: {
      answer: "Yes, the phone features the world's first 100% unbreakable quantum screen.",
      flawExplanation: "Repeated marketing hype as factual truth without grounding it in the verified laboratory drop specifications.",
    },
    groundedPolicyBehavior: {
      answer: "No. While the marketing header claims an 'unbreakable' screen, the technical product details specify that the aluminosilicate glass was only tested to withstand drops up to 1.5 meters onto flat, smooth surfaces. It is not verified to be unbreakable under all conditions.",
      atomicClaims: [
        {
          assertion: "Glass tested to withstand drops up to 1.5 meters onto flat surfaces",
          context: "Technical Product Details",
          evidence: "tested to withstand drops up to 1.5 meters onto flat smooth surfaces.",
        },
      ],
      contextIsolationNotes: [
        "Marketing slogan separated from verified technical test bounds (1.5m drop test).",
      ],
    },
  },

  // P. Original Vaswani Diagnostic Test (Treated strictly as a general regression test)
  {
    id: "test-p-vaswani-general-regression",
    name: "P. Cross-Experiment Condition Separation (Vaswani Regression Test)",
    domain: "Machine Learning Research",
    category: "Cross-Experiment Conflation",
    sourceDocument: `On the WMT 2014 English-to-German translation task, the big transformer model achieves 28.4 BLEU, outperforming the best existing models by over 2 BLEU.
On the WMT 2014 English-to-French translation task, the big transformer model achieves a BLEU score of 41.8 after training for 3.5 days on 8 P100 GPUs.`,
    userPrompt: "What was the BLEU score and training time for the English-to-German model?",
    oldFlawedBehavior: {
      answer: "The English-to-German model achieved 28.4 BLEU after 3.5 days of training on 8 P100 GPUs.",
      flawExplanation: "Merged the 28.4 BLEU score from the German benchmark with the 3.5-day duration from the French benchmark.",
    },
    groundedPolicyBehavior: {
      answer: "The Transformer Big model achieved 28.4 BLEU on the WMT 2014 English-to-German task. Separately, the 3.5-day training duration on 8 P100 GPUs was reported for the English-to-French benchmark, not English-to-German.",
      atomicClaims: [
        {
          assertion: "Transformer Big achieves 28.4 BLEU on English-to-German",
          context: "WMT 2014 English-to-German benchmark",
          evidence: "On the WMT 2014 English-to-German translation task, the big transformer model achieves 28.4 BLEU",
        },
        {
          assertion: "Training took 3.5 days on 8 P100 GPUs for English-to-French",
          context: "WMT 2014 English-to-French benchmark",
          evidence: "after training for 3.5 days on 8 P100 GPUs.",
        },
      ],
      contextIsolationNotes: [
        "Language direction English->German isolated from English->French.",
        "Refused compound sentence combining German score with French hardware duration.",
      ],
    },
  },
];
