/**
 * AI SCHEMAS — Zod validation for AI responses
 * Ensures AI responses are always parseable and structured.
 */
import { z } from "zod";
import logger from "../utils/logger.js";

/**
 * looseEnum — Zod enum that coerces AI prose ("High specificity...") into
 * canonical enum values via case-insensitive substring matching. Every
 * coercion emits an `enum_coerced` log so we can detect prompt drift; a
 * failed coercion falls back to a safe default and emits
 * `enum_coerce_fallback` for weekly review.
 *
 * Belt-and-suspenders companion to the JSON-example prompt-fix — a prompt
 * regression that lets prose slip through still yields a valid verdict
 * instead of the fallback path (which forces NOT_READY / NOT_WORTH_TIME).
 *
 * DO NOT use for top-level verdict fields (WORTH_LEARNING vs NOT_WORTH_TIME,
 * READY vs NOT_READY, STRONG vs WEAK) — a coerced verdict could flip the
 * gate outcome silently. Only use for descriptive sub-enums.
 *
 * @param {string[]} enumValues canonical values, e.g. ["STRONG","OK","WEAK"]
 * @param {Record<string,string[]>} keywordMap enumValue -> substrings (lowercased) that map to it
 * @param {string} fallback which enumValue to use when nothing matches
 */
export function looseEnum(enumValues, keywordMap, fallback) {
  if (!enumValues.includes(fallback)) {
    throw new Error(`looseEnum: fallback ${fallback} not in enum`);
  }
  return z.preprocess((raw) => {
    if (typeof raw !== "string") return raw; // let z.enum handle non-string type errors
    if (enumValues.includes(raw)) return raw; // exact match — hot path, no log
    const lower = raw.toLowerCase();
    for (const value of enumValues) {
      const keywords = keywordMap[value] || [];
      if (keywords.some((k) => lower.includes(k.toLowerCase()))) {
        logger.info({
          event: "enum_coerced",
          from: raw.slice(0, 120),
          to: value,
          enumValues,
        });
        return value;
      }
    }
    logger.warn({
      event: "enum_coerce_fallback",
      from: raw.slice(0, 120),
      to: fallback,
      enumValues,
    });
    return fallback;
  }, z.enum(enumValues));
}

export const solutionReviewSchema = z.object({
  overallScore: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  improvement: z.string(),
  interviewTip: z.string(),
  complexityCheck: z.object({
    timeCorrect: z.boolean(),
    spaceCorrect: z.boolean(),
    timeNote: z.string().nullable(),
    spaceNote: z.string().nullable(),
  }),
});

export const problemContentSchema = z.object({
  realWorldContext: z.string(),
  useCases: z.array(z.string()),
  adminNotes: z.string(),
  followUps: z.array(
    z.object({
      question: z.string(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
      hint: z.string(),
    }),
  ),
});

export const hintSchema = z.object({
  hint: z.string(),
  level: z.number().min(1).max(3),
  encouragement: z.string(),
});

export const weeklyPlanSchema = z.object({
  summary: z.string(),
  focusAreas: z.array(z.string()),
  dailyPlan: z.array(
    z.object({
      day: z.string(),
      task: z.string(),
      type: z.enum(["solve", "review", "simulate", "study"]),
    }),
  ),
  weeklyGoal: z.string(),
});

export const quizQuestionsSchema = z.object({
  title: z.string().optional(),
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).min(2).max(6),
        correctIndex: z.number().min(0).max(5),
        explanation: z.string().optional().default(""),
        difficulty: z
          .enum(["EASY", "MEDIUM", "HARD"])
          .optional()
          .default("MEDIUM"),
      }),
    )
    .min(1),
});

export const quizAnalysisSchema = z.object({
  summary: z.string(),
  weakTopics: z.array(z.string()),
  studyAdvice: z.array(z.string()),
  encouragement: z.string(),
});

/**
 * curriculumReviewSchema — verdict emitted by the curriculum-review AI validator.
 *
 * TEAM_ADMIN-triggered, TOPIC-level. Verdict decides whether the outlined
 * curriculum is worth a learner's 20+ hour investment. Rule 18 (WORTH_LEARNING
 * must cite ≥1 outcome in finalRecommendation) and Rule 22-curriculum
 * (WORTH_LEARNING requires ≥4 outcomes) are enforced by validateCurriculumReview.
 */
export const curriculumReviewSchema = z
  .object({
    verdict: z.enum(["WORTH_LEARNING", "WORTH_WITH_ADJUSTMENTS", "NOT_WORTH_TIME"]),
    oneLineSummary: z.string(),
    outcomes: z.array(z.string()).min(0).max(20),
    wontTeach: z.array(z.string()),
    roi: z
      .object({
        time: z.string(),
        interviewValue: z.string(),
        jobValue: z.string(),
        depthVsBreadth: z.string(),
        // Descriptive sub-enum — AI has a habit of writing "HIGH — because…" or
        // free-form intensity words. Coerce; log-and-review if the mapping fires.
        verdict: looseEnum(
          ["HIGH", "MEDIUM", "LOW"],
          {
            HIGH: ["high", "strong", "significant", "substantial"],
            MEDIUM: ["medium", "moderate", "mid", "some"],
            LOW: ["low", "little", "minimal", "poor", "weak"],
          },
          "MEDIUM",
        ),
      })
      .strict(),
    retention: z
      .object({
        signalsFor: z.array(z.string()),
        signalsAgainst: z.array(z.string()),
        verdict: looseEnum(
          ["HIGH", "MEDIUM", "LOW"],
          {
            HIGH: ["high", "strong", "significant", "substantial"],
            MEDIUM: ["medium", "moderate", "mid", "some"],
            LOW: ["low", "little", "minimal", "poor", "weak"],
          },
          "MEDIUM",
        ),
      })
      .strict(),
    structuralSanity: z
      .object({
        moduleCount: z.number().int().nonnegative(),
        // These three enums are where prod broke — AI wrote sentences like
        // "High specificity with clear focus" instead of "STRONG". Coerce
        // prose to the closest enum via keyword match.
        titleSpecificity: looseEnum(
          ["STRONG", "OK", "WEAK"],
          {
            STRONG: ["strong", "high", "specific", "clear", "precise", "concrete"],
            OK: ["ok", "adequate", "moderate", "acceptable", "reasonable"],
            WEAK: ["weak", "vague", "unclear", "generic", "ambiguous"],
          },
          "OK",
        ),
        capstoneConcreteness: looseEnum(
          ["STRONG", "OK", "WEAK", "MISSING"],
          {
            STRONG: ["strong", "high", "concrete", "specific", "clear", "practical"],
            OK: ["ok", "adequate", "moderate", "acceptable"],
            WEAK: ["weak", "vague", "unclear", "generic"],
            MISSING: ["missing", "absent", "no capstone", "none", "n/a"],
          },
          "OK",
        ),
        dependencyChain: looseEnum(
          ["CLEAN", "MOSTLY_CLEAN", "TANGLED"],
          {
            CLEAN: ["clean", "clear", "logical", "well-ordered", "sequential", "progression"],
            MOSTLY_CLEAN: ["mostly clean", "mostly", "largely clean", "minor"],
            TANGLED: ["tangled", "unclear", "confused", "circular", "messy"],
          },
          "MOSTLY_CLEAN",
        ),
      })
      .strict(),
    modulesNeedingWork: z.array(
      z
        .object({
          conceptId: z.string(),
          issue: z.string(),
          suggestedFix: z.string(),
        })
        .strict(),
    ),
    missingCoverage: z.array(z.string()),
    redundantModules: z.array(z.string()),
    strong: z.array(z.string()),
    finalRecommendation: z.string(),
  })
  .strict();

/**
 * lessonReviewSchema — verdict emitted by the lesson-review AI validator.
 *
 * TEAM_ADMIN-triggered, CONCEPT-level. Model = AI_MODEL_FAST. Grades ONE
 * concept's teaching quality against the 8-check senior-engineer readiness
 * rubric. Rule 19 (READY requires ≥6 of 8 seniorReadiness checks true; any
 * false check needs a non-empty justification) and Rule 22-lesson (belt-
 * and-suspenders codified check that READY has ≥6 seniorReadiness true) are
 * enforced by validateLessonReview.
 */
export const lessonReviewSchema = z
  .object({
    verdict: z.enum(["READY", "POLISH", "NOT_READY"]),
    structuralCompleteness: z.array(
      z
        .object({
          section: z.string(),
          grade: z.enum(["PASS", "WEAK", "MISSING"]),
          justification: z.string(),
        })
        .strict(),
    ),
    contentQuality: z
      .object({
        depthCalibration: z.enum(["PASS", "WEAK", "MISSING"]),
        fundamentalsFirst: z.enum(["PASS", "WEAK", "MISSING"]),
        progressiveLayering: z.enum(["PASS", "WEAK", "MISSING"]),
        concreteOverAcademic: z.enum(["PASS", "WEAK", "MISSING"]),
        tradeoffHonesty: z.enum(["PASS", "WEAK", "MISSING"]),
        productionReality: z.enum(["PASS", "WEAK", "MISSING"]),
        curation: z.enum(["PASS", "WEAK", "MISSING"]),
        lengthCalibration: z.enum(["PASS", "WEAK", "MISSING"]),
      })
      .strict(),
    seniorReadiness: z
      .object({
        explainToJunior: z.boolean(),
        sketchArchitecture: z.boolean(),
        buildFromScratch: z.boolean(),
        nameFailureModes: z.boolean(),
        compareAlternatives: z.boolean(),
        estimateCost: z.boolean(),
        blastRadius: z.boolean(),
        debugFromSymptoms: z.boolean(),
      })
      .strict(),
    seniorReadinessJustifications: z.record(z.string(), z.string()).default({}),
    mustFix: z.array(z.string()),
    niceToHave: z.array(z.string()),
    strong: z.array(z.string()),
    nextStep: z.string(),
  })
  .strict();

/**
 * codeReviewSchema — verdict emitted by the code-review AI validator.
 *
 * Learner-triggered, LAB-level (targetType = "LAB"). Model = AI_MODEL_PRIMARY.
 * Grades ONE Lab attempt against a teaching-lens rubric: correctness,
 * conceptApplication, designQuality, idiomaticStyle, robustness, testing.
 *
 * The Zod `.superRefine` enforces Rule 21 at schema-parse time: STRONG or
 * ADEQUATE verdicts must have nextStep = READY_FOR_REFERENCE. Defense in
 * depth — Rule 21 is ALSO enforced imperatively inside validateCodeReview
 * so a future refactor that removes the .superRefine still gets caught.
 *
 * Rule 20 (STRONG requires ≥1 non-empty lineRef in whatYouGotRight) and
 * Rule 22-code (STRONG or ADEQUATE requires whatYouGotRight.length ≥ 1) are
 * enforced by validateCodeReview (not the schema — Rule 20's substring
 * check is not naturally expressible in Zod).
 */
export const codeReviewSchema = z
  .object({
    overall: z.string(),
    correctness: z.enum(["STRONG", "ADEQUATE", "WEAK", "MISSING"]),
    conceptApplication: z.enum(["STRONG", "ADEQUATE", "WEAK", "MISSING"]),
    designQuality: z.enum(["STRONG", "ADEQUATE", "WEAK", "MISSING"]),
    idiomaticStyle: z.enum(["STRONG", "ADEQUATE", "WEAK", "MISSING"]),
    robustness: z.enum(["STRONG", "ADEQUATE", "WEAK", "MISSING"]),
    testing: z.enum(["STRONG", "ADEQUATE", "WEAK", "MISSING"]),
    mentalModelSignal: z.string(),
    whatYouGotRight: z.array(
      z
        .object({
          item: z.string(),
          lineRef: z.string().nullable().optional(),
        })
        .strict(),
    ),
    thingsToImprove: z.array(
      z
        .object({
          what: z.string(),
          whyItMatters: z.string(),
          how: z.string(),
          lineRef: z.string().nullable().optional(),
        })
        .strict(),
    ),
    bugs: z.array(
      z
        .object({
          what: z.string(),
          whyItMatters: z.string(),
          how: z.string(),
          lineRef: z.string().nullable().optional(),
        })
        .strict(),
    ),
    nextStep: z.enum(["ADDRESS_AND_RESUBMIT", "READY_FOR_REFERENCE", "MINI_DRILL"]),
    codeReviewVerdict: z.enum(["STRONG", "ADEQUATE", "WEAK"]),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Rule 21 at the schema layer — cross-field enforcement. A STRONG or
    // ADEQUATE verdict paired with MINI_DRILL / ADDRESS_AND_RESUBMIT is
    // internally contradictory (the verdict says "good", the next step
    // says "not yet"). Zod rejects at parse time; the imperative Rule 21
    // in validateCodeReview is defense-in-depth for future refactors.
    if (
      (data.codeReviewVerdict === "STRONG" ||
        data.codeReviewVerdict === "ADEQUATE") &&
      data.nextStep !== "READY_FOR_REFERENCE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `codeReviewVerdict ${data.codeReviewVerdict} requires nextStep = READY_FOR_REFERENCE`,
        path: ["nextStep"],
      });
    }
  });

/**
 * checkInSchema — verdict emitted by the check-in AI validator.
 *
 * Learner-triggered, CONCEPT-level 3-question gate (recall / apply / build).
 * Model = AI_MODEL_FAST. Not logged to ContentReviewLog (targetType: null in
 * the registry) — check-ins persist to the ConceptCheckIn table directly at
 * the controller layer. This validator only feeds the D10 calibration signal;
 * no new Rules (18-22 don't apply here) — Zod .strict() + enums are the
 * shape gate, and validateCheckInReview is an identity pass-through.
 *
 * `calibrationDelta` ∈ [0, 1] is the normalized
 *   |preConfidence/5 − impliedScore/10|
 * where impliedScore = mean of PASS/PARTIAL/FAIL → 100/50/0 across the three
 * per-question verdicts. 0 = perfectly calibrated; 1 = maximally
 * mis-calibrated. Feeds D10 Verification & Meta-cognition.
 */
const perQuestionSchema = z
  .object({
    verdict: z.enum(["PASS", "PARTIAL", "FAIL"]),
    feedback: z.string(),
  })
  .strict();

export const checkInSchema = z
  .object({
    perQuestion: z
      .object({
        recall: perQuestionSchema,
        apply: perQuestionSchema,
        build: perQuestionSchema,
      })
      .strict(),
    overallVerdict: z.enum(["PASS", "PARTIAL", "FAIL"]),
    calibrationDelta: z.number().min(0).max(1),
    encouragement: z.string(),
  })
  .strict();

/**
 * Validate AI response against a schema.
 * Returns { valid: true, data } or { valid: false, error }
 */
export function validateAIResponse(schema, data) {
  try {
    const parsed = schema.parse(data);
    return { valid: true, data: parsed };
  } catch (err) {
    console.error("AI response validation failed:", err.errors);
    return { valid: false, error: err.errors };
  }
}
