/**
 * Sidekick - Content Script
 * Enterprise Defense-in-Depth Sanitization, Interactive Element Indexing & DOM Interaction.
 */

(function () {
  const Node = (typeof window !== "undefined" && window.Node) ? window.Node : (typeof globalThis !== "undefined" && globalThis.Node ? globalThis.Node : { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9 });
  const CSS = (typeof window !== "undefined" && window.CSS) ? window.CSS : { escape: (s) => String(s).replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, "\\$1") };
  // If re-injected after extension reload, unbind stale listener if any
  if (typeof window !== "undefined" && window.__SIDEKICK_MESSAGE_LISTENER__) {
    try {
      chrome.runtime.onMessage.removeListener(window.__SIDEKICK_MESSAGE_LISTENER__);
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.__SIDEKICK_CONTENT_INITIALIZED__ = true;
  }

  // Message Dispatcher
  const messageHandler = (message, sender, sendResponse) => {
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

    if (message.action === "capturePreState") {
      try {
        const state = capturePreStateSnapshot(message.selector);
        sendResponse({ success: true, state });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (message.action === "verifyPostState") {
      try {
        const result = verifyPostActionOutcome(message.cdpAction, message.selector, message.preState, message.expectedPostcondition);
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
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

    if (message.action === "PARSE_SURVEY") {
      try {
        const surveyData = SurveyDOMEngine.parseQuestions(document, {
          surveySelector: message.surveySelector || message.params?.surveySelector,
        });
        sendResponse({ success: true, surveyData });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (message.action === "INTERACT_SURVEY_CONTROL") {
      try {
        const result = SurveyDOMEngine.interactControl(message.params);
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (message.action === "VERIFY_SURVEY_SELECTION") {
      try {
        const state = SurveyDOMEngine.verifyQuestionState(message.questionId);
        sendResponse({ success: true, state });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }

    if (message.action === "ADVANCE_SURVEY_PAGE") {
      try {
        const result = SurveyDOMEngine.advancePage(message.actionType, message.selector);
        sendResponse({ success: true, result });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return false;
    }
  };

  if (typeof window !== "undefined") {
    window.__SIDEKICK_MESSAGE_LISTENER__ = messageHandler;
  }
  chrome.runtime.onMessage.addListener(messageHandler);

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
    effectiveBgCache = new WeakMap();
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
      interactiveElements: interactiveElements.slice(0, 80),
      surveyData: (typeof SurveyDOMEngine !== "undefined") ? SurveyDOMEngine.parseQuestions() : null,
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
   * Helper to determine effective background color for contrast/white-on-white detection.
   * Uses WeakMap memoization and detects dark-mode color-scheme canvas defaults.
   */
  let effectiveBgCache = new WeakMap();

  function getEffectiveBackgroundColor(el) {
    if (!el || el === document) {
      return { color: "rgb(255, 255, 255)", isExplicit: false };
    }
    if (effectiveBgCache.has(el)) {
      return effectiveBgCache.get(el);
    }

    let current = el;
    let depth = 0;
    let foundBg = null;

    while (current && current !== document && depth < 8) {
      if (effectiveBgCache.has(current)) {
        foundBg = effectiveBgCache.get(current);
        break;
      }
      try {
        const style = window.getComputedStyle(current);
        const bg = style.backgroundColor;
        if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
          foundBg = { color: bg, isExplicit: true };
          break;
        }
      } catch {}
      current = current.parentElement;
      depth++;
    }

    if (!foundBg) {
      let isDark = false;
      try {
        const htmlStyle = window.getComputedStyle(document.documentElement);
        const colorScheme = htmlStyle.colorScheme || "";
        isDark = colorScheme.includes("dark") ||
          (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      } catch {}
      foundBg = {
        color: isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
        isExplicit: false
      };
    }

    effectiveBgCache.set(el, foundBg);
    return foundBg;
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
    const isSyntheticDom = typeof window !== "undefined" && window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes("jsdom");
    const rect = el.getBoundingClientRect();
    if (!isSyntheticDom) {
      if (rect.width === 0 && rect.height === 0) {
        // Allow display: contents and inline text containers whose children carry text
        if (style.display !== "contents" && (style.display !== "inline" || el.childNodes.length === 0)) {
          return false;
        }
      }
      if (rect.width <= 1 && rect.height <= 1 && (style.overflow === "hidden" || style.overflowX === "hidden" || style.overflowY === "hidden")) {
        return false;
      }
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

    // White-on-white & Zero-contrast check (only if background was explicitly defined)
    const textColor = style.color ? style.color.replace(/\s+/g, "") : "";
    const bgInfo = getEffectiveBackgroundColor(el);
    const effectiveBg = (bgInfo.color || "").replace(/\s+/g, "");

    if (bgInfo.isExplicit) {
      if (textColor === effectiveBg && textColor !== "") {
        return false;
      }
      if ((textColor === "rgb(255,255,255)" || textColor === "#fff" || textColor === "#ffffff") &&
          (effectiveBg === "rgb(255,255,255)" || effectiveBg === "#fff" || effectiveBg === "#ffffff")) {
        return false;
      }
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

    // 8. US & International Phone Numbers (requires formatting delimiters to prevent corrupting raw 10-digit order IDs)
    cleaned = cleaned.replace(/(?:^|[^\w+])(?:\+?1[-. ]?)?(?:\(\d{3}\)[-. ]|\d{3}[-. ])\d{3}[-. ]\d{4}\b/g, (m) => {
      const prefix = m.startsWith(" ") ? " " : "";
      return `${prefix}[REDACTED_PHONE]`;
    });

    // 9. US Social Security Numbers (dashed, spaced, dot, or unformatted 9-digit with SSN context)
    cleaned = cleaned.replace(/\b\d{3}[- \.]\d{2}[- \.]\d{4}\b/g, "[REDACTED_SSN]");
    cleaned = cleaned.replace(/\b\d{9}\b/g, (match, offset, fullStr) => {
      const preceding = fullStr.substring(Math.max(0, offset - 20), offset).toLowerCase();
      if (preceding.includes("ssn") || preceding.includes("social") || preceding.includes("security")) {
        return "[REDACTED_SSN]";
      }
      return match;
    });

    // 10. International Bank Account Numbers (IBAN with ISO 7064 Mod-97 checksum validation)
    cleaned = cleaned.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (match) => {
      return isIbanValid(match) ? "[REDACTED_IBAN]" : match;
    });

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
   * ISO 7064 Mod 97-10 checksum check for International Bank Account Numbers (IBAN)
   */
  function isIbanValid(ibanStr) {
    const clean = String(ibanStr || "").replace(/[\s-]/g, "").toUpperCase();
    if (clean.length < 15 || clean.length > 34) return false;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) return false;
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    let digits = "";
    for (let i = 0; i < rearranged.length; i++) {
      const code = rearranged.charCodeAt(i);
      if (code >= 65 && code <= 90) {
        digits += (code - 55).toString();
      } else {
        digits += rearranged[i];
      }
    }
    let remainder = 0;
    for (let i = 0; i < digits.length; i++) {
      remainder = (remainder * 10 + parseInt(digits[i], 10)) % 97;
    }
    return remainder === 1;
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
      'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="radio"], [role="checkbox"], [role="combobox"], [role="listbox"], [role="option"], [role="switch"], summary'
    );

    const indexed = [];
    let idCounter = 1;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];

      if (el.hidden) continue;

      // Check payment widget exclusion
      if (isPaymentWidgetOrSensitiveField(el)) {
        continue;
      }

      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;

      const tag = el.tagName.toLowerCase();
      const type = (el.type || "").toLowerCase();
      let role = tag;
      if (tag === "input") role = `${type || "text"} input`;
      else if (tag === "a") role = "link";
      else if (el.getAttribute("role")) role = el.getAttribute("role");

      // Label Resolution (with label[for], parent label, aria-labelledby, sibling text)
      let label = "";
      let assocLabelEl = null;

      if (tag === "input" && (type === "radio" || type === "checkbox")) {
        if (el.id) {
          try { assocLabelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); } catch {}
        }
        if (!assocLabelEl) {
          assocLabelEl = el.closest("label");
        }
        if (assocLabelEl) {
          try {
            const clone = assocLabelEl.cloneNode(true);
            clone.querySelectorAll("input, select, textarea").forEach((c) => c.remove());
            label = (clone.innerText || clone.textContent || "").trim();
          } catch {}
        }
      }

      if (!label) {
        if (el.getAttribute("aria-label")) {
          label = el.getAttribute("aria-label");
        } else if (el.getAttribute("aria-labelledby")) {
          const ids = el.getAttribute("aria-labelledby").split(/\s+/);
          const parts = ids.map((id) => {
            const partEl = document.getElementById(id);
            return partEl ? (partEl.innerText || partEl.textContent || "") : "";
          }).filter(Boolean);
          if (parts.length > 0) label = parts.join(" ");
        }
      }

      if (!label && assocLabelEl) {
        label = assocLabelEl.innerText || assocLabelEl.textContent || "";
      }

      if (!label) {
        label = el.innerText || el.textContent || el.getAttribute("title") || el.placeholder || "";
      }

      if (!label && tag === "input") {
        label = el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("type") || "[Input field]";
      }
      label = sanitizeString(label).slice(0, 60);

      // Question / Section Group Context Extraction
      let groupText = "";
      try {
        const groupContainer = el.closest('fieldset, [role="radiogroup"], [role="group"], .question, [data-question-id], .survey-question, [class*="question"], tr, [role="row"], .form-group, form');
        if (groupContainer) {
          const headerEl = groupContainer.querySelector('legend, h1, h2, h3, h4, h5, h6, .question-title, [class*="title"], [class*="label"], th');
          if (headerEl && headerEl !== el && !el.contains(headerEl)) {
            groupText = sanitizeString(headerEl.innerText || headerEl.textContent || "");
          } else if (groupContainer.getAttribute("aria-label")) {
            groupText = sanitizeString(groupContainer.getAttribute("aria-label"));
          }
        }
      } catch {}

      // Target bounds computation: for hidden inputs with visible label, use label rect
      let rect = el.getBoundingClientRect();
      let targetElForCoords = el;
      if ((rect.width < 6 || rect.height < 6 || window.getComputedStyle(el).opacity === "0") && assocLabelEl) {
        const labelRect = assocLabelEl.getBoundingClientRect();
        if (labelRect.width >= 6 && labelRect.height >= 6) {
          rect = labelRect;
          targetElForCoords = assocLabelEl;
        }
      }

      // Check visibility & bounds
      if (rect.width < 4 && rect.height < 4) continue;
      if (rect.bottom < -200 || rect.top > viewportHeight + 1500) continue; // within reasonable page scroll reach

      if (el.offsetParent === null && targetElForCoords.offsetParent === null) {
        const computedPos = window.getComputedStyle(el).position;
        if (computedPos !== "fixed" && computedPos !== "sticky") {
          continue;
        }
      }

      let inputValue = "";
      if (tag === "input" || tag === "textarea" || tag === "select") {
        if (type !== "password") {
          inputValue = (el.value || "").slice(0, 50);
        }
      }
      const isChecked = Boolean(el.checked || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true");

      const centerX = Math.round(rect.left + rect.width / 2);
      const centerY = Math.round(rect.top + rect.height / 2);

      // Check pointer-events overlay interception
      let isIntercepted = false;
      let interceptedBy = "";
      if (centerX >= 0 && centerX <= viewportWidth && centerY >= 0 && centerY <= viewportHeight) {
        try {
          const topEl = document.elementFromPoint(centerX, centerY);
          if (topEl && topEl !== targetElForCoords && !targetElForCoords.contains(topEl) && !topEl.contains(targetElForCoords)) {
            isIntercepted = true;
            interceptedBy = topEl.tagName.toLowerCase() + (topEl.className ? "." + String(topEl.className).split(" ")[0] : "");
          }
        } catch {}
      }

      // Generate unforgeable unique ID
      const uniqueId = `sk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${idCounter}`;
      el.setAttribute("data-sidekick-id", uniqueId);
      const uniqueSelector = `[data-sidekick-id="${uniqueId}"]`;

      let labelSelector = undefined;
      if (assocLabelEl) {
        const labelUniqueId = `sk-lbl-${Date.now()}-${idCounter}`;
        assocLabelEl.setAttribute("data-sidekick-id", labelUniqueId);
        labelSelector = `[data-sidekick-id="${labelUniqueId}"]`;
      }

      indexed.push({
        id: idCounter++,
        role: role,
        label: label || `Unnamed ${role}`,
        associatedLabel: assocLabelEl ? sanitizeString(assocLabelEl.innerText || assocLabelEl.textContent || "").slice(0, 60) : undefined,
        group: groupText ? groupText.slice(0, 60) : undefined,
        context: groupText ? groupText.slice(0, 60) : undefined,
        value: inputValue,
        checked: isChecked,
        x: centerX,
        y: centerY,
        selector: uniqueSelector,
        labelSelector: labelSelector,
        isIntercepted,
        interceptedBy: isIntercepted ? interceptedBy : undefined
      });

      if (indexed.length >= 80) break;
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
   * Detects stale elements, coordinate drift, and ambiguous targets
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
        if (matched.length === 0) {
          return { x: fallbackX, y: fallbackY, verified: false, stale: true, reason: "Element no longer exists in DOM (stale target)" };
        }
        if (matched.length > 1) {
          return { x: fallbackX, y: fallbackY, verified: false, ambiguous: true, reason: `Target selector matched ${matched.length} elements (ambiguous target)` };
        }
        const el = matched[0];
        if (!el.isConnected) {
          return { x: fallbackX, y: fallbackY, verified: false, stale: true, reason: "Target element is disconnected from active document (stale reference)" };
        }
        if (isPaymentWidgetOrSensitiveField(el)) {
          return { x: fallbackX, y: fallbackY, verified: false, blocked: true, reason: "Payment widget lockout" };
        }

        // Scroll element into view smoothly and securely
        if (typeof el.scrollIntoView === "function") {
          try {
            el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
          } catch {}
        }

        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || el.hidden) {
          return { x: fallbackX, y: fallbackY, verified: false, stale: true, reason: "Target element is hidden or detached (display:none/hidden)" };
        }

        let rect = el.getBoundingClientRect();
        let targetElForCoords = el;

        // If target is offscreen, zero-dimension, pointer-events none, or opacity:0 input, locate its associated label
        const isOffscreenOrStyledInput = rect.width <= 0 || rect.height <= 0 || style.opacity === "0" ||
          style.pointerEvents === "none" || rect.left < 0 || rect.top < 0 || rect.bottom <= 0;

        if (isOffscreenOrStyledInput || (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox"))) {
          let assocLabel = null;
          if (el.id) {
            try { assocLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); } catch {}
          }
          if (!assocLabel && typeof el.closest === "function") {
            assocLabel = el.closest("label");
          }
          if (!assocLabel && el.parentElement) {
            assocLabel = el.parentElement.querySelector("label");
          }
          if (assocLabel) {
            const lRect = assocLabel.getBoundingClientRect();
            if (lRect.width > 0 && lRect.height > 0) {
              rect = lRect;
              targetElForCoords = assocLabel;
            }
          }
        }

        if (rect.width <= 0 || rect.height <= 0) {
          return { x: fallbackX, y: fallbackY, verified: false, stale: true, reason: "Target element has zero dimensions in viewport" };
        }

        let liveX = Math.round(rect.left + rect.width / 2);
        let liveY = Math.round(rect.top + rect.height / 2);

        // Check if pointer events are intercepted by a sticky header, dialog, or backdrop overlay
        let isIntercepted = false;
        let interceptedBy = "";
        try {
          let topEl = document.elementFromPoint(liveX, liveY);
          if (topEl && topEl !== targetElForCoords && !targetElForCoords.contains(topEl) && !topEl.contains(targetElForCoords)) {
            // Attempt smart sticky header clearance by scrolling down slightly if topEl is a header/nav
            if (topEl.matches && topEl.matches("header, nav, .sticky-header, [class*='header'], [class*='nav']")) {
              try {
                window.scrollBy({ top: 100, behavior: "instant" });
                rect = targetElForCoords.getBoundingClientRect();
                liveX = Math.round(rect.left + rect.width / 2);
                liveY = Math.round(rect.top + rect.height / 2);
                topEl = document.elementFromPoint(liveX, liveY);
              } catch {}
            }
            if (topEl && topEl !== targetElForCoords && !targetElForCoords.contains(topEl) && !topEl.contains(targetElForCoords)) {
              isIntercepted = true;
              interceptedBy = topEl.tagName.toLowerCase() + (topEl.className ? "." + String(topEl.className).split(" ")[0] : "");
            }
          }
        } catch {}

        return {
          x: liveX,
          y: liveY,
          verified: !isIntercepted,
          isIntercepted,
          interceptedBy: isIntercepted ? interceptedBy : undefined,
          targetSelector: selector
        };
      } catch (err) {
        return { x: fallbackX, y: fallbackY, verified: false, error: err.message };
      }
    }
    return { x: fallbackX, y: fallbackY, verified: false };
  }

  /**
   * Captures a comprehensive pre-action state snapshot for truthful post-action verification.
   */
  function capturePreStateSnapshot(selector) {
    let el = null;
    if (selector) {
      try { el = document.querySelector(selector); } catch {}
    }
    const openModals = document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], dialog[open], .modal:not(.hidden), .popup:not(.hidden), .overlay:not(.hidden)'
    );

    return {
      url: window.location.href,
      mutationVersion: docMutationVersion,
      openModalCount: openModals.length,
      inputValue: el && ("value" in el) ? el.value : undefined,
      elementsCount: document.querySelectorAll("button, a, input, select, textarea").length,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
      elementState: el ? {
        disabled: Boolean(el.disabled),
        checked: Boolean(el.checked || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true"),
        text: (el.innerText || el.textContent || "").trim().slice(0, 100)
      } : null
    };
  }

  /**
   * Verifies post-action outcomes against pre-action state and expected postconditions.
   * Catches dead clicks, intercepted clicks, and reports truthful execution status.
   */
  function verifyPostActionOutcome(cdpAction, selector, preState, expectedPostcondition) {
    let el = null;
    if (selector) {
      try { el = document.querySelector(selector); } catch {}
    }

    // Overlay interception check
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const cx = Math.round(rect.left + rect.width / 2);
        const cy = Math.round(rect.top + rect.height / 2);
        if (cx >= 0 && cx <= window.innerWidth && cy >= 0 && cy <= window.innerHeight) {
          try {
            const topEl = document.elementFromPoint(cx, cy);
            if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
              const isOver = topEl.matches?.('.modal-backdrop, .overlay, [role="dialog"], [role="alertdialog"], .sticky-header, header, .banner, [class*="modal"], [class*="overlay"]') ||
                window.getComputedStyle(topEl).position === "fixed";
              if (isOver) {
                return {
                  success: false,
                  outcome: "intercepted",
                  isIntercepted: true,
                  interceptedBy: topEl.tagName.toLowerCase() + (topEl.className ? "." + String(topEl.className).split(" ")[0] : ""),
                  reason: `Click intercepted by pointer overlay (${topEl.tagName.toLowerCase()})`
                };
              }
            }
          } catch {}
        }
      }
    }

    // Explicit postcondition verification
    if (expectedPostcondition) {
      // Resolve input element if target is a <label> or wrapper
      let targetInput = el;
      if (el && el.tagName === "LABEL") {
        targetInput = (el.htmlFor ? document.getElementById(el.htmlFor) : null) || el.querySelector("input") || el;
      } else if (el && !("checked" in el) && el.querySelector("input")) {
        targetInput = el.querySelector("input") || el;
      }

      if (expectedPostcondition.type === "radio_checked" || expectedPostcondition.type === "radio") {
        const isChecked = targetInput ? Boolean(targetInput.checked || targetInput.getAttribute?.("aria-checked") === "true" || targetInput.getAttribute?.("aria-selected") === "true") : false;
        return {
          success: isChecked,
          outcome: isChecked ? "radio_verified" : "radio_not_checked",
          reason: isChecked ? "Radio button verified checked" : "Radio button was not checked after click"
        };
      }

      if (expectedPostcondition.type === "checkbox_state" || expectedPostcondition.type === "checkbox") {
        const isChecked = targetInput ? Boolean(targetInput.checked || targetInput.getAttribute?.("aria-checked") === "true") : false;
        const matches = expectedPostcondition.expectedChecked !== undefined ? isChecked === expectedPostcondition.expectedChecked : isChecked;
        return {
          success: matches,
          outcome: matches ? "checkbox_verified" : "checkbox_state_mismatch",
          reason: matches ? "Checkbox verified" : `Checkbox expected ${expectedPostcondition.expectedChecked} but observed ${isChecked}`
        };
      }

      if (expectedPostcondition.type === "dropdown_selected" || expectedPostcondition.type === "select") {
        if (el) {
          let val = el.value;
          let text = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex]?.text : (el.innerText || el.textContent || "").trim();
          
          // Check custom dropdown components with hidden inputs or aria-selected
          if (!val) {
            const container = el.closest(".dropdown, .custom-select, [role='combobox'], [role='listbox'], form") || el.parentElement;
            const hiddenInput = container ? container.querySelector('input[type="hidden"]') : null;
            if (hiddenInput && hiddenInput.value) {
              val = hiddenInput.value;
            }
            const selectedOpt = container ? container.querySelector('[aria-selected="true"], [role="option"][aria-selected="true"]') : null;
            if (selectedOpt) {
              text = (selectedOpt.innerText || selectedOpt.textContent || "").trim();
              if (!val) val = selectedOpt.getAttribute("data-value") || selectedOpt.getAttribute("value") || text;
            }
          }

          const verified = (expectedPostcondition.expectedValue !== undefined && val === expectedPostcondition.expectedValue) ||
            (expectedPostcondition.expectedLabel && text && text.toLowerCase().includes(expectedPostcondition.expectedLabel.toLowerCase())) ||
            (el.getAttribute?.("aria-selected") === "true");

          return {
            success: Boolean(verified),
            outcome: verified ? "select_verified" : "select_mismatch",
            reason: verified ? "Dropdown option selected" : `Dropdown mismatch: expected ${expectedPostcondition.expectedValue || expectedPostcondition.expectedLabel}, got val=${val}, text=${text}`
          };
        }
      }

      if (expectedPostcondition.type === "text_value" || expectedPostcondition.type === "type") {
        if (targetInput && ("value" in targetInput)) {
          const verified = expectedPostcondition.expectedValue !== undefined
            ? targetInput.value.includes(expectedPostcondition.expectedValue)
            : targetInput.value.length > 0;
          return {
            success: Boolean(verified),
            outcome: verified ? "text_verified" : "text_mismatch",
            reason: verified ? "Text input verified" : `Text input did not contain expected value "${expectedPostcondition.expectedValue}". Observed: "${targetInput.value}"`
          };
        }
      }

      if (expectedPostcondition.type === "expand_collapse" || expectedPostcondition.type === "accordion") {
        const isExpanded = el ? Boolean(el.getAttribute?.("aria-expanded") === "true" || el.open === true) : false;
        const matches = expectedPostcondition.expectedExpanded !== undefined ? isExpanded === expectedPostcondition.expectedExpanded : isExpanded;
        return {
          success: matches,
          outcome: matches ? "expand_verified" : "expand_mismatch",
          reason: matches ? "Expand/collapse state verified" : `Expected expanded=${expectedPostcondition.expectedExpanded}, observed=${isExpanded}`
        };
      }

      if (expectedPostcondition.type === "navigation") {
        const currentUrl = window.location.href;
        const navigated = !preState || currentUrl !== preState.url;
        return {
          success: navigated,
          outcome: navigated ? "navigation_verified" : "navigation_pending",
          reason: navigated ? `Navigated to ${currentUrl}` : "Page URL did not change"
        };
      }
    }

    if (!preState) {
      return { success: true, outcome: "unverified", reason: "Pre-state snapshot was unavailable for comparison." };
    }

    const currentUrl = window.location.href;
    if (currentUrl !== preState.url) {
      return { success: true, outcome: "navigation", reason: `Navigated from ${preState.url} to ${currentUrl}` };
    }

    const currentModals = document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], dialog[open], .modal:not(.hidden), .popup:not(.hidden), .overlay:not(.hidden)'
    );
    if (currentModals.length > preState.openModalCount) {
      return { success: true, outcome: "modal_opened", reason: "Modal or overlay dialog appeared in viewport." };
    }

    if (cdpAction === "type" && el && ("value" in el)) {
      if (el.value !== preState.inputValue) {
        return { success: true, outcome: "input_updated", reason: `Input value updated to "${el.value.slice(0, 30)}"` };
      }
    }

    if (cdpAction === "scroll") {
      const curScrollX = window.scrollX || 0;
      const curScrollY = window.scrollY || 0;
      const deltaScroll = Math.abs(curScrollY - (preState.scrollY || 0)) + Math.abs(curScrollX - (preState.scrollX || 0));
      if (deltaScroll > 10) {
        return { success: true, outcome: "scrolled", reason: `Viewport scrolled by ${Math.round(deltaScroll)}px.` };
      }
    }

    if (el && preState.elementState) {
      const curChecked = Boolean(el.checked || el.getAttribute("aria-checked") === "true" || el.getAttribute("aria-selected") === "true");
      if (Boolean(el.disabled) !== preState.elementState.disabled || curChecked !== preState.elementState.checked) {
        return { success: true, outcome: "element_state_changed", reason: "Target element state changed (disabled/checked)." };
      }
      const curText = (el.innerText || el.textContent || "").trim().slice(0, 100);
      if (curText !== preState.elementState.text) {
        return { success: true, outcome: "element_text_changed", reason: `Target element text changed to "${curText.slice(0, 30)}"` };
      }
    }

    const currentElementsCount = document.querySelectorAll("button, a, input, select, textarea").length;
    if (currentElementsCount !== preState.elementsCount) {
      return { success: true, outcome: "dom_elements_changed", reason: `Interactive elements changed (${preState.elementsCount} -> ${currentElementsCount}).` };
    }

    if (docMutationVersion > preState.mutationVersion) {
      return { success: true, outcome: "dom_mutated", reason: `DOM mutated (${preState.mutationVersion} -> ${docMutationVersion}).` };
    }

    return {
      success: false,
      outcome: "no_op",
      reason: "Action completed event dispatch, but page state was completely unchanged (no DOM mutation, no navigation, no modal)"
    };
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
        let matched = Array.from(document.querySelectorAll(params.selector));
        if (matched.length > 1 && (params.element_description || params.label)) {
          const descClean = (params.element_description || params.label || "").toLowerCase().trim();
          const filtered = matched.filter((m) => {
            const txt = (m.innerText || m.textContent || m.getAttribute("aria-label") || m.value || "").toLowerCase().trim();
            return txt === descClean || txt.includes(descClean) || descClean.includes(txt);
          });
          if (filtered.length === 1) {
            matched = filtered;
          }
        }
        if (matched.length === 0) {
          throw new Error(`Target element not found in active DOM for selector: "${params.selector}"`);
        }
        if (matched.length > 1) {
          throw new Error(`Ambiguous target: Selector "${params.selector}" matched ${matched.length} elements. Specific group or label required.`);
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

        // Dispatch full trusted event sequence (pointerdown, mousedown, focus, pointerup, mouseup, click)
        const evtInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: params.x || 0,
          clientY: params.y || 0,
          buttons: 1
        };
        try { targetEl.dispatchEvent(new PointerEvent("pointerdown", evtInit)); } catch {}
        try { targetEl.dispatchEvent(new MouseEvent("mousedown", evtInit)); } catch {}
        if (typeof targetEl.focus === "function") targetEl.focus();
        try { targetEl.dispatchEvent(new PointerEvent("pointerup", evtInit)); } catch {}
        try { targetEl.dispatchEvent(new MouseEvent("mouseup", evtInit)); } catch {}

        if (typeof targetEl.click === "function") {
          targetEl.click();
        } else {
          targetEl.dispatchEvent(new MouseEvent("click", evtInit));
        }

        // Guarantee radio, checkbox, label, and custom ARIA target state mutation
        if (targetEl.type === "radio") {
          if (targetEl.name) {
            const root = targetEl.form || document;
            root.querySelectorAll(`input[type="radio"][name="${CSS.escape(targetEl.name)}"]`).forEach(r => {
              if (r !== targetEl) {
                r.checked = false;
                r.setAttribute("aria-checked", "false");
              }
            });
          }
          targetEl.checked = true;
          targetEl.setAttribute("aria-checked", "true");
          targetEl.dispatchEvent(new Event("change", { bubbles: true }));
          targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (targetEl.type === "checkbox") {
          targetEl.checked = !targetEl.checked;
          targetEl.setAttribute("aria-checked", targetEl.checked ? "true" : "false");
          targetEl.dispatchEvent(new Event("change", { bubbles: true }));
          targetEl.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (targetEl.tagName === "LABEL") {
          const inp = (targetEl.htmlFor ? document.getElementById(targetEl.htmlFor) : null) || targetEl.querySelector("input");
          if (inp) {
            if (inp.type === "radio") {
              if (inp.name) {
                const root = inp.form || document;
                root.querySelectorAll(`input[type="radio"][name="${CSS.escape(inp.name)}"]`).forEach(r => {
                  if (r !== inp) {
                    r.checked = false;
                    r.setAttribute("aria-checked", "false");
                  }
                });
              }
              inp.checked = true;
              inp.setAttribute("aria-checked", "true");
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.dispatchEvent(new Event("input", { bubbles: true }));
            } else if (inp.type === "checkbox") {
              inp.checked = !inp.checked;
              inp.setAttribute("aria-checked", inp.checked ? "true" : "false");
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
        } else if (targetEl.getAttribute("role") === "radio" || targetEl.getAttribute("role") === "checkbox" || targetEl.getAttribute("role") === "option") {
          const role = targetEl.getAttribute("role");
          if (role === "radio") {
            const group = targetEl.closest("[role='radiogroup']") || targetEl.parentElement;
            if (group) {
              group.querySelectorAll("[role='radio']").forEach(sib => {
                if (sib !== targetEl) sib.setAttribute("aria-checked", "false");
              });
            }
            targetEl.setAttribute("aria-checked", "true");
          } else if (role === "checkbox") {
            const cur = targetEl.getAttribute("aria-checked") === "true";
            targetEl.setAttribute("aria-checked", cur ? "false" : "true");
          } else if (role === "option") {
            const listbox = targetEl.closest("[role='listbox']") || targetEl.parentElement;
            if (listbox) {
              listbox.querySelectorAll("[role='option']").forEach(sib => {
                if (sib !== targetEl) sib.setAttribute("aria-selected", "false");
              });
            }
            targetEl.setAttribute("aria-selected", "true");
            const container = targetEl.closest(".dropdown, .custom-select, [role='combobox'], [role='listbox']") || targetEl.parentElement;
            const hiddenInput = container ? container.querySelector('input[type="hidden"]') : null;
            if (hiddenInput) {
              hiddenInput.value = targetEl.getAttribute("data-value") || targetEl.getAttribute("value") || targetEl.innerText.trim();
              hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
              hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          targetEl.dispatchEvent(new Event("change", { bubbles: true }));
          targetEl.dispatchEvent(new Event("input", { bubbles: true }));
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
          const isTextarea = (typeof window.HTMLTextAreaElement !== "undefined" && targetEl instanceof window.HTMLTextAreaElement) || targetEl.tagName === "TEXTAREA";
          const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
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

    if (cdpAction === "upload_file" || cdpAction === "uploadFile") {
      throw new Error(`CDP action "${cdpAction}" requires direct Chrome DevTools Protocol attachment. Please close Chrome DevTools on this tab so Sidekick can attach directly.`);
    }

    throw new Error(`Unsupported DOM fallback action: ${cdpAction}. Close DevTools to enable full Chrome DevTools Protocol.`);
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

  /**
   * Survey Question Recognition & Verified Interaction DOM Engine
   * Inspects active page DOM to extract structured survey questions, options,
   * associated labels, and navigation controls, with robust pre/post state verification.
   */
  class SurveyDOMEngine {
    static sanitize(str) {
      if (!str) return "";
      return String(str).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    }

    static cleanQuestionText(raw) {
      if (!raw) return "";
      let s = SurveyDOMEngine.sanitize(raw);
      // Remove leading question numbering like "1.", "Q1:", "Question 2 -"
      s = s.replace(/^(?:question\s*\d+|q\d+|\d+)[\.\:\-\)]\s*/i, "");
      // Remove trailing or leading required asterisks and marks
      s = s.replace(/\s*\*\s*$/, "");
      s = s.replace(/\s*\(required\)\s*$/i, "");
      return s.trim();
    }

    /**
     * CAPTCHA and Anti-Bot Human-Verification Detector
     * Detects recognizable CAPTCHA widgets, challenge frames, and explicit interstitials
     * using observable page evidence, while strictly distinguishing from ordinary questions,
     * login forms, and generic loading states.
     */
    static detectHumanVerification(root = document) {
      if (!root) return { isChallenge: false, active: false };

      // 1. Cloudflare Turnstile / Managed Challenge
      const turnstileFrames = Array.from(root.querySelectorAll(
        'iframe[src*="challenges.cloudflare.com"], .cf-turnstile, #cf-challenge, [data-turnstile], #challenge-running, #challenge-stage, div[id*="cf-turnstile"]'
      ));
      if (turnstileFrames.length > 0) {
        const turnstileResp = root.querySelector('input[name="cf-turnstile-response"]');
        const isSolved = Boolean(turnstileResp && turnstileResp.value && turnstileResp.value.trim().length > 0);
        return {
          isChallenge: true,
          active: !isSolved,
          cleared: isSolved,
          type: "cloudflare_turnstile",
          message: isSolved ? "Cloudflare Turnstile verified" : "Cloudflare Turnstile verification required",
        };
      }

      // 2. Google reCAPTCHA v2 / v3 / Enterprise
      const recaptchaFrames = Array.from(root.querySelectorAll(
        'iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"], iframe[title*="recaptcha" i], .g-recaptcha, #recaptcha, .g-recaptcha[data-sitekey]'
      ));
      if (recaptchaFrames.length > 0) {
        // Check if cleared/solved
        const responseInput = root.querySelector('textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]');
        const isSolved = Boolean(responseInput && responseInput.value && responseInput.value.trim().length > 0) ||
          Boolean(root.querySelector('.recaptcha-checkbox[aria-checked="true"]'));
        return {
          isChallenge: true,
          active: !isSolved,
          cleared: isSolved,
          type: "recaptcha",
          message: isSolved ? "reCAPTCHA verified" : "Google reCAPTCHA verification required",
        };
      }

      // 3. hCaptcha
      const hcaptchaFrames = Array.from(root.querySelectorAll(
        'iframe[src*="hcaptcha.com"], .h-captcha, #hcaptcha, [data-hcaptcha]'
      ));
      if (hcaptchaFrames.length > 0) {
        const hresp = root.querySelector('textarea[name="h-captcha-response"], input[name="h-captcha-response"], textarea[name="g-recaptcha-response"]');
        const isSolved = Boolean(hresp && hresp.value && hresp.value.trim().length > 0);
        return {
          isChallenge: true,
          active: !isSolved,
          cleared: isSolved,
          type: "hcaptcha",
          message: isSolved ? "hCaptcha verified" : "hCaptcha verification required",
        };
      }

      // 4. Arkose Labs / FunCaptcha
      const arkoseFrames = Array.from(root.querySelectorAll(
        'iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], #fc-iframe, #ArkoseFrame'
      ));
      if (arkoseFrames.length > 0) {
        return {
          isChallenge: true,
          active: true,
          cleared: false,
          type: "arkose",
          message: "Arkose Labs FunCaptcha verification required",
        };
      }

      // 5. AWS WAF Captcha / GeeTest
      const botShields = Array.from(root.querySelectorAll(
        '#aws-waf-captcha, .geetest_holder, #px-captcha, .geetest_radar'
      ));
      if (botShields.length > 0) {
        return {
          isChallenge: true,
          active: true,
          cleared: false,
          type: "bot_challenge",
          message: "Anti-bot challenge verification required",
        };
      }

      // 6. Explicit Human-Verification Interstitials
      // IMPORTANT: MUST NOT trigger on ordinary survey questions or login forms!
      const hasPassword = Boolean(root.querySelector('input[type="password"], input[name*="password" i], input[autocomplete="current-password"]'));
      if (hasPassword) {
        // This is a login screen, NOT a CAPTCHA
        return { isChallenge: false, active: false };
      }

      // Check for generic loading state
      const hasOnlyLoading = SurveyDOMEngine.detectLoadingState(root).isLoading;
      const allText = (root.body ? root.body.innerText || root.body.textContent : root.textContent || "").toLowerCase();

      const challengeHeadingRegex = /\b(?:verify\s+you\s+are\s+human|confirm\s+you\s+are\s+not\s+a\s+robot|security\s+check\s+to\s+access|security\s+verification|complete\s+the\s+security\s+check|type\s+the\s+characters\s+in\s+the\s+image|enter\s+the\s+characters\s+you\s+see)\b/i;
      
      if (challengeHeadingRegex.test(allText)) {
        // Ensure it's not an ordinary survey question like "Do you have human resources experience?"
        const isSurveyQuestion = Boolean(root.querySelector('fieldset.question, .survey-question, [role="radiogroup"], table.likert'));
        const hasCaptchaImgOrInput = Boolean(root.querySelector('img[src*="captcha" i], input[name*="captcha" i], #captcha, .captcha-image'));
        
        if (hasCaptchaImgOrInput || (!isSurveyQuestion && !hasOnlyLoading)) {
          return {
            isChallenge: true,
            active: true,
            cleared: false,
            type: "interstitial",
            message: "Human verification security check required",
          };
        }
      }

      return { isChallenge: false, active: false };
    }

    /**
     * Detects loading spinners, skeletons, or busy states
     */
    static detectLoadingState(root = document) {
      if (!root) return { isLoading: false };
      const loaders = Array.from(root.querySelectorAll(
        '.spinner, .loading, .loading-spinner, .survey-loading, [role="progressbar"], .skeleton, [aria-busy="true"], [data-loading="true"], .is-loading'
      )).filter((el) => isVisible(el));

      if (loaders.length > 0) {
        return { isLoading: true, message: "Page is currently loading" };
      }

      const bodyText = (root.body ? root.body.innerText || root.body.textContent : "").trim().toLowerCase();
      if (/^(?:loading(?:\s+survey|\s+page|\.\.\.)?|please\s+wait(?:\s+while\s+we\s+load)?)\b/i.test(bodyText) && bodyText.length < 100) {
        return { isLoading: true, message: "Page is currently loading" };
      }

      return { isLoading: false };
    }

    static getOptionLabel(input, container) {
      if (!input) return "";
      // 0. Explicit data-sidekick-label attribute
      if (input.getAttribute && input.getAttribute("data-sidekick-label")) {
        return input.getAttribute("data-sidekick-label");
      }
      // 1. label[for="inputId"]
      if (input.id) {
        try {
          const forLabel = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          if (forLabel) {
            const t = SurveyDOMEngine.sanitize(forLabel.innerText || forLabel.textContent);
            if (t) return t;
          }
        } catch {}
      }
      // 2. Wrapping <label>
      const parentLabel = input.closest ? input.closest("label") : null;
      if (parentLabel) {
        try {
          const clone = parentLabel.cloneNode(true);
          clone.querySelectorAll("input, select, textarea").forEach((el) => el.remove());
          const t = SurveyDOMEngine.sanitize(clone.innerText || clone.textContent);
          if (t) return t;
        } catch {}
      }
      // 3. aria-label / aria-labelledby
      if (input.getAttribute && input.getAttribute("aria-label")) {
        return SurveyDOMEngine.sanitize(input.getAttribute("aria-label"));
      }
      if (input.getAttribute && input.getAttribute("aria-labelledby")) {
        const ids = input.getAttribute("aria-labelledby").split(/\s+/);
        const parts = ids.map((id) => {
          const el = document.getElementById(id);
          return el ? (el.innerText || el.textContent) : "";
        }).filter(Boolean);
        if (parts.length > 0) return SurveyDOMEngine.sanitize(parts.join(" "));
      }

      // 4. Custom controls (role="option", role="radio", role="checkbox", or non-input elements) with their own text content
      const tagName = (input.tagName || "").toLowerCase();
      if (tagName !== "input") {
        const own = SurveyDOMEngine.sanitize(input.innerText || input.textContent);
        if (own && own.length < 200) return own;
      }

      // 5. Sibling element text (e.g. <input><span class="label">Option</span>)
      if (tagName === "input") {
        let sib = input.nextElementSibling;
        while (sib) {
          const tag = (sib.tagName || "").toLowerCase();
          if (tag !== "input" && tag !== "script" && tag !== "style") {
            const t = SurveyDOMEngine.sanitize(sib.innerText || sib.textContent);
            if (t && t.length < 150) return t;
          }
          sib = sib.nextElementSibling;
        }
      }

      // 6. Parent text (if shallow)
      if (input.parentElement && input.parentElement !== container) {
        try {
          const clone = input.parentElement.cloneNode(true);
          clone.querySelectorAll("input, select, textarea").forEach((el) => el.remove());
          const t = SurveyDOMEngine.sanitize(clone.innerText || clone.textContent);
          if (t && t.length < 150) return t;
        } catch {}
      }
      // 7. Value or placeholder or name
      return input.value || input.placeholder || input.name || "";
    }

    /**
     * Stale Element Dynamic Reacquisition
     * Recovers live element references when DOM mutations or framework rerenders invalidate selectors
     */
    static reacquireElement(params = {}) {
      const { selector, labelSelector, optionId, questionId, value, label, type } = params;
      let el = null;
      if (selector) {
        try { el = document.querySelector(selector); } catch {}
      }
      if (!el && labelSelector) {
        try { el = document.querySelector(labelSelector); } catch {}
      }
      if (!el && optionId) {
        try { el = document.querySelector(`[data-sidekick-id="${CSS.escape(optionId)}"]`); } catch {}
      }
      if (el) return el;

      // Scoped search inside question container
      let qContainer = null;
      if (questionId) {
        try {
          qContainer = document.querySelector(`[data-sidekick-qid="${CSS.escape(questionId)}"]`) ||
            document.getElementById(questionId) ||
            document.querySelector(`[name="${CSS.escape(questionId)}"]`);
        } catch {}
      }

      const searchRoot = qContainer || document;

      // 1. By value
      if (value !== undefined && value !== null && value !== "") {
        try {
          el = searchRoot.querySelector(`input[value="${CSS.escape(String(value))}"]`) ||
            searchRoot.querySelector(`[data-value="${CSS.escape(String(value))}"]`) ||
            searchRoot.querySelector(`option[value="${CSS.escape(String(value))}"]`);
          if (el) return el;
        } catch {}
      }

      // 2. By matching label text
      if (label) {
        const normLabel = SurveyDOMEngine.sanitize(label).toLowerCase();
        const candidates = Array.from(searchRoot.querySelectorAll('label, input, [role="radio"], [role="checkbox"], [role="option"], button'));
        for (const cand of candidates) {
          const t = SurveyDOMEngine.sanitize(cand.innerText || cand.textContent || cand.getAttribute("aria-label") || cand.value).toLowerCase();
          if (t === normLabel || (normLabel.length > 3 && t.includes(normLabel))) {
            if (cand.tagName === "LABEL") {
              const inp = (cand.htmlFor ? document.getElementById(cand.htmlFor) : null) || cand.querySelector("input");
              return inp || cand;
            }
            return cand;
          }
        }
      }

      // 3. By type inside question container
      if (type && qContainer) {
        const inp = qContainer.querySelector(`input[type="${type}"], [role="${type}"]`);
        if (inp) return inp;
      }

      return null;
    }

    /**
     * Discovers actual survey candidates on the page from forms, survey containers,
     * links, and accessible labels, ranking them by survey viability.
     */
    static discoverSurveys(root = document) {
      if (!root) return [];
      const doc = root.ownerDocument || (root.nodeType === 9 ? root : document);
      const candidates = [];
      let candidateCounter = 1;

      // Look for forms and survey containers
      const containerSelectors = [
        "form",
        "[role='form']",
        ".survey-container",
        ".survey-form",
        ".survey",
        ".questionnaire",
        "[data-survey]",
        "[data-survey-id]",
        "#survey",
        "#questionnaire"
      ];
      const foundContainers = Array.from(root.querySelectorAll(containerSelectors.join(", ")));

      for (const container of foundContainers) {
        // Exclude nested containers if parent is already a survey form/container
        if (container.parentElement && container.parentElement.closest && container.parentElement.closest("form, .survey-container, .survey-form, [data-survey]")) {
          continue;
        }

        // Exclude authentication/login forms with passwords
        const hasPassword = Boolean(container.querySelector('input[type="password"], input[name*="password" i], input[autocomplete*="password" i]'));
        if (hasPassword) continue;

        // Count interactive question inputs inside this container
        const inputs = Array.from(container.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea, [role="radio"], [role="checkbox"], [role="slider"], [role="switch"]'
        ));

        // Skip pure search bars (single search input)
        if (inputs.length === 1) {
          const single = inputs[0];
          if (single.type === "search" || /search|query|find|google/i.test(single.name || single.id || single.placeholder || "")) {
            continue;
          }
        }

        if (inputs.length === 0) continue;

        // Extract candidate title or label
        let title = "";
        const titleEl = container.querySelector("legend, h1, h2, h3, h4, h5, h6, .survey-title, .title, .form-title");
        if (titleEl) {
          title = SurveyDOMEngine.cleanQuestionText(titleEl.innerText || titleEl.textContent);
        }
        if (!title && container.getAttribute("aria-label")) {
          title = SurveyDOMEngine.cleanQuestionText(container.getAttribute("aria-label"));
        }
        if (!title && container.getAttribute("name")) {
          title = container.getAttribute("name");
        }
        if (!title && container.id) {
          title = container.id.replace(/[-_]/g, " ");
        }
        if (!title) {
          title = `Survey ${candidateCounter}`;
        }

        const candidateId = container.id ? container.id : `survey-candidate-${candidateCounter++}`;
        if (!container.id) {
          container.setAttribute("data-sidekick-survey-id", candidateId);
        }
        const selector = container.id ? `#${CSS.escape(container.id)}` : `[data-sidekick-survey-id="${candidateId}"]`;

        // Check for submit / next buttons within container or linked via form attribute
        const buttons = Array.from(container.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]'));
        const hasSubmit = buttons.some((b) => /\b(?:submit|finish|done|complete)\b/i.test(b.innerText || b.textContent || b.value || ""));
        const hasNext = buttons.some((b) => /\b(?:next|continue)\b/i.test(b.innerText || b.textContent || b.value || ""));

        // Viability score
        let score = inputs.length * 2;
        const textLower = `${title} ${container.className || ""} ${container.id || ""}`.toLowerCase();
        if (/\b(?:survey|questionnaire|feedback|poll|assessment|evaluation)\b/i.test(textLower)) {
          score += 20;
        }
        if (hasSubmit) score += 10;
        if (hasNext) score += 5;

        candidates.push({
          id: candidateId,
          title,
          element: container,
          selector,
          inputCount: inputs.length,
          hasSubmit,
          hasNext,
          score,
          isViable: inputs.length >= 1,
        });
      }

      // Sort by viability score descending
      candidates.sort((a, b) => b.score - a.score);
      return candidates;
    }

    static parseQuestions(root = document, options = {}) {
      const questions = [];
      let questionCounter = 1;
      const processedElements = new Set();

      // Check Human Verification & Loading States
      const humanVerification = SurveyDOMEngine.detectHumanVerification(root);
      const loadingState = SurveyDOMEngine.detectLoadingState(root);

      // Target survey candidate resolution
      let targetRoot = root;
      let selectedSurveyCandidate = null;
      let discoveredCandidates = [];

      if (options.surveySelector) {
        try {
          const matched = (root.ownerDocument || document).querySelector(options.surveySelector);
          if (matched) {
            targetRoot = matched;
            selectedSurveyCandidate = {
              id: matched.id || "selected-survey",
              selector: options.surveySelector,
              element: matched,
            };
          }
        } catch {}
      } else if (root.nodeType === 9 || root.tagName === "BODY" || root.tagName === "HTML") {
        discoveredCandidates = SurveyDOMEngine.discoverSurveys(root);
        if (discoveredCandidates.length > 0) {
          // Select highest-viability candidate deterministically
          selectedSurveyCandidate = discoveredCandidates[0];
          targetRoot = selectedSurveyCandidate.element;
        }
      }

      // 1. Scan for Likert & Rating Matrix Tables (Single-Select Radio Matrix)
      const likertTables = Array.from(targetRoot.querySelectorAll("table.likert, table.matrix, table[role='grid'], table")).filter((tbl) => {
        const radios = tbl.querySelectorAll('input[type="radio"], [role="radio"]');
        return radios.length >= 4;
      });

      for (const table of likertTables) {
        const headerCells = Array.from(table.querySelectorAll("thead th, thead td, tr:first-child th, tr:first-child td"));
        const colHeaders = headerCells.map((c) => SurveyDOMEngine.sanitize(c.innerText || c.textContent)).filter(Boolean);

        const rows = Array.from(table.querySelectorAll("tbody tr, tr:not(:first-child)"));
        for (const row of rows) {
          const radios = Array.from(row.querySelectorAll('input[type="radio"], [role="radio"]'));
          if (radios.length === 0) continue;

          const rowHeaderEl = row.querySelector("th, td:first-child, .row-label");
          const rowText = SurveyDOMEngine.cleanQuestionText(rowHeaderEl ? (rowHeaderEl.innerText || rowHeaderEl.textContent) : `Rating row`);
          if (!rowText) continue;

          const qId = `sq-matrix-${questionCounter++}`;
          row.setAttribute("data-sidekick-qid", qId);

          const options = [];
          radios.forEach((r, idx) => {
            processedElements.add(r);
            const optId = `opt-${qId}-${idx + 1}`;
            r.setAttribute("data-sidekick-id", optId);

            const colLabel = colHeaders[idx + 1] || colHeaders[idx] || r.value || `Rating ${idx + 1}`;
            r.setAttribute("data-sidekick-label", colLabel);
            const rect = r.getBoundingClientRect();
            options.push({
              id: optId,
              label: colLabel,
              value: r.value || colLabel,
              type: "radio",
              checked: Boolean(r.checked || r.getAttribute("aria-checked") === "true"),
              disabled: Boolean(r.disabled || r.getAttribute("aria-disabled") === "true"),
              hidden: !isVisible(r),
              selector: `[data-sidekick-id="${optId}"]`,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            });
          });

          questions.push({
            id: qId,
            text: rowText,
            instructions: "Rate each item",
            type: "likert_matrix",
            required: false,
            options,
            selector: `[data-sidekick-qid="${qId}"]`,
          });
        }
      }

      // 1b. Scan for Multi-Select Checkbox Matrix Tables
      const checkboxMatrixTables = Array.from(root.querySelectorAll("table.matrix, table.matrix-table, table.likert, table[role='grid'], table")).filter((tbl) => {
        const checkboxes = tbl.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
        const hasMatrixClass = tbl.className && /matrix|likert|grid/i.test(tbl.className);
        return hasMatrixClass ? checkboxes.length >= 2 : checkboxes.length >= 4;
      });

      for (const table of checkboxMatrixTables) {
        const headerCells = Array.from(table.querySelectorAll("thead th, thead td, tr:first-child th, tr:first-child td"));
        const colHeaders = headerCells.map((c) => SurveyDOMEngine.sanitize(c.innerText || c.textContent)).filter(Boolean);

        const rows = Array.from(table.querySelectorAll("tbody tr, tr:not(:first-child)"));
        for (const row of rows) {
          const checkboxes = Array.from(row.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
          if (checkboxes.length === 0) continue;

          const rowHeaderEl = row.querySelector("th, td:first-child, .row-label");
          const rowText = SurveyDOMEngine.cleanQuestionText(rowHeaderEl ? (rowHeaderEl.innerText || rowHeaderEl.textContent) : `Matrix row`);
          if (!rowText) continue;

          const qId = `sq-matrix-cb-${questionCounter++}`;
          row.setAttribute("data-sidekick-qid", qId);

          const options = [];
          checkboxes.forEach((cb, idx) => {
            processedElements.add(cb);
            const optId = `opt-${qId}-${idx + 1}`;
            cb.setAttribute("data-sidekick-id", optId);

            const colLabel = colHeaders[idx + 1] || colHeaders[idx] || cb.value || `Option ${idx + 1}`;
            cb.setAttribute("data-sidekick-label", colLabel);
            const rect = cb.getBoundingClientRect();
            options.push({
              id: optId,
              label: colLabel,
              value: cb.value || colLabel,
              type: "checkbox",
              checked: Boolean(cb.checked || cb.getAttribute("aria-checked") === "true"),
              disabled: Boolean(cb.disabled || cb.getAttribute("aria-disabled") === "true"),
              hidden: !isVisible(cb),
              selector: `[data-sidekick-id="${optId}"]`,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            });
          });

          questions.push({
            id: qId,
            text: rowText,
            instructions: "Select all that apply for each item",
            type: "matrix_checkbox",
            required: false,
            options,
            selector: `[data-sidekick-qid="${qId}"]`,
          });
        }
      }

      // 1c. Scan for Ranking Questions
      const rankingContainers = Array.from(root.querySelectorAll(
        ".ranking, .ranking-container, [class*='ranking'], [data-ranking], [data-type='ranking'], ol.ranking-list, ul.ranking-list, .sortable-list"
      ));
      for (const rContainer of rankingContainers) {
        const titleEl = rContainer.querySelector("legend, .question-title, .title, h1, h2, h3, h4, h5, h6, label");
        const qText = titleEl ? SurveyDOMEngine.cleanQuestionText(titleEl.innerText || titleEl.textContent) : "Ranking Question";
        const qId = `sq-ranking-${questionCounter++}`;
        rContainer.setAttribute("data-sidekick-qid", qId);

        const items = Array.from(rContainer.querySelectorAll("li, .ranking-item, [data-rank], .sortable-item"));
        const options = [];
        items.forEach((item, idx) => {
          processedElements.add(item);
          const optId = `opt-${qId}-${idx + 1}`;
          item.setAttribute("data-sidekick-id", optId);
          const label = SurveyDOMEngine.sanitize(item.innerText || item.textContent);
          const rankInput = item.querySelector("input, select");
          if (rankInput) processedElements.add(rankInput);

          options.push({
            id: optId,
            label,
            value: rankInput ? rankInput.value : String(idx + 1),
            type: "ranking_item",
            rank: idx + 1,
            selector: `[data-sidekick-id="${optId}"]`,
          });
        });

        if (options.length > 0) {
          questions.push({
            id: qId,
            text: qText,
            instructions: "Rank the items in order of preference",
            type: "ranking",
            required: false,
            options,
            selector: `[data-sidekick-qid="${qId}"]`,
          });
        }
      }

      // 2. Scan Standard Question Containers
      const containerSelectors = [
        "fieldset",
        "[role='radiogroup']",
        "[role='group']",
        ".question",
        ".survey-question",
        ".form-group",
        ".form-field",
        "[data-question]",
        "[data-qa]",
        ".card-question",
        ".survey-item"
      ];
      const rawContainers = Array.from(root.querySelectorAll(containerSelectors.join(", ")));

      for (const container of rawContainers) {
        if (container.closest && container.closest("table.likert, table.matrix, .ranking, .ranking-container, [class*='ranking'], [data-ranking]")) continue;

        // Find question text
        let titleEl = container.querySelector(
          "legend, .question-title, .question-text, .title, .label, h1, h2, h3, h4, h5, h6, label.main, [id*='label']"
        );
        if (!titleEl) {
          const labels = Array.from(container.querySelectorAll("label"));
          if (labels.length === 1) {
            titleEl = labels[0];
          } else if (labels.length > 1) {
            titleEl = labels.find((l) => !l.querySelector("input[type='radio'], input[type='checkbox']")) || labels[0];
          }
        }
        let qText = titleEl ? SurveyDOMEngine.cleanQuestionText(titleEl.innerText || titleEl.textContent) : "";
        if (!qText && container.getAttribute("aria-label")) {
          qText = SurveyDOMEngine.cleanQuestionText(container.getAttribute("aria-label"));
        }
        if (!qText && container.getAttribute("aria-labelledby")) {
          const lEl = document.getElementById(container.getAttribute("aria-labelledby"));
          if (lEl) qText = SurveyDOMEngine.cleanQuestionText(lEl.innerText || lEl.textContent);
        }

        // Instructions
        const instrEl = container.querySelector(".description, .instructions, .help-text, .sub-text, [aria-describedby]");
        let instructions = instrEl ? SurveyDOMEngine.sanitize(instrEl.innerText || instrEl.textContent) : "";

        // Required & Validation Error
        const isRequired = Boolean(
          container.hasAttribute("required") ||
          container.getAttribute("aria-required") === "true" ||
          container.querySelector(".required, [aria-required='true']") ||
          /\*\s*$/.test(titleEl?.innerText || "")
        );

        const errorEl = container.querySelector(".error, .error-message, [role='alert'], .invalid-feedback, .is-invalid, .validation-error");
        let validationError = null;
        if (errorEl && isVisible(errorEl)) {
          const errText = SurveyDOMEngine.sanitize(errorEl.innerText || errorEl.textContent);
          if (errText) validationError = errText;
        }

        // Collect interactive inputs inside this container
        const inputs = Array.from(container.querySelectorAll(
          'input:not([type="hidden"]), select, textarea, [role="radio"], [role="checkbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="switch"]'
        ));
        if (inputs.length === 0) continue;

        const availableInputs = inputs.filter((inp) => !processedElements.has(inp));
        if (availableInputs.length === 0) continue;

        const qId = `sq-${questionCounter++}`;
        container.setAttribute("data-sidekick-qid", qId);

        const radios = availableInputs.filter((i) => i.type === "radio" || i.getAttribute("role") === "radio");
        const checkboxes = availableInputs.filter((i) => (i.type === "checkbox" || i.getAttribute("role") === "checkbox") && i.getAttribute("role") !== "switch");
        const selects = availableInputs.filter((i) => (i.tagName || "").toLowerCase() === "select");
        const customDropdowns = availableInputs.filter((i) => i.getAttribute("role") === "combobox" || i.getAttribute("role") === "listbox");
        const sliders = availableInputs.filter((i) => i.type === "range" || i.getAttribute("role") === "slider");
        const numericInputs = availableInputs.filter((i) => (i.tagName || "").toLowerCase() === "input" && (i.type === "number" || i.getAttribute("inputmode") === "numeric" || i.type === "tel"));
        const dateInputs = availableInputs.filter((i) => (i.tagName || "").toLowerCase() === "input" && ["date", "datetime-local", "month", "time"].includes(i.type));
        const fileInputs = availableInputs.filter((i) => (i.tagName || "").toLowerCase() === "input" && i.type === "file");
        const switches = availableInputs.filter((i) => i.getAttribute("role") === "switch");
        const textInputs = availableInputs.filter((i) => {
          const tag = (i.tagName || "").toLowerCase();
          return tag === "textarea" || (tag === "input" && !["radio", "checkbox", "button", "submit", "reset", "range", "number", "tel", "date", "datetime-local", "month", "time", "file"].includes(i.type) && i.getAttribute("inputmode") !== "numeric");
        });

        let qType = "single_choice_radio";
        const options = [];

        if (radios.length > 0) {
          qType = "single_choice_radio";
          radios.forEach((r, idx) => {
            processedElements.add(r);
            const optId = `opt-${qId}-${idx + 1}`;
            r.setAttribute("data-sidekick-id", optId);
            const lbl = SurveyDOMEngine.getOptionLabel(r, container);
            let assocLabel = (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null) || (r.closest ? r.closest("label") : null);
            let labelSelector = undefined;
            if (assocLabel) {
              const lblId = `${optId}-label`;
              assocLabel.setAttribute("data-sidekick-id", lblId);
              labelSelector = `[data-sidekick-id="${lblId}"]`;
            }
            let rect = r.getBoundingClientRect();
            if ((rect.width < 6 || rect.height < 6 || (typeof window !== "undefined" && window.getComputedStyle && window.getComputedStyle(r).opacity === "0")) && assocLabel) {
              const lRect = assocLabel.getBoundingClientRect();
              if (lRect.width >= 6 && lRect.height >= 6) {
                rect = lRect;
              }
            }
            options.push({
              id: optId,
              label: lbl,
              value: r.value || lbl,
              type: "radio",
              checked: Boolean(r.checked || r.getAttribute("aria-checked") === "true"),
              disabled: Boolean(r.disabled || r.getAttribute("aria-disabled") === "true"),
              hidden: !isVisible(r),
              selector: `[data-sidekick-id="${optId}"]`,
              labelSelector,
              group: qText,
              context: qText,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            });
          });
        } else if (checkboxes.length > 0) {
          qType = "multi_choice_checkbox";
          checkboxes.forEach((cb, idx) => {
            processedElements.add(cb);
            const optId = `opt-${qId}-${idx + 1}`;
            cb.setAttribute("data-sidekick-id", optId);
            const lbl = SurveyDOMEngine.getOptionLabel(cb, container);
            let assocLabel = (cb.id ? document.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : null) || (cb.closest ? cb.closest("label") : null);
            let labelSelector = undefined;
            if (assocLabel) {
              const lblId = `${optId}-label`;
              assocLabel.setAttribute("data-sidekick-id", lblId);
              labelSelector = `[data-sidekick-id="${lblId}"]`;
            }
            let rect = cb.getBoundingClientRect();
            if ((rect.width < 6 || rect.height < 6 || (typeof window !== "undefined" && window.getComputedStyle && window.getComputedStyle(cb).opacity === "0")) && assocLabel) {
              const lRect = assocLabel.getBoundingClientRect();
              if (lRect.width >= 6 && lRect.height >= 6) {
                rect = lRect;
              }
            }
            options.push({
              id: optId,
              label: lbl,
              value: cb.value || lbl,
              type: "checkbox",
              checked: Boolean(cb.checked || cb.getAttribute("aria-checked") === "true"),
              disabled: Boolean(cb.disabled || cb.getAttribute("aria-disabled") === "true"),
              hidden: !isVisible(cb),
              selector: `[data-sidekick-id="${optId}"]`,
              labelSelector,
              group: qText,
              context: qText,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            });
          });
        } else if (selects.length > 0) {
          qType = "dropdown_native";
          const sel = selects[0];
          processedElements.add(sel);
          const selId = `opt-${qId}-select`;
          sel.setAttribute("data-sidekick-id", selId);
          const optEls = Array.from(sel.querySelectorAll("option"));
          optEls.forEach((o, idx) => {
            if (o.value === "" && idx === 0) return; // skip placeholder
            const optId = `opt-${qId}-val-${idx}`;
            options.push({
              id: optId,
              label: SurveyDOMEngine.sanitize(o.innerText || o.textContent),
              value: o.value,
              type: "select_option",
              selected: Boolean(o.selected),
              disabled: Boolean(o.disabled),
              hidden: false,
              selector: `[data-sidekick-id="${selId}"]`,
            });
          });
        } else if (customDropdowns.length > 0) {
          qType = "dropdown_custom";
          const dd = customDropdowns[0];
          processedElements.add(dd);
          const ddId = `opt-${qId}-combobox`;
          dd.setAttribute("data-sidekick-id", ddId);
          let optEls = Array.from(dd.querySelectorAll("[role='option']"));
          if (optEls.length === 0 && dd.getAttribute("aria-controls")) {
            const listbox = document.getElementById(dd.getAttribute("aria-controls"));
            if (listbox) optEls = Array.from(listbox.querySelectorAll("[role='option']"));
          }
          optEls.forEach((o, idx) => {
            const optId = `opt-${qId}-custom-${idx}`;
            o.setAttribute("data-sidekick-id", optId);
            options.push({
              id: optId,
              label: SurveyDOMEngine.sanitize(o.innerText || o.textContent),
              value: o.getAttribute("data-value") || o.innerText.trim(),
              type: "custom_option",
              selected: o.getAttribute("aria-selected") === "true",
              disabled: o.getAttribute("aria-disabled") === "true",
              hidden: !isVisible(o),
              selector: `[data-sidekick-id="${optId}"]`,
            });
          });
        } else if (sliders.length > 0) {
          qType = "slider";
          const s = sliders[0];
          processedElements.add(s);
          const sId = `opt-${qId}-slider`;
          s.setAttribute("data-sidekick-id", sId);
          options.push({
            id: sId,
            label: qText || "Slider",
            value: s.value || s.getAttribute("aria-valuenow") || "0",
            min: s.min || s.getAttribute("aria-valuemin") || "0",
            max: s.max || s.getAttribute("aria-valuemax") || "100",
            step: s.step || "1",
            type: "slider",
            disabled: Boolean(s.disabled),
            hidden: !isVisible(s),
            selector: `[data-sidekick-id="${sId}"]`,
          });
        } else if (numericInputs.length > 0) {
          qType = "numeric_input";
          const ni = numericInputs[0];
          processedElements.add(ni);
          const niId = `opt-${qId}-number`;
          ni.setAttribute("data-sidekick-id", niId);
          options.push({
            id: niId,
            label: qText || "Number",
            value: ni.value || "",
            min: ni.min,
            max: ni.max,
            step: ni.step,
            type: "number",
            disabled: Boolean(ni.disabled),
            hidden: !isVisible(ni),
            selector: `[data-sidekick-id="${niId}"]`,
          });
        } else if (dateInputs.length > 0) {
          qType = "date_input";
          const di = dateInputs[0];
          processedElements.add(di);
          const diId = `opt-${qId}-date`;
          di.setAttribute("data-sidekick-id", diId);
          options.push({
            id: diId,
            label: qText || "Date",
            value: di.value || "",
            type: di.type,
            disabled: Boolean(di.disabled),
            hidden: !isVisible(di),
            selector: `[data-sidekick-id="${diId}"]`,
          });
        } else if (fileInputs.length > 0) {
          qType = "file_upload";
          const fi = fileInputs[0];
          processedElements.add(fi);
          const fiId = `opt-${qId}-file`;
          fi.setAttribute("data-sidekick-id", fiId);
          options.push({
            id: fiId,
            label: qText || "File Upload",
            type: "file",
            accept: fi.accept || "*",
            disabled: Boolean(fi.disabled),
            hidden: !isVisible(fi),
            selector: `[data-sidekick-id="${fiId}"]`,
          });
        } else if (switches.length > 0) {
          qType = "switch_toggle";
          const sw = switches[0];
          processedElements.add(sw);
          const swId = `opt-${qId}-switch`;
          sw.setAttribute("data-sidekick-id", swId);
          options.push({
            id: swId,
            label: SurveyDOMEngine.getOptionLabel(sw, container) || qText || "Switch",
            checked: sw.getAttribute("aria-checked") === "true",
            type: "switch",
            disabled: Boolean(sw.disabled || sw.getAttribute("aria-disabled") === "true"),
            selector: `[data-sidekick-id="${swId}"]`,
          });
        } else if (textInputs.length > 0) {
          qType = "text_input";
          const ti = textInputs[0];
          processedElements.add(ti);
          const tiId = `opt-${qId}-text`;
          ti.setAttribute("data-sidekick-id", tiId);
          const rect = ti.getBoundingClientRect();
          options.push({
            id: tiId,
            label: qText || "Text response",
            value: ti.value || "",
            type: "text",
            disabled: Boolean(ti.disabled),
            hidden: !isVisible(ti),
            selector: `[data-sidekick-id="${tiId}"]`,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          });
        }

        if (!qText && options.length > 0) {
          qText = container.getAttribute("name") || `Question ${questions.length + 1}`;
        }

        questions.push({
          id: qId,
          text: qText,
          instructions,
          type: qType,
          required: isRequired,
          validationError,
          options,
          selector: `[data-sidekick-qid="${qId}"]`,
        });
      }

      // 3. Scan Standalone Ungrouped Radios
      const standaloneInputs = Array.from(root.querySelectorAll('input[type="radio"]')).filter((el) => !processedElements.has(el));
      const radioGroups = new Map();
      for (const el of standaloneInputs) {
        if (el.name) {
          const list = radioGroups.get(el.name) || [];
          list.push(el);
          radioGroups.set(el.name, list);
        }
      }

      for (const [name, radios] of radioGroups.entries()) {
        const qId = `sq-radio-${questionCounter++}`;
        const options = [];
        radios.forEach((r, idx) => {
          processedElements.add(r);
          const optId = `opt-${qId}-${idx + 1}`;
          r.setAttribute("data-sidekick-id", optId);
          const lbl = SurveyDOMEngine.getOptionLabel(r, null);
          let assocLabel = (r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null) || (r.closest ? r.closest("label") : null);
          let labelSelector = undefined;
          if (assocLabel) {
            const lblId = `${optId}-label`;
            assocLabel.setAttribute("data-sidekick-id", lblId);
            labelSelector = `[data-sidekick-id="${lblId}"]`;
          }
          let rect = r.getBoundingClientRect();
          if ((rect.width < 6 || rect.height < 6 || (typeof window !== "undefined" && window.getComputedStyle && window.getComputedStyle(r).opacity === "0")) && assocLabel) {
            const lRect = assocLabel.getBoundingClientRect();
            if (lRect.width >= 6 && lRect.height >= 6) {
              rect = lRect;
            }
          }
          options.push({
            id: optId,
            label: lbl,
            value: r.value || lbl,
            type: "radio",
            checked: Boolean(r.checked),
            disabled: Boolean(r.disabled),
            hidden: !isVisible(r),
            selector: `[data-sidekick-id="${optId}"]`,
            labelSelector,
            group: name,
            context: name,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          });
        });

        questions.push({
          id: qId,
          text: `Question for ${name}`,
          type: "single_choice_radio",
          required: false,
          options,
          selector: `input[name="${CSS.escape(name)}"]`,
        });
      }

      // 4. Scan Form Navigation Controls
      const buttons = Array.from(targetRoot.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a.btn, a.button'));
      if (targetRoot.id) {
        const extButtons = Array.from((targetRoot.ownerDocument || document).querySelectorAll(`button[form="${CSS.escape(targetRoot.id)}"], input[form="${CSS.escape(targetRoot.id)}"]`));
        for (const eb of extButtons) {
          if (!buttons.includes(eb)) buttons.push(eb);
        }
      }
      let nextButton = null;
      let backButton = null;
      let submitButton = null;

      for (const btn of buttons) {
        if (btn.disabled || !isVisible(btn)) continue;
        const text = (btn.innerText || btn.textContent || btn.value || btn.getAttribute("aria-label") || "").trim().toLowerCase();

        if (/\b(?:submit|finish|complete|done)\b/i.test(text)) {
          const btnId = `sk-submit-${Date.now()}`;
          btn.setAttribute("data-sidekick-id", btnId);
          submitButton = {
            id: btnId,
            text,
            isSubmit: true,
            selector: `[data-sidekick-id="${btnId}"]`,
          };
        } else if (/\b(?:next|continue|proceed|forward|continue to next)\b/i.test(text)) {
          const btnId = `sk-next-${Date.now()}`;
          btn.setAttribute("data-sidekick-id", btnId);
          nextButton = {
            id: btnId,
            text,
            isSubmit: false,
            selector: `[data-sidekick-id="${btnId}"]`,
          };
        } else if (/\b(?:back|prev|previous)\b/i.test(text)) {
          const btnId = `sk-back-${Date.now()}`;
          btn.setAttribute("data-sidekick-id", btnId);
          backButton = {
            id: btnId,
            text,
            selector: `[data-sidekick-id="${btnId}"]`,
          };
        }
      }

      const progressEl = targetRoot.querySelector ? targetRoot.querySelector(".progress, .progress-bar, [role='progressbar'], .survey-progress, .page-number") : root.querySelector(".progress, .progress-bar, [role='progressbar'], .survey-progress, .page-number");
      let progress = "";
      if (progressEl) {
        progress = SurveyDOMEngine.sanitize(progressEl.innerText || progressEl.textContent || progressEl.getAttribute("aria-valuenow") || "");
      }

      // 5. Completion / Confirmation Recognition
      let isCompleted = false;
      let completionMessage = "";
      const completionSelectors = [
        ".thank-you", ".thankyou", ".completion-message", ".survey-completed",
        ".survey-complete", ".confirmation-message", ".success-message",
        ".alert-success", "[role='status'].complete", ".done-message"
      ];
      const compEl = (targetRoot.querySelector ? targetRoot.querySelector(completionSelectors.join(", ")) : null) || (root.querySelector ? root.querySelector(completionSelectors.join(", ")) : null);
      const pageText = (root.body ? root.body.innerText || root.body.textContent : root.textContent || "").toLowerCase();
      const completionRegex = /\b(?:thank\s+you\s+for\s+(?:completing|taking|submitting|your)|your\s+response\s+has\s+been\s+recorded|survey\s+complete|submission\s+received|all\s+done!?|feedback\s+submitted)\b/i;

      if (compEl && isVisible(compEl)) {
        isCompleted = true;
        completionMessage = SurveyDOMEngine.sanitize(compEl.innerText || compEl.textContent);
      } else if (questions.length === 0 && completionRegex.test(pageText)) {
        isCompleted = true;
        const match = pageText.match(completionRegex);
        completionMessage = match ? match[0] : "Survey completion verified.";
      }
      const currentUrl = typeof window !== "undefined" ? (window.location?.href || "").toLowerCase() : "";
      if (/\/(?:thank-?you|completed?|finish(?:ed)?|confirmation|submitted?)\b/.test(currentUrl)) {
        isCompleted = true;
      }

      return {
        questions,
        nextButton,
        backButton,
        submitButton,
        progress,
        questionCount: questions.length,
        isCompleted,
        completionMessage: completionMessage || (isCompleted ? "Survey completed and verified." : ""),
        completionEvidence: isCompleted ? { text: completionMessage || "Survey completed and verified.", url: currentUrl } : null,
        selectedSurvey: selectedSurveyCandidate ? { id: selectedSurveyCandidate.id, title: selectedSurveyCandidate.title, selector: selectedSurveyCandidate.selector } : null,
        surveyCandidates: discoveredCandidates.map((c) => ({ id: c.id, title: c.title, selector: c.selector, inputCount: c.inputCount, score: c.score })),
        humanVerification,
        loadingState,
      };
    }

    /**
     * Executes interaction with multi-strategy recovery on failure
     */
    static interactControl(params = {}) {
      const { action, selector, value, text, optionId, labelSelector, strategy = "direct" } = params;

      // Reacquire element with fallback logic for dynamic rerenders
      let el = SurveyDOMEngine.reacquireElement(params);

      if (!el) {
        throw new Error(`Target control not found: ${selector || labelSelector || optionId || value}`);
      }

      if (el.disabled || el.getAttribute("aria-disabled") === "true") {
        throw new Error(`Target control is disabled`);
      }

      if (typeof el.scrollIntoView === "function") {
        try { el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" }); } catch {}
      }
      if (typeof el.focus === "function") el.focus();

      const tag = (el.tagName || "").toLowerCase();

      // Sliders
      if (action === "set_slider" || el.type === "range" || el.getAttribute("role") === "slider") {
        const val = value !== undefined ? value : (text || 0);
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype || {}, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(el, String(val));
        } else {
          el.value = String(val);
        }
        el.setAttribute("aria-valuenow", String(val));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        const verified = String(el.value) === String(val) || el.getAttribute("aria-valuenow") === String(val);
        return { success: true, verified, value: el.value };
      }

      // Numeric inputs
      if (action === "set_number" || (tag === "input" && (el.type === "number" || el.getAttribute("inputmode") === "numeric"))) {
        const val = value !== undefined ? value : (text || 0);
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype || {}, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(el, String(val));
        } else {
          el.value = String(val);
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, verified: String(el.value) === String(val), value: el.value };
      }

      // Date inputs
      if (action === "set_date" || (tag === "input" && ["date", "datetime-local", "month", "time"].includes(el.type))) {
        const val = value !== undefined ? value : (text || "");
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype || {}, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(el, String(val));
        } else {
          el.value = String(val);
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, verified: String(el.value) === String(val), value: el.value };
      }

      // Switch toggles
      if (action === "toggle_switch" || el.getAttribute("role") === "switch") {
        const desired = params.desiredChecked !== undefined ? params.desiredChecked : (el.getAttribute("aria-checked") !== "true");
        el.setAttribute("aria-checked", desired ? "true" : "false");
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return { success: true, checked: el.getAttribute("aria-checked") === "true" };
      }

      // Dropdown Native
      if (action === "select_option" || tag === "select") {
        const select = tag === "select" ? el : el.closest("select");
        if (select) {
          if (value !== undefined) {
            select.value = value;
          }
          select.dispatchEvent(new Event("change", { bubbles: true }));
          select.dispatchEvent(new Event("input", { bubbles: true }));
          return { success: true, verified: select.value === value, value: select.value };
        }
      }

      // Text Input
      if (action === "type_text" || tag === "textarea" || (tag === "input" && el.type === "text")) {
        const txt = text !== undefined ? text : (value || "");
        const proto = tag === "textarea" ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto || {}, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(el, txt);
        } else {
          el.value = txt;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, verified: el.value === txt, value: el.value };
      }

      // 0. State-Based Checkbox NOOP Fast-Path
      if (action === "noop") {
        const associatedInp = el.tagName === "LABEL" ? ((el.htmlFor ? document.getElementById(el.htmlFor) : null) || el.querySelector("input")) : null;
        const isNowChecked = Boolean(
          el.checked ||
          el.getAttribute("aria-checked") === "true" ||
          el.getAttribute("aria-selected") === "true" ||
          (associatedInp && associatedInp.checked)
        );
        return {
          success: true,
          verified: true,
          action: "noop",
          target: selector || optionId || el.id || "",
          expectedState: isNowChecked,
          observedState: isNowChecked,
          checked: isNowChecked,
          value: el.value !== undefined ? el.value : undefined
        };
      }

      // If checkbox already in desired state, do NOT click or toggle
      if (action === "check" && (el.type === "checkbox" || el.getAttribute("role") === "checkbox")) {
        const isAlreadyChecked = Boolean(el.checked || el.getAttribute("aria-checked") === "true");
        if (isAlreadyChecked) {
          return {
            success: true,
            verified: true,
            action: "noop_already_checked",
            target: selector || optionId || el.id || "",
            expectedState: true,
            observedState: true,
            checked: true,
            value: el.value !== undefined ? el.value : undefined
          };
        }
      }
      if (action === "uncheck" && (el.type === "checkbox" || el.getAttribute("role") === "checkbox")) {
        const isAlreadyUnchecked = !Boolean(el.checked || el.getAttribute("aria-checked") === "true");
        if (isAlreadyUnchecked) {
          return {
            success: true,
            verified: true,
            action: "noop_already_unchecked",
            target: selector || optionId || el.id || "",
            expectedState: false,
            observedState: false,
            checked: false,
            value: el.value !== undefined ? el.value : undefined
          };
        }
      }

      // If radio already checked, do NOT click again unnecessarily
      if ((action === "click" || action === "select") && (el.type === "radio" || el.getAttribute("role") === "radio")) {
        const isAlreadyChecked = Boolean(el.checked || el.getAttribute("aria-checked") === "true");
        if (isAlreadyChecked) {
          return {
            success: true,
            verified: true,
            action: "noop_already_selected",
            target: selector || optionId || el.id || "",
            expectedState: true,
            observedState: true,
            checked: true,
            value: el.value !== undefined ? el.value : undefined
          };
        }
      }

      // Handle closed combobox expansion
      if (el.getAttribute("role") === "combobox" && el.getAttribute("aria-expanded") !== "true") {
        el.click();
        el.setAttribute("aria-expanded", "true");
      }

      // Strategy 3: Keyboard interaction (Spacebar)
      if (strategy === "keyboard") {
        try {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
        } catch {}
      }

      // Strategy 2: Label click
      if (strategy === "label" && labelSelector) {
        try {
          const lEl = document.querySelector(labelSelector);
          if (lEl) {
            lEl.click();
            const nowChecked = Boolean(el.checked || el.getAttribute("aria-checked") === "true");
            return {
              success: true,
              verified: action === "uncheck" ? !nowChecked : nowChecked,
              action: "label_click",
              target: labelSelector,
              expectedState: action === "uncheck" ? false : true,
              observedState: nowChecked,
              checked: nowChecked,
              value: el.value
            };
          }
        } catch {}
      }

      // Standard pointer & mouse dispatch
      const evtInit = { bubbles: true, cancelable: true, view: window };
      let defaultPrevented = false;
      try { el.dispatchEvent(new PointerEvent("pointerdown", evtInit)); } catch {}
      try { el.dispatchEvent(new MouseEvent("mousedown", evtInit)); } catch {}
      try { el.dispatchEvent(new PointerEvent("pointerup", evtInit)); } catch {}
      try { el.dispatchEvent(new MouseEvent("mouseup", evtInit)); } catch {}

      if (typeof el.click === "function") {
        const clickEvent = new MouseEvent("click", evtInit);
        const dispatched = el.dispatchEvent(clickEvent);
        if (!dispatched || clickEvent.defaultPrevented) {
          defaultPrevented = true;
        } else {
          el.click();
        }
      } else {
        const clickEvent = new MouseEvent("click", evtInit);
        const dispatched = el.dispatchEvent(clickEvent);
        if (!dispatched || clickEvent.defaultPrevented) {
          defaultPrevented = true;
        }
      }

      if (!defaultPrevented) {
        if (el.type === "radio") {
          if (el.name) {
            const rootEl = el.form || document;
            rootEl.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`).forEach((r) => {
              if (r !== el) {
                r.checked = false;
                r.setAttribute("aria-checked", "false");
              }
            });
          }
          el.checked = true;
          el.setAttribute("aria-checked", "true");
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (el.type === "checkbox") {
          if (action === "check") el.checked = true;
          else if (action === "uncheck") el.checked = false;
          else el.checked = !el.checked;
          el.setAttribute("aria-checked", el.checked ? "true" : "false");
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (el.tagName === "LABEL" || el.querySelector("input")) {
          const inp = (el.htmlFor ? document.getElementById(el.htmlFor) : null) || el.querySelector("input");
          if (inp && !defaultPrevented) {
            if (inp.type === "radio") {
              if (inp.name) {
                const rootEl = inp.form || document;
                rootEl.querySelectorAll(`input[type="radio"][name="${CSS.escape(inp.name)}"]`).forEach((r) => {
                  if (r !== inp) {
                    r.checked = false;
                    r.setAttribute("aria-checked", "false");
                  }
                });
              }
              inp.checked = true;
              inp.setAttribute("aria-checked", "true");
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.dispatchEvent(new Event("input", { bubbles: true }));
            } else if (inp.type === "checkbox") {
              if (action === "check") inp.checked = true;
              else if (action === "uncheck") inp.checked = false;
              else inp.checked = !inp.checked;
              inp.setAttribute("aria-checked", inp.checked ? "true" : "false");
              inp.dispatchEvent(new Event("change", { bubbles: true }));
              inp.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
        } else if (el.getAttribute("role") === "option" || el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox") {
          const role = el.getAttribute("role");
          if (role === "option") {
            const listbox = el.closest("[role='listbox']") || el.parentElement;
            if (listbox) {
              listbox.querySelectorAll("[role='option']").forEach((sibling) => {
                sibling.setAttribute("aria-selected", "false");
              });
            }
            el.setAttribute("aria-selected", "true");
            const container = el.closest(".dropdown, .custom-select, [role='combobox'], [role='listbox']") || el.parentElement;
            const hiddenInput = container ? container.querySelector('input[type="hidden"]') : null;
            if (hiddenInput) {
              hiddenInput.value = el.getAttribute("data-value") || el.getAttribute("value") || el.innerText.trim();
              hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
              hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
            }
            const combobox = container ? (container.getAttribute("role") === "combobox" ? container : container.querySelector('[role="combobox"]')) : null;
            if (combobox) {
              combobox.setAttribute("aria-expanded", "false");
            }
          } else if (role === "radio") {
            const group = el.closest("[role='radiogroup']") || el.parentElement;
            if (group) {
              group.querySelectorAll("[role='radio']").forEach((sib) => {
                if (sib !== el) sib.setAttribute("aria-checked", "false");
              });
            }
            el.setAttribute("aria-checked", "true");
          } else if (role === "checkbox") {
            const cur = el.getAttribute("aria-checked") === "true";
            el.setAttribute("aria-checked", action === "check" ? "true" : (action === "uncheck" ? "false" : String(!cur)));
          }
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      // Check whether el or any associated input is checked
      const associatedInp = el.tagName === "LABEL" ? ((el.htmlFor ? document.getElementById(el.htmlFor) : null) || el.querySelector("input")) : null;
      const isNowChecked = Boolean(
        el.checked ||
        el.getAttribute("aria-checked") === "true" ||
        el.getAttribute("aria-selected") === "true" ||
        (associatedInp && associatedInp.checked)
      );

      const expectedChecked = action === "uncheck" ? false : true;
      const isVerified = (action === "uncheck") ? (!isNowChecked) : isNowChecked;

      return {
        success: !defaultPrevented,
        verified: isVerified,
        action: action || "click",
        target: selector || optionId || el.id || "",
        expectedState: expectedChecked,
        observedState: isNowChecked,
        checked: isNowChecked,
        defaultPrevented,
        value: el.value !== undefined ? el.value : undefined
      };
    }

    static verifyQuestionState(questionId) {
      let qEl = document.querySelector(`[data-sidekick-qid="${CSS.escape(questionId)}"]`);
      if (!qEl) {
        qEl = document.getElementById(questionId);
      }
      if (!qEl) return null;

      const inputs = Array.from(qEl.querySelectorAll("input, select, textarea, [role='radio'], [role='checkbox'], [role='option'], [role='slider'], [role='switch']"));
      const options = inputs.map((inp) => {
        return {
          id: inp.getAttribute("data-sidekick-id") || inp.id,
          label: SurveyDOMEngine.getOptionLabel(inp, qEl),
          value: inp.value !== undefined ? inp.value : inp.getAttribute("data-value"),
          checked: Boolean(inp.checked || inp.getAttribute("aria-checked") === "true" || inp.getAttribute("aria-selected") === "true"),
          selected: Boolean(inp.selected || inp.getAttribute("aria-selected") === "true"),
          disabled: Boolean(inp.disabled || inp.getAttribute("aria-disabled") === "true"),
        };
      });

      const selectEl = qEl.querySelector("select");
      const textareaEl = qEl.querySelector("textarea, input[type='text'], input[type='number'], input[type='range'], input[type='date']");
      const sliderEl = qEl.querySelector("input[type='range'], [role='slider']");
      const errorEl = qEl.querySelector(".error, .error-message, [role='alert'], .invalid-feedback, .is-invalid");

      return {
        id: questionId,
        options,
        value: selectEl ? selectEl.value : (textareaEl ? textareaEl.value : (sliderEl ? (sliderEl.value || sliderEl.getAttribute("aria-valuenow")) : undefined)),
        validationError: errorEl && isVisible(errorEl) ? SurveyDOMEngine.sanitize(errorEl.innerText || errorEl.textContent) : null,
      };
    }

    static advancePage(actionType, selector) {
      let btn = null;
      if (selector) {
        try { btn = document.querySelector(selector); } catch {}
      }
      if (!btn) {
        const buttons = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit'], [role='button'], a.btn, a.button"));
        const regex = actionType === "submit" ? /\b(?:submit|finish)\b/i : /\b(?:next|continue)\b/i;
        btn = buttons.find((b) => regex.test(b.innerText || b.textContent || b.value || ""));
      }
      if (!btn) {
        throw new Error(`Navigation button not found for action ${actionType}`);
      }
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") {
        throw new Error(`Navigation button "${btn.innerText || actionType}" is currently disabled`);
      }

      const preUrl = window.location.href;
      if (typeof btn.scrollIntoView === "function") {
        try { btn.scrollIntoView({ behavior: "instant", block: "center", inline: "center" }); } catch {}
      }
      if (typeof btn.focus === "function") btn.focus();

      const evtInit = { bubbles: true, cancelable: true, view: window };
      try { btn.dispatchEvent(new PointerEvent("pointerdown", evtInit)); } catch {}
      try { btn.dispatchEvent(new MouseEvent("mousedown", evtInit)); } catch {}
      try { btn.dispatchEvent(new PointerEvent("pointerup", evtInit)); } catch {}
      try { btn.dispatchEvent(new MouseEvent("mouseup", evtInit)); } catch {}

      if (typeof btn.click === "function") btn.click();
      else btn.dispatchEvent(new MouseEvent("click", evtInit));

      return {
        success: true,
        advanced: true,
        preUrl,
      };
    }
  }

  window.SludgeAuditor = SludgeAuditor;
  window.CancelationEngine = CancelationEngine;
  window.SurveyDOMEngine = SurveyDOMEngine;
})();
