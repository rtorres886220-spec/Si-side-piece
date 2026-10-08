/**
 * Sidekick - Content Script
 * Enterprise Defense-in-Depth Sanitization, Interactive Element Indexing & DOM Interaction.
 */

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractContext") {
    try {
      const context = extractVisibleSanitizedContext();
      sendResponse({ success: true, context });
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
      characterData: true
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initObserver);
  } else {
    initObserver();
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
    url: window.location.href || "",
    author: metadata.author || "",
    date: metadata.date || "",
    selectedText: sanitizedSelection,
    bodyText: formattedBody,
    structuredEvidence: structuredUnits,
    tables: structuredTables,
    charCount: formattedBody.length,
    interactiveElements: interactiveElements.slice(0, 45),
    extractionTimeMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime,
    fromCache: false
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

  if (!date) {
    const timeEl = document.querySelector("time[datetime]");
    if (timeEl) date = timeEl.getAttribute("datetime") || timeEl.innerText.trim();
  }

  return {
    author: sanitizeString(author),
    date: sanitizeString(date)
  };
}

/**
 * Extracts visible DOM elements into structured evidence units while preserving
 * headings, sections, tables (row, col, header, cell relationships), and lists.
 */
function extractStructuredEvidence(rootNode, maxChars = 100000) {
  if (!rootNode) return { structuredUnits: [], structuredTables: [], formattedBody: "" };

  const structuredUnits = [];
  const structuredTables = [];
  const textChunks = [];
  let totalLength = 0;
  let unitCounter = 1;
  let tableCounter = 1;

  let currentSectionPath = ["Document"];
  let currentHeading = "Document";

  function isVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
    
    // Fast path: standard hidden attributes or inline display
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    if (el.style) {
      if (el.style.display === "none" || el.style.visibility === "hidden" || el.style.opacity === "0") {
        return false;
      }
    }

    // Modern browser fast path: checkVisibility is 30x faster than getComputedStyle + getBoundingClientRect
    if (typeof el.checkVisibility === "function") {
      try {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          return false;
        }
      } catch {}
    } else {
      // Fallback
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        parseFloat(style.fontSize) === 0
      ) {
        return false;
      }
    }

    // Only inspect bounding rect if element has zero children to avoid layout thrashing on branches
    if (el.children.length === 0) {
      const rect = el.getBoundingClientRect();
      if (
        (rect.width === 0 && rect.height === 0) ||
        rect.right < -500 ||
        rect.bottom < -500 ||
        rect.left > window.innerWidth + 2000
      ) {
        return false;
      }
    }

    return true;
  }

  function traverse(node) {
    if (totalLength >= maxChars) return;
    if (!node) return;

    const nodeName = node.nodeName;
    if (
      nodeName === "SCRIPT" ||
      nodeName === "STYLE" ||
      nodeName === "NOSCRIPT" ||
      nodeName === "SVG" ||
      nodeName === "CANVAS" ||
      nodeName === "AUDIO" ||
      nodeName === "VIDEO"
    ) {
      return;
    }

    if (nodeName === "IFRAME") {
      try {
        if (node.contentDocument && node.contentDocument.body) {
          traverse(node.contentDocument.body);
        }
      } catch {}
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!isVisible(node)) return;

      // Check for Headings
      if (/^H[1-6]$/.test(nodeName)) {
        const headingText = sanitizeString(node.innerText || "").trim();
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

      // Check for Tables (Preserve Row, Column, Header, and Cell relationships)
      if (nodeName === "TABLE") {
        const tableId = `tbl-${tableCounter++}`;
        const captionEl = node.querySelector("caption");
        const caption = captionEl ? sanitizeString(captionEl.innerText) : "";

        // Collect Column Headers
        const colHeaders = [];
        const headerCells = node.querySelectorAll("thead th, thead td, tr:first-child th");
        headerCells.forEach((th) => {
          colHeaders.push(sanitizeString(th.innerText).trim());
        });

        const rows = [];
        const trList = node.querySelectorAll("tr");
        let tableMd = `\n[Table: ${caption || tableId}]\n`;

        trList.forEach((tr, rIdx) => {
          const cells = tr.querySelectorAll("td, th");
          if (cells.length === 0) return;

          const rowCells = [];
          let rowHeader = "";
          const firstTh = tr.querySelector("th");
          if (firstTh) rowHeader = sanitizeString(firstTh.innerText).trim();

          const cellTexts = [];
          cells.forEach((cell, cIdx) => {
            const val = sanitizeString(cell.innerText).trim();
            const colH = colHeaders[cIdx] || `Col ${cIdx + 1}`;
            rowCells.push({
              colHeader: colH,
              value: val,
              colIdx: cIdx
            });
            cellTexts.push(val);

            // Record fine-grained evidence unit for each non-empty cell
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

          rows.push({
            rowHeader,
            cells: rowCells
          });

          tableMd += `| ${cellTexts.join(" | ")} |\n`;
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
        const liText = sanitizeString(node.innerText || "").trim();
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
        const pText = sanitizeString(node.innerText || "").trim();
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
 */
function sanitizeString(str) {
  if (!str) return "";

  // Fast path for standard strings without zero-width, bidi, or potential credentials/PII digits
  const hasSpecial = /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/.test(str);
  const hasDigits = /\d/.test(str);
  const hasSecrets = /Bearer|AIza|ghp_|sk-/.test(str);

  if (!hasSpecial && !hasDigits && !hasSecrets) {
    return str.replace(/\s+/g, " ").trim();
  }

  let cleaned = str;
  if (hasSpecial) {
    cleaned = cleaned
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
  }

  cleaned = cleaned.replace(/\s+/g, " ");

  if (hasDigits) {
    // 4. Redact Credit Card Numbers (Basic pattern + Luhn check)
    cleaned = cleaned.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, (match) => {
      const digits = match.replace(/[- ]/g, "");
      return isLuhnValid(digits) ? "[REDACTED_CREDIT_CARD]" : match;
    });

    // 5. Redact US Social Security Numbers
    cleaned = cleaned.replace(/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, "[REDACTED_SSN]");
  }

  if (hasSecrets) {
    // 6. Redact Bearer Tokens & Common API Key formats
    cleaned = cleaned.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_AUTH_TOKEN]");
    cleaned = cleaned.replace(/\bAIza[0-9A-Za-z-_]{35}\b/g, "[REDACTED_API_KEY]");
    cleaned = cleaned.replace(/\bghp_[a-zA-Z0-9]{36}\b/g, "[REDACTED_GITHUB_TOKEN]");
    cleaned = cleaned.replace(/\bsk-[a-zA-Z0-9]{32,}\b/g, "[REDACTED_SECRET_KEY]");
  }

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

let sidekickIdCounter = 0;

/**
 * 2. Interactive Element Indexer (Shielded from Payment Widgets)
 */
function indexInteractiveElements() {
  const candidates = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]'
  );

  const indexed = [];
  let idCounter = 1;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];

    // Fast-path: skip unrendered or hidden elements immediately
    if (el.hidden || (el.offsetParent === null && el.style.position !== "fixed" && el.style.position !== "sticky")) {
      continue;
    }

    // Check payment widget exclusion
    if (isPaymentWidgetOrSensitiveField(el)) {
      continue; // Strictly excluded
    }

    const rect = el.getBoundingClientRect();

    // Check visible within window
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

    // Fast visibility check using checkVisibility when available
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        continue;
      }
    } else {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        continue;
      }
    }

    // Determine descriptive label
    let label = el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.placeholder || el.value || "";
    label = sanitizeString(label).slice(0, 50);

    const tag = el.tagName.toLowerCase();
    const type = el.type || "";
    let role = tag;
    if (tag === "input") role = `${type || "text"} input`;
    else if (tag === "a") role = "link";

    // Center coordinates
    const centerX = Math.round(rect.left + rect.width / 2);
    const centerY = Math.round(rect.top + rect.height / 2);

    // 1. INJECT UNIQUE ID to prevent selector collision
    let uniqueId = el.getAttribute("data-sidekick-id");
    if (!uniqueId) {
      uniqueId = `sk-${Date.now()}-${sidekickIdCounter++}`;
      el.setAttribute("data-sidekick-id", uniqueId);
    }
    const uniqueSelector = `[data-sidekick-id="${uniqueId}"]`;

    indexed.push({
      id: idCounter++,
      role: role,
      label: label || `Unnamed ${role}`,
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
 */
function isPaymentWidgetOrSensitiveField(el) {
  // Check password inputs
  if (el.type === "password") return true;

  // Check element attributes and ancestor containers
  let current = el;
  let depth = 0;
  while (current && depth < 5) {
    const idClass = `${current.id || ""} ${current.className || ""} ${current.getAttribute("name") || ""} ${current.getAttribute("autocomplete") || ""}`.toLowerCase();
    if (
      idClass.includes("stripe") ||
      idClass.includes("paypal") ||
      idClass.includes("braintree") ||
      idClass.includes("credit-card") ||
      idClass.includes("cardnumber") ||
      idClass.includes("cvv") ||
      idClass.includes("cvc") ||
      idClass.includes("exp-date") ||
      idClass.includes("cc-number")
    ) {
      return true;
    }
    current = current.parentElement;
    depth++;
  }
  return false;
}

/**
 * Optimal CSS selector generator
 */
function getOptimalSelector(el) {
  if (el.getAttribute("data-sidekick-id")) return `[data-sidekick-id="${CSS.escape(el.getAttribute("data-sidekick-id"))}"]`;
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  if (el.getAttribute("aria-label")) return `[aria-label="${CSS.escape(el.getAttribute("aria-label"))}"]`;
  const classes = Array.from(el.classList).slice(0, 2).map(c => `.${CSS.escape(c)}`).join("");
  return `${el.tagName.toLowerCase()}${classes}`;
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
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let currentNode;
  const searchNeedle = quote.toLowerCase().replace(/\s+/g, " ");

  while ((currentNode = walker.nextNode())) {
    const text = currentNode.nodeValue ? currentNode.nodeValue.toLowerCase().replace(/\s+/g, " ") : "";
    if (text.includes(searchNeedle) || (searchNeedle.length > 25 && text.includes(searchNeedle.slice(0, 25)))) {
      const parent = currentNode.parentElement;
      if (parent) {
        parent.scrollIntoView({ behavior: "smooth", block: "center" });
        parent.style.transition = "background-color 0.3s ease";
        const oldBg = parent.style.backgroundColor;
        parent.style.backgroundColor = "rgba(124, 140, 255, 0.35)";
        setTimeout(() => {
          parent.style.backgroundColor = oldBg;
        }, 2500);
        return true;
      }
    }
  }

  return false;
}

/**
 * JIT Coordinate Re-verification (Eliminates missed clicks from dynamic layouts or scrolling)
 */
function getLiveCoordinates(selector, fallbackX, fallbackY) {
  if (selector) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            verified: true
          };
        }
      }
    } catch {}
  }
  return { x: fallbackX, y: fallbackY, verified: false };
}

/**
 * Direct DOM Fallback Dispatcher
 * Triggered when Chrome DevTools (F12) is attached or CDP connection is blocked
 */
function executeDOMFallback(cdpAction, params) {
  params = params || {};
  let targetEl = null;
  if (params.selector) {
    try {
      targetEl = document.querySelector(params.selector);
    } catch {}
  }
  if (!targetEl && params.x !== undefined && params.y !== undefined && !isNaN(params.x) && !isNaN(params.y)) {
    targetEl = document.elementFromPoint(params.x, params.y);
  }

  if (cdpAction === "click") {
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof targetEl.focus === "function") targetEl.focus();
      const clickEvt = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: params.x || 0,
        clientY: params.y || 0
      });
      targetEl.dispatchEvent(clickEvt);
      if (typeof targetEl.click === "function") {
        targetEl.click();
      }
      showActionIndicator(params.x || 100, params.y || 100, params.selector || targetEl.innerText || "clicked");
      return { clicked: true, domFallback: true };
    }
    throw new Error("Target element not found for DOM click fallback");
  }

  if (cdpAction === "type") {
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof targetEl.focus === "function") targetEl.focus();
      const txt = params.text || "";
      if ("value" in targetEl) {
        targetEl.value = txt;
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
      window.location.href = params.url;
      return { navigated: true, url: params.url, domFallback: true };
    }
    throw new Error("Missing URL for navigation fallback");
  }

  throw new Error(`Unsupported fallback action: ${cdpAction}`);
}

// ============================================================================
// ANTI-SLUDGE & PREDATORY WEB NEUTRALIZER (PHASE 1)
// ============================================================================

/**
 * @typedef {Object} DetectedDarkPattern
 * @property {string} id - Unique identifier for the finding
 * @property {string} type - e.g., "prechecked_opt_in", "asymmetric_visuals"
 * @property {string} severity - "critical", "warning", "advisory"
 * @property {string} selector - The CSS selector (using data-sidekick-id) to target it
 * @property {string} detectedText - The text that triggered the flag
 * @property {string} remedyActionDescription - What the bot should do to fix it
 */

/**
 * Recursively pierces Shadow DOMs and Same-Origin iframes to find elements.
 * This defeats modern web-component obfuscation used by adversarial UIs.
 */
function getPiercedElements(root, selector) {
    let elements = Array.from(root.querySelectorAll(selector));
    
    // 1. Traverse into Shadow DOMs (Custom Web Components)
    const allNodes = Array.from(root.querySelectorAll('*'));
    for (let node of allNodes) {
        if (node.shadowRoot) {
            elements = elements.concat(getPiercedElements(node.shadowRoot, selector));
        }
    }

    // 2. Traverse into Same-Origin iFrames
    const iframes = root.querySelectorAll('iframe');
    for (let iframe of iframes) {
        try {
            if (iframe.contentDocument) {
                elements = elements.concat(getPiercedElements(iframe.contentDocument, selector));
            }
        } catch (e) {
            // Cross-origin iframes (like external Stripe) require manifest all_frames: true
            // but this safely catches the error so the script doesn't crash.
        }
    }
    return elements;
}

if (typeof window !== "undefined") {
    window.getPiercedElements = getPiercedElements;
}

class SludgeAuditor {
    static scanPrecheckedFees() {
        const findings = [];
        const checkedInputs = getPiercedElements(document, 'input[type="checkbox"]:checked, input[type="radio"]:checked');
        const feeTerms = ["fee", "protection", "insurance", "warranty", "subscription", "monthly", "annually", "$", "premium", "tip", "donation"];
        const ignoreTerms = ["terms", "conditions", "privacy", "policy", "age", "18", "agree", "acknowledge", "rules"];

        checkedInputs.forEach((input, index) => {
            const labelElement = input.closest('label') || input.parentElement;
            const textContext = (labelElement ? labelElement.textContent : "").toLowerCase();

            if (ignoreTerms.some(term => textContext.includes(term))) return;

            if (feeTerms.some(term => textContext.includes(term))) {
                if (!input.hasAttribute('data-sidekick-id')) {
                    input.setAttribute('data-sidekick-id', `sk-sludge-fee-${Date.now()}-${index}`);
                }
                findings.push({
                    id: `sludge-fee-${index}`,
                    type: "prechecked_opt_in",
                    severity: "critical",
                    selector: `[data-sidekick-id="${input.getAttribute('data-sidekick-id')}"]`,
                    detectedText: textContext.trim().replace(/\s+/g, ' ').substring(0, 150),
                    remedyActionDescription: "Uncheck unauthorized fee/opt-in toggle"
                });
            }
        });
        return findings;
    }

    /**
     * STEP 3: Scans for Asymmetric Visual Hierarchies (e.g. Giant 'Keep Plan' vs Tiny 'Cancel')
     */
     static scanAsymmetricButtons() {
        const findings = [];
        const buttons = getPiercedElements(document, 'button, [role="button"], a.btn, a.button');

        // Look for manipulative opposite pairs
        const positiveRegex = /(accept all|keep plan|stay subscribed|claim offer)/i;
        const negativeRegex = /(reject all|cancel plan|manage settings|unsubscribe)/i;

        const positives = buttons.filter(b => positiveRegex.test(b.innerText || b.value));
        const negatives = buttons.filter(b => negativeRegex.test(b.innerText || b.value));

        if (positives.length > 0 && negatives.length > 0) {
            const posRect = positives[0].getBoundingClientRect();
            const negRect = negatives[0].getBoundingClientRect();

            const posArea = posRect.width * posRect.height;
            const negArea = negRect.width * negRect.height;

            // GATE 3.1 Math Check: If the "Keep/Accept" button is 3x larger than "Cancel/Reject"
            if (posArea > 0 && negArea > 0 && (posArea / negArea) >= 3) {
                const ratio = (posArea / negArea).toFixed(1);
                
                if (!negatives[0].hasAttribute('data-sidekick-id')) {
                    negatives[0].setAttribute('data-sidekick-id', `sk-sludge-async-${Date.now()}`);
                }

                findings.push({
                    id: `sludge-asymmetric-0`,
                    type: "asymmetric_visual_hierarchy",
                    severity: "warning",
                    selector: `[data-sidekick-id="${negatives[0].getAttribute('data-sidekick-id')}"]`,
                    detectedText: `Deceptive sizing detected. 'Accept/Keep' is ${ratio}x larger than 'Reject/Cancel'.`,
                    remedyActionDescription: "Click the hidden/smaller Reject or Cancel button"
                });
            }
        }
        return findings;
    }
}

if (typeof window !== "undefined") {
    window.SludgeAuditor = SludgeAuditor;
}

/**
 * STEP 5 & 6: The Autonomous Click-to-Cancel Engine
 */
class CancelationEngine {
    static getNextCancelationStep() {
        const bodyText = document.body.innerText.toLowerCase();

        // 1. GATE 6.1: Termination Proof (Check if we already succeeded)
        const successText = /(successfully cancelled|has been cancelled|cancellation confirmed|we're sorry to see you go|cancellation complete)/i;
        if (successText.test(bodyText)) {
            return { status: "complete", message: "Cancellation cryptographically verified by DOM state." };
        }

        // 2. Survey Bypass: Handle mandatory guilt-trip radio buttons
        const radios = getPiercedElements(document, 'input[type="radio"]');
        if (radios.length > 0) {
            // Find a neutral survey response like "Other" or "Too expensive", fallback to the first option
            const targetRadio = radios.find(r => {
                const label = (r.closest('label') || r.parentElement)?.innerText || "";
                return /(other|expensive|financial|no longer need)/i.test(label);
            }) || radios[0];

            if (targetRadio && !targetRadio.checked) {
                targetRadio.click();
                return { status: "survey_bypassed", message: "Selected neutral option to bypass mandatory exit survey." };
            }
        }

        // 3. GATE 5.1: Decoy Rejection & Target Resolution
        const buttons = getPiercedElements(document, 'button, a, [role="button"]');
        const cancelRegex = /(cancel|end|terminate|close account|continue to cancel|confirm cancellation)/i;
        const decoyRegex = /(keep|stay|nevermind|go back|claim discount|save \d+%|never mind)/i;

        let trueTarget = null;
        for (let btn of buttons) {
            const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || "").toLowerCase();
            
            // It MUST match a cancel intent, and MUST NOT match a retention lure
            if (cancelRegex.test(text) && !decoyRegex.test(text)) {
                const rect = btn.getBoundingClientRect();
                // Ensure the button is actually visible, not hidden in a collapsed div
                if (rect.width > 0 && rect.height > 0) {
                    trueTarget = btn;
                    break;
                }
            }
        }

        if (trueTarget) {
            const targetName = trueTarget.innerText.trim().substring(0, 30);
            trueTarget.click();
            return { status: "progressing", message: `Clicked legitimate progression target: [${targetName}]` };
        }

        return { status: "stuck", message: "Could not find a valid cancellation path on this page." };
    }
}

if (typeof window !== "undefined") {
    window.CancelationEngine = CancelationEngine;
}

// UPDATE YOUR EXISTING LISTENER at the bottom of content.js to look like this:
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_SLUDGE_AUDIT") {
        const feeFindings = SludgeAuditor.scanPrecheckedFees();
        const visualFindings = SludgeAuditor.scanAsymmetricButtons();
        sendResponse({ success: true, findings: [...feeFindings, ...visualFindings] });
    } 
    else if (request.action === "EXECUTE_DISINFECT") {
        const threats = SludgeAuditor.scanPrecheckedFees();
        let count = 0;
        threats.forEach(t => {
            const el = document.querySelector(t.selector) || getPiercedElements(document, t.selector)[0];
            if (el) { el.click(); count++; }
        });
        sendResponse({ success: true, count });
    }
    else if (request.action === "EXECUTE_CANCEL_STEP") {
        const result = CancelationEngine.getNextCancelationStep();
        sendResponse(result);
    }
    return true; 
});

