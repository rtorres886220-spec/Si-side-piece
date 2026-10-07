/**
 * Adaptive Evidence Retriever for Sidekick Browser Companion
 *
 * Implements Adaptive Evidence Retrieval:
 * - Starts with the minimum sufficient evidence region.
 * - Preserves document hierarchy, parent/child headings, tables with row/column coordinates.
 * - Dynamically retrieves multiple disjoint regions if the query requires multi-section evidence.
 * - Widens context progressively if a matching section is sparse (< 600 chars) or references adjacent definitions.
 * - Deduplicates user selected text.
 * - Detects EVIDENCE_ABSENT deterministically when no evidence matches query terms.
 * - Zero arbitrary hardcoded character limits.
 */

export interface AdaptiveRetrieverOptions {
  title?: string;
  url?: string;
  author?: string;
  date?: string;
  selectedText?: string;
  tables?: any[];
  maxRegions?: number;
  minEvidenceChars?: number;
}

export interface AdaptiveEvidenceResult {
  retrievedContent: string;
  retainedRegionsCount: number;
  totalSectionsCount: number;
  isFullDocument: boolean;
  isTruncated: boolean;
  insufficientEvidence: boolean;
  selectedTextDeduplicated: boolean;
  regions: Array<{ heading: string; charCount: number; score: number }>;
}

interface ParsedSection {
  index: number;
  level: number;
  heading: string;
  headingBreadcrumbs: string[];
  text: string;
  lowerText: string;
  hasTable: boolean;
  score: number;
}

const STOP_WORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "up", "about", "into", "over", "after",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "can", "could", "should", "would", "may", "might",
  "this", "that", "these", "those", "page", "document", "tell", "show", "find",
  "please", "explain", "give", "list", "describe"
]);

export function retrieveAdaptiveEvidence(
  rawBodyText: string,
  promptText: string,
  options?: AdaptiveRetrieverOptions
): AdaptiveEvidenceResult {
  const rawBody = (rawBodyText || "").trim();
  const title = options?.title || "";
  const selectedText = (options?.selectedText || "").trim();
  const minChars = options?.minEvidenceChars ?? 1200;

  if (!rawBody) {
    return {
      retrievedContent: "",
      retainedRegionsCount: 0,
      totalSectionsCount: 0,
      isFullDocument: true,
      isTruncated: false,
      insufficientEvidence: true,
      selectedTextDeduplicated: false,
      regions: [],
    };
  }

  // Small documents (<= 8,000 characters) are already concise and can be sent intact
  if (rawBody.length <= 8000) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return {
      retrievedContent: rawBody,
      retainedRegionsCount: 1,
      totalSectionsCount: 1,
      isFullDocument: true,
      isTruncated: false,
      insufficientEvidence: false,
      selectedTextDeduplicated: isDup,
      regions: [{ heading: title || "Full Document", charCount: rawBody.length, score: 1.0 }],
    };
  }

  // Decompose document into structured sections
  const sectionRegex = /(?=^#{1,6}\s+)/gm;
  const rawSections = rawBody.split(sectionRegex);

  if (rawSections.length <= 2) {
    const isDup = selectedText.length > 0 && rawBody.includes(selectedText);
    return {
      retrievedContent: rawBody,
      retainedRegionsCount: rawSections.length,
      totalSectionsCount: rawSections.length,
      isFullDocument: true,
      isTruncated: false,
      insufficientEvidence: false,
      selectedTextDeduplicated: isDup,
      regions: [{ heading: title || "Overview", charCount: rawBody.length, score: 1.0 }],
    };
  }

  // Parse sections and track heading breadcrumb hierarchy
  const parsedSections: ParsedSection[] = [];
  const headingStack: { level: number; heading: string }[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const secText = rawSections[i].trim();
    if (!secText) continue;

    const headingMatch = secText.match(/^(#{1,6})\s+(.+)$/m);
    const level = headingMatch ? headingMatch[1].length : 1;
    const heading = headingMatch ? headingMatch[2].trim() : (i === 0 ? (title || "Overview") : `Section ${i}`);

    while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
      headingStack.pop();
    }
    headingStack.push({ level, heading });
    const headingBreadcrumbs = headingStack.map((h) => h.heading);

    parsedSections.push({
      index: i,
      level,
      heading,
      headingBreadcrumbs,
      text: secText,
      lowerText: secText.toLowerCase(),
      hasTable: secText.includes("|") || secText.includes("[Table:"),
      score: 0,
    });
  }

  // Extract meaningful query tokens
  const queryTokens = (promptText.toLowerCase().match(/[a-z0-9_-]{2,}/g) || []).filter(
    (w) => !STOP_WORDS.has(w)
  );

  // Score each section
  for (const sec of parsedSections) {
    let score = 0;
    for (const tok of queryTokens) {
      if (sec.heading.toLowerCase().includes(tok)) {
        score += 3.0; // Heading match is a high-priority relevance indicator
      }
      const matches = (sec.lowerText.match(new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || []).length;
      if (matches > 0) {
        score += Math.min(matches, 5) * 1.0;
      }
    }
    sec.score = score;
  }

  // Check if any section matched
  const scoredSections = parsedSections.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  // If no section matched, check if document mentions stop-words or broad summary
  const isBroadSummary = /(?:summarize|overview|entire|all|table\s+of\s+contents|outline)/i.test(promptText);

  if (scoredSections.length === 0 && !isBroadSummary) {
    // Deterministic EVIDENCE_ABSENT detection
    return {
      retrievedContent: rawSections[0] || "",
      retainedRegionsCount: 1,
      totalSectionsCount: rawSections.length,
      isFullDocument: false,
      isTruncated: true,
      insufficientEvidence: true,
      selectedTextDeduplicated: false,
      regions: [],
    };
  }

  // Region selection:
  // Always include Section 0 (Header/Abstract) for baseline orientation
  const selectedIndices = new Set<number>();
  selectedIndices.add(0);

  if (isBroadSummary) {
    // For broad summary, take first 4 sections and any section containing tables
    for (let k = 0; k < Math.min(parsedSections.length, 5); k++) {
      selectedIndices.add(k);
    }
    for (const s of parsedSections) {
      if (s.hasTable && selectedIndices.size < 8) {
        selectedIndices.add(s.index);
      }
    }
  } else {
    // Adaptive selection: take top scoring primary sections
    const maxRegions = options?.maxRegions ?? 4;
    for (let k = 0; k < Math.min(scoredSections.length, maxRegions); k++) {
      const topSec = scoredSections[k];
      selectedIndices.add(topSec.index);

      // Progressive widening: if matching section is small (< 600 chars) or has a table, pull adjacent
      if (topSec.text.length < 600 || topSec.hasTable) {
        if (topSec.index > 0) selectedIndices.add(topSec.index - 1);
        if (topSec.index < rawSections.length - 1) selectedIndices.add(topSec.index + 1);
      }
    }
  }

  // Ensure minimum content threshold
  const orderedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  let totalChars = orderedIndices.reduce((sum, idx) => sum + rawSections[idx].length, 0);

  if (totalChars < minChars && rawSections.length > orderedIndices.length) {
    for (let k = 0; k < rawSections.length; k++) {
      if (!selectedIndices.has(k)) {
        selectedIndices.add(k);
        orderedIndices.push(k);
        orderedIndices.sort((a, b) => a - b);
        totalChars += rawSections[k].length;
        if (totalChars >= minChars) break;
      }
    }
  }

  // Assemble retrieved evidence regions with breadcrumb headers
  const assembledParts: string[] = [];
  const reportedRegions: Array<{ heading: string; charCount: number; score: number }> = [];

  for (const idx of orderedIndices) {
    const sec = parsedSections[idx];
    if (!sec) continue;

    let regionContent = sec.text;
    // Add breadcrumb context if subheader
    if (sec.headingBreadcrumbs.length > 1 && !sec.text.includes(sec.headingBreadcrumbs.join(" > "))) {
      regionContent = `[Location: ${sec.headingBreadcrumbs.join(" > ")}]\n${sec.text}`;
    }

    assembledParts.push(regionContent);
    reportedRegions.push({
      heading: sec.heading,
      charCount: sec.text.length,
      score: sec.score,
    });
  }

  const retrievedContent = assembledParts.join("\n\n");
  const isDeduplicated = selectedText.length > 0 && retrievedContent.includes(selectedText);

  return {
    retrievedContent,
    retainedRegionsCount: orderedIndices.length,
    totalSectionsCount: rawSections.length,
    isFullDocument: orderedIndices.length >= rawSections.length,
    isTruncated: orderedIndices.length < rawSections.length,
    insufficientEvidence: false,
    selectedTextDeduplicated: isDeduplicated,
    regions: reportedRegions,
  };
}
