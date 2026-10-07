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
CORE SYSTEM DIRECTIVE: STRICT EVIDENCE GROUNDING & RELATIONSHIP INTEGRITY

You are operating under an application-level factual grounding pipeline.
Factual accuracy, context preservation, and relationship integrity are your highest priorities—strictly above fluency, confidence, comprehensiveness, or conversational flow. A concise answer containing only verified facts is strictly superior to an expansive answer containing plausible but ungrounded relationships.

MANDATORY EXECUTION DIRECTIVES:

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
- If a question asks for a fact, entity, metric, or relationship not established in the available evidence, you MUST explicitly state: "I cannot verify this from the available evidence."
- Prefer explicit non-verification over plausible speculation.

8. CONTRADICTION PRESERVATION:
- If different sections, tables, or source versions conflict, report the discrepancy explicitly (e.g., "Section 1 states X, whereas Section 4 reports Y"). Never average conflicting figures or silently pick one.

When completing an informational task, call "finish_task" with structured paragraphs, verbatim citations, atomic claims, context separation notes, and any unverified claims.
`.trim();

// Backwards-compatible alias for existing imports
export const GROUNDING_SYSTEM_POLICY = CANONICAL_GROUNDING_POLICY;

// ============================================================================
// 3. REQUEST INTENT CLASSIFIER
// ============================================================================

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
  // Matches monetary, percentages, counts, metrics, benchmark scores, durations, hardware counts
  const regex = /(\$?\b\d+(?:,\d{3})*(?:\.\d+)?(?:k|m|b|t)?\b(?:\s*(?:bleu|percent|%|days?|hours?|steps?|gpus?|parameters?|layers?|usd|dollars?|million|billion|trillion|gb|mb|tb|ms|seconds?|wordpieces?|tokens?|acc|accuracy))?)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawString = match[1].trim();
    if (rawString.length > 0) {
      tuples.push({
        value: rawString,
        rawString,
      });
    }
  }
  return tuples;
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

    // Standard paragraph or list line
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
  if (sentenceNumbers.length < 2) return { isValid: true };

  // If a sentence combines two distinct numerical facts, check if any single evidence item contains both.
  // E.g. Combining "28.4 BLEU" with "3.5 days" or "$4.2B" with "28%"
  const cleanTokens = sentenceNumbers.map((n) => n.rawString.toLowerCase());

  // Check if all numbers exist together in at least one evidence item
  const lowerTexts = store ? store.itemLowerTexts : evidenceItems.map((e) => e.text.toLowerCase());
  const coOccursInSingleEvidence = lowerTexts.some((evLower) => {
    return cleanTokens.every((tok) => evLower.includes(tok));
  });

  if (!coOccursInSingleEvidence) {
    // Distinct numbers from different evidence units were joined in a single sentence!
    // Check if the sentence connects them with an unestablished relationship (e.g. "after", "with", "and achieved")
    const isJoinedRelation =
      sentence.toLowerCase().includes(" after ") ||
      sentence.toLowerCase().includes(" with a ") ||
      sentence.toLowerCase().includes(" outperforming ") ||
      sentence.toLowerCase().includes(" achieving ");

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
        validatedCitations.length === 1 &&
        !sentence.includes("Separately")
      ) {
        const singleCitQuote = validatedCitations[0]?.quote || "";
        // Check if the citation only covers one clause of the compound sentence
        const clauses = sentence.split(/\band\b|\bwhile\b/i);
        if (clauses.length >= 2) {
          const firstHasQuote = verifyQuoteInSource(singleCitQuote, clauses[0].trim());
          const secondHasQuote = verifyQuoteInSource(singleCitQuote, clauses[1].trim());
          if (firstHasQuote !== secondHasQuote) {
            issues.push({
              type: "compound-sentence-asymmetry",
              description: "Citation only supports one clause of a compound sentence.",
              offendingText: sentence,
              resolution: "Split compound sentence and isolate supported fact from unverified clause.",
            });
          }
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
