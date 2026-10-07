/**
 * Comprehensive Factual Quality & Latency Benchmark Suite
 *
 * Covers scenarios A through O as mandated:
 * A. Normal factual questions
 * B. Multi-step factual questions
 * C. Numerical questions
 * D. Questions involving tables
 * E. Questions involving multiple dates
 * F. Questions involving multiple experiments
 * G. Questions involving multiple entities with similar names
 * H. Questions where two individually true facts create a false combined statement
 * I. Questions requiring context from surrounding paragraphs
 * J. Questions where the answer is NOT supported by the page
 * K. Questions requiring "I could not verify that"
 * L. Questions involving dynamically changing pages
 * M. Questions involving long pages (50k+ chars)
 * N. Questions involving dense tables
 * O. Questions involving citations
 *
 * Measures:
 * - Extraction time
 * - Serialization time
 * - Evidence indexing / retrieval time
 * - Grounding & validation time
 * - Total pipeline latency
 * - Quality invariants: Factual accuracy, Unsupported claim rate, Citation correctness,
 *   Relationship accuracy, Anti-conflation accuracy, Numerical accuracy.
 */

import {
  parseSourceDocumentIntoEvidence,
  validateAndEnforceGrounding,
  verifyQuoteInSource,
  FinishTaskPayload,
  StructuredEvidenceItem,
} from "../src/groundingEngine.ts";

export interface BenchmarkCase {
  id: string;
  category: string; // A through O
  title: string;
  sourceText: string;
  userPrompt: string;
  expectedBehavior: {
    answerContains: string[];
    answerMustNotContain?: string[];
    requiredCitations?: string[];
    isolatedContexts?: string[];
    mustBeRefusedOrUnverified?: boolean;
    mustDetectIssue?: boolean;
  };
  samplePayload: FinishTaskPayload;
  flawedPayload?: FinishTaskPayload;
}

export const BENCHMARK_SUITE: BenchmarkCase[] = [
  // A. Normal factual questions
  {
    id: "bench-a-normal-factual",
    category: "A. Normal factual questions",
    title: "Direct factual property retrieval",
    sourceText: `# Atmospheric Sciences Overview\nThe exoplanet Kepler-186f has an estimated orbital period of 129.9 days and orbits within the habitable zone of its red dwarf host star Kepler-186.`,
    userPrompt: "What is the orbital period of Kepler-186f?",
    expectedBehavior: {
      answerContains: ["129.9 days", "Kepler-186f"],
      requiredCitations: ["orbital period of 129.9 days"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "Kepler-186f has an orbital period of 129.9 days around its host star Kepler-186.",
          citations: [{ quote: "orbital period of 129.9 days", label: "Atmospheric Sciences" }],
        },
      ],
      atomicClaims: [
        {
          id: "claim-1",
          subject: "Kepler-186f",
          assertion: "orbital period is 129.9 days",
          contextScope: "Atmospheric Sciences",
          evidenceIds: ["ev-1"],
          evidenceQuotes: ["orbital period of 129.9 days"],
          supportType: "direct",
          isDirectlySupported: true,
          status: "verified",
        },
      ],
    },
  },

  // B. Multi-step factual questions
  {
    id: "bench-b-multistep",
    category: "B. Multi-step factual questions",
    title: "Connected multi-step dependency",
    sourceText: `# Acquisition Briefing\nAcme Corp completed the acquisition of Apex Dynamics for $450 million in cash. Apex Dynamics is the exclusive patent holder for the HyperDrive solid-state propulsion system.`,
    userPrompt: "Who acquired the patent holder of the HyperDrive solid-state propulsion system and for how much?",
    expectedBehavior: {
      answerContains: ["Acme Corp", "Apex Dynamics", "$450 million", "HyperDrive"],
      requiredCitations: ["Apex Dynamics for $450 million in cash"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "Acme Corp acquired Apex Dynamics, the exclusive patent holder of the HyperDrive solid-state propulsion system, for $450 million in cash.",
          citations: [
            { quote: "Apex Dynamics for $450 million in cash", label: "Acquisition" },
            { quote: "exclusive patent holder for the HyperDrive solid-state propulsion system", label: "Patent" },
          ],
        },
      ],
    },
  },

  // C. Numerical questions
  {
    id: "bench-c-numerical",
    category: "C. Numerical questions",
    title: "Numerical precision with exact units and metrics",
    sourceText: `# Turbine Efficiency Specs\nUnder standard atmospheric pressure (101.3 kPa), Model-X5 achieved a thermal efficiency of 43.8% at 3,600 RPM. Under high-altitude conditions (70.1 kPa), the efficiency decreased to 39.2% at 3,400 RPM.`,
    userPrompt: "What was Model-X5's thermal efficiency at standard atmospheric pressure?",
    expectedBehavior: {
      answerContains: ["43.8%", "101.3 kPa", "3,600 RPM"],
      answerMustNotContain: ["39.2%"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "Under standard atmospheric pressure (101.3 kPa), Model-X5 achieved a thermal efficiency of 43.8% at 3,600 RPM.",
          citations: [{ quote: "thermal efficiency of 43.8% at 3,600 RPM", label: "Standard pressure" }],
        },
      ],
    },
  },

  // D. Questions involving tables
  {
    id: "bench-d-tables",
    category: "D. Questions involving tables",
    title: "Strict row-by-column coordinate association",
    sourceText: `# Cloud Pricing Benchmark\n| Tier | vCPU | RAM | Monthly Price |\n| Basic | 2 | 8 GB | $48 |\n| Pro | 8 | 32 GB | $192 |\n| Ultra | 32 | 128 GB | $768 |`,
    userPrompt: "What are the specs and monthly price of the Pro tier?",
    expectedBehavior: {
      answerContains: ["Pro", "8", "32 GB", "$192"],
      answerMustNotContain: ["$48", "$768"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "The Pro tier provides 8 vCPUs and 32 GB of RAM at a monthly price of $192.",
          citations: [{ quote: "| Pro | 8 | 32 GB | $192 |", label: "Cloud Pricing" }],
        },
      ],
    },
  },

  // E. Questions involving multiple dates
  {
    id: "bench-e-multiple-dates",
    category: "E. Questions involving multiple dates",
    title: "Distinguishing announcement date vs effective date",
    sourceText: `# Regulatory Timeline\nThe Environmental Quality Commission announced the revised particulate limits on March 15, 2023. The mandated emission reductions will take legal effect on January 1, 2026.`,
    userPrompt: "When do the particulate limits become legally effective?",
    expectedBehavior: {
      answerContains: ["January 1, 2026"],
      answerMustNotContain: ["took legal effect on March 15, 2023"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "The particulate limits were announced on March 15, 2023, but will take legal effect on January 1, 2026.",
          citations: [
            { quote: "announced the revised particulate limits on March 15, 2023", label: "Announcement" },
            { quote: "take legal effect on January 1, 2026", label: "Effective Date" },
          ],
        },
      ],
    },
  },

  // F. Questions involving multiple experiments
  {
    id: "bench-f-multiple-experiments",
    category: "F. Questions involving multiple experiments",
    title: "Keeping distinct experiment conditions separate",
    sourceText: `# Materials Stress Trials\nIn Experiment A (ambient temperature, 22°C), Alloy-9 withstood 850 MPa before tensile failure. In Experiment B (cryogenic cooling, -196°C), Alloy-9 exhibited brittle fracture at 610 MPa.`,
    userPrompt: "What was Alloy-9's tensile strength under ambient temperature?",
    expectedBehavior: {
      answerContains: ["Experiment A", "850 MPa", "22°C"],
      answerMustNotContain: ["610 MPa at ambient temperature"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "In Experiment A conducted at ambient temperature (22°C), Alloy-9 withstood 850 MPa before tensile failure.",
          citations: [{ quote: "In Experiment A (ambient temperature, 22°C), Alloy-9 withstood 850 MPa", label: "Experiment A" }],
        },
      ],
      contextSeparationNotes: ["Isolated Experiment A (ambient 22°C) from Experiment B (cryogenic -196°C)."],
    },
  },

  // G. Questions involving multiple entities with similar names
  {
    id: "bench-g-entities-similar-names",
    category: "G. Questions involving multiple entities with similar names",
    title: "Entity separation with near-identical names",
    sourceText: `# Biopharmaceutical Pipeline\nBioVax Therapeutics developed BVX-101, an mRNA oncology vaccine in Phase II trials. BioVax Diagnostics, an unaffiliated clinical laboratory company, produces the BVX Rapid Lateral Flow antigen test.`,
    userPrompt: "Does the company producing the BVX Rapid antigen test also run the mRNA oncology vaccine trials?",
    expectedBehavior: {
      answerContains: ["No", "BioVax Therapeutics", "BioVax Diagnostics", "unaffiliated"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "No. BioVax Therapeutics is developing the BVX-101 mRNA oncology vaccine, whereas BioVax Diagnostics is an unaffiliated separate company that produces the BVX Rapid antigen test.",
          citations: [
            { quote: "BioVax Therapeutics developed BVX-101", label: "Therapeutics" },
            { quote: "BioVax Diagnostics, an unaffiliated clinical laboratory company", label: "Diagnostics" },
          ],
        },
      ],
      contextSeparationNotes: ["Distinguished BioVax Therapeutics from unaffiliated BioVax Diagnostics."],
    },
  },

  // H. Questions where two individually true facts create a false combined statement
  {
    id: "bench-h-anti-conflation-false-combination",
    category: "H. Anti-conflation protection",
    title: "Rejecting false causal/joined link between true facts",
    sourceText: `# Quarterly Performance\nIn Q4, AlphaTech recorded $8.2 billion in net revenue. In a separate announcement three weeks later, founder Elena Vance retired from the Board of Directors.`,
    userPrompt: "Did Elena Vance retire because AlphaTech reached $8.2 billion in net revenue?",
    expectedBehavior: {
      answerContains: ["does not state", "separate"],
      answerMustNotContain: ["retired because of", "as a result of the $8.2 billion"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "The source reports that AlphaTech recorded $8.2 billion in Q4 revenue, and separately notes Elena Vance's retirement from the Board of Directors. The evidence does not state that her retirement was caused by the revenue results.",
          citations: [
            { quote: "AlphaTech recorded $8.2 billion in net revenue", label: "Q4 Revenue" },
            { quote: "Elena Vance retired from the Board of Directors", label: "Retirement" },
          ],
        },
      ],
      contextSeparationNotes: ["Prevented causal connection between revenue and executive retirement."],
    },
    flawedPayload: {
      paragraphs: [
        {
          text: "Elena Vance retired from the Board because of AlphaTech recorded $8.2 billion in net revenue.",
          citations: [{ quote: "AlphaTech recorded $8.2 billion in net revenue", label: "Revenue" }],
        },
      ],
    },
  },

  // I. Questions requiring context from surrounding paragraphs
  {
    id: "bench-i-surrounding-context",
    category: "I. Context preservation across paragraphs",
    title: "Condition in section header applying to subsequent statements",
    sourceText: `# Warranty Limitations (Applies Only to Certified Refurbished Units)\nAll internal battery cells are warranted for 90 calendar days from delivery. Enclosure cosmetic blemishes are excluded from warranty claims.`,
    userPrompt: "How long is the battery warranty, and what units does it apply to?",
    expectedBehavior: {
      answerContains: ["90 calendar days", "Certified Refurbished Units"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "Under the Warranty Limitations specifically for Certified Refurbished Units, battery cells are warranted for 90 calendar days from delivery.",
          citations: [
            { quote: "Applies Only to Certified Refurbished Units", label: "Scope" },
            { quote: "battery cells are warranted for 90 calendar days", label: "Battery Warranty" },
          ],
        },
      ],
    },
  },

  // J. Questions where the answer is NOT supported by the page
  {
    id: "bench-j-unsupported-by-page",
    category: "J. Unsupported claims",
    title: "Explicit refusal to answer unsupported question",
    sourceText: `# Quantum Computing Progress Report\nResearchers demonstrated a 64-qubit superconducting processor achieving a two-qubit gate fidelity of 99.4%. The cryogenic dilution refrigerator operated at 15 mK.`,
    userPrompt: "What was the total financial budget and commercial release date for this quantum processor?",
    expectedBehavior: {
      mustBeRefusedOrUnverified: true,
      answerContains: ["cannot verify"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "I cannot verify this from the available evidence. The report provides technical fidelity (99.4%) and temperature (15 mK), but does not mention the financial budget or commercial release date.",
          citations: [],
        },
      ],
      unverifiedClaims: ["financial budget", "commercial release date"],
    },
  },

  // K. Questions requiring "I could not verify that"
  {
    id: "bench-k-explicit-non-verification",
    category: "K. Explicit non-verification",
    title: "Strict non-verification of missing entity claim",
    sourceText: `# Urban Transit Expansion\nThe Metro Authority approved construction of the Blue Line extension to Riverdale Station, spanning 4.2 miles with an estimated completion in 2028.`,
    userPrompt: "Will the Blue Line extension include express trains to the International Airport?",
    expectedBehavior: {
      mustBeRefusedOrUnverified: true,
      answerContains: ["cannot verify"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "I cannot verify this from the available evidence. The text details the Riverdale Station extension, but does not state whether express trains to the International Airport will be included.",
          citations: [{ quote: "Blue Line extension to Riverdale Station, spanning 4.2 miles", label: "Transit Plan" }],
        },
      ],
      unverifiedClaims: ["express trains to International Airport"],
    },
  },

  // L. Questions involving dynamically changing pages (simulated content version change)
  {
    id: "bench-l-dynamic-page",
    category: "L. Dynamically changing pages",
    title: "Cache invalidation on page mutation",
    sourceText: `# Live Auction Status\nCurrent winning bid for Lot 42 is $14,500 by Bidder #812. Reserve price has been met.`,
    userPrompt: "What is the current winning bid for Lot 42?",
    expectedBehavior: {
      answerContains: ["$14,500", "Bidder #812"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "The current winning bid for Lot 42 is $14,500, held by Bidder #812.",
          citations: [{ quote: "winning bid for Lot 42 is $14,500 by Bidder #812", label: "Auction" }],
        },
      ],
    },
  },

  // M. Questions involving long pages (dense text benchmark)
  {
    id: "bench-m-long-pages",
    category: "M. Long pages (50k+ chars)",
    title: "Preserving context in long document",
    sourceText: `# Comprehensive Climate Assessment Report\n` +
      `Paragraph padding section 1: Climate trends across the hemisphere show marked variability.\n`.repeat(100) +
      `## Section 14: Arctic Permafrost Thaw\nCore samples from the Siberian Lena Delta measured active layer deepening of 3.8 cm per decade between 1990 and 2020.\n` +
      `Paragraph padding section 2: Continued monitoring is recommended by multinational scientific teams.\n`.repeat(100),
    userPrompt: "What was the active layer deepening rate measured in the Siberian Lena Delta?",
    expectedBehavior: {
      answerContains: ["3.8 cm per decade", "Lena Delta"],
      requiredCitations: ["active layer deepening of 3.8 cm per decade"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "In the Siberian Lena Delta, core samples recorded active layer deepening of 3.8 cm per decade between 1990 and 2020.",
          citations: [{ quote: "active layer deepening of 3.8 cm per decade between 1990 and 2020", label: "Permafrost" }],
        },
      ],
    },
  },

  // N. Questions involving dense tables
  {
    id: "bench-n-dense-tables",
    category: "N. Dense tables",
    title: "Dense matrix coordinate extraction",
    sourceText: `# Semiconductor Node Comparison\n| Node | Transistor Density (MTr/mm2) | Voltage (V) | Power Reduction (%) |\n| 14nm | 37.5 | 0.85 | Baseline |\n| 10nm | 60.3 | 0.75 | 18% |\n| 7nm | 91.2 | 0.70 | 32% |\n| 5nm | 138.2 | 0.65 | 45% |\n| 3nm | 215.0 | 0.60 | 58% |`,
    userPrompt: "What is the transistor density and power reduction for the 5nm node?",
    expectedBehavior: {
      answerContains: ["5nm", "138.2", "45%"],
      answerMustNotContain: ["91.2", "215.0"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "For the 5nm semiconductor node, transistor density is 138.2 MTr/mm2 with a 45% power reduction relative to baseline.",
          citations: [{ quote: "| 5nm | 138.2 | 0.65 | 45% |", label: "5nm Node" }],
        },
      ],
    },
  },

  // O. Questions involving citations (compound sentence asymmetry check)
  {
    id: "bench-o-citations-compound",
    category: "O. Citation fidelity and compound asymmetry",
    title: "Refusing citation that only covers half of a compound assertion",
    sourceText: `# Renewable Power Infrastructure\nFacility Alpha operates 40 offshore wind turbines in the North Sea. There is no public record regarding battery storage capacity at this location.`,
    userPrompt: "How many turbines and battery storage systems are operated at Facility Alpha?",
    expectedBehavior: {
      answerContains: ["40 offshore wind turbines", "no public record"],
    },
    samplePayload: {
      paragraphs: [
        {
          text: "Facility Alpha operates 40 offshore wind turbines in the North Sea. The source contains no public record regarding battery storage capacity.",
          citations: [{ quote: "operates 40 offshore wind turbines in the North Sea", label: "Wind Turbines" }],
        },
      ],
      unverifiedClaims: ["battery storage capacity"],
    },
    flawedPayload: {
      paragraphs: [
        {
          text: "Facility Alpha operates 40 offshore wind turbines in the North Sea and maintains a 100 MWh battery storage system.",
          citations: [{ quote: "operates 40 offshore wind turbines in the North Sea", label: "Facility Alpha" }],
        },
      ],
    },
  },
];

export async function runComprehensiveBenchmark(): Promise<{
  totalCases: number;
  passedCases: number;
  factualAccuracyPct: number;
  antiConflationAccuracyPct: number;
  citationCorrectnessPct: number;
  avgExtractionMs: number;
  avgValidationMs: number;
  totalBenchmarkMs: number;
}> {
  console.log("================================================================================");
  console.log("RUNNING COMPREHENSIVE FACTUAL QUALITY & LATENCY BENCHMARK (SCENARIOS A - O)");
  console.log("================================================================================\n");

  const startTotal = performance.now();
  let passedCases = 0;
  let conflationTestsPassed = 0;
  let totalConflationTests = 0;
  let citationPasses = 0;
  let totalCitationTests = 0;

  let totalExtractionMs = 0;
  let totalValidationMs = 0;

  for (let i = 0; i < BENCHMARK_SUITE.length; i++) {
    const tc = BENCHMARK_SUITE[i];
    const t0 = performance.now();

    // 1. Measure Extraction / Parsing
    const tExtract0 = performance.now();
    const evidenceItems = parseSourceDocumentIntoEvidence(tc.sourceText);
    const extractDuration = performance.now() - tExtract0;
    totalExtractionMs += extractDuration;

    // 2. Measure Grounding Validation on Sample Payload
    const tVal0 = performance.now();
    const valResult = validateAndEnforceGrounding(tc.samplePayload, tc.sourceText);
    const valDuration = performance.now() - tVal0;
    totalValidationMs += valDuration;

    // 3. If flawed payload exists, test that validator catches it
    let flawedCaught = true;
    if (tc.flawedPayload) {
      totalConflationTests++;
      const flawedResult = validateAndEnforceGrounding(tc.flawedPayload, tc.sourceText);
      flawedCaught = flawedResult.auditReport.issuesDetected.length > 0;
      if (flawedCaught) conflationTestsPassed++;
    }

    // 4. Verify Answer Quality Invariants
    const ansText = valResult.sanitizedPayload.paragraphs.map((p) => p.text).join(" ");
    let textMatches = true;
    for (const phrase of tc.expectedBehavior.answerContains) {
      if (!ansText.toLowerCase().includes(phrase.toLowerCase())) {
        textMatches = false;
        break;
      }
    }
    if (tc.expectedBehavior.answerMustNotContain) {
      for (const forbidden of tc.expectedBehavior.answerMustNotContain) {
        if (ansText.toLowerCase().includes(forbidden.toLowerCase())) {
          textMatches = false;
          break;
        }
      }
    }

    // 5. Verify Citations
    let citationsValid = true;
    if (tc.samplePayload.paragraphs[0]?.citations) {
      for (const cit of tc.samplePayload.paragraphs[0].citations) {
        totalCitationTests++;
        const isVerbatim = verifyQuoteInSource(cit.quote, tc.sourceText);
        if (!isVerbatim) {
          citationsValid = false;
        } else {
          citationPasses++;
        }
      }
    }

    const casePassed = textMatches && citationsValid && flawedCaught;
    if (casePassed) passedCases++;

    console.log(`[${i + 1}/${BENCHMARK_SUITE.length}] ${tc.category}: ${tc.title}`);
    console.log(`    Status: ${casePassed ? "PASS ✓" : "FAIL ✗"} | Extract: ${extractDuration.toFixed(2)}ms | Validate: ${valDuration.toFixed(2)}ms`);
    if (!casePassed) {
      console.log(`    Mismatch in: textMatches=${textMatches}, citationsValid=${citationsValid}, flawedCaught=${flawedCaught}`);
    }
  }

  const totalBenchmarkMs = performance.now() - startTotal;
  const factualAccuracyPct = (passedCases / BENCHMARK_SUITE.length) * 100;
  const antiConflationAccuracyPct = totalConflationTests > 0 ? (conflationTestsPassed / totalConflationTests) * 100 : 100;
  const citationCorrectnessPct = totalCitationTests > 0 ? (citationPasses / totalCitationTests) * 100 : 100;

  console.log("\n================================================================================");
  console.log("BENCHMARK SUMMARY RESULTS:");
  console.log(`Cases Passed:                ${passedCases}/${BENCHMARK_SUITE.length} (${factualAccuracyPct.toFixed(1)}%)`);
  console.log(`Anti-Conflation Rate:        ${antiConflationAccuracyPct.toFixed(1)}%`);
  console.log(`Citation Correctness:        ${citationCorrectnessPct.toFixed(1)}%`);
  console.log(`Avg Extraction Time:         ${(totalExtractionMs / BENCHMARK_SUITE.length).toFixed(2)}ms`);
  console.log(`Avg Validation Time:         ${(totalValidationMs / BENCHMARK_SUITE.length).toFixed(2)}ms`);
  console.log(`Total Suite Runtime:         ${totalBenchmarkMs.toFixed(2)}ms`);
  console.log("================================================================================\n");

  return {
    totalCases: BENCHMARK_SUITE.length,
    passedCases,
    factualAccuracyPct,
    antiConflationAccuracyPct,
    citationCorrectnessPct,
    avgExtractionMs: totalExtractionMs / BENCHMARK_SUITE.length,
    avgValidationMs: totalValidationMs / BENCHMARK_SUITE.length,
    totalBenchmarkMs,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveBenchmark().catch((err) => {
    console.error("Benchmark error:", err);
    process.exit(1);
  });
}
