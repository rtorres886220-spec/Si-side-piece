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

      if (signal?.aborted) {
        throw new DOMException("Task aborted by user", "AbortError");
      }

      const router = typeof SidekickRouter !== "undefined" ? SidekickRouter : (typeof globalThis !== "undefined" ? globalThis.SidekickRouter : null);
      const retriever = typeof SidekickRetriever !== "undefined" ? SidekickRetriever : (typeof globalThis !== "undefined" ? globalThis.SidekickRetriever : null);
      const workers = typeof SidekickWorkers !== "undefined" ? SidekickWorkers : (typeof globalThis !== "undefined" ? globalThis.SidekickWorkers : null);
      const gate = typeof SidekickGate !== "undefined" ? SidekickGate : (typeof globalThis !== "undefined" ? globalThis.SidekickGate : null);
      const critic = typeof SidekickCritic !== "undefined" ? SidekickCritic : (typeof globalThis !== "undefined" ? globalThis.SidekickCritic : null);

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
      const mechanical = router ? router.checkMechanicalFastPath(promptText) : { isMechanical: false };
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
      const docSections = retriever ? retriever.parseDocumentSections(pageContext?.bodyText || "") : [];
      const sectionCatalog = retriever ? retriever.generateSectionCatalog(docSections) : [];

      // 3. STAGE 1: ROUTER + RETRIEVER
      if (signal?.aborted) throw new DOMException("Task aborted by user", "AbortError");
      onProgress("Routing intent & ranking sections…", "1. Router Agent", 1);
      const tRouterStart = performance.now();

      const route = await (router || SidekickRouter).routeRequest(this.apiClient, promptText, sectionCatalog, { signal, thinkingLevel });
      telemetry.routerMs = Math.round(performance.now() - tRouterStart);
      telemetry.intent = route.intent;

      if (signal?.aborted) throw new DOMException("Task aborted by user", "AbortError");

      // Execute discrete retrieval using selected section indices
      const evidence = (retriever || SidekickRetriever).retrieveEvidence(docSections, route.target_sections, {
        selectedText: pageContext?.selectedText || "",
        pageTitle: pageContext?.title || "",
        pageUrl: pageContext?.url || "",
      });
      telemetry.usedFullPageFallback = evidence.usedFullPageFallback;

      // 4. STAGE 2: SPECIALIST WORKER EXECUTION
      if (signal?.aborted) throw new DOMException("Task aborted by user", "AbortError");
      const tWorkerStart = performance.now();
      let workerPayload = null;
      let workerType = route.intent;
      const enclaveId = options.enclaveId;

      if (route.intent === "survey") {
        onProgress("Initializing Survey Answering Engine…", "2. Survey Specialist", 2);
        telemetry.workerUsed = "SurveyEngine";
        workerPayload = {
          type: "survey",
          instruction: promptText,
          pageContext,
        };
      } else if (route.intent === "action") {
        onProgress("Targeting element & action type…", "2. Action Worker", 2);
        telemetry.workerUsed = "ActionWorker";
        workerPayload = await (workers || SidekickWorkers).executeActionWorker(
          this.apiClient,
          promptText,
          pageContext?.interactiveElements || [],
          pageContext,
          { signal, elementHint: route.element_hint, enclaveId, thinkingLevel, cognitiveLedger: options.cognitiveLedger }
        );
      } else if (route.intent === "answer") {
        onProgress("Synthesizing grounded facts & receipts…", "2. Answer Worker", 2);
        telemetry.workerUsed = "AnswerWorker";
        workerPayload = await (workers || SidekickWorkers).executeAnswerWorker(
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
        workerPayload = await (workers || SidekickWorkers).executeTransformWorker(
          this.apiClient,
          promptText,
          evidence.evidenceText,
          pageContext,
          { signal, enclaveId, thinkingLevel }
        );
      }
      telemetry.workerMs = Math.round(performance.now() - tWorkerStart);

      // 5. STAGE 3: DETERMINISTIC INVARIANT GATE
      if (signal?.aborted) throw new DOMException("Task aborted by user", "AbortError");
      onProgress("Verifying safety & quality invariants…", "3. Deterministic Gate", 3);
      const tGateStart = performance.now();

      let gateResult = null;
      if (route.intent === "survey") {
        gateResult = { passed: true, code: "SURVEY_ROUTED", reason: "Survey task routed to dedicated verified survey engine." };
      } else if (route.intent === "action") {
        gateResult = (gate || SidekickGate).verifyActionWorker(workerPayload, pageContext?.interactiveElements || []);
      } else if (route.intent === "answer") {
        gateResult = (gate || SidekickGate).verifyAnswerWorker(workerPayload, promptText, evidence.evidenceText);
      } else {
        gateResult = (gate || SidekickGate).verifyTransformWorker(workerPayload);
      }
      telemetry.gateMs = Math.round(performance.now() - tGateStart);

      // 6. STAGE 4: CRITIC VERIFIER LOOP (Fires ONLY on gate violation)
      if (!gateResult.passed) {
        if (signal?.aborted) throw new DOMException("Task aborted by user", "AbortError");
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

        const repair = await (critic || SidekickCritic).repairFailure(
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

        // Successfully repaired: update gateResult to passed
        if (repair.repaired && workerPayload) {
          gateResult = {
            ...gateResult,
            passed: true,
            repaired: true,
            reason: "Action invariants successfully repaired by Critic."
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
        requestSafetyApproval = null,
        executeAction = null,
      } = callbacks;

      const loopStartTime = Date.now();

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

      // If survey, invoke SurveyEngine workflow with synchronized ledger
      if (route.intent === "survey") {
        onProgress("Executing verified survey workflow…", "Survey Engine", 2);
        const SurveyEngineClass = typeof SurveyEngine !== "undefined" ? SurveyEngine : (typeof globalThis !== "undefined" ? globalThis.SurveyEngine : null);
        if (SurveyEngineClass) {
          const actionExec = callbacks.executeAction || executeAction;
          if (!actionExec || !callbacks.advancePageFn) {
            return {
              type: "survey",
              status: "FAILED",
              error: "Missing required execution callbacks for survey workflow.",
              telemetry: { totalMs: Math.round(Date.now() - loopStartTime) }
            };
          }
          const engine = new SurveyEngineClass(options.surveyOptions || {});
          const surveyRes = await engine.processSurveyWorkflow(
            callbacks.getSurveyFn || (async () => (await getPageContextFn())?.surveyData),
            actionExec,
            callbacks.verifyStateFn || (async () => null),
            callbacks.advancePageFn,
            {
              signal,
              evidenceText: pageContext?.bodyText || "",
              onQuestionStart: (q) => onProgress(`Processing question: "${q.text?.slice(0, 35)}"`, "Survey Engine", 2),
              onQuestionAnswered: (ans) => onVerificationUpdate(`[Verified] "${ans.question?.text?.slice(0, 30)}": ${ans.answer?.join(", ")}`),
              onRequiresSubmitApproval: callbacks.requestSafetyApproval || requestSafetyApproval || (async () => false),
              onComplete: (res) => onComplete(res.message || "Survey completed", res),
            }
          );
          return {
            type: "survey",
            surveyResult: surveyRes,
            status: surveyRes.status,
            record: surveyRes.record,
            telemetry: { totalMs: Math.round(Date.now() - loopStartTime) }
          };
        }
      }

      // If purely informational or transform, process single turn with receipts and exit
      if (route.intent === "answer" || route.intent === "transform") {
        const turnResult = await this.processTurn(promptText, pageContext, { signal, onProgress, enclaveId });
        onComplete(turnResult.type === "answer" ? "Verified factual answer generated." : "Synthesis complete.", turnResult);
        return turnResult;
      }

      // 2. CONTINUOUS ACTION LOOP PREPARATION
      const safetyBudget = {
        maxActions: options.safetyBudget?.maxActions || 50,
        maxTimeMs: options.safetyBudget?.maxTimeMs || 600000,
        maxConsecutiveFailures: options.safetyBudget?.maxConsecutiveFailures || 3,
        ...options.safetyBudget
      };
      let consecutiveFailures = 0;
      let controllerState = "RUNNING";

      const cognitiveLedger = {
        taskObjective: promptText,
        stepNumber: 1,
        completedMilestones: [],
        activePlan: [],
        lastAction: null,
        domDelta: "Initial viewport state captured",
        historySignatures: [],
        actionLog: [],
        state: "RUNNING",
      };

      onProgress("Decomposing objective into sub-goals…", "Action Planner", 1);

      while (!signal?.aborted) {
        if (signal?.aborted) {
          controllerState = "STOPPED_BY_USER";
          break;
        }

        // Safety Budget Checks
        if (cognitiveLedger.stepNumber > safetyBudget.maxActions) {
          controllerState = "PAUSED_FOR_USER";
          onVerificationUpdate(`Safety budget reached: Task exceeded maximum limit of ${safetyBudget.maxActions} actions. Paused for safety.`);
          return {
            type: "safety_budget_reached",
            status: "PAUSED_FOR_USER",
            stepsCompleted: cognitiveLedger.stepNumber - 1,
            reason: `Exceeded action safety budget (${safetyBudget.maxActions} actions). You can resume or refine instructions.`,
            actionLog: cognitiveLedger.actionLog
          };
        }

        if (Date.now() - loopStartTime > safetyBudget.maxTimeMs) {
          controllerState = "PAUSED_FOR_USER";
          onVerificationUpdate(`Safety budget reached: Elapsed time exceeded limit of ${Math.round(safetyBudget.maxTimeMs / 1000)}s.`);
          return {
            type: "safety_budget_reached",
            status: "PAUSED_FOR_USER",
            stepsCompleted: cognitiveLedger.stepNumber - 1,
            reason: `Exceeded execution time budget (${Math.round(safetyBudget.maxTimeMs / 1000)}s).`,
            actionLog: cognitiveLedger.actionLog
          };
        }

        if (consecutiveFailures >= safetyBudget.maxConsecutiveFailures) {
          controllerState = "FAILED";
          onVerificationUpdate(`Task paused: ${consecutiveFailures} consecutive recovery attempts failed on target interactions.`);
          return {
            type: "recovery_exhausted",
            status: "FAILED",
            stepsCompleted: cognitiveLedger.stepNumber - 1,
            reason: `${consecutiveFailures} consecutive interaction failures. Halting to protect page integrity.`,
            actionLog: cognitiveLedger.actionLog
          };
        }

        controllerState = "RUNNING";
        cognitiveLedger.state = controllerState;
        onProgress(`Deliberating Step ${cognitiveLedger.stepNumber}…`, `Step ${cognitiveLedger.stepNumber}`, 2);

        // Execute Action Worker with cognitive ledger
        const workerPayload = await SidekickWorkers.executeActionWorker(
          this.apiClient,
          promptText,
          pageContext?.interactiveElements || [],
          pageContext,
          { signal, elementHint: route.element_hint, enclaveId, cognitiveLedger }
        );

        if (signal?.aborted) {
          controllerState = "STOPPED_BY_USER";
          break;
        }

        // Check if task is already complete or cannot proceed
        if (workerPayload.is_task_complete) {
          controllerState = "COMPLETED";
          cognitiveLedger.state = "COMPLETED";
          const completionSummary = workerPayload.completion_summary || workerPayload.explanation || "Task completed successfully.";
          onChecklistUpdate(workerPayload.plan_checklist || [], cognitiveLedger.stepNumber, workerPayload.situational_thought || "Task objective reached.");
          onComplete(completionSummary, workerPayload);
          return {
            type: "continuous_complete",
            status: "COMPLETED",
            stepsCompleted: cognitiveLedger.stepNumber - 1,
            summary: completionSummary,
            checklist: workerPayload.plan_checklist,
            actionLog: cognitiveLedger.actionLog,
          };
        }

        if (workerPayload.action === "none") {
          // Zero-Stall Exploration: Auto-scroll viewport to discover off-screen elements before giving up
          if ((cognitiveLedger.scrollExplorations || 0) < 3) {
            cognitiveLedger.scrollExplorations = (cognitiveLedger.scrollExplorations || 0) + 1;
            onProgress(`No actionable target visible in current viewport. Scrolling down to discover elements (${cognitiveLedger.scrollExplorations}/3)…`, "Viewport Explorer", 2);
            onVerificationUpdate(`[Exploration] Scrolling viewport down to discover off-screen interactive controls.`);
            if (executeAction) {
              await executeAction("scroll", { action: "scroll", direction: "down", distance: 500 });
            }
            await new Promise((r) => setTimeout(r, 450));
            pageContext = await getPageContextFn();
            continue;
          }
          controllerState = "STALLED";
          cognitiveLedger.state = "STALLED";
          const reason = workerPayload.explanation || "No actionable element found after active viewport exploration.";
          onVerificationUpdate(`Action paused: ${reason}`);
          return {
            type: "action_stalled",
            status: "UNABLE_TO_ACT",
            stepsCompleted: cognitiveLedger.stepNumber - 1,
            reason,
            actionLog: cognitiveLedger.actionLog,
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
            return { type: "security_blocked", status: "FAILED", reason: gateResult.reason, actionLog: cognitiveLedger.actionLog };
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
            gateResult = {
              ...gateResult,
              passed: true,
              repaired: true,
              reason: "Action invariants successfully repaired by Critic."
            };
          } else {
            consecutiveFailures++;
            onVerificationUpdate(`Critic repair failed: ${gateResult.reason}. Retrying with updated diagnostic feedback…`);
            cognitiveLedger.domDelta = `Action failed safety gate: ${gateResult.reason}. Select an alternative visible target or scroll.`;
            if (consecutiveFailures < safetyBudget.maxConsecutiveFailures) {
              if (executeAction) {
                await executeAction("scroll", { action: "scroll", direction: "down", distance: 350 });
              }
              await new Promise((r) => setTimeout(r, 400));
              pageContext = await getPageContextFn();
              continue;
            } else {
              break;
            }
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
        
        const actionSucceeded = Boolean(execRes && execRes.success === true);
        const isVerified = Boolean(execRes && execRes.verified === true);
        if (!actionSucceeded || !isVerified) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
          cognitiveLedger.scrollExplorations = 0;
        }

        // Record into compact action log
        cognitiveLedger.actionLog.push({
          step: cognitiveLedger.stepNumber,
          action: workerPayload.action,
          target: workerPayload.element_label || `[#${workerPayload.target_id}]`,
          executionSuccess: actionSucceeded,
          verified: isVerified,
          recoveryAttempt: execRes?.recovered || false,
          status: isVerified ? "VERIFIED" : (actionSucceeded ? "UNVERIFIED" : "FAILED")
        });

        onStepExecuted(cognitiveLedger.stepNumber, desc, actionSucceeded);

        // Verification pause for live DOM mutation / network responses
        controllerState = "WAITING_FOR_PAGE";
        if (callbacks.waitForSettledFn) {
          try {
            await callbacks.waitForSettledFn();
          } catch {}
        }
        await new Promise((r) => setTimeout(r, Math.max(300, postActionDelay)));
        if (signal?.aborted) {
          controllerState = "STOPPED_BY_USER";
          break;
        }

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

      if (signal?.aborted || controllerState === "STOPPED_BY_USER") {
        onVerificationUpdate("🛑 Emergency stop activated: Continuous task loop stopped.");
        return { type: "aborted", status: "STOPPED_BY_USER", stepsCompleted: cognitiveLedger.stepNumber - 1, actionLog: cognitiveLedger.actionLog };
      }

      return {
        type: "continuous_finished",
        status: controllerState,
        stepsCompleted: cognitiveLedger.stepNumber - 1,
        actionLog: cognitiveLedger.actionLog
      };
    }
  }

  // Export to global scope across window, service worker (self), and globalThis (Node.js/browser)
  if (typeof globalThis !== "undefined") {
    globalThis.SidekickCoordinator = SidekickCoordinator;
  }
  if (typeof window !== "undefined") {
    window.SidekickCoordinator = SidekickCoordinator;
  }
  if (typeof self !== "undefined") {
    self.SidekickCoordinator = SidekickCoordinator;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SidekickCoordinator };
  }
})();
