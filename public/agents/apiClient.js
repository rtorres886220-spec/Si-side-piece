/**
 * Sidekick Multi-Agent API Client (Manifest V3 Client-Side)
 * Direct resilient caller to generativelanguage.googleapis.com
 * Handles rate limits (429/503), backoff with jitter, call serialization,
 * and temporary non-persisted failover.
 */

(function () {
  const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
  const PRIMARY_MODEL = "gemini-3.5-flash-lite";
  const TEMPORARY_FALLBACK_MODEL = "gemini-3.1-flash-lite";

  class SidekickApiClient {
    constructor(apiKey, defaultModel = PRIMARY_MODEL) {
      this.apiKey = (apiKey || "").replace(/['"\s]/g, "").trim();
      this.defaultModel = defaultModel || PRIMARY_MODEL;
      this._requestQueue = Promise.resolve(); // Serializes model calls within this client
    }

    setApiKey(key) {
      this.apiKey = (key || "").replace(/['"\s]/g, "").trim();
    }

    setModel(model) {
      if (model) this.defaultModel = model;
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
     * Call with exponential backoff and jitter
     */
    async _callWithRetry(requestBody, options = {}) {
      const {
        model = this.defaultModel,
        signal = null,
        maxRetries = 3,
        initialDelayMs = 750,
      } = options;

      if (!this.apiKey) {
        throw new Error("Missing Gemini API Key. Please configure your key in Settings.");
      }

      let currentModel = model;
      let attempt = 0;
      let delayMs = initialDelayMs;

      while (attempt <= maxRetries) {
        attempt++;
        const endpoint = `${GEMINI_BASE_URL}/${currentModel}:generateContent`;

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify(requestBody),
            signal,
          });

          if (res.ok) {
            const data = await res.json();
            return {
              data,
              usedModel: currentModel,
              wasFallback: currentModel !== model,
            };
          }

          const status = res.status;
          let errorText = "";
          try {
            const errJson = await res.json();
            errorText = errJson?.error?.message || JSON.stringify(errJson);
          } catch {
            errorText = await res.text();
          }

          // Handle 429 Too Many Requests or 503 Service Unavailable
          if ((status === 429 || status === 503) && attempt <= maxRetries) {
            // Apply jitter: ± 25% of delay
            const jitter = (Math.random() - 0.5) * 0.5 * delayMs;
            const waitTime = Math.max(300, Math.round(delayMs + jitter));
            console.warn(`[ApiClient] Received ${status} from ${currentModel}. Retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries}). Error: ${errorText}`);
            await this._sleep(waitTime, signal);
            delayMs *= 2;

            // If 503 persists on last retry attempt, try temporary fallback without persisting
            if (status === 503 && attempt === maxRetries && currentModel === PRIMARY_MODEL) {
              console.warn(`[ApiClient] 503 persisted. Testing temporary non-persisted fallback model: ${TEMPORARY_FALLBACK_MODEL}`);
              currentModel = TEMPORARY_FALLBACK_MODEL;
            }
            continue;
          }

          throw new Error(`Gemini API error (${status}): ${errorText || res.statusText}`);
        } catch (err) {
          if (err.name === "AbortError") throw err;

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
     * Extracts text or JSON candidate parts from Gemini response
     */
    static extractCandidate(data) {
      const candidate = data?.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      if (!part) return { text: "", json: null, functionCall: null };

      const text = part.text || "";
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
          try {
            json = JSON.parse(cleaned);
          } catch {}
        }
      }

      return {
        text,
        json,
        functionCall: part.functionCall || null,
      };
    }
  }

  // Export to global scope
  if (typeof window !== "undefined") {
    window.SidekickApiClient = SidekickApiClient;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickApiClient };
  }
})();
