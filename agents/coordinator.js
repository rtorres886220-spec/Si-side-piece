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
        thinkingLevel = "HIGH",
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

      const route = await SidekickRouter.routeRequest(this.apiClient, promptText, sectionCatalog, { signal, thinkingLevel });
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
          { signal, elementHint: route.element_hint, enclaveId, thinkingLevel, cognitiveLedger: options.cognitiveLedger }
        );
      } else if (route.intent === "answer") {
        onProgress("Synthesizing grounded facts & receipts…", "2. Answer Worker", 2);
        telemetry.workerUsed = "AnswerWorker";
        workerPayload = await SidekickWorkers.executeAnswerWorker(
          this.apiClient,
          promptText,
          evidence.evidenceText,
          pageContext,
          { signal, enclaveId, thinkingLevel }
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
          { signal, enclaveId, thinkingLevel }
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
          { signal, interactiveElements: pageContext?.interactiveElements || [], enclaveId, thinkingLevel }
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

    /**
     * Executes an autonomous, continuous multi-process loop until the task is complete.
     * Continuously observes the live page, reasons about progress, performs actions,
     * verifies state mutations, and updates the real-time checklist and thought stream.
     */
    async runContinuousTaskLoop(promptText, getPageContextFn, callbacks = {}, options = {}) {
      const {
        signal = null,
        enclaveId = "enclave-" + Date.now(),
        postActionDelay = 350,
      } = options;

      const {
        onProgress = () => {},
        onChecklistUpdate = () => {},
        onStepExecuted = () => {},
        onVerificationUpdate = () => {},
        onComplete = () => {},
        requestSafetyApproval = async () => true,
        executeAction = async () => ({ success: true }),
      } = callbacks;

      // 1. FAST PATH: Check mechanical bypass (0ms)
      const mechanical = SidekickRouter.checkMechanicalFastPath(promptText);
      if (mechanical.isMechanical) {
        if (executeAction) {
          await executeAction("mechanical", mechanical);
        }
        onComplete(`Mechanical shortcut completed: ${mechanical.mechanicalAction}`);
        return { type: "mechanical", mechanicalAction: mechanical.mechanicalAction };
      }

      // Initial observation
      let pageContext = await getPageContextFn();

      // Check intent via router
      const docSections = SidekickRetriever.parseDocumentSections(pageContext?.bodyText || "");
      const sectionCatalog = SidekickRetriever.generateSectionCatalog(docSections);
      onProgress("Analyzing intent and required workflow…", "Router Agent", 1);
      const route = await SidekickRouter.routeRequest(this.apiClient, promptText, sectionCatalog, { signal });

      // If purely informational or transform, process single turn with receipts and exit
      if (route.intent === "answer" || route.intent === "transform") {
        const turnResult = await this.processTurn(promptText, pageContext, { signal, onProgress, enclaveId });
        onComplete(turnResult.type === "answer" ? "Verified factual answer generated." : "Synthesis complete.", turnResult);
        return turnResult;
      }

      // 2. CONTINUOUS ACTION LOOP PREPARATION
      const cognitiveLedger = {
        taskObjective: promptText,
        stepNumber: 1,
        completedMilestones: [],
        activePlan: [],
        lastAction: null,
        domDelta: "Initial viewport state captured",
        historySignatures: [],
      };

      onProgress("Decomposing objective into sub-goals…", "Action Planner", 1);

      while (!signal?.aborted) {
        if (signal?.aborted) break;

        onProgress(`Deliberating Step ${cognitiveLedger.stepNumber}…`, `Step ${cognitiveLedger.stepNumber}`, 2);

        // Execute Action Worker with cognitive ledger
        const workerPayload = await SidekickWorkers.executeActionWorker(
          this.apiClient,
          promptText,
          pageContext?.interactiveElements || [],
          pageContext,
          { signal, elementHint: route.element_hint, enclaveId, cognitiveLedger }
        );

        if (signal?.aborted) break;

        // Check if task is already complete or no more action needed
        if (workerPayload.is_task_complete || workerPayload.action === "none") {
          const completionSummary = workerPayload.completion_summary || workerPayload.explanation || "Task completed successfully.";
          onChecklistUpdate(workerPayload.plan_checklist || [], cognitiveLedger.stepNumber, workerPayload.situational_thought || "Task objective reached.");
          onComplete(completionSummary, workerPayload);
          return {
            type: "continuous_complete",
            stepsCompleted: cognitiveLedger.stepNumber - 1,
            summary: completionSummary,
            checklist: workerPayload.plan_checklist,
          };
        }

        // Notify UI of updated plan and thought stream
        onChecklistUpdate(
          workerPayload.plan_checklist || [],
          cognitiveLedger.stepNumber,
          workerPayload.situational_thought || workerPayload.explanation
        );

        // Deterministic Gate Check
        let gateResult = SidekickGate.verifyActionWorker(workerPayload, pageContext?.interactiveElements || []);
        if (!gateResult.passed) {
          if (gateResult.isSecurityViolation) {
            onVerificationUpdate(`Security policy blocked action: ${gateResult.reason}`);
            return { type: "security_blocked", reason: gateResult.reason };
          }
          // Attempt Critic Repair
          onProgress(`Refining action invariant (${gateResult.code})…`, "Critic Verifier", 3);
          const repair = await SidekickCritic.repairFailure(
            this.apiClient,
            "action",
            workerPayload,
            gateResult,
            promptText,
            "",
            pageContext,
            { signal, interactiveElements: pageContext?.interactiveElements || [], enclaveId }
          );
          if (repair.repaired && repair.payload) {
            Object.assign(workerPayload, repair.payload);
          } else {
            onVerificationUpdate(`Action repair failed: ${gateResult.reason}`);
            break;
          }
        }

        // Cycle Detection (Anti-thrashing: detect identical repeated actions without progress)
        const currentSignature = `${workerPayload.action}:${workerPayload.target_id || ""}:${workerPayload.text || ""}:${pageContext?.interactiveElements?.length || 0}`;
        cognitiveLedger.historySignatures.push(currentSignature);
        const last3 = cognitiveLedger.historySignatures.slice(-3);
        if (last3.length === 3 && last3[0] === last3[1] && last3[1] === last3[2]) {
          onVerificationUpdate("Halting: Detected 3 identical consecutive actions without DOM state progress to prevent runaway loops.");
          break;
        }

        // Dispatch action via callback
        onProgress(`Dispatching ${workerPayload.action} action via CDP…`, "Execution Engine", 3);
        const execRes = await executeAction(workerPayload.action, workerPayload);
        const desc = workerPayload.element_label 
          ? `${workerPayload.action === "click" ? "Clicked" : "Typed into"} "${workerPayload.element_label}"`
          : `${workerPayload.action} dispatched`;
        
        onStepExecuted(cognitiveLedger.stepNumber, desc, execRes?.success !== false);

        // Verification pause for live DOM mutation / network responses
        await new Promise((r) => setTimeout(r, postActionDelay));
        if (signal?.aborted) break;

        // Re-extract fresh page context
        const prevContext = pageContext;
        pageContext = await getPageContextFn();

        // Calculate DOM state delta
        const urlChanged = prevContext?.url !== pageContext?.url;
        const elemDelta = (pageContext?.interactiveElements?.length || 0) - (prevContext?.interactiveElements?.length || 0);
        let deltaDesc = urlChanged 
          ? `Navigated to new URL: ${pageContext?.url}`
          : `DOM updated (${pageContext?.interactiveElements?.length || 0} interactive elements visible, ${elemDelta >= 0 ? "+" : ""}${elemDelta} delta)`;
        
        cognitiveLedger.domDelta = deltaDesc;
        cognitiveLedger.lastAction = desc;
        cognitiveLedger.completedMilestones.push(`Step ${cognitiveLedger.stepNumber}: ${desc}`);
        onVerificationUpdate(`Verified: ${deltaDesc}`);

        cognitiveLedger.stepNumber++;
      }

      if (signal?.aborted) {
        onVerificationUpdate("🛑 Emergency stop activated: Continuous task loop stopped.");
        return { type: "aborted", stepsCompleted: cognitiveLedger.stepNumber - 1 };
      }

      return {
        type: "continuous_finished",
        stepsCompleted: cognitiveLedger.stepNumber - 1,
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
