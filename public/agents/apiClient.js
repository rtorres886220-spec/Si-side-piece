/**
 * Sidekick Multi-Agent API Client (Manifest V3 Client-Side)
 * Direct resilient caller to generativelanguage.googleapis.com
 * Handles rate limits (429/503), backoff with jitter, call serialization,
 * and temporary non-persisted failover.
 */

(function () {
  const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
  const PRIMARY_MODEL = "gemini-3.1-flash-lite";
  const TEMPORARY_FALLBACK_MODEL = "gemini-3.8-flash";

  class SidekickApiClient {
    constructor(apiKey, defaultModel = PRIMARY_MODEL, proxyBaseUrl = "") {
      this.apiKey = (apiKey || "").replace(/['"\s]/g, "").trim();
      this.defaultModel = defaultModel || PRIMARY_MODEL;
      this.proxyBaseUrl = proxyBaseUrl || "";
      this._requestQueue = Promise.resolve(); // Serializes model calls within this client
    }

    setApiKey(key) {
      this.apiKey = (key || "").replace(/['"\s]/g, "").trim();
    }

    setModel(model) {
      if (model) {
        this.defaultModel = model === "gemini-3.5-flash-lite" ? PRIMARY_MODEL : model;
      }
    }

    setProxyBaseUrl(url) {
      this.proxyBaseUrl = (url || "").trim().replace(/\/+$/, "");
    }

    getResolvedProxyUrl() {
      if (this.proxyBaseUrl) return this.proxyBaseUrl;
      if (typeof globalThis !== "undefined" && globalThis.__SIDEKICK_BACKEND_URL__) {
        return String(globalThis.__SIDEKICK_BACKEND_URL__).trim().replace(/\/+$/, "");
      }
      if (typeof window !== "undefined" && window.location && window.location.protocol && window.location.protocol.startsWith("http")) {
        return window.location.origin;
      }
      return "http://localhost:3000";
    }

    /**
     * Delay helper with cancellation support
     */
    _sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          return reject(new DOMException("Aborted", "AbortError"));
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }

    /**
     * Serialized request execution
     */
    async executeRequest(requestBody, options = {}) {
      // Serialize so calls do not race or blow rate limits
      const run = async () => {
        return this._callWithRetry(requestBody, options);
      };

      const resultPromise = this._requestQueue.then(run, run);
      this._requestQueue = resultPromise.catch(() => {});
      return resultPromise;
    }

    /**
     * Call with exponential backoff, jitter, bounded timeouts, and truthful failure reporting
     */
    async _callWithRetry(requestBody, options = {}) {
      const rawModel = options.model || this.defaultModel;
      const model = rawModel === "gemini-3.5-flash-lite" ? PRIMARY_MODEL : rawModel;
      const {
        signal = null,
        maxRetries = 3,
        initialDelayMs = 750,
        requestTimeoutMs = 30000,
      } = options;

      // Create bounded per-attempt timeout controller combined with external signal
      const createAttemptSignal = () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort(new DOMException("Request timed out after 30 seconds", "TimeoutError"));
        }, requestTimeoutMs);

        if (signal) {
          if (signal.aborted) {
            clearTimeout(timeoutId);
            controller.abort(signal.reason);
          } else {
            signal.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              controller.abort(signal.reason);
            }, { once: true });
          }
        }
        return { signal: controller.signal, cleanup: () => clearTimeout(timeoutId) };
      };

      if (!this.apiKey) {
        // Mode 2: Server-side proxy
        const proxyBase = this.getResolvedProxyUrl();
        const proxyEndpoint = `${proxyBase}/api/gemini`;
        const { signal: attemptSignal, cleanup } = createAttemptSignal();

        try {
          const proxyRes = await fetch(proxyEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              promptText: requestBody?.contents?.[0]?.parts?.[0]?.text || "Request",
              model: model || this.defaultModel,
              rawPayload: requestBody,
            }),
            signal: attemptSignal,
          });

          cleanup();

          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            return {
              data: proxyData.rawResponse || {
                candidates: [
                  {
                    content: {
                      parts: proxyData.functionCall
                        ? [{ functionCall: proxyData.functionCall }]
                        : [{ text: proxyData.text || "" }]
                    }
                  }
                ]
              },
              usedModel: proxyData.usedModel || model,
              wasFallback: false,
              fromProxy: true,
            };
          }

          let proxyErrorText = "";
          try {
            const errJson = await proxyRes.json();
            proxyErrorText = errJson?.error || JSON.stringify(errJson);
          } catch {
            proxyErrorText = await proxyRes.text().catch(() => proxyRes.statusText);
          }

          const proxyErr = new Error(`Server Proxy error (${proxyRes.status}): ${proxyErrorText || proxyRes.statusText}`);
          proxyErr.status = proxyRes.status;
          proxyErr.isNonRetryable = proxyRes.status === 400 || proxyRes.status === 401 || proxyRes.status === 403 || proxyRes.status === 404;
          throw proxyErr;
        } catch (proxyErr) {
          cleanup();
          if (proxyErr.name === "AbortError" || proxyErr.isNonRetryable) throw proxyErr;
          throw new Error(`Proxy connection failed to ${proxyBase}: ${proxyErr.message}. Configure Gemini API key in Settings for direct access.`);
        }
      }

      // Mode 1: Direct Gemini API
      let currentModel = model;
      let attempt = 0;
      let delayMs = initialDelayMs;

      while (attempt <= maxRetries) {
        attempt++;
        const endpoint = `${GEMINI_BASE_URL}/${currentModel}:generateContent`;
        const { signal: attemptSignal, cleanup } = createAttemptSignal();

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify(requestBody),
            signal: attemptSignal,
          });

          cleanup();

          if (res.ok) {
            const data = await res.json();
            return {
              data,
              usedModel: currentModel,
              wasFallback: currentModel !== model,
              fromProxy: false,
            };
          }

          const status = res.status;
          let errorText = "";
          try {
            const rawBody = await res.text();
            try {
              const errJson = JSON.parse(rawBody);
              errorText = errJson?.error?.message || JSON.stringify(errJson);
            } catch {
              errorText = rawBody;
            }
          } catch {
            errorText = res.statusText || `HTTP ${status}`;
          }

          // Handle 429 Too Many Requests or 503 Service Unavailable with bounded backoff
          if ((status === 429 || status === 503) && attempt <= maxRetries) {
            const jitter = (Math.random() - 0.5) * 0.5 * delayMs;
            const waitTime = Math.max(300, Math.round(delayMs + jitter));
            console.warn(`[ApiClient] Received ${status} from ${currentModel}. Retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries}). Error: ${errorText}`);
            await this._sleep(waitTime, signal);
            delayMs *= 2;

            if (attempt === maxRetries && currentModel === PRIMARY_MODEL) {
              console.warn(`[ApiClient] High load persisted on ${PRIMARY_MODEL}. Trying fallback model: ${TEMPORARY_FALLBACK_MODEL}`);
              currentModel = TEMPORARY_FALLBACK_MODEL;
            }
            continue;
          }

          const nonRetryError = new Error(`Gemini API error (${status}): ${errorText || res.statusText}`);
          nonRetryError.status = status;
          nonRetryError.isNonRetryable = true;
          throw nonRetryError;
        } catch (err) {
          cleanup();
          if (err.name === "AbortError" || err.isNonRetryable) throw err;

          // Network or transient errors
          if (attempt <= maxRetries && !signal?.aborted) {
            const jitter = (Math.random() - 0.5) * 0.5 * delayMs;
            const waitTime = Math.max(300, Math.round(delayMs + jitter));
            console.warn(`[ApiClient] Network request failed. Retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries}). Error: ${err.message}`);
            await this._sleep(waitTime, signal);
            delayMs *= 2;
            continue;
          }
          throw err;
        }
      }

      throw new Error(`Failed after ${maxRetries} attempts.`);
    }

    /**
     * Resilient JSON parser that handles code blocks, preambles, and trailing commas
     */
    static parseJsonFromText(rawText) {
      if (!rawText || typeof rawText !== "string") return null;
      const str = rawText.trim();
      if (!str) return null;

      // 1. Direct parse attempt
      try {
        return JSON.parse(str);
      } catch {}

      // 2. Extract code block content (```json ... ``` or ``` ... ```) anywhere in string
      const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        const candidate = codeBlockMatch[1].trim();
        try {
          return JSON.parse(candidate);
        } catch {
          const cleaned = candidate.replace(/,\s*([}\]])/g, "$1");
          try {
            return JSON.parse(cleaned);
          } catch {}
        }
      }

      // 3. Find outer balanced braces {...}
      const firstBrace = str.indexOf("{");
      const lastBrace = str.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidateJson = str.substring(firstBrace, lastBrace + 1).trim();
        try {
          return JSON.parse(candidateJson);
        } catch {
          const cleaned = candidateJson.replace(/,\s*([}\]])/g, "$1");
          try {
            return JSON.parse(cleaned);
          } catch {}
        }
      }

      // 4. Find outer brackets [...]
      const firstBracket = str.indexOf("[");
      const lastBracket = str.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        const candidateJson = str.substring(firstBracket, lastBracket + 1).trim();
        try {
          return JSON.parse(candidateJson);
        } catch {
          const cleaned = candidateJson.replace(/,\s*([}\]])/g, "$1");
          try {
            return JSON.parse(cleaned);
          } catch {}
        }
      }

      return null;
    }

    /**
     * Extracts text, JSON, and function calls from Gemini response parts.
     * Accurately filters out internal thought blocks from Gemini 2.0/3.x models.
     */
    static extractCandidate(data) {
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      if (!parts.length) return { text: "", json: null, functionCall: null };

      // Look for functionCall first
      const functionCallPart = parts.find((p) => p && p.functionCall);
      const functionCall = functionCallPart ? functionCallPart.functionCall : null;

      // Filter out internal reasoning/thought parts (Gemini 2.0 Flash Thinking / Gemini 3)
      const nonThoughtParts = parts.filter(
        (p) => p && !p.thought && typeof p.text === "string" && p.text.trim().length > 0
      );

      let text = "";
      if (nonThoughtParts.length > 0) {
        text = nonThoughtParts.map((p) => p.text).join("");
      } else {
        // Fallback: use all text parts if model only provided a single part without thought flag
        text = parts
          .filter((p) => p && typeof p.text === "string")
          .map((p) => p.text)
          .join("");
      }

      const json = SidekickApiClient.parseJsonFromText(text);

      return {
        text,
        json,
        functionCall,
      };
    }
  }

  // Export to global scope across window, service worker (self), and globalThis (Node.js/browser)
  if (typeof globalThis !== "undefined") {
    globalThis.SidekickApiClient = SidekickApiClient;
  }
  if (typeof window !== "undefined") {
    window.SidekickApiClient = SidekickApiClient;
  }
  if (typeof self !== "undefined") {
    self.SidekickApiClient = SidekickApiClient;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickApiClient };
  }
})();
