/**
 * Rate-Limit Aware Availability Scheduler & Resilient Dispatcher
 *
 * Tracks:
 * - Rolling 60-second request timestamps (monitors 15 RPM free tier budget).
 * - HTTP 429 (Resource Exhausted) & 503 (High Demand / Unavailable).
 * - Bounded exponential backoff with jitter.
 * - Distinguishes deterministic client errors (never retried) from transient network/load issues.
 */

export interface RequestMetric {
  timestamp: number;
  model: string;
  statusCode?: number;
  durationMs: number;
  isError: boolean;
  errorType?: "429" | "503" | "timeout" | "auth" | "client" | "other";
}

export class RateLimitScheduler {
  private requestHistory: RequestMetric[] = [];
  private consecutiveFailures = 0;
  private maxHistorySize = 100;

  // Configuration
  private readonly rpmThreshold = 14; // Alert threshold near 15 RPM
  private readonly baseBackoffMs = 800;
  private readonly maxBackoffMs = 5000;

  /**
   * Check current rolling 60-second request rate
   */
  getRollingRpm(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.cleanupOldMetrics(oneMinuteAgo);
    return this.requestHistory.filter((m) => m.timestamp >= oneMinuteAgo).length;
  }

  /**
   * Determine recommended backoff delay if throttled
   */
  computeBackoffDelay(attempt: number, errorStatus?: number): number {
    // If rate-limited (429) or overloaded (503), apply exponential backoff + jitter
    const exponent = Math.min(attempt, 4);
    const delay = this.baseBackoffMs * Math.pow(2, exponent - 1);
    const jitter = Math.random() * 400 - 200; // ±200ms
    const total = Math.min(this.maxBackoffMs, Math.max(400, delay + jitter));
    return Math.round(total);
  }

  /**
   * Check whether an error is transient (retriable) vs deterministic (non-retriable)
   */
  isRetriableError(err: any): boolean {
    if (!err) return false;
    const msg = (err.message || "").toLowerCase();
    const status = err.status || err.statusCode || 0;

    // Explicit deterministic auth / client errors MUST NOT be retried
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return false;
    }
    if (msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("permission denied")) {
      return false;
    }

    // Transient rate-limits, capacity spikes, network timeouts ARE retriable
    if (
      status === 429 ||
      status === 503 ||
      status === 500 ||
      status === 502 ||
      status === 504 ||
      msg.includes("high demand") ||
      msg.includes("spikes in demand") ||
      msg.includes("resource_exhausted") ||
      msg.includes("overloaded") ||
      msg.includes("timeout") ||
      msg.includes("fetch failed") ||
      err.name === "TimeoutError" ||
      err.code === "UND_ERR_HEADERS_TIMEOUT"
    ) {
      return true;
    }

    return false;
  }

  /**
   * Record outcome of request
   */
  recordOutcome(metric: RequestMetric) {
    this.requestHistory.push(metric);
    if (metric.isError) {
      this.consecutiveFailures++;
    } else {
      this.consecutiveFailures = 0;
    }
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }
  }

  getStats(): {
    rollingRpm: number;
    consecutiveFailures: number;
    totalTracked: number;
    errorRate: number;
  } {
    const rpm = this.getRollingRpm();
    const total = this.requestHistory.length;
    const errors = this.requestHistory.filter((m) => m.isError).length;
    return {
      rollingRpm: rpm,
      consecutiveFailures: this.consecutiveFailures,
      totalTracked: total,
      errorRate: total > 0 ? Math.round((errors / total) * 100) : 0,
    };
  }

  private cleanupOldMetrics(cutoff: number) {
    this.requestHistory = this.requestHistory.filter((m) => m.timestamp >= cutoff);
  }
}

export const globalRateLimitScheduler = new RateLimitScheduler();
