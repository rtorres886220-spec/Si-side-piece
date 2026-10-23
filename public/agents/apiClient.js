/**
 * Sidekick Multi-Agent API Client (Manifest V3 Client-Side)
 * Direct resilient caller to generativelanguage.googleapis.com
 * Handles rate limits (429/503), backoff with jitter, call serialization,
 * and temporary non-persisted failover.
 */

(function () {
  const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
  const PRIMARY_MODEL = "gemini-2.0-flash";
  const TEMPORARY_FALLBACK_MODEL = "gemini-1.5-flash";

  class SidekickApiClient {
    constructor(apiKey, defaultModel = PRIMARY_MODEL, proxyBaseUrl = "") {
      this.apiKey = (apiKey || "").replace(/['"\s]/g, "").trim();
      this.defaultModel = defaultModel || PRIMARY_MODEL;
      this.proxyBaseUrl = proxyBaseUrl || "";
      this._requestQueue = Promise.resolve(); // Serializes model calls within this client
      this._lastRequestEndTime = 0;
      this._minRequestIntervalMs = 4000; // Pacing to protect 15 RPM free tier
      this.onRateLimitPause = null;
    }

    setApiKey(key) {
      this.apiKey = (key || "").replace(/['"\s]/g, "").trim();
    }

    setModel(model) {
      if (model) {
        this.defaultModel = model;
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
     * Serialized request execution with pacing
     */
    async executeRequest(requestBody, options = {}) {
      // Serialize so calls do not race or blow rate limits
      const run = async () => {
        const now = Date.now();
        const elapsedSinceLast = now - this._lastRequestEndTime;
        if (elapsedSinceLast < this._minRequestIntervalMs && this._lastRequestEndTime > 0) {
          await this._sleep(this._minRequestIntervalMs - elapsedSinceLast, options.signal);
        }
        try {
          const res = await this._callWithRetry(requestBody, options);
          this._lastRequestEndTime = Date.now();
          return res;
        } catch (err) {
          this._lastRequestEndTime = Date.now();
          throw err;
        }
      };

      const resultPromise = this._requestQueue.then(run, run);
      this._requestQueue = resultPromise.catch(() => {});
      return resultPromise;
    }

    /**
     * Call with exponential backoff, jitter, bounded timeouts, and truthful failure reporting
     */
    async _callWithRetry(requestBody, options = {}) {
      const model = options.model || this.defaultModel;
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
        // Mode 2: Authorized Server-Side Proxy with bounded retries for transient spikes
        const proxyBase = this.getResolvedProxyUrl();
        const proxyEndpoint = `${proxyBase}/api/gemini`;
        let proxyAttempt = 0;
        let proxyDelayMs = initialDelayMs;

        while (proxyAttempt <= maxRetries) {
          proxyAttempt++;
          const { signal: attemptSignal, cleanup } = createAttemptSignal();

          try {
            const screenshotData = options?.screenshotDataUrl || requestBody?.screenshot || requestBody?.screenshotDataUrl || null;
            const proxyRes = await fetch(proxyEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                promptText: requestBody?.promptText || requestBody?.contents?.[0]?.parts?.find(p => p.text)?.text || requestBody?.contents?.[0]?.parts?.[0]?.text || "Request",
                model: model || this.defaultModel,
                screenshot: screenshotData,
                rawPayload: requestBody,
              }),
              signal: attemptSignal,
            });

            cleanup();

            if (proxyRes.ok) {
              const proxyData = await proxyRes.json();
              const responseData = proxyData.rawResponse || proxyData.data || {
                candidates: proxyData.candidates || [
                  {
                    content: {
                      parts: proxyData.functionCall
                        ? [{ functionCall: proxyData.functionCall }]
                        : [{ text: proxyData.text || "" }]
                    }
                  }
                ],
                text: proxyData.text,
                functionCall: proxyData.functionCall,
              };

              return {
                data: responseData,
                usedModel: proxyData.usedModel || model,
                wasFallback: Boolean(proxyData.wasFallback),
                fromProxy: true,
              };
            }

            let proxyErrorText = "";
            let errorCode = proxyRes.status;
            try {
              const errJson = await proxyRes.json();
              proxyErrorText = errJson?.error || JSON.stringify(errJson);
            } catch {
              proxyErrorText = await proxyRes.text().catch(() => proxyRes.statusText);
            }

            const isTransient = errorCode === 429 || errorCode === 503 || errorCode === 500;
            const isNonRetryable = errorCode === 400 || errorCode === 401 || errorCode === 403 || errorCode === 404;

            if (isTransient && proxyAttempt <= maxRetries && !signal?.aborted) {
              const jitter = (Math.random() - 0.5) * 0.5 * proxyDelayMs;
              const waitTime = Math.max(300, Math.round(proxyDelayMs + jitter));
              console.warn(`[ApiClient] Server proxy returned ${errorCode}. Retrying in ${waitTime}ms (attempt ${proxyAttempt}/${maxRetries}). Error: ${proxyErrorText}`);
              await this._sleep(waitTime, signal);
              proxyDelayMs *= 2;
              continue;
            }

            const proxyErr = new Error(`Server Proxy error (${errorCode}): ${proxyErrorText || proxyRes.statusText}`);
            proxyErr.status = errorCode;
            proxyErr.isNonRetryable = isNonRetryable;
            throw proxyErr;
          } catch (proxyErr) {
            cleanup();
            if (signal?.aborted) throw proxyErr;
            if (proxyErr.isNonRetryable) throw proxyErr;

            const isTimeout = proxyErr.name === "TimeoutError" || attemptSignal.reason?.name === "TimeoutError";

            if (proxyAttempt <= maxRetries && !signal?.aborted) {
              const jitter = (Math.random() - 0.5) * 0.5 * proxyDelayMs;
              const waitTime = Math.max(300, Math.round(proxyDelayMs + jitter));
              console.warn(`[ApiClient] Server proxy attempt ${proxyAttempt}/${maxRetries} failed (${isTimeout ? 'timeout' : proxyErr.message}). Retrying in ${waitTime}ms...`);
              await this._sleep(waitTime, signal);
              proxyDelayMs *= 2;
              continue;
            }

            if (isTimeout) {
              const timeoutErr = new DOMException(`Request timed out after ${requestTimeoutMs / 1000} seconds`, "TimeoutError");
              throw timeoutErr;
            }

            const connectionErr = new Error(`Proxy connection failed to ${proxyBase}: ${proxyErr.message}. If offline, please verify server status or configure a Gemini API key in Settings.`);
            connectionErr.isOffline = true;
            connectionErr.status = 503;
            throw connectionErr;
          }
        }

        throw new Error(`Server proxy request failed after ${maxRetries} attempts.`);
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
          let directBody = requestBody;
          const directScreenshot = options?.screenshotDataUrl || requestBody?.screenshot || requestBody?.screenshotDataUrl;
          if (directScreenshot && typeof directScreenshot === "string" && directScreenshot.startsWith("data:")) {
            const match = directScreenshot.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mimeType = match[1];
              const data = match[2];
              const parts = [{ inlineData: { mimeType, data } }];
              if (Array.isArray(requestBody?.contents?.[0]?.parts)) {
                parts.push(...requestBody.contents[0].parts);
              } else if (typeof requestBody?.prompt === "string") {
                parts.push({ text: requestBody.prompt });
              }
              directBody = {
                ...requestBody,
                contents: [{ role: "user", parts }],
              };
            }
          }

          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify(directBody),
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

          // Handle 429 Rate Limit (Free tier 15 RPM limit) with strict 60s automatic pause
          if (status === 429) {
            console.warn(`[ApiClient] 429 Rate Limit hit on ${currentModel}. Pausing for 60 seconds.`);
            const notifyPause = options.onRateLimitPause || this.onRateLimitPause;
            if (typeof notifyPause === "function") {
              notifyPause(60, "Rate limit: Pausing for 60s");
            }
            // Strict 60-second backoff with second-by-second countdown
            for (let sec = 60; sec > 0; sec--) {
              if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
              const notifyCountdown = options.onRateLimitCountdown || this.onRateLimitCountdown;
              if (typeof notifyCountdown === "function") {
                notifyCountdown(sec);
              }
              await this._sleep(1000, signal);
            }
            const notifyResume = options.onRateLimitResume || this.onRateLimitResume;
            if (typeof notifyResume === "function") {
              notifyResume();
            }
            // Retry the call
            continue;
          }

          // Handle 503 Service Unavailable with bounded exponential backoff
          if (status === 503 && attempt <= maxRetries) {
            const jitter = (Math.random() - 0.5) * 0.5 * delayMs;
            const waitTime = Math.max(300, Math.round(delayMs + jitter));
            console.warn(`[ApiClient] Received 503 from ${currentModel}. Retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries}). Error: ${errorText}`);
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
      if (!data) return { text: "", json: null, functionCall: null };

      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Extract functionCall
      let functionCall = null;
      const functionCallPart = parts.find((p) => p && p.functionCall);
      if (functionCallPart) {
        functionCall = functionCallPart.functionCall;
      } else if (data.functionCall) {
        functionCall = data.functionCall;
      }

      // Filter out internal reasoning/thought parts (Gemini 2.0 Flash Thinking / Gemini 3)
      const nonThoughtParts = parts.filter(
        (p) => p && !p.thought && typeof p.text === "string" && p.text.trim().length > 0
      );

      let text = "";
      if (nonThoughtParts.length > 0) {
        text = nonThoughtParts.map((p) => p.text).join("");
      } else if (parts.length > 0) {
        text = parts
          .filter((p) => p && typeof p.text === "string")
          .map((p) => p.text)
          .join("");
      } else if (typeof data.text === "string") {
        text = data.text;
      }

      let json = SidekickApiClient.parseJsonFromText(text);
      if (!json && functionCall && functionCall.args) {
        json = functionCall.args;
      }

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
