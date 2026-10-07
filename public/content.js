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
});

/**
 * 1. Invisible & Off-Screen DOM Stripper + PII Redaction
 */
function extractVisibleSanitizedContext() {
  const selection = window.getSelection() ? window.getSelection().toString().trim() : "";
  const sanitizedBody = extractVisibleText(document.body, 100000);
  const interactiveElements = indexInteractiveElements();

  return {
    title: sanitizeString(document.title || "Untitled"),
    url: window.location.href || "",
    selectedText: sanitizeString(selection),
    bodyText: sanitizedBody,
    charCount: sanitizedBody.length,
    interactiveElements: interactiveElements.slice(0, 45) // Keep high-priority top interactive elements
  };
}

/**
 * Extract visible text while stripping invisible/hidden/off-screen injection tricks
 */
function extractVisibleText(rootNode, maxChars = 100000) {
  if (!rootNode) return "";

  const textChunks = [];
  let totalLength = 0;

  function traverse(node) {
    if (totalLength >= maxChars) return;
    if (!node) return;

    // Skip technical and script nodes
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

    // Inspect accessible same-origin iframe content documents
    if (nodeName === "IFRAME") {
      try {
        if (node.contentDocument && node.contentDocument.body) {
          traverse(node.contentDocument.body);
        }
      } catch {}
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      // Check computed visibility & offscreen properties
      const style = window.getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        parseFloat(style.fontSize) === 0
      ) {
        return; // Purge hidden elements
      }

      // Check text-color cloaking (white-on-white, matching colors)
      if (style.color && style.backgroundColor && style.color === style.backgroundColor && style.color !== "rgba(0, 0, 0, 0)") {
        return; // Purge cloaked text
      }

      // Check off-screen coordinate tricks
      const rect = node.getBoundingClientRect();
      if (
        (rect.width === 0 && rect.height === 0 && node.children.length === 0) ||
        rect.right < -500 ||
        rect.bottom < -500 ||
        rect.left > window.innerWidth + 2000
      ) {
        return; // Purge elements moved far offscreen
      }

      // Traverse standard child nodes
      for (let i = 0; i < node.childNodes.length; i++) {
        traverse(node.childNodes[i]);
        if (totalLength >= maxChars) break;
      }

      // Traverse Shadow Root (Web Components, YouTube, Reddit custom elements)
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
          textChunks.push(sanitized);
          totalLength += sanitized.length;
        }
      }
    }
  }

  traverse(rootNode);
  return textChunks.join(" ").slice(0, maxChars);
}

/**
 * PII, Credential & Unicode Injection Sanitizer
 */
function sanitizeString(str) {
  if (!str) return "";

  let cleaned = str
    // 1. Strip zero-width characters used to bypass word boundaries
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // 2. Strip bidirectional override characters used in Trojan Source/RTL spoofing
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    // 3. Normalize whitespace
    .replace(/\s+/g, " ");

  // 4. Redact Credit Card Numbers (Basic pattern + Luhn check)
  cleaned = cleaned.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, (match) => {
    const digits = match.replace(/[- ]/g, "");
    return isLuhnValid(digits) ? "[REDACTED_CREDIT_CARD]" : match;
  });

  // 5. Redact US Social Security Numbers
  cleaned = cleaned.replace(/\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, "[REDACTED_SSN]");

  // 6. Redact Bearer Tokens & Common API Key formats
  cleaned = cleaned.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_AUTH_TOKEN]");
  cleaned = cleaned.replace(/\bAIza[0-9A-Za-z-_]{35}\b/g, "[REDACTED_API_KEY]");
  cleaned = cleaned.replace(/\bghp_[a-zA-Z0-9]{36}\b/g, "[REDACTED_GITHUB_TOKEN]");
  cleaned = cleaned.replace(/\bsk-[a-zA-Z0-9]{32,}\b/g, "[REDACTED_SECRET_KEY]");

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
 */
function indexInteractiveElements() {
  const candidates = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]'
  );

  const indexed = [];
  let idCounter = 1;

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];

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
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      continue;
    }

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || el.disabled) {
      continue;
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

    indexed.push({
      id: idCounter++,
      role: role,
      label: label || `Unnamed ${role}`,
      x: centerX,
      y: centerY,
      selector: getOptimalSelector(el)
    });

    if (indexed.length >= 50) break;
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
