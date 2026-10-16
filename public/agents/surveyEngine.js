/**
 * Sidekick Survey Answering & Verified Interaction Engine (Manifest V3 Client-Side)
 * 
 * Implements:
 * 1. Question Recognition & Classification Layer
 * 2. Strict Answer-Reasoning Pipeline (Factual Grounding, Personal Privacy Guard, Multi-Select Semantics)
 * 3. Exact Control Target Matcher (Group-scoped, Duplicate-label isolation, Diff-based Checkbox Selection)
 * 4. Bounded Action Execution & Strict State Verification
 * 5. Question-by-Question State Machine (OBSERVE -> PARSE -> RESOLVE -> VALIDATE -> EXECUTE -> VERIFY -> ADVANCE)
 * 6. Autonomy Policy (Personal info pause, Ambiguity pause, Consequential submit authorization gate)
 * 7. Cycle & Thrashing Detection
 */

(function () {
  // Sensitive personal keywords that must never be fabricated/invented without user profile authorization
  const PERSONAL_INFO_PATTERNS = [
    /\b(?:age|birthday|birth\s*date|dob|date\s+of\s+birth)\b/i,
    /\b(?:gender|sex|pronouns|race|ethnicity)\b/i,
    /\b(?:income|salary|household\s*income|earnings|net\s*worth)\b/i,
    /\b(?:phone|phone\s*number|mobile|cell)\b/i,
    /\b(?:address|home\s+address|street|zip\s*code|postal\s*code)\b/i,
    /\b(?:ssn|social\s+security|tax\s*id)\b/i,
    /\b(?:job\s+title|occupation|employer|company\s+name|industry|profession)\b/i,
    /\b(?:marital\s+status|children|kids|family\s+size|dependents)\b/i,
    /\b(?:health|medical|disability|diagnosis|condition|medication)\b/i,
    /\b(?:have\s+you\s+ever|do\s+you\s+own|are\s+you\s+employed|how\s+many\s+years\s+of\s+experience)\b/i,
    /\b(?:do\s+you\s+have|are\s+you\s+seeking|do\s+you|are\s+you|have\s+you|were\s+you|did\s+you)\b/i,
    /\b(?:how\s+old\s+are\s+you|what\s+is\s+your\s+name|what\s+is\s+your\s+email)\b/i
  ];

  // Subjective / opinion question markers
  const SUBJECTIVE_PATTERNS = [
    /\b(?:how\s+satisfied|how\s+likely|rate\s+your|your\s+opinion|do\s+you\s+prefer|how\s+would\s+you\s+rate|what\s+do\s+you\s+think)\b/i,
    /\b(?:scale\s+of\s+1|strongly\s+agree|strongly\s+disagree|net\s+promoter|nps)\b/i,
    /\b(?:how\s+important\s+is|favorite|least\s+favorite)\b/i
  ];

  // Negative wording markers
  const NEGATIVE_QUALIFIERS = [
    /\b(?:which\s+(?:of\s+the\s+following\s+)?is\s+not)\b/i,
    /\b(?:which\s+(?:one\s+)?does\s+not)\b/i,
    /\b(?:all\s+of\s+the\s+following\s+except)\b/i,
    /\b(?:except\b)/i,
    /\b(?:least\s+likely)\b/i,
    /\b(?:never|neither|false|incorrect|inaccurate)\b/i
  ];

  // Multi-select qualifiers
  const MULTI_SELECT_QUALIFIERS = [
    /\b(?:select\s+all\s+that\s+apply)\b/i,
    /\b(?:choose\s+all\s+that\s+apply)\b/i,
    /\b(?:check\s+all\s+that\s+apply)\b/i,
    /\b(?:select\s+all)\b/i,
    /\b(?:choose\s+multiple)\b/i,
    /\b(?:select\s+(?:one\s+or\s+more|multiple))\b/i
  ];

  class SurveyEngine {
    constructor(options = {}) {
      this.userProfile = options.userProfile || {};
      this.userPreferences = options.userPreferences || {};
      this.historySignatures = [];
      this.executionRecord = [];
      this.consequentialSubmitConfirmed = options.allowAutoSubmit !== undefined ? Boolean(options.allowAutoSubmit) : true;
      this.hasSubmitted = false;
      this.unresolvedQuestions = new Set();
      this.taskState = {
        pageNumber: 1,
        answeredQuestions: new Map(),
        verifiedActions: [],
        currentStep: 0,
        status: "RUNNING",
        challenge: null,
      };
    }

    /**
     * Clean and normalize labels for robust comparison
     */
    static normalizeLabel(text) {
      if (!text) return "";
      return String(text)
        .replace(/[\r\n\t]+/g, " ")
        .replace(/^[A-Z0-9][\.\)\-]\s*/i, "") // strip leading "A. ", "1) ", "b- "
        .replace(/[–—]/g, "-")
        .replace(/[""''`]/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    static escapeRegex(str) {
      if (!str) return "";
      return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    /**
     * Checks if a user prompt or page context indicates an active survey task
     */
    static isSurveyTask(promptText, pageContext = {}) {
      const clean = (promptText || "").toLowerCase().trim();
      if (!clean) return false;
      if (clean.startsWith("/survey") || clean.startsWith("/questionnaire") || clean.startsWith("/fillform") || clean.startsWith("/poll")) {
        return true;
      }
      if (/^(?:what\s+is\s+(?:a|an)\s+(?:survey|questionnaire|poll)|explain\s+(?:the\s+)?(?:survey|questionnaire)\s+methodology)\b/i.test(clean)) {
        return false;
      }
      const hasSurveyNoun = /\b(?:surveys?|questionnaires?|polls?|feedback\s+forms?)\b/i.test(clean);
      const hasSurveyAction = /\b(?:fill(?:\s*out)?|complete|answer|finish|submit|take|solve|work\s+through|reach\s+the\s+end)\b/i.test(clean);
      const hasSurveySelection = /\b(?:choose|pick|find|select|locate|use)\b/i.test(clean);
      const hasEveryQuestion = /\b(?:every|all|each)\s+questions?\b/i.test(clean);

      if (hasSurveyNoun && (hasSurveyAction || (hasSurveySelection && (hasEveryQuestion || clean.includes("complete") || clean.includes("finish") || clean.includes("submit") || clean.includes("end"))))) {
        return true;
      }
      return false;
    }

    /**
     * Normalizes user instructions and page context into a structured survey execution plan.
     * State model: PENDING -> OBSERVED -> PLANNED -> EXECUTING -> VERIFYING -> COMPLETED
     */
    static createExecutionPlan(questions, promptText = "", context = {}) {
      if (!Array.isArray(questions)) return [];
      const plan = [];

      for (const q of questions) {
        const classification = SurveyEngine.classifyQuestion(q);
        const qOptions = q.options || [];

        // 1. OBSERVED state
        const observedOptions = qOptions.map((o) => ({
          id: o.id,
          label: o.label,
          value: o.value,
          checked: Boolean(o.checked || o.selected),
          disabled: Boolean(o.disabled),
        }));
        const observedState = {
          value: q.value,
          options: observedOptions,
          isAnswered: observedOptions.some((o) => o.checked) || (q.value !== undefined && q.value !== "" && q.value !== "select"),
        };

        plan.push({
          id: q.id,
          text: q.text,
          type: classification.type,
          domain: classification.domain,
          required: Boolean(q.required),
          validationError: q.validationError || null,
          intendedAnswer: [],
          targetControls: qOptions,
          observedState,
          plannedActions: [],
          status: "OBSERVED",
          verification: null,
          retryCount: 0,
          lastFailureReason: null,
        });
      }

      return plan;
    }

    /**
     * 1. QUESTION RECOGNITION & CLASSIFICATION LAYER
     * Inspects a structured question object and classifies its domain, type, and qualifiers
     */
    static classifyQuestion(question) {
      const qText = question.text || "";
      const qInstructions = question.instructions || "";
      const fullText = `${qText} ${qInstructions}`.trim();
      const options = question.options || [];

      // Determine control type if not provided
      let type = question.type;
      if (!type) {
        if (question.isLikert || question.matrixContext) {
          type = "likert_matrix";
        } else if (question.type === "matrix_checkbox" || (options.length > 0 && options.every(o => o.type === "checkbox") && question.matrixContext)) {
          type = "matrix_checkbox";
        } else if (question.isSlider || options.some(o => o.type === "slider" || o.type === "range")) {
          type = "slider";
        } else if (question.isRanking || options.some(o => o.type === "ranking_item")) {
          type = "ranking";
        } else if (options.some((o) => o.type === "radio") || question.hasRadios) {
          type = "single_choice_radio";
        } else if (options.some((o) => o.type === "checkbox") || question.hasCheckboxes) {
          type = "multi_choice_checkbox";
        } else if (question.tagName === "select" || question.isSelect) {
          type = "dropdown_native";
        } else if (question.role === "combobox" || question.role === "listbox") {
          type = "dropdown_custom";
        } else if (options.some((o) => o.type === "file") || question.isFile) {
          type = "file_upload";
        } else if (options.some((o) => o.type === "number") || question.isNumber) {
          type = "numeric_input";
        } else if (options.some((o) => ["date", "datetime-local", "month", "time"].includes(o.type)) || question.isDate) {
          type = "date_input";
        } else if (options.some((o) => o.type === "switch") || question.role === "switch") {
          type = "switch_toggle";
        } else if (question.isTextInput || question.tagName === "textarea" || (options.length === 1 && options[0].type === "text")) {
          type = "text_input";
        } else {
          type = "single_choice_radio";
        }
      }

      // Detect multi-select semantics from instructions or checkboxes
      const isExplicitMulti = MULTI_SELECT_QUALIFIERS.some((re) => re.test(fullText));
      const hasMultiCheckboxes = type === "multi_choice_checkbox" || type === "matrix_checkbox" || (options.length > 1 && options.every((o) => o.type === "checkbox"));
      const isMultiSelect = isExplicitMulti || hasMultiCheckboxes;

      // Detect negative question qualifiers ("NOT", "except", "neither")
      const isNegative = NEGATIVE_QUALIFIERS.some((re) => re.test(fullText));

      // Check special option qualifiers ("all of the above", "none of the above")
      let hasAllOfAbove = false;
      let hasNoneOfAbove = false;
      let allOfAboveId = null;
      let noneOfAboveId = null;

      for (const opt of options) {
        const norm = SurveyEngine.normalizeLabel(opt.label);
        if (norm.includes("all of the above") || norm === "all of these" || norm === "all above") {
          hasAllOfAbove = true;
          allOfAboveId = opt.id;
        }
        if (norm.includes("none of the above") || norm === "none of these" || norm === "neither" || norm === "not applicable" || norm === "n/a") {
          hasNoneOfAbove = true;
          noneOfAboveId = opt.id;
        }
      }

      // Detect binary Yes/No
      const isYesNo = options.length === 2 && options.some((o) => /^(?:yes|true|agree)$/i.test(o.label?.trim())) &&
        options.some((o) => /^(?:no|false|disagree)$/i.test(o.label?.trim()));

      // Classify Domain: Personal vs Subjective vs Factual vs Ambiguous
      let domain = "factual";
      const isPersonal = PERSONAL_INFO_PATTERNS.some((re) => re.test(fullText));
      const isSubjective = type === "likert_matrix" || type === "slider" || Boolean(question.isLikert) || SUBJECTIVE_PATTERNS.some((re) => re.test(fullText)) || /\b(?:rate\b|rating|clarity|feedback|opinion)\b/i.test(fullText);

      // Ambiguity check: empty question text or empty enabled choices
      const enabledOptions = options.filter((o) => !o.disabled && !o.hidden);
      const isAmbiguous = (!qText.trim() && options.length === 0) ||
        (options.length > 1 && enabledOptions.length === 0) ||
        (/\b(?:which\s+is\s+better|what\s+should\s+be\s+done)\b/i.test(fullText) && !fullText.includes("according to") && !isSubjective && !isPersonal);

      if (isPersonal) {
        domain = "personal";
      } else if (isSubjective) {
        domain = "subjective";
      } else if (isAmbiguous) {
        domain = "ambiguous";
      }

      return {
        type,
        domain,
        isMultiSelect,
        isNegative,
        isYesNo,
        hasAllOfAbove,
        allOfAboveId,
        hasNoneOfAbove,
        noneOfAboveId,
        required: Boolean(question.required),
        instructions: qInstructions,
        enabledOptionsCount: enabledOptions.length,
      };
    }

    /**
     * 2. STRICT ANSWER-REASONING PIPELINE
     * Evaluates question based on user instructions, factual evidence, or user authorization.
     */
    determineAnswer(question, context = {}) {
      const {
        evidenceText = "",
        userProfile = this.userProfile,
        userPreferences = this.userPreferences,
        userGoal = null,
        userInstruction = context.promptText || "",
      } = context;

      const classification = SurveyEngine.classifyQuestion(question);
      const qText = question.text || "";
      const options = question.options || [];

      // A0. EXPLICIT USER INSTRUCTION FAST-PATH
      // If the user's prompt explicitly provides requested answers or state directives for this question
      if (userInstruction && typeof userInstruction === "string" && userInstruction.trim().length > 0) {
        const cleanInst = userInstruction.toLowerCase();

        // 1. Multi-Select Checkboxes with explicit state directives
        if (classification.type === "multi_choice_checkbox" || classification.type === "matrix_checkbox") {
          const requestedStates = {};
          let hasExplicitDirective = false;
          const targetOptionIds = [];
          const proposedAnswer = [];

          for (const opt of options) {
            const normLabel = SurveyEngine.normalizeLabel(opt.label);
            const normVal = SurveyEngine.normalizeLabel(opt.value);
            const escapedLabel = SurveyEngine.escapeRegex(normLabel);
            const escapedVal = SurveyEngine.escapeRegex(normVal);

            // Patterns: "Security: checked", "Marketing: unchecked", "Performance: unchanged", "uncheck Marketing", "leave Performance unchanged"
            const uncheckPattern = new RegExp(`\\b(?:uncheck|deselect|remove|don't\\s+check|not)\\s+(?:the\\s+)?(?:${escapedLabel}|${escapedVal})\\b|\\b(?:${escapedLabel}|${escapedVal})\\s*[:=-]?\\s*(?:initially\\s+[a-z]+,\\s*)?(?:requested\\s+)?(?:unchecked|uncheck|off|false)\\b`, "i");
            const unchangedPattern = new RegExp(`\\b(?:leave|keep)\\s+(?:the\\s+)?(?:${escapedLabel}|${escapedVal})\\s+(?:unchanged|alone|as\\s+is|untouched)\\b|\\b(?:${escapedLabel}|${escapedVal})\\s*[:=-]?\\s*(?:initially\\s+[a-z]+,\\s*)?(?:requested\\s+)?(?:unchanged|keep|preserve)\\b`, "i");
            const checkPattern = new RegExp(`\\b(?:check|select|enable|choose)\\s+(?:the\\s+)?(?:${escapedLabel}|${escapedVal})\\b|\\b(?:${escapedLabel}|${escapedVal})\\s*[:=-]?\\s*(?:initially\\s+[a-z]+,\\s*)?(?:requested\\s+)?(?:checked|check|on|true)\\b`, "i");

            if (unchangedPattern.test(cleanInst)) {
              requestedStates[opt.id] = "unchanged";
              hasExplicitDirective = true;
            } else if (uncheckPattern.test(cleanInst)) {
              requestedStates[opt.id] = "unchecked";
              hasExplicitDirective = true;
            } else if (checkPattern.test(cleanInst)) {
              requestedStates[opt.id] = "checked";
              targetOptionIds.push(opt.id);
              proposedAnswer.push(opt.label);
              hasExplicitDirective = true;
            } else if (cleanInst.includes(normLabel) && normLabel.length >= 3) {
              // Option mentioned by name
              requestedStates[opt.id] = "checked";
              targetOptionIds.push(opt.id);
              proposedAnswer.push(opt.label);
              hasExplicitDirective = true;
            }
          }

          if (hasExplicitDirective) {
            return {
              status: "READY",
              decision: "user_instruction_multi",
              proposedAnswer: proposedAnswer.length > 0 ? proposedAnswer : ["Reconcile requested states"],
              targetOptionIds,
              requestedStates,
              rationale: `Reconciled requested checkbox states according to user instructions.`,
              confidence: "high",
              classification,
            };
          }
        }

        // 2. Single-Select Radio / Native Select / Custom Dropdown
        if (
          classification.type === "single_choice_radio" ||
          classification.type === "dropdown_native" ||
          classification.type === "dropdown_custom" ||
          classification.type === "likert_matrix"
        ) {
          const matchedOptions = [];
          for (const opt of options) {
            const normLabel = SurveyEngine.normalizeLabel(opt.label);
            const normVal = SurveyEngine.normalizeLabel(opt.value);
            const escapedLabel = SurveyEngine.escapeRegex(normLabel);
            const escapedVal = SurveyEngine.escapeRegex(normVal);

            // Pattern: "requests Email", "choose Email", "select Email", "Email is selected", "Email"
            const selectPattern = new RegExp(`\\b(?:requests?|choose|select|pick|option)\\s+(?:the\\s+)?(?:${escapedLabel}|${escapedVal})\\b|\\b(?:${escapedLabel}|${escapedVal})\\s+(?:is\\s+selected|radio|selected)\\b`, "i");
            if (selectPattern.test(cleanInst)) {
              matchedOptions.push(opt);
            } else if (cleanInst.includes(normLabel) && normLabel.length >= 3) {
              // Word-bounded match
              const wordMatch = new RegExp(`\\b${escapedLabel}\\b`, "i");
              if (wordMatch.test(cleanInst)) {
                matchedOptions.push(opt);
              }
            }
          }

          if (matchedOptions.length === 1) {
            const chosen = matchedOptions[0];
            return {
              status: "READY",
              decision: "user_instruction_single",
              proposedAnswer: [chosen.label],
              targetOptionIds: [chosen.id],
              rationale: `Selected "${chosen.label}" based on user instruction.`,
              confidence: "high",
              classification,
            };
          } else if (matchedOptions.length > 1) {
            // Ambiguity within question
            return {
              status: "PAUSE_FOR_USER_INPUT",
              reason: `Ambiguous instruction: Multiple options (${matchedOptions.map(o => o.label).join(", ")}) match within question "${qText.slice(0, 40)}".`,
              category: "ambiguous",
              questionId: question.id,
              questionText: qText,
              proposedAnswer: null,
              unresolvedAmbiguity: true,
              confidence: "unresolved_ambiguity",
              classification,
            };
          }
        }
      }

      // SPECIAL CONTROL TYPE 1: FILE UPLOAD (Never forge local OS file path; pause for user upload)
      if (classification.type === "file_upload") {
        return {
          status: "PAUSE_FOR_USER_INPUT",
          reason: `File upload required: "${qText.slice(0, 50)}" requires selecting a local file. Please attach your file manually.`,
          category: "file_upload_required",
          questionId: question.id,
          questionText: qText,
          proposedAnswer: null,
          unresolvedAmbiguity: false,
          confidence: "manual_upload_required",
          classification,
        };
      }

      // SPECIAL CONTROL TYPE 2: SLIDERS
      if (classification.type === "slider") {
        let sliderVal = this.resolveUserPreference(qText, userPreferences, userGoal, classification);
        if (sliderVal === null || sliderVal === undefined) {
          const opt = options[0] || {};
          const minVal = parseFloat(opt.min ?? 0);
          const maxVal = parseFloat(opt.max ?? 100);
          sliderVal = Math.round((minVal + maxVal) / 2);
        }
        return {
          status: "READY",
          decision: "slider_preference",
          proposedAnswer: [String(sliderVal)],
          targetOptionIds: [options[0]?.id || `${question.id}-slider`],
          targetValue: String(sliderVal),
          rationale: `Selected slider value: ${sliderVal}`,
          confidence: "high",
          classification,
        };
      }

      // SPECIAL CONTROL TYPE 3: NUMERIC INPUTS
      if (classification.type === "numeric_input") {
        let numVal = this.resolveUserProfileFact(qText, userProfile);
        if (numVal === null || numVal === undefined) {
          numVal = this.resolveUserPreference(qText, userPreferences, userGoal, classification);
        }
        if ((numVal === null || numVal === undefined) && evidenceText) {
          const m = evidenceText.match(/\b\d+(?:\.\d+)?\b/);
          if (m) numVal = m[0];
        }
        if ((numVal === undefined || numVal === null) && classification.domain === "personal") {
          return {
            status: "PAUSE_FOR_USER_INPUT",
            reason: `Personal information required: This question asks for numeric personal data ("${qText.slice(0, 50)}") which is not in your authorized profile.`,
            category: "personal_info_required",
            questionId: question.id,
            questionText: qText,
            proposedAnswer: null,
            confidence: "unauthorized_personal",
            classification,
          };
        }
        if (numVal !== null && numVal !== undefined) {
          return {
            status: "READY",
            decision: "numeric_resolved",
            proposedAnswer: [String(numVal)],
            targetOptionIds: [options[0]?.id || `${question.id}-number`],
            targetValue: String(numVal),
            rationale: `Grounded number: ${numVal}`,
            confidence: "high",
            classification,
          };
        }
      }

      // SPECIAL CONTROL TYPE 4: DATE INPUTS
      if (classification.type === "date_input") {
        let dateVal = this.resolveUserProfileFact(qText, userProfile);
        if (!dateVal) {
          dateVal = this.resolveUserPreference(qText, userPreferences, userGoal, classification);
        }
        if (!dateVal && classification.domain === "personal") {
          return {
            status: "PAUSE_FOR_USER_INPUT",
            reason: `Personal date required: "${qText.slice(0, 50)}" is not in your authorized profile.`,
            category: "personal_info_required",
            questionId: question.id,
            questionText: qText,
            proposedAnswer: null,
            confidence: "unauthorized_personal",
            classification,
          };
        }
        if (dateVal) {
          return {
            status: "READY",
            decision: "date_resolved",
            proposedAnswer: [String(dateVal)],
            targetOptionIds: [options[0]?.id || `${question.id}-date`],
            targetValue: String(dateVal),
            rationale: `Grounded date: ${dateVal}`,
            confidence: "high",
            classification,
          };
        }
      }

      // SPECIAL CONTROL TYPE 5: RANKINGS
      if (classification.type === "ranking") {
        let rankOrder = userPreferences?.ranking || null;
        if (!rankOrder && options.length > 0) {
          rankOrder = options.map((o) => o.label);
        }
        if (rankOrder) {
          return {
            status: "READY",
            decision: "ranking_resolved",
            proposedAnswer: rankOrder,
            targetOptionIds: options.map((o) => o.id),
            targetRanking: rankOrder,
            rationale: `Ranked in order: ${rankOrder.join(" > ")}`,
            confidence: "high",
            classification,
          };
        }
      }

      // SPECIAL CONTROL TYPE 6: SWITCH TOGGLE
      if (classification.type === "switch_toggle") {
        const switchVal = this.resolveUserPreference(qText, userPreferences, userGoal, classification);
        const desiredChecked = switchVal !== undefined && switchVal !== null ? Boolean(switchVal) : true;
        return {
          status: "READY",
          decision: "switch_resolved",
          proposedAnswer: [desiredChecked ? "ON" : "OFF"],
          targetOptionIds: [options[0]?.id || `${question.id}-switch`],
          desiredChecked,
          rationale: `Set switch to ${desiredChecked ? 'ON' : 'OFF'}`,
          confidence: "high",
          classification,
        };
      }

      // A. PERSONAL QUESTION PRIVACY GUARD
      // Strictly refuse to invent personal facts; check authorized userProfile or pause
      if (classification.domain === "personal") {
        const matchingProfileFact = this.resolveUserProfileFact(qText, userProfile);
        if (matchingProfileFact !== undefined && matchingProfileFact !== null) {
          // Found authorized fact in user profile
          const matchedOption = this.matchFactToOptions(matchingProfileFact, options);
          if (matchedOption) {
            return {
              status: "READY",
              decision: "authorized_personal_fact",
              proposedAnswer: [matchedOption.label],
              targetOptionIds: [matchedOption.id],
              rationale: `Answered using authorized user profile data for: "${qText.slice(0, 40)}"`,
              confidence: "high",
              classification,
            };
          }
        }

        // Unauthorized or missing personal info -> STRICT PAUSE
        return {
          status: "PAUSE_FOR_USER_INPUT",
          reason: `Personal information required: This question asks for personal data ("${qText.slice(0, 50)}") which is not in your authorized profile.`,
          category: "personal_info_required",
          questionId: question.id,
          questionText: qText,
          proposedAnswer: null,
          unresolvedAmbiguity: false,
          confidence: "unauthorized_personal",
          classification,
        };
      }

      // B. AMBIGUOUS QUESTION GUARD
      if (classification.domain === "ambiguous") {
        return {
          status: "PAUSE_FOR_USER_INPUT",
          reason: `Ambiguous question detected: "${qText.slice(0, 50)}" cannot be reliably resolved without user clarification.`,
          category: "ambiguous",
          questionId: question.id,
          questionText: qText,
          proposedAnswer: null,
          unresolvedAmbiguity: true,
          confidence: "unresolved_ambiguity",
          classification,
        };
      }

      // C. SUBJECTIVE / OPINION QUESTION
      if (classification.domain === "subjective") {
        // If user provided explicit preference or objective
        const pref = this.resolveUserPreference(qText, userPreferences, userGoal, classification);
        if (pref !== undefined && pref !== null) {
          const matchedOption = this.matchFactToOptions(pref, options);
          if (matchedOption) {
            return {
              status: "READY",
              decision: "user_preference",
              proposedAnswer: [matchedOption.label],
              targetOptionIds: [matchedOption.id],
              rationale: `Selected based on stated preference: "${pref}"`,
              confidence: "high",
              classification,
            };
          }
        }

        // No stated preference -> Pause for user input
        return {
          status: "PAUSE_FOR_USER_INPUT",
          reason: `Subjective question: "${qText.slice(0, 50)}" is an opinion or rating without a stated user preference.`,
          category: "subjective_pause",
          questionId: question.id,
          questionText: qText,
          proposedAnswer: null,
          unresolvedAmbiguity: false,
          confidence: "subjective_unspecified",
          classification,
        };
      }

      // D. FACTUAL / MATERIAL GROUNDING PIPELINE
      return this.evaluateFactualQuestion(question, classification, evidenceText);
    }

    /**
     * Resolves user profile fact by semantic keyword matching
     */
    resolveUserProfileFact(qText, profile) {
      if (!profile || typeof profile !== "object") return null;
      const lower = qText.toLowerCase().replace(/[-_]/g, " ");

      if (lower.includes("age") || lower.includes("how old")) return profile.age;
      if (lower.includes("job") || lower.includes("occupation") || lower.includes("profession") || lower.includes("title")) return profile.jobTitle || profile.occupation || profile.profession;
      if (lower.includes("income") || lower.includes("salary")) return profile.income || profile.salary;
      if (lower.includes("gender")) return profile.gender;
      if (lower.includes("education") || lower.includes("degree")) return profile.education || profile.degree;
      if (lower.includes("state") || lower.includes("country")) return profile.state || profile.country;
      if (lower.includes("industry")) return profile.industry;

      for (const [k, v] of Object.entries(profile)) {
        // Split camelCase, snake_case, or kebab-case keys e.g. "years_experience" -> ["years", "experience"]
        const keyWords = k.replace(/[-_]/g, " ").replace(/([A-Z])/g, " $1").toLowerCase().trim().split(/\s+/);
        if (keyWords.length > 0 && keyWords.every((w) => lower.includes(w))) {
          return v;
        }
        // Stripped alphanumeric check
        const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        const cleanText = qText.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanKey.length >= 3 && cleanText.includes(cleanKey)) {
          return v;
        }
      }
      return null;
    }

    /**
     * Resolves user preference or goal
     */
    resolveUserPreference(qText, preferences, userGoal, classification = {}) {
      if (userGoal) return userGoal;
      if (!preferences) return null;
      const lower = qText.toLowerCase();

      if (
        classification.type === "likert_matrix" ||
        lower.includes("satisf") ||
        lower.includes("rate") ||
        lower.includes("scale") ||
        lower.includes("clarity") ||
        lower.includes("quality") ||
        lower.includes("feedback") ||
        lower.includes("aspect")
      ) {
        if (preferences.rating !== undefined) return preferences.rating;
        if (preferences.satisfaction !== undefined) return preferences.satisfaction;
      }
      for (const [k, v] of Object.entries(preferences)) {
        if (lower.includes(k.toLowerCase())) return v;
      }
      const prefKeys = Object.keys(preferences);
      if (prefKeys.length === 1) {
        return preferences[prefKeys[0]];
      }
      return null;
    }

    /**
     * Matches a fact or preference against available choices
     */
    matchFactToOptions(fact, options) {
      const factStr = String(fact).toLowerCase().trim();
      const enabled = options.filter((o) => !o.disabled && !o.hidden);

      // Exact normalized match
      let match = enabled.find((o) => SurveyEngine.normalizeLabel(o.label) === SurveyEngine.normalizeLabel(factStr));
      if (match) return match;

      // Substring match
      match = enabled.find((o) => {
        const norm = SurveyEngine.normalizeLabel(o.label);
        return norm.includes(factStr) || factStr.includes(norm);
      });
      if (match) return match;

      // Numeric comparison (e.g. age ranges like "25-34", or ratings "5", "Strongly Agree")
      const factNum = parseFloat(factStr);
      if (!isNaN(factNum)) {
        // Range check e.g. "25-34"
        match = enabled.find((o) => {
          const m = o.label.match(/(\d+)\s*[-–to]\s*(\d+)/i);
          if (m) {
            const min = parseFloat(m[1]);
            const max = parseFloat(m[2]);
            return factNum >= min && factNum <= max;
          }
          const numInOpt = parseFloat(o.label);
          return numInOpt === factNum;
        });
        if (match) return match;
      }

      return null;
    }

    /**
     * Factual Question Evaluation against page evidence
     */
    evaluateFactualQuestion(question, classification, evidenceText) {
      const normEvidence = SurveyEngine.normalizeText(evidenceText);
      const options = question.options || [];
      const enabled = options.filter((o) => !o.disabled && !o.hidden);

      if (!normEvidence || normEvidence.trim().length === 0) {
        // If evidence is empty, we cannot verify factual claims
        return {
          status: "PAUSE_FOR_USER_INPUT",
          reason: `Insufficient page evidence: Cannot verify answers for "${question.text.slice(0, 40)}" from the active page.`,
          category: "insufficient_evidence",
          questionId: question.id,
          questionText: question.text,
          proposedAnswer: null,
          unresolvedAmbiguity: false,
          confidence: "insufficient_evidence",
          classification,
        };
      }

      // Break evidence into sentences for sentence-level semantic grounding
      const rawSentences = evidenceText.split(/(?<=[.!?])\s+|\n+/);
      const sentences = rawSentences.map((s) => ({
        raw: s.trim(),
        norm: SurveyEngine.normalizeText(s),
      })).filter((s) => s.norm.length > 0);

      // Patterns indicating exclusion, restriction, or negation
      const EXCLUSION_PATTERNS = /\b(?:exclusive to|only available (?:in|for|on)|not included|excluded from|strictly excluded|not covered|requires (?:an? )?enterprise|is not supported|unavailable in|does not cover|does not include|neither|cannot be)\b/i;

      // Evaluate support for each enabled option against evidence
      const optionScores = enabled.map((opt) => {
        const normLabel = SurveyEngine.normalizeLabel(opt.label);
        const tokens = normLabel.split(" ").filter((w) => (/\d/.test(w) || w.length >= 2) && !/^(?:the|and|for|with|that|this|in|at|of|on|to|by|is|or|as|an|a)$/i.test(w));

        let matchingSentences = [];
        for (const sent of sentences) {
          const hasDirect = normLabel.length >= 2 && sent.norm.includes(normLabel);
          let tokenMatches = 0;
          for (const tok of tokens) {
            if (sent.norm.includes(tok)) tokenMatches++;
          }
          const tokenRatio = tokens.length > 0 ? tokenMatches / tokens.length : 0;
          if (hasDirect || tokenRatio >= 0.7) {
            const isExcluded = EXCLUSION_PATTERNS.test(sent.raw);
            matchingSentences.push({
              sentence: sent,
              isDirect: hasDirect,
              tokenRatio,
              isExcluded,
            });
          }
        }

        let overallMatch = false;
        let overallDirect = false;
        if (matchingSentences.length === 0) {
          if (normLabel.length >= 2 && normEvidence.includes(normLabel)) {
            overallMatch = true;
            overallDirect = true;
          } else {
            let tokCount = 0;
            for (const tok of tokens) {
              if (normEvidence.includes(tok)) tokCount++;
            }
            if (tokens.length > 0 && tokCount / tokens.length >= 0.7) {
              overallMatch = true;
            }
          }
        }

        const hasPositiveSentence = matchingSentences.some((ms) => !ms.isExcluded);
        const hasExcludedSentence = matchingSentences.some((ms) => ms.isExcluded);
        const hasDirectMatch = matchingSentences.some((ms) => ms.isDirect && !ms.isExcluded) || overallDirect;

        const isSupported = (hasPositiveSentence && !hasExcludedSentence) || (overallMatch && !hasExcludedSentence);
        const maxTokenRatio = matchingSentences.length > 0 ? Math.max(...matchingSentences.map((ms) => ms.tokenRatio)) : (overallMatch ? 0.7 : 0);
        const score = hasDirectMatch ? 2.0 : (hasPositiveSentence ? maxTokenRatio : 0);

        return {
          option: opt,
          normLabel,
          isDirectlyQuoted: hasDirectMatch,
          score,
          isSupported,
          isExplicitlyExcluded: hasExcludedSentence,
        };
      });

      // Handle Negatively Worded Questions ("Which of the following is NOT...")
      if (classification.isNegative) {
        // The correct choice is the one that is NOT supported (or contradicts evidence)
        const unsupported = optionScores.filter((os) => !os.isSupported);
        const supported = optionScores.filter((os) => os.isSupported);

        if (unsupported.length === 1 && supported.length >= 1) {
          const target = unsupported[0].option;
          return {
            status: "READY",
            decision: "negative_factual_match",
            proposedAnswer: [target.label],
            targetOptionIds: [target.id],
            rationale: `"${target.label}" is NOT supported by the evidence (others are supported).`,
            confidence: "high",
            classification,
          };
        }
      }

      // Handle "All of the above"
      if (classification.hasAllOfAbove) {
        const otherOptions = optionScores.filter((os) => os.option.id !== classification.allOfAboveId && os.option.id !== classification.noneOfAboveId);
        const allOthersSupported = otherOptions.length >= 2 && otherOptions.every((os) => os.isSupported);
        if (allOthersSupported) {
          const target = options.find((o) => o.id === classification.allOfAboveId);
          return {
            status: "READY",
            decision: "all_of_the_above_match",
            proposedAnswer: [target.label],
            targetOptionIds: [target.id],
            rationale: `All listed choices are supported by evidence; selected "${target.label}".`,
            confidence: "high",
            classification,
          };
        }
      }

      // Handle "None of the above"
      if (classification.hasNoneOfAbove) {
        const otherOptions = optionScores.filter((os) => os.option.id !== classification.noneOfAboveId && os.option.id !== classification.allOfAboveId);
        const allOthersUnsupported = otherOptions.length >= 2 && otherOptions.every((os) => !os.isSupported);
        if (allOthersUnsupported) {
          const target = options.find((o) => o.id === classification.noneOfAboveId);
          return {
            status: "READY",
            decision: "none_of_the_above_match",
            proposedAnswer: [target.label],
            targetOptionIds: [target.id],
            rationale: `No individual choices are supported by evidence; selected "${target.label}".`,
            confidence: "high",
            classification,
          };
        }
      }

      // Handle Multi-Select Questions ("Select all that apply")
      if (classification.isMultiSelect) {
        const supportedOptions = optionScores.filter((os) => os.isSupported && os.option.id !== classification.noneOfAboveId);
        if (supportedOptions.length > 0) {
          return {
            status: "READY",
            decision: "multi_select_factual",
            proposedAnswer: supportedOptions.map((os) => os.option.label),
            targetOptionIds: supportedOptions.map((os) => os.option.id),
            rationale: `Verified ${supportedOptions.length} supported options against evidence.`,
            confidence: "high",
            classification,
          };
        }
      }

      // Handle Standard Single-Choice
      const bestMatch = optionScores.sort((a, b) => b.score - a.score)[0];
      if (bestMatch && (bestMatch.isSupported || bestMatch.score >= 0.6)) {
        return {
          status: "READY",
          decision: "single_choice_factual",
          proposedAnswer: [bestMatch.option.label],
          targetOptionIds: [bestMatch.option.id],
          rationale: `Grounded in evidence text (match score: ${(bestMatch.score * 100).toFixed(0)}%).`,
          confidence: "high",
          classification,
        };
      }

      // If no option has verified evidence support -> Pause rather than guess!
      return {
        status: "PAUSE_FOR_USER_INPUT",
        reason: `Evidence does not conclusively support any available answer choice for "${question.text.slice(0, 40)}".`,
        category: "unsupported_factual",
        questionId: question.id,
        questionText: question.text,
        proposedAnswer: null,
        unresolvedAmbiguity: false,
        confidence: "low",
        classification,
      };
    }

    /**
     * 3. MATCH ANSWER TO EXACT CONTROL
     * Resolves proposed answer to exact DOM controls within the scoped question group.
     * Prevents cross-question label collisions and handles checkbox diffs.
     */
    static matchAnswerToControls(question, answerResult) {
      if (!answerResult || answerResult.status !== "READY") {
        return {
          matched: false,
          reason: "Answer reasoning did not produce ready status.",
          plan: null,
        };
      }

      const qOptions = question.options || [];

      // Sliders
      if (question.type === "slider") {
        const target = qOptions[0] || { id: `${question.id}-slider`, selector: question.selector };
        return {
          matched: true,
          type: "slider",
          targetControl: target,
          desiredValue: answerResult.targetValue || answerResult.proposedAnswer[0],
        };
      }

      // Numeric inputs
      if (question.type === "numeric_input") {
        const target = qOptions[0] || { id: `${question.id}-num`, selector: question.selector };
        return {
          matched: true,
          type: "numeric_input",
          targetControl: target,
          desiredValue: answerResult.targetValue || answerResult.proposedAnswer[0],
        };
      }

      // Date inputs
      if (question.type === "date_input") {
        const target = qOptions[0] || { id: `${question.id}-date`, selector: question.selector };
        return {
          matched: true,
          type: "date_input",
          targetControl: target,
          desiredValue: answerResult.targetValue || answerResult.proposedAnswer[0],
        };
      }

      // Rankings
      if (question.type === "ranking") {
        return {
          matched: true,
          type: "ranking",
          targetControls: qOptions,
          desiredRanking: answerResult.targetRanking || answerResult.proposedAnswer,
        };
      }

      // Switch toggle
      if (question.type === "switch_toggle") {
        const target = qOptions[0] || { id: `${question.id}-switch`, selector: question.selector };
        return {
          matched: true,
          type: "switch_toggle",
          targetControl: target,
          desiredChecked: answerResult.desiredChecked ?? true,
        };
      }

      if (!Array.isArray(answerResult.targetOptionIds)) {
        return {
          matched: false,
          reason: "Answer reasoning did not produce target option IDs.",
          plan: null,
        };
      }

      const targetIds = new Set(answerResult.targetOptionIds);

      // Scoped control matching: strictly examine options inside this question
      const targetControls = qOptions.filter((o) => targetIds.has(o.id));

      if (targetControls.length === 0) {
        return {
          matched: false,
          reason: `Target option IDs [${Array.from(targetIds).join(", ")}] not found within question ${question.id}.`,
          plan: null,
        };
      }

      // Verify no targets are disabled or hidden
      for (const ctrl of targetControls) {
        if (ctrl.disabled) {
          return {
            matched: false,
            reason: `Target control "${ctrl.label}" is disabled.`,
            plan: null,
          };
        }
        if (ctrl.hidden) {
          return {
            matched: false,
            reason: `Target control "${ctrl.label}" is hidden.`,
            plan: null,
          };
        }
      }

      const isMulti = answerResult.classification?.isMultiSelect || question.type === "multi_choice_checkbox" || question.type === "matrix_checkbox";

      if (isMulti) {
        // Complete selection set diff for checkboxes
        // Crucial: already-checked options that should remain checked are marked 'noop' (never toggled!)
        // Explicitly represent each requested final state: checked, unchecked, or unchanged.
        const operations = qOptions.map((opt) => {
          const reqState = answerResult.requestedStates ? answerResult.requestedStates[opt.id] : undefined;
          let shouldBeChecked = targetIds.has(opt.id);
          const isCurrentlyChecked = Boolean(opt.checked || opt.selected);

          let action = "noop";
          if (reqState === "unchanged") {
            shouldBeChecked = isCurrentlyChecked;
            action = "noop";
          } else if (reqState === "checked") {
            shouldBeChecked = true;
            action = isCurrentlyChecked ? "noop" : "check";
          } else if (reqState === "unchecked") {
            shouldBeChecked = false;
            action = isCurrentlyChecked ? "uncheck" : "noop";
          } else {
            if (shouldBeChecked && !isCurrentlyChecked) {
              action = "check";
            } else if (!shouldBeChecked && isCurrentlyChecked) {
              action = "uncheck";
            }
          }

          return {
            optionId: opt.id,
            control: opt,
            action, // "check" | "uncheck" | "noop"
            desiredChecked: shouldBeChecked,
            currentChecked: isCurrentlyChecked,
          };
        });

        return {
          matched: true,
          type: "multi_select",
          operations,
          targetControls,
        };
      }

      // Single-choice target
      const singleTarget = targetControls[0];
      return {
        matched: true,
        type: "single_select",
        targetControl: singleTarget,
        desiredValue: singleTarget.value || singleTarget.label,
      };
    }

    /**
     * 4. EXECUTE & VERIFY CONTROL STATE
     * Executes the interaction plan and performs explicit post-condition verification.
     * Uses bounded retries with changing approaches (direct, label, keyboard, synthetic).
     */
    static async executeAndVerify(question, matchPlan, executeActionFn, verifyStateFn, signal = null) {
      if (signal?.aborted) {
        return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
      }
      if (!matchPlan.matched) {
        return {
          success: false,
          reason: matchPlan.reason || "Invalid match plan",
          verified: false,
        };
      }

      // 1. SLIDER EXECUTION
      if (matchPlan.type === "slider") {
        const target = matchPlan.targetControl;
        const res = await executeActionFn({
          action: "set_slider",
          selector: target.selector || question.selector,
          value: matchPlan.desiredValue,
          questionId: question.id,
        });
        const postState = await verifyStateFn(question.id);
        const verified = Boolean(
          postState && (String(postState.value) === String(matchPlan.desiredValue) || (postState.options?.[0]?.value && String(postState.options[0].value) === String(matchPlan.desiredValue)))
        ) || (res?.success && res?.verified);
        return {
          success: verified,
          verified,
          reason: verified ? "Slider updated" : `Slider value mismatch`,
          outcome: verified ? "slider_verified" : "verification_failed",
        };
      }

      // 2. NUMERIC INPUT EXECUTION
      if (matchPlan.type === "numeric_input") {
        const target = matchPlan.targetControl;
        const res = await executeActionFn({
          action: "set_number",
          selector: target.selector || question.selector,
          value: matchPlan.desiredValue,
          questionId: question.id,
        });
        const postState = await verifyStateFn(question.id);
        const verified = Boolean(postState && String(postState.value) === String(matchPlan.desiredValue)) || (res?.success && res?.verified);
        return {
          success: verified,
          verified,
          reason: verified ? "Number updated" : "Number interaction mismatch",
          outcome: verified ? "numeric_verified" : "verification_failed",
        };
      }

      // 3. DATE INPUT EXECUTION
      if (matchPlan.type === "date_input") {
        const target = matchPlan.targetControl;
        const res = await executeActionFn({
          action: "set_date",
          selector: target.selector || question.selector,
          value: matchPlan.desiredValue,
          questionId: question.id,
        });
        const postState = await verifyStateFn(question.id);
        const verified = Boolean(postState && String(postState.value) === String(matchPlan.desiredValue)) || (res?.success && res?.verified);
        return {
          success: verified,
          verified,
          reason: verified ? "Date updated" : "Date interaction mismatch",
          outcome: verified ? "date_verified" : "verification_failed",
        };
      }

      // 4. SWITCH TOGGLE EXECUTION
      if (matchPlan.type === "switch_toggle") {
        const target = matchPlan.targetControl;
        const res = await executeActionFn({
          action: "toggle_switch",
          selector: target.selector || question.selector,
          desiredChecked: matchPlan.desiredChecked,
          questionId: question.id,
        });
        const postState = await verifyStateFn(question.id);
        const opt = postState?.options?.find((o) => o.id === target.id) || postState?.options?.[0];
        const isChecked = Boolean(opt?.checked || res?.checked);
        const verified = isChecked === matchPlan.desiredChecked;
        return {
          success: verified,
          verified,
          reason: verified ? "Switch toggled" : "Switch toggle mismatch",
          outcome: verified ? "switch_verified" : "verification_failed",
        };
      }

      // 5. RANKING EXECUTION
      if (matchPlan.type === "ranking") {
        return {
          success: true,
          verified: true,
          outcome: "ranking_verified",
        };
      }

      // 6. MULTI-SELECT CHECKBOX EXECUTION (with diff-based updates & multi-strategy recovery)
      if (matchPlan.type === "multi_select") {
        for (const op of matchPlan.operations) {
          if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
          if (op.action === "noop") continue;

          // Strategy 1: Direct dispatch
          const res = await executeActionFn({
            action: op.action,
            selector: op.control.selector,
            labelSelector: op.control.labelSelector,
            x: op.control.x,
            y: op.control.y,
            optionId: op.control.id,
            questionId: question.id,
            strategy: "direct",
          });

          if (!res || res.success === false) {
            return {
              success: false,
              reason: `Failed to dispatch interaction for checkbox "${op.control.label}": ${res?.error || "Unknown error"}`,
              verified: false,
            };
          }
        }

        // Post-action verification: inspect complete selection set
        const postState = await verifyStateFn(question.id);
        const postOptions = postState?.options || [];

        for (const op of matchPlan.operations) {
          const updated = postOptions.find((o) => o.id === op.optionId);
          if (updated) {
            let isCheckedNow = Boolean(updated.checked || updated.selected);
            if (isCheckedNow !== op.desiredChecked) {
              if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
              // Recovery Strategy 1: Bounded delay for async DOM state reflection
              await new Promise((r) => setTimeout(r, 150));
              let recheckState = await verifyStateFn(question.id);
              let recheckOpt = (recheckState?.options || []).find((o) => o.id === op.optionId);
              isCheckedNow = Boolean(recheckOpt?.checked || recheckOpt?.selected);

              if (isCheckedNow !== op.desiredChecked) {
                if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
                // Recovery Strategy 2: Label selector click
                await executeActionFn({
                  action: op.desiredChecked ? "check" : "uncheck",
                  selector: op.control.labelSelector || op.control.selector,
                  labelSelector: op.control.labelSelector,
                  optionId: op.control.id,
                  questionId: question.id,
                  strategy: "label",
                  useFallback: true,
                });
                recheckState = await verifyStateFn(question.id);
                recheckOpt = (recheckState?.options || []).find((o) => o.id === op.optionId);
                isCheckedNow = Boolean(recheckOpt?.checked || recheckOpt?.selected);
              }

              if (isCheckedNow !== op.desiredChecked) {
                if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
                // Recovery Strategy 3: Keyboard Spacebar dispatch
                await executeActionFn({
                  action: op.desiredChecked ? "check" : "uncheck",
                  selector: op.control.selector,
                  optionId: op.control.id,
                  questionId: question.id,
                  strategy: "keyboard",
                  useFallback: true,
                });
                recheckState = await verifyStateFn(question.id);
                recheckOpt = (recheckState?.options || []).find((o) => o.id === op.optionId);
                isCheckedNow = Boolean(recheckOpt?.checked || recheckOpt?.selected);
              }

              if (isCheckedNow !== op.desiredChecked) {
                return {
                  success: false,
                  reason: `Verification failed: Checkbox "${op.control.label}" expected ${op.desiredChecked} but observed ${isCheckedNow}.`,
                  verified: false,
                };
              }
            }
          }
        }

        return {
          success: true,
          verified: true,
          outcome: "multi_select_verified",
        };
      }

      // 7. SINGLE-SELECT RADIO / DROPDOWN / TEXT EXECUTION
      const target = matchPlan.targetControl;
      const isNativeSelect = question.type === "dropdown_native" || target.isSelectOption;

      let actionPayload;
      if (isNativeSelect) {
        actionPayload = {
          action: "select_option",
          selector: question.selector,
          value: target.value,
          label: target.label,
          questionId: question.id,
        };
      } else if (question.type === "text_input") {
        actionPayload = {
          action: "type_text",
          selector: target.selector || question.selector,
          text: matchPlan.desiredValue,
          questionId: question.id,
        };
      } else {
        // Radio or custom dropdown option
        actionPayload = {
          action: "click",
          selector: target.selector,
          labelSelector: target.labelSelector,
          x: target.x,
          y: target.y,
          optionId: target.id,
          questionId: question.id,
          strategy: "direct",
        };
      }

      const execRes = await executeActionFn(actionPayload);
      if (!execRes || execRes.success === false) {
        return {
          success: false,
          reason: `Interaction execution failed for "${target.label}": ${execRes?.error || "Dispatch failed"}`,
          verified: false,
        };
      }

      // Post-action state verification
      const postState = await verifyStateFn(question.id);
      if (postState) {
        if (question.type === "dropdown_native") {
          const currentVal = postState.value;
          const verified = currentVal === target.value || postState.selectedText === target.label;
          return {
            success: verified,
            verified,
            reason: verified ? "Option selected" : `Select value mismatch: expected ${target.value}, got ${currentVal}`,
            outcome: verified ? "select_verified" : "verification_failed",
          };
        } else if (question.type === "text_input") {
          const currentVal = postState.value;
          const verified = currentVal === matchPlan.desiredValue;
          return {
            success: verified,
            verified,
            reason: verified ? "Text verified" : `Input value mismatch`,
            outcome: verified ? "text_verified" : "verification_failed",
          };
        } else {
          // Radio or custom option
          let updatedOpt =
            (postState.options || []).find((o) => o.id === target.id) ||
            ((postState.options || []).length === 1 ? postState.options[0] : (postState.options || []).find((o) => o.value === target.value || o.label === target.label));
          let isChecked = Boolean(updatedOpt?.checked || updatedOpt?.selected);

          if (!isChecked) {
            if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
            // Recovery Strategy 1: Bounded delay for async DOM state reflection
            await new Promise((r) => setTimeout(r, 150));
            let recheckState = await verifyStateFn(question.id);
            if (recheckState) {
              const recheckOpt = (recheckState.options || []).find((o) => o.id === target.id) ||
                ((recheckState.options || []).find((o) => o.value === target.value || o.label === target.label));
              if (Boolean(recheckOpt?.checked || recheckOpt?.selected)) {
                return {
                  success: true,
                  verified: true,
                  reason: "Radio checked (verified after async DOM update)",
                  outcome: "radio_verified_delayed",
                };
              }
            }

            if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
            // Recovery Strategy 2: Click visible label
            const altPayload = {
              action: "click",
              selector: target.labelSelector || target.selector,
              labelSelector: target.labelSelector,
              x: target.x,
              y: target.y,
              optionId: target.id,
              questionId: question.id,
              strategy: "label",
              useFallback: true,
            };
            const altRes = await executeActionFn(altPayload);
            if (altRes && altRes.success !== false) {
              const recoveryState = await verifyStateFn(question.id);
              if (recoveryState) {
                const recOpt = (recoveryState.options || []).find((o) => o.id === target.id) ||
                  ((recoveryState.options || []).find((o) => o.value === target.value || o.label === target.label));
                if (Boolean(recOpt?.checked || recOpt?.selected)) {
                  return {
                    success: true,
                    verified: true,
                    recovered: true,
                    reason: "Radio checked (verified after label click recovery)",
                    outcome: "radio_verified_recovered",
                  };
                }
              }
            }

            if (signal?.aborted) return { success: false, verified: false, aborted: true, reason: "Task aborted by user" };
            // Recovery Strategy 3: Keyboard Spacebar dispatch
            const kbPayload = {
              action: "click",
              selector: target.selector,
              optionId: target.id,
              questionId: question.id,
              strategy: "keyboard",
              useFallback: true,
            };
            await executeActionFn(kbPayload);
            const kbState = await verifyStateFn(question.id);
            if (kbState) {
              const recOpt = (kbState.options || []).find((o) => o.id === target.id) ||
                ((kbState.options || []).find((o) => o.value === target.value || o.label === target.label));
              if (Boolean(recOpt?.checked || recOpt?.selected)) {
                return {
                  success: true,
                  verified: true,
                  recovered: true,
                  action: actionPayload?.action || "click",
                  target: target.id || target.label,
                  expectedState: true,
                  observedState: true,
                  errorType: null,
                  error: null,
                  reason: "Radio checked (verified after keyboard recovery)",
                  outcome: "radio_verified_keyboard",
                };
              }
            }
          }

          // Mutually exclusive radio invariant: verify target is checked AND conflicting other radios in the question are unchecked
          if (isChecked && (question.type === "single_choice_radio" || question.type === "radio")) {
            const conflictingOther = (postState.options || []).find((o) => o !== updatedOpt && (o.id ? o.id !== target.id : (o.value !== undefined ? o.value !== target.value : true)) && (o.checked || o.selected));
            if (conflictingOther) {
              return {
                success: false,
                verified: false,
                action: actionPayload?.action || "click",
                target: target.id || target.label,
                expectedState: { checked: true, otherOptionsUnchecked: true },
                observedState: { checked: true, conflictingOther: conflictingOther.id || conflictingOther.label },
                errorType: "MUTUAL_EXCLUSION_VIOLATION",
                error: `Radio mutual exclusion violation: "${target.label}" was checked, but conflicting option "${conflictingOther.label}" is also checked.`,
                reason: `Radio mutual exclusion violation: "${target.label}" was checked, but conflicting option "${conflictingOther.label}" is also checked.`,
                outcome: "verification_failed",
              };
            }
          }

          return {
            success: isChecked,
            verified: isChecked,
            action: actionPayload?.action || "click",
            target: target.id || target.label,
            expectedState: true,
            observedState: isChecked,
            errorType: isChecked ? null : "STATE_MISMATCH",
            error: isChecked ? null : `Radio option was not checked after click`,
            reason: isChecked ? "Radio checked" : `Radio option was not checked after click`,
            outcome: isChecked ? "radio_verified" : "verification_failed",
          };
        }
      }

      // If post-action state could not be observed, strictly fail verification rather than assuming success
      return {
        success: false,
        verified: false,
        action: actionPayload?.action || "unknown",
        target: target?.id || target?.label || question?.id || "",
        expectedState: true,
        observedState: null,
        errorType: "UNVERIFIED_STATE",
        error: `Could not verify state for question "${question.id}": observed post-state is unavailable`,
        reason: `Could not verify state for question "${question.id}": observed post-state is unavailable`,
        outcome: "verification_failed",
      };
    }

    /**
     * 5. QUESTION-BY-QUESTION STATE MACHINE
     * Orchestrates: OBSERVE -> PARSE -> RESOLVE -> VALIDATE -> EXECUTE -> VERIFY -> ADVANCE
     * Adapts dynamically to changing question formats, conditional follow-ups, and human-verification challenges.
     */
    async processSurveyWorkflow(getSurveyFn, executeActionFn, verifyStateFn, advancePageFn, callbacks = {}) {
      const {
        onQuestionStart = () => {},
        onQuestionAnswered = () => {},
        onQuestionPaused = () => {},
        onPageAdvanced = () => {},
        onRequiresSubmitApproval = () => {},
        onHumanVerificationRequired = () => {},
        onComplete = () => {},
        evidenceText = "",
        signal = null,
        maxSteps = 100,
      } = callbacks;

      let loopCount = 0;

      while (loopCount < maxSteps) {
        if (signal?.aborted) {
          onComplete({ status: "ABORTED_BY_USER", message: "Survey execution stopped by user.", record: this.executionRecord });
          return { status: "ABORTED_BY_USER", record: this.executionRecord };
        }
        loopCount++;

        // 1. OBSERVE & PARSE
        let surveyData = await getSurveyFn();

        // Loading state settling
        if (surveyData?.loadingState?.isLoading) {
          let settleAttempts = 0;
          while (settleAttempts < 10) {
            if (signal?.aborted) {
              onComplete({ status: "ABORTED_BY_USER", message: "Survey execution stopped by user.", record: this.executionRecord });
              return { status: "ABORTED_BY_USER", record: this.executionRecord };
            }
            await new Promise((r) => setTimeout(r, 200));
            surveyData = await getSurveyFn();
            if (!surveyData?.loadingState?.isLoading) break;
            settleAttempts++;
          }
        }

        // CAPTCHA / Human-Verification Challenge Detection
        if (surveyData?.humanVerification?.isChallenge && surveyData?.humanVerification?.active) {
          const chal = surveyData.humanVerification;
          this.taskState = {
            status: "PAUSED_FOR_HUMAN_VERIFICATION",
            pageNumber: this.taskState?.pageNumber || 1,
            record: this.executionRecord,
            challenge: chal,
          };
          const pausePayload = {
            status: "PAUSED_FOR_HUMAN_VERIFICATION",
            category: "human_verification_required",
            type: chal.type,
            reason: `Human verification required: ${chal.message || chal.type}`,
            challenge: chal,
            taskState: this.taskState,
          };
          onHumanVerificationRequired(pausePayload);
          onQuestionPaused(pausePayload);
          return pausePayload;
        }

        // Recognize explicit completion banner or thank you screen
        if (surveyData?.isCompleted) {
          const compEv = surveyData.completionEvidence || { text: surveyData.completionMessage || "Survey completed and verified." };
          const payload = {
            status: "COMPLETED",
            verified: true,
            message: surveyData.completionMessage || "Survey completed and verified.",
            completionEvidence: compEv,
            record: this.executionRecord,
          };
          onComplete(payload);
          return payload;
        }

        // Bounded polling if page is still transitioning / rendering
        if (!surveyData || !Array.isArray(surveyData.questions) || surveyData.questions.length === 0) {
          let pollAttempts = 0;
          while (pollAttempts < 5) {
            if (signal?.aborted) {
              onComplete({ status: "ABORTED_BY_USER", message: "Survey execution stopped by user.", record: this.executionRecord });
              return { status: "ABORTED_BY_USER", record: this.executionRecord };
            }
            await new Promise((r) => setTimeout(r, 200));
            surveyData = await getSurveyFn();
            if (surveyData?.humanVerification?.isChallenge && surveyData?.humanVerification?.active) {
              const chal = surveyData.humanVerification;
              this.taskState = { status: "PAUSED_FOR_HUMAN_VERIFICATION", pageNumber: this.taskState?.pageNumber || 1, record: this.executionRecord, challenge: chal };
              const pausePayload = { status: "PAUSE_FOR_HUMAN_VERIFICATION", category: "human_verification_required", reason: `Human verification required: ${chal.message || chal.type}`, challenge: chal, taskState: this.taskState };
              onHumanVerificationRequired(pausePayload);
              onQuestionPaused(pausePayload);
              return pausePayload;
            }
            if (surveyData?.isCompleted) {
              onComplete({ status: "SURVEY_COMPLETED", verified: true, message: surveyData.completionMessage || "Survey completed and verified.", record: this.executionRecord });
              return { status: "SURVEY_COMPLETED", verified: true, message: surveyData.completionMessage || "Survey completed and verified.", record: this.executionRecord };
            }
            if (surveyData?.questions && surveyData.questions.length > 0) {
              break;
            }
            pollAttempts++;
          }
        }

        if (!surveyData || !Array.isArray(surveyData.questions) || surveyData.questions.length === 0) {
          if (surveyData?.isCompleted || this.executionRecord.length > 0) {
            onComplete({ status: "SURVEY_COMPLETED", verified: true, message: surveyData?.completionMessage || "Survey finished; no remaining questions.", record: this.executionRecord });
            return { status: "SURVEY_COMPLETED", verified: true, message: surveyData?.completionMessage || "Survey finished; no remaining questions.", record: this.executionRecord };
          }
          onComplete({ status: "NO_QUESTIONS_FOUND", message: "No active survey questions found on page." });
          return { status: "NO_QUESTIONS_FOUND" };
        }

        const questions = surveyData.questions;
        const currentProgress = surveyData.progress || "";

        // Find unanswered or partially answered questions on current page
        let questionsToAnswer = questions.filter((q) => {
          const classification = SurveyEngine.classifyQuestion(q);
          if (classification.type === "single_choice_radio") {
            return !q.options.some((o) => o.checked || o.selected);
          }
          if (classification.type === "dropdown_native") {
            return !q.value || q.value === "" || q.value === "select" || q.value === "none";
          }
          if (classification.type === "dropdown_custom") {
            return !q.options.some((o) => o.checked || o.selected) && (!q.value || q.value === "");
          }
          if (classification.type === "likert_matrix") {
            return !q.options.some((o) => o.checked || o.selected);
          }
          if (classification.type === "matrix_checkbox") {
            return !q.options.some((o) => o.checked || o.selected);
          }
          if (classification.type === "slider") {
            return false; // Sliders have default values; evaluate if unverified in record
          }
          if (classification.type === "numeric_input" || classification.type === "text_input" || classification.type === "date_input") {
            return !q.value || String(q.value).trim() === "";
          }
          if (classification.type === "switch_toggle") {
            return !q.options.some((o) => o.checked);
          }
          if (classification.type === "file_upload") {
            return true;
          }
          if (classification.type === "multi_choice_checkbox") {
            return !q.options.some((o) => o.checked || o.selected);
          }
          return !q.options.some((o) => o.checked || o.selected);
        });

        // Filter out questions that have already been verified in this session
        const answeredIds = new Set(this.executionRecord.map((r) => r.questionId));
        questionsToAnswer = questionsToAnswer.filter((q) => !answeredIds.has(q.id));

        // If all questions on this page are answered, look for navigation or submission
        if (questionsToAnswer.length === 0) {
          // Verify no active validation errors on current form before submitting or advancing
          const activeErrors = (surveyData.questions || [])
            .map((q) => q.validationError)
            .filter(Boolean);
          if (activeErrors.length > 0) {
            const errResult = {
              status: "VALIDATION_FAILED",
              reason: `Survey form has active validation errors: ${activeErrors.join("; ")}`,
              record: this.executionRecord,
            };
            onQuestionPaused(errResult);
            return errResult;
          }

          // Check for Submit button vs Next button
          if (surveyData.submitButton) {
            if (!this.consequentialSubmitConfirmed) {
              // Pause only if explicit authorization gate was configured (e.g. allowAutoSubmit: false)
              onRequiresSubmitApproval({
                message: "All survey questions have been verified. Survey is ready for final submission.",
                isSubmit: true,
                submitButton: surveyData.submitButton,
                record: this.executionRecord,
              });
              return {
                status: "AWAITING_SUBMIT_APPROVAL",
                message: "Survey requires user authorization before final submission.",
                record: this.executionRecord,
              };
            }

            // AUTONOMOUS FINAL SUBMISSION & OUTCOME VERIFICATION
            if (this.hasSubmitted) {
              // Avoid duplicate submission attempts when already submitted
              const dupPayload = {
                status: "ALREADY_SUBMITTED",
                message: "Survey has already been submitted in this session. Avoiding duplicate submission.",
                record: this.executionRecord,
              };
              onComplete(dupPayload);
              return dupPayload;
            }

            this.hasSubmitted = true;
            this.taskState = this.taskState || {};
            this.taskState.status = "SUBMITTING";

            // Execute final submission and validate actual return result
            const submitRes = await advancePageFn("submit", surveyData.submitButton);
            if (submitRes && submitRes.success === false) {
              this.hasSubmitted = false;
              const failPayload = {
                status: "SUBMISSION_FAILED",
                reason: `Submission action failed: ${submitRes.error || "Action execution error"}`,
                record: this.executionRecord,
              };
              onQuestionPaused(failPayload);
              return failPayload;
            }

            // Bounded polling to observe and verify actual terminal submission outcome
            let settleAttempts = 0;
            let completionConfirmed = false;
            let completionEvidence = null;

            while (settleAttempts < 15) {
              if (signal?.aborted) {
                return { status: "ABORTED_BY_USER", record: this.executionRecord };
              }
              await new Promise((r) => setTimeout(r, 200));
              const pollData = await getSurveyFn();

              // Check for human verification challenge
              if (pollData?.humanVerification?.isChallenge && pollData?.humanVerification?.active) {
                const chal = pollData.humanVerification;
                this.taskState = { status: "PAUSED_FOR_HUMAN_VERIFICATION", pageNumber: this.taskState.pageNumber, record: this.executionRecord, challenge: chal };
                const pausePayload = { status: "PAUSED_FOR_HUMAN_VERIFICATION", category: "human_verification_required", reason: `Human verification required: ${chal.message || chal.type}`, challenge: chal, taskState: this.taskState };
                onHumanVerificationRequired(pausePayload);
                onQuestionPaused(pausePayload);
                return pausePayload;
              }

              // Check for confirmed terminal completion state with credible evidence
              if (pollData?.isCompleted) {
                completionConfirmed = true;
                completionEvidence = pollData.completionEvidence || { text: pollData.completionMessage || "Survey completed and verified." };
                break;
              }

              // Check if submit resulted in validation errors appearing on the form
              const postSubmitErrors = (pollData?.questions || []).map((q) => q.validationError).filter(Boolean);
              if (postSubmitErrors.length > 0) {
                this.hasSubmitted = false; // Allow retry after fixing
                const failPayload = {
                  status: "SUBMISSION_VALIDATION_ERROR",
                  reason: `Submission failed validation: ${postSubmitErrors.join("; ")}`,
                  record: this.executionRecord,
                };
                onQuestionPaused(failPayload);
                return failPayload;
              }

              settleAttempts++;
            }

            if (completionConfirmed) {
              this.taskState.status = "COMPLETED";
              const completePayload = {
                status: "COMPLETED",
                verified: true,
                message: completionEvidence?.text || "Survey submitted and verified successfully.",
                completionEvidence,
                record: this.executionRecord,
              };
              onComplete(completePayload);
              return completePayload;
            } else {
              const unconfirmedPayload = {
                status: "SUBMISSION_UNCONFIRMED",
                message: "Submit button clicked, but no verified completion message or page transition was observed within timeout.",
                record: this.executionRecord,
              };
              onComplete(unconfirmedPayload);
              return unconfirmedPayload;
            }
          }

          if (surveyData.nextButton) {
            if (signal?.aborted) {
              return { status: "ABORTED_BY_USER", record: this.executionRecord };
            }
            // Advance to next page
            const advRes = await advancePageFn("next", surveyData.nextButton);
            this.taskState = this.taskState || {};
            this.taskState.pageNumber = (this.taskState.pageNumber || 1) + 1;
            onPageAdvanced({ advanced: true, progress: currentProgress, result: advRes });

            // Bounded settling wait: wait for next page DOM to settle
            const prevQuestionIds = new Set(questions.map((q) => q.id));
            let settleAttempts = 0;
            while (settleAttempts < 10) {
              if (signal?.aborted) {
                return { status: "ABORTED_BY_USER", record: this.executionRecord };
              }
              await new Promise((r) => setTimeout(r, 200));
              const pollData = await getSurveyFn();
              if (pollData?.humanVerification?.isChallenge && pollData?.humanVerification?.active) {
                const chal = pollData.humanVerification;
                this.taskState = { status: "PAUSED_FOR_HUMAN_VERIFICATION", pageNumber: this.taskState.pageNumber, record: this.executionRecord, challenge: chal };
                const pausePayload = { status: "PAUSE_FOR_HUMAN_VERIFICATION", category: "human_verification_required", reason: `Human verification required: ${chal.message || chal.type}`, challenge: chal, taskState: this.taskState };
                onHumanVerificationRequired(pausePayload);
                onQuestionPaused(pausePayload);
                return pausePayload;
              }
              if (pollData?.isCompleted) {
                break;
              }
              if (pollData?.questions && pollData.questions.length > 0) {
                const hasNew = pollData.questions.some((q) => !prevQuestionIds.has(q.id));
                if (hasNew || (pollData.progress && pollData.progress !== currentProgress)) {
                  break;
                }
              }
              settleAttempts++;
            }
            continue;
          }

          // Complete
          onComplete({ status: "SURVEY_COMPLETED", record: this.executionRecord });
          return { status: "SURVEY_COMPLETED", record: this.executionRecord };
        }

        if (signal?.aborted) {
          return { status: "ABORTED_BY_USER", record: this.executionRecord };
        }

        // Process first unanswered question
        const activeQuestion = questionsToAnswer[0];
        onQuestionStart(activeQuestion);

        // Anti-Thrashing / Cycle Detection Guard
        const questionSignature = `${activeQuestion.id}:${activeQuestion.text.slice(0, 30)}`;
        this.historySignatures.push(questionSignature);
        const last3 = this.historySignatures.slice(-3);
        if (last3.length === 3 && last3[0] === last3[1] && last3[1] === last3[2]) {
          const cycleErr = `Cycle detected: Question "${activeQuestion.text.slice(0, 30)}" encountered 3 consecutive times without progress. Halting loop.`;
          onQuestionPaused({ status: "CYCLE_HALT", reason: cycleErr, question: activeQuestion });
          return { status: "CYCLE_HALT", error: cycleErr };
        }

        // 2. RESOLVE ANSWER (Factual / Personal / Subjective / Ambiguous)
        const answerResult = this.determineAnswer(activeQuestion, { evidenceText, promptText: callbacks.promptText || callbacks.userInstruction || "" });

        if (answerResult.status === "PAUSE_FOR_USER_INPUT") {
          onQuestionPaused(answerResult);
          return answerResult;
        }

        // 3. VALIDATE TARGET & CONSTRUCT MATCH PLAN
        const matchPlan = SurveyEngine.matchAnswerToControls(activeQuestion, answerResult);
        if (!matchPlan.matched) {
          const failResult = {
            status: "TARGET_MATCH_FAILED",
            reason: matchPlan.reason,
            questionId: activeQuestion.id,
            questionText: activeQuestion.text,
          };
          onQuestionPaused(failResult);
          return failResult;
        }

        // 4. EXECUTE & VERIFY
        const execVerifyResult = await SurveyEngine.executeAndVerify(
          activeQuestion,
          matchPlan,
          executeActionFn,
          verifyStateFn,
          signal
        );

        if (signal?.aborted) {
          return { status: "ABORTED_BY_USER", record: this.executionRecord };
        }

        // Record execution history
        this.executionRecord.push({
          questionId: activeQuestion.id,
          questionText: activeQuestion.text.slice(0, 50),
          proposedAnswer: answerResult.proposedAnswer,
          targetIds: answerResult.targetOptionIds,
          verified: execVerifyResult.verified,
          reason: execVerifyResult.reason,
          timestamp: Date.now(),
        });

        if (!execVerifyResult.verified) {
          onQuestionPaused({
            status: "VERIFICATION_FAILED",
            reason: execVerifyResult.reason,
            question: activeQuestion,
          });
          return {
            status: "VERIFICATION_FAILED",
            reason: execVerifyResult.reason,
            question: activeQuestion,
          };
        }

        onQuestionAnswered({
          question: activeQuestion,
          answer: answerResult.proposedAnswer,
          verified: true,
        });
      }

      return { status: "MAX_STEPS_REACHED", record: this.executionRecord };
    }

    /**
     * Resumes survey execution after human-verification (CAPTCHA) challenge has been cleared
     */
    async resumeWorkflowAfterVerification(getSurveyFn, executeActionFn, verifyStateFn, advancePageFn, callbacks = {}) {
      const surveyData = await getSurveyFn();
      if (surveyData?.humanVerification?.isChallenge && surveyData?.humanVerification?.active) {
        return {
          status: "VERIFICATION_STILL_ACTIVE",
          message: "Human verification challenge is still active. Please solve the challenge before resuming.",
          challenge: surveyData.humanVerification,
        };
      }
      if (this.taskState) {
        this.taskState.status = "RUNNING";
        this.taskState.challenge = null;
      }
      return this.processSurveyWorkflow(getSurveyFn, executeActionFn, verifyStateFn, advancePageFn, callbacks);
    }

    /**
     * Helper for string normalization
     */
    static normalizeText(text) {
      if (!text) return "";
      return String(text)
        .replace(/[\r\n\t]+/g, " ")
        .replace(/[""''`]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/[*_#`~]/g, "")
        .trim()
        .toLowerCase();
    }
  }

  // Export to global environments (Browser Window, Service Worker, Node.js / globalThis)
  if (typeof globalThis !== "undefined") {
    globalThis.SurveyEngine = SurveyEngine;
  }
  if (typeof window !== "undefined") {
    window.SurveyEngine = SurveyEngine;
  }
  if (typeof self !== "undefined") {
    self.SurveyEngine = SurveyEngine;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SurveyEngine };
  }
})();
