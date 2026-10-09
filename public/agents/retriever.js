/**
 * Sidekick Multi-Agent Evidence Retriever (Manifest V3 Client-Side)
 * Discrete retrieval stage: parses page into structured sections, provides
 * lightweight section catalog for router, gathers targeted sections,
 * and FALLS BACK TO FULL PAGE when nothing specifically matches to prevent
 * false "unverified" answers.
 */

(function () {
  class SidekickRetriever {
    /**
     * Splits body text into indexed sections based on markdown headers and tables
     */
    static parseDocumentSections(bodyText) {
      const text = (bodyText || "").trim();
      if (!text) return [];

      const sectionRegex = /(?=^#{1,6}\s+|^\[Table:\s+)/gm;
      const rawChunks = text.split(sectionRegex);

      const sections = [];
      let currentHeading = "Document Header";

      for (let i = 0; i < rawChunks.length; i++) {
        const chunk = rawChunks[i].trim();
        if (!chunk) continue;

        // Check if heading
        const headingMatch = chunk.match(/^(#{1,6})\s+(.+)$/m);
        const tableMatch = chunk.match(/^\[Table:\s*([^\]]+)\]/m);

        if (headingMatch) {
          currentHeading = headingMatch[2].trim();
        } else if (tableMatch) {
          currentHeading = `Table: ${tableMatch[1].trim()}`;
        }

        sections.push({
          index: sections.length,
          heading: currentHeading,
          preview: chunk.slice(0, 160).replace(/\s+/g, " "),
          fullText: chunk,
          charCount: chunk.length,
        });
      }

      // If document had no headers or tables, return as single section
      if (sections.length === 0 && text) {
        sections.push({
          index: 0,
          heading: "Page Content",
          preview: text.slice(0, 160).replace(/\s+/g, " "),
          fullText: text,
          charCount: text.length,
        });
      }

      return sections;
    }

    /**
     * Generates a compact catalog for the Router model call
     */
    static generateSectionCatalog(sections, maxItems = 25) {
      if (!sections || sections.length === 0) return "No structured sections available.";
      return sections.slice(0, maxItems).map((s) => {
        return `[Sec ${s.index}] ${s.heading} — "${s.preview.slice(0, 80)}..."`;
      }).join("\n");
    }

    /**
     * Gathers evidence for the Answer / Transform Worker
     * Critical Rule: If target_sections is empty or nothing matched,
     * FALL BACK TO FULL CLEAN PAGE TEXT rather than truncating or failing!
     */
    static retrieveEvidence(sections, targetIndices, options = {}) {
      const {
        maxChars = 60000,
        selectedText = "",
        pageTitle = "",
        pageUrl = "",
      } = options;

      let retrievedChunks = [];
      let usedFallback = false;

      // Always include selected text at the top if the user highlighted something
      if (selectedText && selectedText.trim()) {
        retrievedChunks.push(`[Active User Selection]:\n"${selectedText.trim()}"`);
      }

      const validIndices = Array.isArray(targetIndices)
        ? targetIndices.filter((idx) => typeof idx === "number" && idx >= 0 && idx < sections.length)
        : [];

      if (validIndices.length > 0) {
        // Collect requested sections
        for (const idx of validIndices) {
          const sec = sections[idx];
          if (sec) {
            retrievedChunks.push(`[Section: ${sec.heading}]\n${sec.fullText}`);
          }
        }
      } else {
        // FALLBACK: Use full page text across all sections within char budget
        usedFallback = true;
        for (const sec of sections) {
          retrievedChunks.push(`[Section: ${sec.heading}]\n${sec.fullText}`);
        }
      }

      let combined = retrievedChunks.join("\n\n");
      if (combined.length > maxChars) {
        combined = combined.slice(0, maxChars) + "\n\n[... Remaining page text truncated to stay within budget]";
      }

      return {
        evidenceText: combined,
        sectionsCount: validIndices.length > 0 ? validIndices.length : sections.length,
        usedFullPageFallback: usedFallback,
        totalDocSections: sections.length,
      };
    }
  }

  // Export to global scope
  if (typeof window !== "undefined") {
    window.SidekickRetriever = SidekickRetriever;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickRetriever };
  }
})();
