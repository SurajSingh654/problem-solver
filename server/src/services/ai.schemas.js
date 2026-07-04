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
