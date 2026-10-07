/**
 * Instrumentation & Telemetry Engine for Sidekick Architecture Migration
 *
 * Tracks granular per-request metrics:
 * - Token breakdown: system, tools, page, evidence, selection, history, output
 * - Execution route: direct_action, direct_conversation, lite_action, lite_synthesis, fallback
 * - Gemini call counts per task
 * - Verification passes and conflation catches
 * - Latencies & HTTP statuses
 */

export interface RequestTelemetryRecord {
  id: string;
  timestamp: number;
  model: string;
  intent: string;
  requestType: "direct_conversation" | "direct_action" | "lite_action" | "lite_synthesis" | "fallback";
  tokens: {
    system: number;
    tools: number;
    page: number;
    evidence: number;
    selection: number;
    history: number;
    inputTotal: number;
    outputEstimated: number;
  };
  toolsCount: number;
  geminiCallsCount: number;
  timings: {
    payloadMs: number;
    inferenceMs: number;
    ttftMs?: number;
    validationMs: number;
    totalMs: number;
  };
  httpStatus: number;
  retries: number;
  verified: boolean;
  conflationIssuesCount: number;
  isSuccess: boolean;
}

export class TelemetryCollector {
  private records: RequestTelemetryRecord[] = [];
  private maxRecords = 200;

  record(telemetry: RequestTelemetryRecord) {
    this.records.push(telemetry);
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  getRecords(): RequestTelemetryRecord[] {
    return [...this.records];
  }

  getAggregateSummary(): {
    totalRequests: number;
    directZeroGeminiCount: number;
    liteGeminiCount: number;
    avgInputTokens: number;
    avgLatencyMs: number;
    zeroGeminiRatio: string;
  } {
    const total = this.records.length;
    if (total === 0) {
      return {
        totalRequests: 0,
        directZeroGeminiCount: 0,
        liteGeminiCount: 0,
        avgInputTokens: 0,
        avgLatencyMs: 0,
        zeroGeminiRatio: "0%",
      };
    }

    const directCount = this.records.filter(
      (r) => r.requestType === "direct_conversation" || r.requestType === "direct_action"
    ).length;
    const liteCount = this.records.filter((r) => r.geminiCallsCount > 0).length;
    const totalTokens = this.records.reduce((acc, r) => acc + r.tokens.inputTotal, 0);
    const totalLatency = this.records.reduce((acc, r) => acc + r.timings.totalMs, 0);

    return {
      totalRequests: total,
      directZeroGeminiCount: directCount,
      liteGeminiCount: liteCount,
      avgInputTokens: Math.round(totalTokens / total),
      avgLatencyMs: Math.round(totalLatency / total),
      zeroGeminiRatio: `${Math.round((directCount / total) * 100)}%`,
    };
  }

  clear() {
    this.records = [];
  }
}

export const globalTelemetry = new TelemetryCollector();
