/**
 * AI SCHEMAS — Zod validation for AI responses
 * Ensures AI responses are always parseable and structured.
 */
import { z } from "zod";

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
        verdict: z.enum(["HIGH", "MEDIUM", "LOW"]),
      })
      .strict(),
    retention: z
      .object({
        signalsFor: z.array(z.string()),
        signalsAgainst: z.array(z.string()),
        verdict: z.enum(["HIGH", "MEDIUM", "LOW"]),
      })
      .strict(),
    structuralSanity: z
      .object({
        moduleCount: z.number().int().nonnegative(),
        titleSpecificity: z.enum(["STRONG", "OK", "WEAK"]),
        capstoneConcreteness: z.enum(["STRONG", "OK", "WEAK", "MISSING"]),
        dependencyChain: z.enum(["CLEAN", "MOSTLY_CLEAN", "TANGLED"]),
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
