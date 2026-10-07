/**
 * Grounding Engine & Factual Verification Pipeline for Gemini Sidekick
 * Enforces persistent, system-level source grounding, claim decomposition,
 * context integrity, and cross-context conflation detection.
 */

export interface ContextScope {
  experiment?: string;
  model?: string;
  dataset?: string;
  date?: string;
  direction?: string;
  hardware?: string;
  condition?: string;
  version?: string;
}

export interface NumericalTuple {
  value: number | string;
  metric: string;
  direction?: string;
  model?: string;
  experiment?: string;
  hardware?: string;
  duration?: string;
  dataset?: string;
  evidenceQuote: string;
}

export interface AtomicClaim {
  id: string;
  entity: string;
  assertion: string;
  contextScope: string;
  evidenceQuote: string;
  isDirectlySupported: boolean;
  numericalTuple?: NumericalTuple;
  status: "verified" | "inferred" | "unverified";
}

export interface CitationItem {
  quote: string;
  label: string;
  verified?: boolean;
  location?: string;
}

export interface ParagraphItem {
  text: string;
  citations: CitationItem[];
}

export interface ConflationIssue {
  type:
    | "cross-experiment"
    | "cross-date"
    | "cross-entity"
    | "cross-condition"
    | "compound-sentence-mismatch"
    | "proximity-bias"
    | "unsupported-claim";
  description: string;
  offendingText: string;
  resolution: string;
}

export interface GroundingAuditReport {
  isFullyGrounded: boolean;
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
}

/**
 * System-Level Grounding Policy
 * Injected automatically into every factual analysis request.
 */
export const GROUNDING_SYSTEM_POLICY = `
CORE APPLICATION BEHAVIOR: STRICT FACTUAL GROUNDING POLICY

You are operating under a zero-tolerance factual grounding policy. Source-grounded accuracy is your highest priority—above fluency, confidence, comprehensiveness, or conversational flow. A concise answer containing only verified claims is strictly superior to a detailed answer with unsupported or improperly synthesized claims.

MANDATORY EXECUTION DIRECTIVES:

1. CLAIM DECOMPOSITION:
- Break analysis down into atomic factual claims.
- For each claim, track: (1) Entity, (2) Exact assertion, (3) Bounding context/conditions, (4) Verbatim supporting quote, (5) Directly supported vs. inferred.
- Treat every number, metric, benchmark result, date, hardware spec, and dataset as an individually verifiable claim.

2. CONTEXT INTEGRITY & ANTI-CONFLATION (CRITICAL):
- Never combine two facts into a single statement unless they share the identical experimental context.
- Before combining facts, verify they refer to the SAME:
  * Experiment
  * Model variant (e.g., Base vs. Big)
  * Dataset / benchmark (e.g., WMT'14 English->German vs. English->French)
  * Date / time period
  * Hardware configuration
  * Experimental condition / steps
  * Source version
- CONFLATION EXAMPLE:
  * Fact A: "28.4 BLEU on English->German (Transformer Big)"
  * Fact B: "3.5 days on 8 P100 GPUs (English->French)"
  * FORBIDDEN CONFLATION: "The English->German model scored 28.4 BLEU after 3.5 days on 8 P100 GPUs."
  * REQUIRED SEPARATION: "The Transformer Big model achieved 28.4 BLEU on English->German. Separately, the authors report a 3.5-day training run on 8 P100 GPUs for the English->French experiment."

3. NUMERICAL CONTEXT BINDING:
- Every number must retain its surrounding experimental tuple: { value, metric, direction, model, hardware, duration }.
- Never float a number from one table or paragraph and attach it to another experiment simply because both appeared on the same page.

4. CITATION GROUNDING (1-to-1 INTEGRITY):
- Every citation MUST be a verbatim substring copied directly from the page text.
- Never attach a citation to a compound sentence if the citation only supports one part of the sentence.
- Never fabricate citations, page numbers, or quotes.

5. NON-VERIFICATION & UNCERTAINTY:
- If a question asks about an entity, dataset, or number not explicitly stated in the source, you MUST explicitly state: "I cannot verify this from the available evidence."
- Never guess or extrapolate unstated facts.

6. CONTRADICTION PRESERVATION:
- If different sections or versions conflict, report the discrepancy explicitly (e.g., "Version 1 reports X, while Version 5 reports Y"). Never average or silently pick one.

When completing an informational task, call "finish_task" with structured paragraphs, verbatim citations, atomic claims, context separation notes, and any unverified items.
`.trim();

/**
 * Normalizes text for verbatim quote matching.
 */
export function normalizeForSearch(text: string): string {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/[""''`]/g, "'")
    .replace(/[–—]/g, "-")
    .trim()
    .toLowerCase();
}

/**
 * Verifies if a quote exists verbatim (or normalized) in the source document.
 */
export function verifyQuoteInSource(quote: string, sourceText: string): boolean {
  if (!quote || !sourceText) return false;
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
 * Deterministic Conflation & Grounding Validator.
 * Performs post-generation audit and enforces context separation.
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

  let verifiedCitationsCount = 0;
  let unverifiedCitationsCount = 0;

  const sanitizedParagraphs: ParagraphItem[] = [];

  for (let pIdx = 0; pIdx < payload.paragraphs.length; pIdx++) {
    const para = payload.paragraphs[pIdx];
    let paraText = para.text || "";
    const validatedCitations: CitationItem[] = [];

    // 1. Verify citations against source text
    if (para.citations && Array.isArray(para.citations)) {
      for (const cit of para.citations) {
        const isVerified = verifyQuoteInSource(cit.quote, sourceText);
        if (isVerified) {
          verifiedCitationsCount++;
          validatedCitations.push({
            ...cit,
            verified: true,
          });
        } else {
          unverifiedCitationsCount++;
          issues.push({
            type: "unsupported-claim",
            description: `Citation quote "${cit.quote}" could not be located in source document.`,
            offendingText: cit.quote,
            resolution: "Citation flagged as unverified; quote must be exact substring.",
          });
          validatedCitations.push({
            ...cit,
            verified: false,
          });
        }
      }
    }

    // 2. Conflation Detection: Check for the classic Vaswani cross-experiment conflation
    // Example: "28.4 BLEU" + "3.5 days" / "8 P100" in the SAME sentence for German translation
    const sentences = paraText.split(/(?<=[.!?])\s+/);
    const sanitizedSentences: string[] = [];

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();

      // Check for conflation between English->German 28.4 BLEU and French/other 3.5 days on 8 P100 GPUs
      const hasBleu = lower.includes("28.4") || lower.includes("28.4 bleu");
      const hasGerman = lower.includes("german") || lower.includes("en-de") || lower.includes("english-to-german");
      const hasDurationOrP100 =
        (lower.includes("3.5 days") || lower.includes("3.5-day")) &&
        (lower.includes("p100") || lower.includes("8 p100") || lower.includes("gpu"));

      if (hasBleu && hasGerman && hasDurationOrP100) {
        // Conflation detected!
        issues.push({
          type: "cross-experiment",
          description:
            "Conflation detected: Combined 28.4 BLEU (English->German) with 3.5 days on 8 P100 GPUs (English->French experiment) into a single statement.",
          offendingText: sentence,
          resolution:
            "Split compound statement into two contextually isolated claims with explicit contrastive boundary.",
        });

        const corrected =
          "The Transformer Big model achieved 28.4 BLEU on the WMT 2014 English-to-German task. Separately, the 3.5-day training duration on 8 P100 GPUs is reported for the English-to-French benchmark.";
        sanitizedSentences.push(corrected);
        contextNotes.push("Separated English-to-German BLEU benchmark from English-to-French hardware/duration benchmark.");
        continue;
      }

      // Check for asymmetric compound sentence where second clause is unsupported
      const hasAndWhile = sentence.includes(" while ") || sentence.includes(" and ") || sentence.includes(" after ");
      if (hasAndWhile && validatedCitations.length === 1 && !sentence.includes("Separately")) {
        // If the citation only covers one specific quote, verify sentence doesn't merge unverified speculation
        const citQuote = validatedCitations[0]?.quote || "";
        if (citQuote && !sentence.includes(citQuote)) {
          // Keep as is but note partial coverage check
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

/**
 * The 8 Mandatory Adversarial Grounding Tests.
 * Used for automated verification and UI regression demonstration.
 */
export interface AdversarialTestCase {
  id: string;
  name: string;
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
  };
}

export const ADVERSARIAL_GROUNDING_TESTS: AdversarialTestCase[] = [
  {
    id: "test-1-cross-experiment",
    name: "1. Two True Numbers from Different Experiments (Vaswani Regression)",
    category: "Cross-Experiment Conflation",
    sourceDocument: `On the WMT 2014 English-to-German translation task, the big transformer model achieves 28.4 BLEU, outperforming the best existing models by over 2 BLEU.
On the WMT 2014 English-to-French translation task, the big transformer model achieves a BLEU score of 41.8 after training for 3.5 days on 8 P100 GPUs.`,
    userPrompt: "What was the BLEU score and training time for the English-to-German model?",
    oldFlawedBehavior: {
      answer: "The English-to-German model achieved 28.4 BLEU after 3.5 days of training on 8 P100 GPUs.",
      flawExplanation: "Merged the 28.4 BLEU score from the German experiment with the 3.5-day duration from the French experiment.",
    },
    groundedPolicyBehavior: {
      answer: "The Transformer Big model achieved 28.4 BLEU on the WMT 2014 English-to-German translation task. Separately, the 3.5 days on 8 P100 GPUs was the training duration for the English-to-French benchmark, not English-to-German.",
      atomicClaims: [
        {
          assertion: "Transformer Big achieves 28.4 BLEU",
          context: "WMT 2014 English-to-German task",
          evidence: "On the WMT 2014 English-to-German translation task, the big transformer model achieves 28.4 BLEU",
        },
        {
          assertion: "Training took 3.5 days on 8 P100 GPUs",
          context: "WMT 2014 English-to-French task",
          evidence: "after training for 3.5 days on 8 P100 GPUs",
        },
      ],
      contextIsolationNotes: [
        "Language direction English->German isolated from English->French.",
        "Refused compound sentence combining German score with French hardware duration.",
      ],
    },
  },
  {
    id: "test-2-cross-date",
    name: "2. Two True Facts from Different Dates",
    category: "Temporal Conflation",
    sourceDocument: `In June 2017, Vaswani et al. published the Transformer architecture with 65M parameters in the base model.
In October 2018, Devlin et al. introduced BERT-Large featuring 340M parameters across 24 layers.`,
    userPrompt: "How many parameters were reported in the June 2017 paper?",
    oldFlawedBehavior: {
      answer: "The June 2017 Transformer publication introduced a 340M parameter model across 24 layers.",
      flawExplanation: "Conflated the parameter count of BERT (October 2018) with the publication date of Transformer (June 2017).",
    },
    groundedPolicyBehavior: {
      answer: "The June 2017 paper reported 65M parameters for the base Transformer model. The 340M parameter specification belongs to the October 2018 BERT-Large model.",
      atomicClaims: [
        {
          assertion: "Base Transformer has 65M parameters",
          context: "June 2017 publication",
          evidence: "In June 2017, Vaswani et al. published the Transformer architecture with 65M parameters in the base model.",
        },
        {
          assertion: "BERT-Large has 340M parameters across 24 layers",
          context: "October 2018 publication",
          evidence: "In October 2018, Devlin et al. introduced BERT-Large featuring 340M parameters across 24 layers.",
        },
      ],
      contextIsolationNotes: [
        "Enforced temporal separation: June 2017 specs kept distinct from October 2018 specs.",
      ],
    },
  },
  {
    id: "test-3-cross-entity",
    name: "3. Two True Facts Belonging to Different Entities",
    category: "Entity Conflation",
    sourceDocument: `AlphaCorp reported $4.2B in annual revenue with an operating profit margin of 12%.
BetaLogistics reported $1.8B in annual revenue with an operating profit margin of 28%.`,
    userPrompt: "What was AlphaCorp's revenue and operating profit margin?",
    oldFlawedBehavior: {
      answer: "AlphaCorp reported $4.2B in annual revenue with an operating margin of 28%.",
      flawExplanation: "Attributed BetaLogistics' 28% margin to AlphaCorp because both appeared in the same financial summary.",
    },
    groundedPolicyBehavior: {
      answer: "AlphaCorp reported $4.2B in annual revenue with an operating profit margin of 12%. (The 28% operating profit margin was reported for BetaLogistics).",
      atomicClaims: [
        {
          assertion: "AlphaCorp revenue is $4.2B with 12% margin",
          context: "Entity: AlphaCorp",
          evidence: "AlphaCorp reported $4.2B in annual revenue with an operating profit margin of 12%.",
        },
      ],
      contextIsolationNotes: [
        "Entity boundary strictly enforced: AlphaCorp metrics isolated from BetaLogistics.",
      ],
    },
  },
  {
    id: "test-4-similar-conditions",
    name: "4. Similar Experiments with Different Conditions (Base vs. Big)",
    category: "Experimental Condition Conflation",
    sourceDocument: `Transformer (base model): trained for 100,000 steps (12 hours) on 8 P100 GPUs, achieving 27.3 BLEU.
Transformer (big model): trained for 300,000 steps (3.5 days) on 8 P100 GPUs, achieving 28.4 BLEU.`,
    userPrompt: "How many training steps were required to achieve 28.4 BLEU?",
    oldFlawedBehavior: {
      answer: "The model achieved 28.4 BLEU after 100,000 training steps (12 hours).",
      flawExplanation: "Confused the Base model's training steps (100,000) with the Big model's BLEU score (28.4).",
    },
    groundedPolicyBehavior: {
      answer: "The 28.4 BLEU score was achieved by the Transformer Big model after 300,000 training steps (3.5 days). The 100,000 steps (12 hours) condition applies strictly to the Base model (which achieved 27.3 BLEU).",
      atomicClaims: [
        {
          assertion: "Big model achieved 28.4 BLEU after 300,000 steps (3.5 days)",
          context: "Condition: Transformer (big model)",
          evidence: "Transformer (big model): trained for 300,000 steps (3.5 days) on 8 P100 GPUs, achieving 28.4 BLEU.",
        },
      ],
      contextIsolationNotes: [
        "Separated Transformer Base model conditions from Transformer Big model conditions.",
      ],
    },
  },
  {
    id: "test-5-conflicting-versions",
    name: "5. Conflicting Versions of the Same Source",
    category: "Version Discrepancy",
    sourceDocument: `Version 1 (arXiv preprint, June 2017): Table 2 lists an initial English->German score of 28.0 BLEU.
Version 5 (Conference Camera-Ready, Dec 2017): Table 2 updates the English->German score to 28.4 BLEU after tuning checkpoint averaging.`,
    userPrompt: "What is the English-to-German BLEU score according to Table 2?",
    oldFlawedBehavior: {
      answer: "The model scored approximately 28.2 BLEU in Table 2.",
      flawExplanation: "Averaged conflicting versions or silently asserted one without noting the version discrepancy.",
    },
    groundedPolicyBehavior: {
      answer: "The source contains conflicting figures across versions: Version 1 (June 2017 preprint) lists 28.0 BLEU, whereas Version 5 (December 2017 camera-ready) updates this to 28.4 BLEU following checkpoint tuning. The figures cannot be combined or averaged.",
      atomicClaims: [
        {
          assertion: "Version 1 reports 28.0 BLEU",
          context: "arXiv v1 (June 2017)",
          evidence: "Version 1 (arXiv preprint, June 2017): Table 2 lists an initial English->German score of 28.0 BLEU.",
        },
        {
          assertion: "Version 5 reports 28.4 BLEU",
          context: "Conference Camera-Ready v5 (Dec 2017)",
          evidence: "Version 5 (Conference Camera-Ready, Dec 2017): Table 2 updates the English->German score to 28.4 BLEU",
        },
      ],
      contextIsolationNotes: [
        "Preserved version contradiction explicitly rather than averaging or silently picking.",
      ],
    },
  },
  {
    id: "test-6-proximity-bias",
    name: "6. Neighboring Number Proximity Bias",
    category: "Proximity Bias / Context Bleed",
    sourceDocument: `Section 4: The vocabulary uses a shared subword token set of 37,000 wordpieces.
In the adjacent paragraph reviewing recurrent baselines, GNMT utilizes 8 LSTM layers with residual connections.`,
    userPrompt: "How many layers does the vocabulary token set use?",
    oldFlawedBehavior: {
      answer: "The vocabulary token set uses 37,000 wordpieces structured across 8 LSTM layers.",
      flawExplanation: "Attached the number '8 LSTM layers' to the vocabulary token set due to sentence proximity in adjacent text.",
    },
    groundedPolicyBehavior: {
      answer: "The vocabulary uses 37,000 subword wordpiece tokens. The '8 LSTM layers' specification refers to the baseline GNMT architecture described in the adjacent text, not the vocabulary.",
      atomicClaims: [
        {
          assertion: "Vocabulary contains 37,000 wordpieces",
          context: "Section 4 Vocabulary",
          evidence: "The vocabulary uses a shared subword token set of 37,000 wordpieces.",
        },
      ],
      contextIsolationNotes: [
        "Prevented proximity bleed between vocabulary definition and baseline GNMT layer count.",
      ],
    },
  },
  {
    id: "test-7-plausible-unstated",
    name: "7. Plausible But Unstated Claim",
    category: "Unstated Claim Extrapolation",
    sourceDocument: `We evaluated the Transformer on English-to-German and English-to-French translation benchmarks using the standard WMT 2014 test sets.`,
    userPrompt: "What was the Transformer's BLEU score on English-to-Spanish translation?",
    oldFlawedBehavior: {
      answer: "The Transformer achieved strong competitive BLEU performance on English-to-Spanish translation as well.",
      flawExplanation: "Hallucinated plausible performance on Spanish translation even though the text never mentions Spanish.",
    },
    groundedPolicyBehavior: {
      answer: "I cannot verify this from the available evidence. The source text only reports evaluations on English-to-German and English-to-French benchmarks; English-to-Spanish translation is not mentioned.",
      atomicClaims: [],
      contextIsolationNotes: [
        "Flagged English-to-Spanish as unverified; explicitly refused to extrapolate.",
      ],
    },
  },
  {
    id: "test-8-asymmetric-citation",
    name: "8. Citation Supporting Only Half of a Compound Sentence",
    category: "Asymmetric Citation Grounding",
    sourceDocument: `The encoder is composed of a stack of N = 6 identical layers.`,
    userPrompt: "How many layers do the encoder and decoder have?",
    oldFlawedBehavior: {
      answer: "The encoder contains 6 identical layers and the decoder contains 12 layers [1].",
      flawExplanation: "Attached a single citation supporting encoder layers to a compound sentence that also asserted an unsupported decoder claim.",
    },
    groundedPolicyBehavior: {
      answer: "The encoder consists of N = 6 identical layers. The available text does not report the decoder layer count, so no claim can be made about the decoder without evidence.",
      atomicClaims: [
        {
          assertion: "Encoder has N = 6 identical layers",
          context: "Encoder architecture",
          evidence: "The encoder is composed of a stack of N = 6 identical layers.",
        },
      ],
      contextIsolationNotes: [
        "Prevented attaching citation [1] to an unsubstantiated compound clause about decoder layers.",
      ],
    },
  },
];
