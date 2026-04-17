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
