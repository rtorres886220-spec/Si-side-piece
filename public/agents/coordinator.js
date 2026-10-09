/**
 * Sidekick Multi-Agent Pipeline Coordinator (Manifest V3 Client-Side)
 * Orchestrates the full lifecycle:
 * 1. Mechanical bypass (0ms)
 * 2. Router + Discrete Retriever
 * 3. Specialist Worker (Action / Answer / Transform)
 * 4. Deterministic Invariant Gate (Safety & Quality)
 * 5. Critic Verifier Loop (on gate failure)
 * Provides progress telemetry and realistic 1-3s status feedback.
 */

(function () {
  class SidekickCoordinator {
    constructor(apiClient) {
      this.apiClient = apiClient;
    }

    /**
     * Executes one complete multi-agent turn
     */
    async processTurn(promptText, pageContext, options = {}) {
      const {
        signal = null,
        onProgress = () => {},
      } = options;

      const tStart = performance.now();
      const telemetry = {
        routerMs: 0,
        workerMs: 0,
        gateMs: 0,
        criticMs: 0,
        totalMs: 0,
        criticFired: false,
        criticRepaired: false,
        usedFullPageFallback: false,
        intent: "unknown",
        workerUsed: "",
      };

      // 1. MECHANICAL BYPASS (0ms Zero-LLM)
      const mechanical = SidekickRouter.checkMechanicalFastPath(promptText);
      if (mechanical.isMechanical) {
        telemetry.totalMs = Math.round(performance.now() - tStart);
        telemetry.intent = "mechanical_action";
        return {
          type: "mechanical",
          mechanicalAction: mechanical.mechanicalAction,
          direction: mechanical.direction,
          telemetry,
        };
      }

      // 2. DISCRETE RETRIEVAL STAGE PREP
      const docSections = SidekickRetriever.parseDocumentSections(pageContext?.bodyText || "");
      const sectionCatalog = SidekickRetriever.generateSectionCatalog(docSections);

      // 3. STAGE 1: ROUTER + RETRIEVER
      onProgress("Routing intent & ranking sections…", "1. Router Agent", 1);
      const tRouterStart = performance.now();

      const route = await SidekickRouter.routeRequest(this.apiClient, promptText, sectionCatalog, { signal });
      telemetry.routerMs = Math.round(performance.now() - tRouterStart);
      telemetry.intent = route.intent;

      // Execute discrete retrieval using selected section indices
      const evidence = SidekickRetriever.retrieveEvidence(docSections, route.target_sections, {
        selectedText: pageContext?.selectedText || "",
        pageTitle: pageContext?.title || "",
        pageUrl: pageContext?.url || "",
      });
      telemetry.usedFullPageFallback = evidence.usedFullPageFallback;

      // 4. STAGE 2: SPECIALIST WORKER EXECUTION
      const tWorkerStart = performance.now();
      let workerPayload = null;
      let workerType = route.intent;
      const enclaveId = options.enclaveId;

      if (route.intent === "action") {
        onProgress("Targeting element & action type…", "2. Action Worker", 2);
        telemetry.workerUsed = "ActionWorker";
        workerPayload = await SidekickWorkers.executeActionWorker(
          this.apiClient,
          promptText,
          pageContext?.interactiveElements || [],
          pageContext,
          { signal, elementHint: route.element_hint, enclaveId }
        );
      } else if (route.intent === "answer") {
        onProgress("Synthesizing grounded facts & receipts…", "2. Answer Worker", 2);
        telemetry.workerUsed = "AnswerWorker";
        workerPayload = await SidekickWorkers.executeAnswerWorker(
          this.apiClient,
          promptText,
          evidence.evidenceText,
          pageContext,
          { signal, enclaveId }
        );
      } else {
        // "transform" (open synthesis, rewrite, translate, draft, quiz, evaluate)
        onProgress("Generating synthesis & transform…", "2. Transform Worker", 2);
        telemetry.workerUsed = "TransformWorker";
        workerPayload = await SidekickWorkers.executeTransformWorker(
          this.apiClient,
          promptText,
          evidence.evidenceText,
          pageContext,
          { signal, enclaveId }
        );
      }
      telemetry.workerMs = Math.round(performance.now() - tWorkerStart);

      // 5. STAGE 3: DETERMINISTIC INVARIANT GATE
      onProgress("Verifying safety & quality invariants…", "3. Deterministic Gate", 3);
      const tGateStart = performance.now();

      let gateResult = null;
      if (route.intent === "action") {
        gateResult = SidekickGate.verifyActionWorker(workerPayload, pageContext?.interactiveElements || []);
      } else if (route.intent === "answer") {
        gateResult = SidekickGate.verifyAnswerWorker(workerPayload, promptText, evidence.evidenceText);
      } else {
        gateResult = SidekickGate.verifyTransformWorker(workerPayload);
      }
      telemetry.gateMs = Math.round(performance.now() - tGateStart);

      // 6. STAGE 4: CRITIC VERIFIER LOOP (Fires ONLY on gate violation)
      if (!gateResult.passed) {
        telemetry.criticFired = true;

        if (gateResult.isSecurityViolation) {
          // Security violation cannot be bypassed by model
          telemetry.totalMs = Math.round(performance.now() - tStart);
          return {
            type: "security_blocked",
            reason: gateResult.reason,
            payload: null,
            telemetry,
          };
        }

        onProgress(`Gate flagged ${gateResult.code}; Critic repairing…`, "4. Critic Verifier", 4);
        const tCriticStart = performance.now();

        const repair = await SidekickCritic.repairFailure(
          this.apiClient,
          route.intent,
          workerPayload,
          gateResult,
          promptText,
          evidence.evidenceText,
          pageContext,
          { signal, interactiveElements: pageContext?.interactiveElements || [], enclaveId }
        );

        telemetry.criticMs = Math.round(performance.now() - tCriticStart);
        telemetry.criticRepaired = repair.repaired;
        workerPayload = repair.payload;

        // If action repair failed, STRICTLY block execution rather than running an invalid action
        if (route.intent === "action" && (!repair.repaired || !workerPayload)) {
          telemetry.totalMs = Math.round(performance.now() - tStart);
          return {
            type: "action_blocked",
            reason: repair.reason || gateResult.reason || "Action failed validation invariants and could not be repaired.",
            payload: null,
            telemetry,
            gateResult,
          };
        }
      }

      telemetry.totalMs = Math.round(performance.now() - tStart);

      return {
        type: route.intent,
        payload: workerPayload,
        evidence: evidence,
        route: route,
        gateResult: gateResult,
        telemetry: telemetry,
      };
    }
  }

  // Export to global scope
  if (typeof window !== "undefined") {
    window.SidekickCoordinator = SidekickCoordinator;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickCoordinator };
  }
})();
