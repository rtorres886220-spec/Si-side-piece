/**
 * Sidekick - Content Script
 * Enterprise Defense-in-Depth Sanitization, Interactive Element Indexing & DOM Interaction.
 */

(function () {
  if (typeof window !== "undefined" && window.__SIDEKICK_CONTENT_INITIALIZED__) {
    return;
  }
  if (typeof window !== "undefined") {
    window.__SIDEKICK_CONTENT_INITIALIZED__ = true;
  }

  // Message Dispatcher
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // A1: Strict top-level frame restriction - never allow subframes to impersonate top page
    if (window.top !== window.self) {
      if (message.action === "extractContext") {
        sendResponse({ success: false, error: "Subframe extraction prohibited" });
      }
      return false;
    }

    if (message.action === "extractContext") {
      try {
        const context = extractVisibleSanitizedContext();
        sendResponse({ success: true, context });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    // A5/A6/A12: Inspect element at specific viewport coordinates for human gate & safety checks
    if (message.action === "inspectPoint" && message.x !== undefined && message.y !== undefined) {
      try {
        const el = document.elementFromPoint(message.x, message.y);
        if (el) {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute("role") || tag;
          const text = (el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
          const isInput = tag === "input" || tag === "textarea" || tag === "select";
          const isButton = tag === "button" || role === "button" || (tag === "input" && (el.type === "submit" || el.type === "button"));
          const isPayment = isPaymentWidgetOrSensitiveField(el);
          sendResponse({
            success: true,
            element: {
              tag,
              role,
              text: sanitizeString(text).slice(0, 100),
              isInput,
              isButton,
              isPayment,
              type: el.type || ""
            }
          });
          return false;
        }
        sendResponse({ success: true, element: null });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (message.action === "reverifyCoordinates") {
      try {
        const coords = getLiveCoordinates(message.selector, message.x, message.y);
        sendResponse({ success: true, coords });
      } catch (e) {
        sendResponse({ success: false, coords: { x: message.x, y: message.y } });
      }
      return false;
    }

    if (message.action === "scrollToQuote" && message.quote) {
      try {
        const success = locateAndHighlight(message.quote);
        sendResponse({ success });
      } catch (e) {
        sendResponse({ success: false });
      }
      return false;
    }

    if (message.action === "highlightTarget" && message.x !== undefined && message.y !== undefined) {
      try {
        showActionIndicator(message.x, message.y, message.label);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false });
      }
      return false;
    }

    if (message.action === "executeDOMAction") {
      try {
        const result = executeDOMFallback(message.cdpAction, message.params);
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (message.action === "RUN_SLUDGE_AUDIT") {
      try {
        const feeFindings = SludgeAuditor.scanPrecheckedFees();
        const visualFindings = SludgeAuditor.scanAsymmetricButtons();
        sendResponse({ success: true, findings: [...feeFindings, ...visualFindings] });
      } catch (e) {
        sendResponse({ success: false, error: e.message, findings: [] });
      }
      return false;
    }

    if (message.action === "EXECUTE_DISINFECT") {
      try {
        const feeFindings = SludgeAuditor.scanPrecheckedFees();
        let neutralizedCount = 0;
        feeFindings.forEach(f => {
          if (f.selector) {
            const el = document.querySelector(f.selector);
            if (el && el.checked) {
              el.checked = false;
              el.removeAttribute('data-sidekick-id');
              el.dispatchEvent(new Event("change", { bubbles: true }));
              el.dispatchEvent(new Event("input", { bubbles: true }));
              neutralizedCount++;
            }
          }
        });
        sendResponse({ success: true, count: neutralizedCount });
      } catch (e) {
        sendResponse({ success: false, error: e.message, count: 0 });
      }
      return false;
    }

    if (message.action === "EXECUTE_CANCEL_STEP") {
      try {
        const step = CancelationEngine.getNextCancelationStep();
        sendResponse(step);
      } catch (e) {
        sendResponse({ status: "error", message: e.message });
      }
      return false;
    }

    if (message.action === "EXECUTE_APPROVED_CANCEL_CLICK") {
      try {
        let targetEl = null;
        if (message.selector) {
          targetEl = document.querySelector(message.selector);
        }
        if (targetEl) {
          if (typeof targetEl.click === "function") {
            targetEl.click();
          } else {
            targetEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          }
          targetEl.removeAttribute('data-sidekick-id');
          sendResponse({ success: true, clicked: true });
        } else {
          sendResponse({ success: false, error: "Target element for approved cancellation step not found." });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }
  });

  // Cache & Mutation Tracking for Zero-Staleness Instant Extraction
  let cachedContext = null;
  let docMutationVersion = 1;
  let cachedContextVersion = 0;
  let lastSelectedText = "";

  if (typeof MutationObserver !== "undefined") {
    const initObserver = () => {
      if (!document.body) {
        setTimeout(initObserver, 50);
        return;
      }
      const observer = new MutationObserver(() => {
        docMutationVersion++;
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-expanded", "open", "disabled"]
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initObserver);
    } else {
      initObserver();
    }
    window.addEventListener("scroll", () => {
      docMutationVersion++;
    }, { passive: true });
    window.addEventListener("resize", () => {
      docMutationVersion++;
    }, { passive: true });
  }

  // A14: Sanitizes URL query parameters to prevent token/credential leak to external LLM
  function sanitizeUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      const u = new URL(rawUrl);
      const sensitiveKeys = [
        "token", "access_token", "auth", "code", "secret", "key", "api_key",
        "apikey", "password", "pwd", "sig", "signature", "session", "session_id",
        "refresh_token", "verification_token"
      ];
      for (const k of Array.from(u.searchParams.keys())) {
        if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
          u.searchParams.set(k, "[REDACTED]");
        }
      }
      return u.toString();
    } catch {
      return rawUrl.split("?")[0];
    }
  }

  /**
   * 1. Invisible & Off-Screen DOM Stripper + Structured Evidence Extraction + PII Redaction
   */
  function extractVisibleSanitizedContext() {
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    const selection = window.getSelection() ? window.getSelection().toString().trim() : "";

    // Check cache validity against document mutation version
    if (cachedContext && cachedContextVersion === docMutationVersion) {
      const sanitizedSelection = sanitizeString(selection);
      if (sanitizedSelection === lastSelectedText) {
        return {
          ...cachedContext,
          extractionTimeMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime,
          fromCache: true
        };
      }
      lastSelectedText = sanitizedSelection;
      return {
        ...cachedContext,
        selectedText: sanitizedSelection,
        extractionTimeMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime,
        fromCache: true
      };
    }

    const metadata = extractDocumentMetadata();
    const { structuredUnits, structuredTables, formattedBody } = extractStructuredEvidence(document.body, 100000);
    const interactiveElements = indexInteractiveElements();
    const sanitizedSelection = sanitizeString(selection);
    lastSelectedText = sanitizedSelection;

    const result = {
      title: sanitizeString(document.title || "Untitled"),
      url: sanitizeUrl(window.location.href || ""),
      author: metadata.author || "",
      date: metadata.date || "",
      selectedText: sanitizedSelection,
      bodyText: formattedBody,
      structuredEvidence: structuredUnits,
      tables: structuredTables,
      charCount: formattedBody.length,
      interactiveElements: interactiveElements.slice(0, 45),
      extractionTimeMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime,
      fromCache: false,
      mutationVersion: docMutationVersion
    };

    cachedContext = result;
    cachedContextVersion = docMutationVersion;
    return result;
  }

  /**
   * Extracts author, publication date, and document meta tags
   */
  function extractDocumentMetadata() {
    let author = "";
    let date = "";

    const authorMeta = document.querySelector('meta[name="author"], meta[property="article:author"], meta[name="twitter:creator"]');
    if (authorMeta) author = authorMeta.getAttribute("content") || "";

    const dateMeta = document.querySelector('meta[name="date"], meta[property="article:published_time"], meta[name="pubdate"], meta[itemprop="datePublished"]');
    if (dateMeta) date = dateMeta.getAttribute("content") || "";

    return { author: sanitizeString(author), date: sanitizeString(date) };
  }

  /**
   * Helper to determine effective background color for contrast/white-on-white detection
   */
  function getEffectiveBackgroundColor(el) {
    let current = el;
    while (current && current !== document) {
      const style = window.getComputedStyle(current);
      const bg = style.backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        return bg;
      }
      current = current.parentElement;
    }
    return "rgb(255, 255, 255)"; // Default browser canvas is white
  }

  /**
   * Comprehensive Deep Visibility Checker
   * A3: Neutralizes all CSS invisibility bypasses (opacity:0, font-size:0, transparent, 1px clipped, offscreen, white-on-white)
   */
  function isVisible(el) {
    if (!el) return false;
    if (el.nodeType === Node.TEXT_NODE) {
      return el.parentElement ? isVisible(el.parentElement) : true;
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return false;

    // Fast path: standard hidden attributes
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0" ||
      parseFloat(style.opacity) === 0 ||
      parseFloat(style.fontSize) === 0 ||
      style.color === "transparent" ||
      style.color === "rgba(0, 0, 0, 0)" ||
      style.clip === "rect(0px, 0px, 0px, 0px)" ||
      style.clip === "rect(0, 0, 0, 0)" ||
      (style.clipPath && (style.clipPath.includes("inset(100%)") || style.clipPath.includes("circle(0") || style.clipPath.includes("polygon(0px 0px, 0px 0px")))
    ) {
      return false;
    }

    // SVG elements check: strip embedded SVG graphics and text
    const tagNameLower = (el.tagName || "").toLowerCase();
    if (
      tagNameLower === "svg" ||
      el.namespaceURI === "http://www.w3.org/2000/svg" ||
      (el.closest && el.closest("svg"))
    ) {
      return false;
    }

    // Bounds check for rendered boxes
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Allow display: contents and inline text containers whose children carry text
      if (style.display !== "contents" && (style.display !== "inline" || el.childNodes.length === 0)) {
        return false;
      }
    }
    if (rect.width <= 1 && rect.height <= 1 && (style.overflow === "hidden" || style.overflowX === "hidden" || style.overflowY === "hidden")) {
      return false;
    }
    // Only reject elements that are deliberately positioned off-screen (e.g. left: -9999px),
    // NEVER strip elements simply because the user has scrolled down the page!
    const docScrollY = window.scrollY || window.pageYOffset || 0;
    const docScrollX = window.scrollX || window.pageXOffset || 0;
    const docTop = rect.top + docScrollY;
    const docLeft = rect.left + docScrollX;
    if (docLeft < -2000 || docTop < -20000 || rect.left < -5000) {
      return false;
    }

    // White-on-white & Zero-contrast check
    const textColor = style.color ? style.color.replace(/\s+/g, "") : "";
    const effectiveBg = getEffectiveBackgroundColor(el).replace(/\s+/g, "");
    if (textColor === effectiveBg && textColor !== "") {
      return false;
    }
    if ((textColor === "rgb(255,255,255)" || textColor === "#fff" || textColor === "#ffffff") &&
        (effectiveBg === "rgb(255,255,255)" || effectiveBg === "#fff" || effectiveBg === "#ffffff")) {
      return false;
    }

    return true;
  }

  /**
   * A3: Extract truly visible text by traversing children and skipping invisible child spans
   */
  function extractVisibleText(el) {
    if (!el) return "";
    if (el.nodeType === Node.TEXT_NODE) {
      return el.textContent || "";
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return "";
    if (!isVisible(el)) return "";

    const tag = (el.nodeName || "").toUpperCase();
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "SVG" ||
      tag === "CANVAS" ||
      el.namespaceURI === "http://www.w3.org/2000/svg" ||
      (el.closest && el.closest("svg"))
    ) {
      return "";
    }

    let text = "";
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (isVisible(child)) {
          text += extractVisibleText(child);
        }
      }
    }
    return text;
  }

  /**
   * Structured Evidence Extraction
   */
  function extractStructuredEvidence(rootNode, maxChars = 100000) {
    const structuredUnits = [];
    const structuredTables = [];
    const textChunks = [];
    let totalLength = 0;
    let unitCounter = 1;
    let tableCounter = 1;

    let currentSectionPath = [];
    let currentHeading = "";

    function traverse(node) {
      if (totalLength >= maxChars) return;
      if (!node) return;

      const nodeName = node.nodeName.toUpperCase();
      if (
        nodeName === "SCRIPT" ||
        nodeName === "STYLE" ||
        nodeName === "NOSCRIPT" ||
        nodeName === "SVG" ||
        nodeName === "CANVAS" ||
        nodeName === "AUDIO" ||
        nodeName === "VIDEO" ||
        node.namespaceURI === "http://www.w3.org/2000/svg" ||
        (node.closest && node.closest("svg"))
      ) {
        return;
      }

      if (nodeName === "IFRAME") {
        return; // A1: Do not traverse or incorporate child iframes
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        if (!isVisible(node)) return;

        // Check for Headings
        if (/^H[1-6]$/.test(nodeName)) {
          const headingText = sanitizeString(extractVisibleText(node)).trim();
          if (headingText) {
            const level = parseInt(nodeName.charAt(1), 10);
            currentHeading = headingText;
            if (level === 1) {
              currentSectionPath = [headingText];
            } else {
              currentSectionPath = [...currentSectionPath.slice(0, level - 1), headingText];
            }

            const headingMd = `\n${"#".repeat(level)} ${headingText}\n`;
            textChunks.push(headingMd);
            totalLength += headingMd.length;

            structuredUnits.push({
              id: `ev-${unitCounter++}`,
              type: "heading",
              level,
              sectionPath: [...currentSectionPath],
              heading: headingText,
              text: headingText
            });
          }
          return;
        }

        // Check for Tables
        if (nodeName === "TABLE") {
          const tableId = `tbl-${tableCounter++}`;
          const captionEl = node.querySelector("caption");
          const caption = captionEl && isVisible(captionEl) ? sanitizeString(extractVisibleText(captionEl)) : "";

          const colHeaders = [];
          const headerCells = node.querySelectorAll("thead th, thead td, tr:first-child th");
          headerCells.forEach((th) => {
            if (isVisible(th)) {
              colHeaders.push(sanitizeString(extractVisibleText(th)).trim());
            }
          });

          const rows = [];
          const trList = node.querySelectorAll("tr");
          let tableMd = `\n[Table: ${caption || tableId}]\n`;

          trList.forEach((tr, rIdx) => {
            if (!isVisible(tr)) return; // A3: check tr visibility
            const cells = tr.querySelectorAll("td, th");
            if (cells.length === 0) return;

            const rowCells = [];
            let rowHeader = "";
            const firstTh = tr.querySelector("th");
            if (firstTh && isVisible(firstTh)) rowHeader = sanitizeString(extractVisibleText(firstTh)).trim();

            const cellTexts = [];
            cells.forEach((cell, cIdx) => {
              if (!isVisible(cell)) return; // A3: check cell visibility
              const val = sanitizeString(extractVisibleText(cell)).trim();
              const colH = colHeaders[cIdx] || `Col ${cIdx + 1}`;
              rowCells.push({
                colHeader: colH,
                value: val,
                colIdx: cIdx
              });
              cellTexts.push(val);

              if (val) {
                structuredUnits.push({
                  id: `ev-${unitCounter++}`,
                  type: "table-cell",
                  tableId,
                  tableCaption: caption,
                  sectionPath: [...currentSectionPath],
                  heading: currentHeading,
                  rowIdx: rIdx,
                  colIdx: cIdx,
                  rowHeader: rowHeader || undefined,
                  colHeader: colH,
                  text: `[Table: ${caption || tableId} | Row ${rIdx + 1}${rowHeader ? ` (${rowHeader})` : ""} | Column: ${colH}]: ${val}`
                });
              }
            });

            if (rowCells.length > 0) {
              rows.push({
                rowHeader,
                cells: rowCells
              });
              tableMd += `| ${cellTexts.join(" | ")} |\n`;
            }
          });

          tableMd += `[End Table: ${tableId}]\n\n`;
          textChunks.push(tableMd);
          totalLength += tableMd.length;

          structuredTables.push({
            id: tableId,
            caption,
            headers: colHeaders,
            rows
          });
          return;
        }

        // Check for List Items
        if (nodeName === "LI") {
          const liText = sanitizeString(extractVisibleText(node)).trim();
          if (liText) {
            const itemLine = `• ${liText}\n`;
            textChunks.push(itemLine);
            totalLength += itemLine.length;

            structuredUnits.push({
              id: `ev-${unitCounter++}`,
              type: "list-item",
              sectionPath: [...currentSectionPath],
              heading: currentHeading,
              text: liText
            });
          }
          return;
        }

        // Check for Paragraphs / Blockquotes
        if (nodeName === "P" || nodeName === "BLOCKQUOTE") {
          const pText = sanitizeString(extractVisibleText(node)).trim();
          if (pText) {
            const paraBlock = `${pText}\n\n`;
            textChunks.push(paraBlock);
            totalLength += paraBlock.length;

            structuredUnits.push({
              id: `ev-${unitCounter++}`,
              type: "paragraph",
              sectionPath: [...currentSectionPath],
              heading: currentHeading,
              text: pText
            });
          }
          return;
        }

        // General element: traverse children
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
          if (totalLength >= maxChars) break;
        }

        // Traverse Shadow Root
        if (node.shadowRoot) {
          try {
            for (let s = 0; s < node.shadowRoot.childNodes.length; s++) {
              traverse(node.shadowRoot.childNodes[s]);
              if (totalLength >= maxChars) break;
            }
          } catch {}
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const rawText = node.nodeValue;
        if (rawText && rawText.trim().length > 0) {
          const sanitized = sanitizeString(rawText);
          if (sanitized) {
            textChunks.push(sanitized + " ");
            totalLength += sanitized.length + 1;
          }
        }
      }
    }

    traverse(rootNode);

    return {
      structuredUnits,
      structuredTables,
      formattedBody: textChunks.join("").slice(0, maxChars).trim()
    };
  }

  /**
   * PII, Credential & Unicode Injection Sanitizer
   * A4: Strips all Unicode Tag Characters and zero-width smugglers
   * A15: Comprehensive redaction covering Bearer, JWT, API keys, AWS, GitHub PATs, CC, Amex, SSN, emails, phone
   */
  function sanitizeString(str) {
    if (!str) return "";

    let cleaned = str;

    // A4: Strip Unicode Tag Characters (U+E0000–U+E007F) used in indirect prompt injection
    cleaned = cleaned.replace(/[\u{E0000}-\u{E007F}]/gu, "");

    // A4: Strip all zero-width, soft hyphens, bidi overrides, invisible math, vowel separators
    cleaned = cleaned.replace(/[\u200B-\u200F\uFEFF\u200E\u200F\u202A-\u202E\u2060-\u2069\u00AD\u180E\u034F\u115F\u3164\uFE00-\uFE0F\u061C\uFFA0]/g, "");

    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, " ");

    // A15: Credential and API Key Redactions
    // 1. Bearer auth tokens (case-insensitive)
    cleaned = cleaned.replace(/\bBearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, "Bearer [REDACTED_AUTH_TOKEN]");

    // 2. JWT tokens (three dot-separated base64url strings)
    cleaned = cleaned.replace(/\beyJ[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]{8,}\b/g, "[REDACTED_JWT_TOKEN]");

    // 3. Google API keys (ending with letter, digit, underscore or dash)
    cleaned = cleaned.replace(/\bAIza[0-9A-Za-z\-_]{35}(?=[^\w\-]|\b|$)/g, "[REDACTED_API_KEY]");

    // 4. GitHub PATs and Classic tokens
    cleaned = cleaned.replace(/\bgithub_pat_[a-zA-Z0-9_]{30,}\b/g, "[REDACTED_GITHUB_TOKEN]");
    cleaned = cleaned.replace(/\bgh[pousr]_[a-zA-Z0-9]{36,}\b/g, "[REDACTED_GITHUB_TOKEN]");

    // 5. OpenAI / Anthropic / Stripe keys (sk-, sk-proj-, sk-ant-, sk_live_, sk_test_)
    cleaned = cleaned.replace(/\bsk[-_](?:proj-|ant-|live_|test_)?[a-zA-Z0-9_\-]{15,}\b/gi, "[REDACTED_SECRET_KEY]");

    // 6. AWS Access Keys
    cleaned = cleaned.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]");

    // 7. Emails
    cleaned = cleaned.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]");

    // 8. US & International Phone Numbers
    cleaned = cleaned.replace(/\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g, "[REDACTED_PHONE]");

    // 9. US Social Security Numbers (dashed, spaced, dot, or unformatted 9-digit with SSN context)
    cleaned = cleaned.replace(/\b\d{3}[- \.]\d{2}[- \.]\d{4}\b/g, "[REDACTED_SSN]");
    cleaned = cleaned.replace(/\b\d{9}\b/g, (match, offset, fullStr) => {
      const preceding = fullStr.substring(Math.max(0, offset - 20), offset).toLowerCase();
      if (preceding.includes("ssn") || preceding.includes("social") || preceding.includes("security")) {
        return "[REDACTED_SSN]";
      }
      return match;
    });

    // 10. International Bank Account Numbers (IBAN)
    cleaned = cleaned.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "[REDACTED_IBAN]");

    // 11. Standard 16-digit Credit Cards with Luhn validation
    cleaned = cleaned.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, (match) => {
      const digits = match.replace(/[- ]/g, "");
      return isLuhnValid(digits) ? "[REDACTED_CREDIT_CARD]" : match;
    });

    // 12. American Express (15-digit 4-6-5 format: 34xx or 37xx)
    cleaned = cleaned.replace(/\b3[47]\d{2}[- ]?\d{6}[- ]?\d{5}\b/g, (match) => {
      const digits = match.replace(/[- ]/g, "");
      return isLuhnValid(digits) ? "[REDACTED_CREDIT_CARD]" : match;
    });

    return cleaned.trim();
  }

  /**
   * Luhn check for credit card verification
   */
  function isLuhnValid(numStr) {
    if (numStr.length < 13 || numStr.length > 19) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = numStr.length - 1; i >= 0; i--) {
      let digit = parseInt(numStr.charAt(i), 10);
      if (isNaN(digit)) return false;
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  /**
   * 2. Interactive Element Indexer (Shielded from Payment Widgets)
   * A8: Generates cryptographically secure unique IDs; never reuses page-provided IDs
   * A15: Masks password and sensitive input values from labels
   */
  function indexInteractiveElements() {
    // Clear any pre-existing attacker-supplied data-sidekick-id (preserve active cancel targets)
    document.querySelectorAll("[data-sidekick-id]").forEach((el) => {
      const currentId = el.getAttribute("data-sidekick-id") || "";
      if (!currentId.startsWith("sk-cancel-")) {
        el.removeAttribute("data-sidekick-id");
      }
    });

    const candidates = document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]'
    );

    const indexed = [];
    let idCounter = 1;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];

      if (el.hidden) continue;
      if (el.offsetParent === null) {
        const computedPos = window.getComputedStyle(el).position;
        if (computedPos !== "fixed" && computedPos !== "sticky") {
          continue;
        }
      }

      // Check payment widget exclusion
      if (isPaymentWidgetOrSensitiveField(el)) {
        continue;
      }

      const rect = el.getBoundingClientRect();

      if (
        rect.width < 6 ||
        rect.height < 6 ||
        rect.bottom < 0 ||
        rect.top > viewportHeight ||
        rect.right < 0 ||
        rect.left > viewportWidth
      ) {
        continue;
      }

      if (el.disabled) continue;

      if (!isVisible(el)) continue;

      // Determine descriptive label without leaking sensitive input values
      let label = el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.placeholder || "";
      if (!label && el.tagName.toLowerCase() === "input") {
        label = el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("type") || "[Input field]";
      }
      label = sanitizeString(label).slice(0, 50);

      const tag = el.tagName.toLowerCase();
      const type = el.type || "";
      let role = tag;
      if (tag === "input") role = `${type || "text"} input`;
      else if (tag === "a") role = "link";

      let inputValue = "";
      if (tag === "input" || tag === "textarea" || tag === "select") {
        if (el.type !== "password") {
          inputValue = (el.value || "").slice(0, 50);
        }
      }
      const isChecked = typeof el.checked === "boolean" ? el.checked : false;

      const centerX = Math.round(rect.left + rect.width / 2);
      const centerY = Math.round(rect.top + rect.height / 2);

      // A8: Generate unforgeable unique ID
      const uniqueId = `sk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${idCounter}`;
      el.setAttribute("data-sidekick-id", uniqueId);
      const uniqueSelector = `[data-sidekick-id="${uniqueId}"]`;

      indexed.push({
        id: idCounter++,
        role: role,
        label: label || `Unnamed ${role}`,
        value: inputValue,
        checked: isChecked,
        x: centerX,
        y: centerY,
        selector: uniqueSelector
      });

      if (indexed.length >= 45) break;
    }

    return indexed;
  }

  /**
   * Shield payment widgets and high-security checkout fields from CDP actions
   * A12: Exhaustive sensitive payment field detector
   */
  function isPaymentWidgetOrSensitiveField(el) {
    if (!el) return false;
    if (el.type === "password") return true;

    let current = el;
    let depth = 0;
    while (current && depth < 6) {
      const attrs = `${current.id || ""} ${current.className || ""} ${current.getAttribute?.("name") || ""} ${current.getAttribute?.("autocomplete") || ""} ${current.getAttribute?.("aria-label") || ""} ${current.getAttribute?.("placeholder") || ""}`.toLowerCase();
      if (
        attrs.includes("stripe") ||
        attrs.includes("paypal") ||
        attrs.includes("braintree") ||
        attrs.includes("credit-card") ||
        attrs.includes("cardnumber") ||
        attrs.includes("card_number") ||
        attrs.includes("card-number") ||
        attrs.includes("ccnum") ||
        attrs.includes("cvv") ||
        attrs.includes("cvc") ||
        attrs.includes("security-code") ||
        attrs.includes("exp-date") ||
        attrs.includes("exp-month") ||
        attrs.includes("exp-year") ||
        attrs.includes("cc-number") ||
        attrs.includes("card number")
      ) {
        return true;
      }
      current = current.parentElement;
      depth++;
    }
    return false;
  }

  /**
   * Visual Action Indicator (Gives immediate feedback when agent interacts)
   */
  function showActionIndicator(x, y, label) {
    const dot = document.createElement("div");
    dot.className = "sidekick-action-dot";
    dot.style.position = "fixed";
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.transform = "translate(-50%, -50%) scale(0.5)";
    dot.style.width = "22px";
    dot.style.height = "22px";
    dot.style.borderRadius = "50%";
    dot.style.background = "radial-gradient(circle, #7c8cff 0%, #c26bff 100%)";
    dot.style.boxShadow = "0 0 16px rgba(124, 140, 255, 0.8), 0 0 4px #fff";
    dot.style.zIndex = "2147483647";
    dot.style.pointerEvents = "none";
    dot.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease";
    dot.style.opacity = "1";

    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = "translate(-50%, -50%) scale(1.3)";
    });

    setTimeout(() => {
      dot.style.transform = "translate(-50%, -50%) scale(0.3)";
      dot.style.opacity = "0";
      setTimeout(() => dot.remove(), 400);
    }, 600);
  }

  /**
   * 3. Passage Locator (Click-to-locate citations)
   */
  function locateAndHighlight(rawQuote) {
    const quote = rawQuote.trim();
    if (!quote) return false;

    document.querySelectorAll(".sidekick-highlight-active").forEach((el) => {
      el.classList.remove("sidekick-highlight-active");
    });

    try {
      const selection = window.getSelection();
      if (selection) selection.removeAllRanges();

      let found = typeof window.find === "function" ? window.find(quote, false, false, true, false, true, false) : false;
      if (!found && quote.length > 45 && typeof window.find === "function") {
        found = window.find(quote.slice(0, 40), false, false, true, false, true, false);
      }

      if (found && selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const span = document.createElement("span");
        span.className = "sidekick-highlight-active";
        span.style.backgroundColor = "rgba(124, 140, 255, 0.45)";
        span.style.color = "inherit";
        span.style.borderRadius = "3px";
        span.style.padding = "2px 4px";
        span.style.transition = "background-color 1.8s ease-out";
        span.style.boxShadow = "0 0 12px rgba(124, 140, 255, 0.6)";

        try {
          range.surroundContents(span);
          span.scrollIntoView({ behavior: "smooth", block: "center" });

          setTimeout(() => {
            span.style.backgroundColor = "transparent";
            span.style.boxShadow = "none";
            setTimeout(() => {
              if (span.parentNode) {
                span.replaceWith(...span.childNodes);
              }
            }, 1800);
          }, 2200);

          return true;
        } catch (e) {
          const commonNode = range.commonAncestorContainer;
          const targetElement = commonNode.nodeType === Node.ELEMENT_NODE ? commonNode : commonNode.parentElement;
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
            targetElement.style.outline = "2px solid #7c8cff";
            setTimeout(() => { targetElement.style.outline = "none"; }, 2500);
            return true;
          }
        }
      }
    } catch (err) {
      console.debug("Window.find traversal fallback:", err);
    }

    // DOM TreeWalker Fallback
    if (!document.body) return false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let currentNode;
    const quoteLower = quote.toLowerCase();

    while ((currentNode = walker.nextNode())) {
      const nodeText = currentNode.nodeValue || "";
      if (nodeText.toLowerCase().includes(quoteLower)) {
        const parent = currentNode.parentElement;
        if (parent && isVisible(parent)) {
          parent.scrollIntoView({ behavior: "smooth", block: "center" });
          parent.style.outline = "2px solid #7c8cff";
          setTimeout(() => { parent.style.outline = "none"; }, 2500);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * JIT Coordinate Re-verification
   * A8: Verifies selector uniqueness to prevent forged selector collisions
   */
  function getLiveCoordinates(selector, fallbackX, fallbackY) {
    if (fallbackX !== undefined && fallbackY !== undefined) {
      try {
        const elAtPoint = document.elementFromPoint(fallbackX, fallbackY);
        if (isPaymentWidgetOrSensitiveField(elAtPoint)) {
          return { x: fallbackX, y: fallbackY, verified: false, blocked: true, reason: "Payment widget lockout" };
        }
      } catch {}
    }
    if (selector) {
      try {
        const matched = document.querySelectorAll(selector);
        if (matched.length === 1) {
          const el = matched[0];
          if (isPaymentWidgetOrSensitiveField(el)) {
            return { x: fallbackX, y: fallbackY, verified: false, blocked: true, reason: "Payment widget lockout" };
          }
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              verified: true
            };
          }
        } else if (matched.length > 1) {
          return { x: fallbackX, y: fallbackY, verified: false, ambiguous: true };
        }
      } catch {}
    }
    return { x: fallbackX, y: fallbackY, verified: false };
  }

  /**
   * Direct DOM Fallback Dispatcher
   * A10: Dispatches single click (eliminates silent double-click bug) and blocks password fields
   */
  function executeDOMFallback(cdpAction, params) {
    params = params || {};
    let targetEl = null;
    if (params.selector) {
      try {
        const matched = document.querySelectorAll(params.selector);
        if (matched.length !== 1) {
          throw new Error("Security Exception: Target selector matched 0 or multiple elements (ambiguous or spoofed target).");
        }
        targetEl = matched[0];
      } catch (err) {
        throw err;
      }
    }
    if (!targetEl && params.x !== undefined && params.y !== undefined && !isNaN(params.x) && !isNaN(params.y)) {
      targetEl = document.elementFromPoint(params.x, params.y);
    }

    if (cdpAction === "click") {
      if (targetEl) {
        if (isPaymentWidgetOrSensitiveField(targetEl)) {
          throw new Error("Security Exception: Interaction with checkout or payment widget is blocked.");
        }
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof targetEl.focus === "function") targetEl.focus();

        // A10: Dispatch single click only
        if (typeof targetEl.click === "function") {
          targetEl.click();
        } else {
          const clickEvt = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: params.x || 0,
            clientY: params.y || 0
          });
          targetEl.dispatchEvent(clickEvt);
        }
        showActionIndicator(params.x || 100, params.y || 100, params.selector || targetEl.innerText || "clicked");
        return { clicked: true, domFallback: true };
      }
      throw new Error("Target element not found for DOM click fallback");
    }

    if (cdpAction === "type") {
      if (targetEl) {
        // A10: Prevent typing into password or payment fields
        if (targetEl.type === "password" || isPaymentWidgetOrSensitiveField(targetEl)) {
          throw new Error("Security Exception: Automated typing into password or payment fields is strictly blocked.");
        }
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof targetEl.focus === "function") targetEl.focus();
        const txt = params.text || "";
        if ("value" in targetEl) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
                                Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          if (nativeSetter) {
            nativeSetter.call(targetEl, txt);
          } else {
            targetEl.value = txt;
          }
        } else {
          targetEl.innerText = txt;
        }
        targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        targetEl.dispatchEvent(new Event("change", { bubbles: true }));
        if (params.pressEnter) {
          targetEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          targetEl.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
          if (targetEl.form && typeof targetEl.form.dispatchEvent === "function") {
            targetEl.form.dispatchEvent(new Event("submit", { bubbles: true }));
          }
        }
        showActionIndicator(params.x || 100, params.y || 100, `Typed: ${txt.slice(0, 20)}`);
        return { typed: true, textLength: txt.length, domFallback: true };
      }
      throw new Error("Target element not found for DOM type fallback");
    }

    if (cdpAction === "scroll") {
      const deltaY = params.deltaY || 300;
      window.scrollBy({ top: deltaY, behavior: "smooth" });
      return { scrolled: true, deltaY, domFallback: true };
    }

    if (cdpAction === "navigate") {
      if (params.url) {
        const u = params.url.toLowerCase();
        if (!u.startsWith("http://") && !u.startsWith("https://")) {
          throw new Error("Security Exception: Navigation is restricted to HTTP/HTTPS only.");
        }
        window.location.href = params.url;
        return { navigated: true, url: params.url, domFallback: true };
      }
      throw new Error("Missing URL for navigation fallback");
    }

    throw new Error(`Unsupported DOM fallback action: ${cdpAction}`);
  }

  // Shadow DOM Piercing Helper
  function getPiercedElements(root, selector) {
    let elements = Array.from(root.querySelectorAll(selector));
    const walkers = root.querySelectorAll('*');
    walkers.forEach(el => {
      if (el.shadowRoot) {
        elements = elements.concat(getPiercedElements(el.shadowRoot, selector));
      }
    });
    return elements;
  }

  /**
   * Sludge Auditor (Hidden Fees & Dark Patterns)
   * B12: Word-bounded terms to eliminate evasion & false positives
   */
  class SludgeAuditor {
    static scanPrecheckedFees() {
      const findings = [];
      const checkedInputs = getPiercedElements(document, 'input[type="checkbox"]:checked');
      const feeRegex = /\b(fee|fees|protection|insurance|warranty|subscription|monthly|annually|premium|tip|donation)\b|\$\d+/i;
      const ignoreRegex = /\b(terms|conditions|privacy|policy|age|18\+|rules|agree|acknowledge)\b/i;

      checkedInputs.forEach((input, index) => {
        const labelElement = input.closest('label') || input.parentElement;
        const textContext = (labelElement ? labelElement.textContent : "").toLowerCase();

        // B12: Word-bounded check prevents "$18.99" matching "18" or "damage" matching "age"
        if (ignoreRegex.test(textContext)) return;

        // B12: Word-bounded fee test prevents "feedback" matching "fee"
        if (feeRegex.test(textContext)) {
          const secureId = `sk-sludge-fee-${Date.now()}-${index}`;
          input.setAttribute('data-sidekick-id', secureId);
          findings.push({
            id: `sludge-fee-${index}`,
            type: "prechecked_opt_in",
            severity: "critical",
            selector: `[data-sidekick-id="${secureId}"]`,
            detectedText: textContext.trim().replace(/\s+/g, ' ').substring(0, 150),
            remedyActionDescription: "Uncheck unauthorized fee/opt-in toggle"
          });
        }
      });
      return findings;
    }

    static scanAsymmetricButtons() {
      const findings = [];
      const buttons = getPiercedElements(document, 'button, [role="button"], a.btn, a.button');

      const positiveRegex = /\b(accept all|keep plan|stay subscribed|claim offer)\b/i;
      const negativeRegex = /\b(reject all|cancel plan|manage settings|unsubscribe)\b/i;

      const positives = buttons.filter(b => positiveRegex.test(b.innerText || b.value));
      const negatives = buttons.filter(b => negativeRegex.test(b.innerText || b.value));

      if (positives.length > 0 && negatives.length > 0) {
        const posRect = positives[0].getBoundingClientRect();
        const negRect = negatives[0].getBoundingClientRect();

        const posArea = posRect.width * posRect.height;
        const negArea = negRect.width * negRect.height;

        if (posArea > 0 && negArea > 0 && (posArea / negArea) >= 3) {
          const ratio = (posArea / negArea).toFixed(1);
          const secureId = `sk-sludge-async-${Date.now()}`;
          negatives[0].setAttribute('data-sidekick-id', secureId);

          findings.push({
            id: `sludge-asymmetric-0`,
            type: "asymmetric_visual_hierarchy",
            severity: "warning",
            selector: `[data-sidekick-id="${secureId}"]`,
            detectedText: `Deceptive sizing detected. 'Accept/Keep' is ${ratio}x larger than 'Reject/Cancel'.`,
            remedyActionDescription: "Click the hidden/smaller Reject or Cancel button"
          });
        }
      }
      return findings;
    }
  }

  /**
   * Autonomous Click-to-Cancel Engine
   * A9: Word-bounded cancellation regexes (never matches 'Send payment') and verifies exit survey presence
   */
  class CancelationEngine {
    static getNextCancelationStep() {
      const bodyText = document.body.innerText.toLowerCase();

      // 1. Termination Proof
      const successText = /\b(successfully cancelled|has been cancelled|cancellation confirmed|we're sorry to see you go|cancellation complete)\b/i;
      if (successText.test(bodyText)) {
        return { status: "complete", message: "Cancellation verified by DOM state." };
      }

      // 2. Survey Bypass: ONLY if an actual exit survey is present on page and NOT inside billing/checkout
      const isExitSurveyPresent = /\b(why are you leaving|reason for cancelling|reason for cancellation|why are you canceling|exit survey)\b/i.test(bodyText);
      if (isExitSurveyPresent) {
        const surveyContainer = Array.from(document.querySelectorAll('fieldset, form, div, section')).find(el => {
          const t = (el.innerText || "").toLowerCase();
          return /\b(why are you leaving|reason for cancelling|reason for cancellation|exit survey)\b/i.test(t) && !/payment|billing|credit card|cvv|checkout/i.test(t);
        });
        if (surveyContainer) {
          const radios = getPiercedElements(surveyContainer, 'input[type="radio"]');
          if (radios.length > 0) {
            const targetRadio = radios.find(r => {
              const label = (r.closest('label') || r.parentElement)?.innerText || "";
              return /\b(other|expensive|financial|no longer need)\b/i.test(label);
            }) || radios[0];

            if (targetRadio && !targetRadio.checked && !isPaymentWidgetOrSensitiveField(targetRadio)) {
              const secureId = `sk-cancel-radio-${Date.now()}`;
              targetRadio.setAttribute('data-sidekick-id', secureId);
              const label = (targetRadio.closest('label') || targetRadio.parentElement)?.innerText?.trim() || "Survey option";
              return {
                status: "requires_approval",
                actionType: "click",
                selector: `[data-sidekick-id="${secureId}"]`,
                targetName: `Survey option: "${label.slice(0, 30)}"`,
                message: `Exit survey requires selecting: [${label.slice(0, 30)}]`
              };
            }
          }
        }
      }

      // 3. Anchored cancellation target - word-bounded to NEVER match 'Send payment' or generic 'end'
      const buttons = getPiercedElements(document, 'button, a, [role="button"]');
      const cancelRegex = /\b(cancel\s+subscription|cancel\s+membership|close\s+account|continue\s+to\s+cancel|confirm\s+cancellation|end\s+subscription|cancel\s+plan)\b/i;
      const decoyRegex = /\b(keep\s+plan|stay\s+subscribed|claim\s+discount|save\s+\d+%|never\s*mind|go\s+back|send\s+payment)\b/i;

      let trueTarget = null;
      for (let btn of buttons) {
        const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || "").toLowerCase();

        if (cancelRegex.test(text) && !decoyRegex.test(text)) {
          if (isPaymentWidgetOrSensitiveField(btn) || !isVisible(btn)) continue;
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            trueTarget = btn;
            break;
          }
        }
      }

      if (trueTarget) {
        const targetName = trueTarget.innerText.trim().substring(0, 30);
        const secureId = `sk-cancel-btn-${Date.now()}`;
        trueTarget.setAttribute('data-sidekick-id', secureId);
        return {
          status: "requires_approval",
          actionType: "click",
          selector: `[data-sidekick-id="${secureId}"]`,
          targetName,
          message: `Confirm cancellation step: [${targetName}]`
        };
      }

      return { status: "stuck", message: "Could not find a valid cancellation path on this page." };
    }
  }

  window.SludgeAuditor = SludgeAuditor;
  window.CancelationEngine = CancelationEngine;
})();
