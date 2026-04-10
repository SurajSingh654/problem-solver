/**
 * SOLUTION SCHEMAS
 */
import { z } from "zod";

// Accepts string, empty string, or null — normalizes all to undefined
const optStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (!v ? undefined : v));

export const createSolutionSchema = z.object({
  body: z.object({
    problemId: z.string().min(1),

    // Pattern
    patternIdentified: optStr,
    firstInstinct: optStr,
    whyThisPattern: optStr,
    timeToPatternSecs: z
      .union([z.number().int().positive(), z.null()])
      .optional()
      .transform((v) => v ?? undefined),

    // Brute force
    bruteForceApproach: optStr,
    bruteForceTime: optStr,
    bruteForceSpace: optStr,

    // Optimized
    optimizedApproach: optStr,
    optimizedTime: optStr,
    optimizedSpace: optStr,
    predictedTime: optStr,
    predictedSpace: optStr,
    code: optStr,
    language: z
      .enum([
        "PYTHON",
        "JAVASCRIPT",
        "JAVA",
        "CPP",
        "C",
        "GO",
        "RUST",
        "TYPESCRIPT",
        "SWIFT",
        "KOTLIN",
        "OTHER",
      ])
      .default("PYTHON"),

    // Depth
    keyInsight: optStr,
    feynmanExplanation: optStr,
    realWorldConnection: optStr,
    followUpAnswers: z.array(z.string()).default([]),

    // Self-assessment
    confidenceLevel: z.number().int().min(0).max(5).default(0),
    difficultyFelt: optStr,
    stuckPoints: optStr,
    hintsUsed: z.boolean().default(false),

    // Interview mode
    isInterviewMode: z.boolean().default(false),
    timeLimitSecs: z
      .union([z.number().int().positive(), z.null()])
      .optional()
      .transform((v) => v ?? undefined),
    timeUsedSecs: z
      .union([z.number().int().positive(), z.null()])
      .optional()
      .transform((v) => v ?? undefined),
  }),
});

export const updateSolutionSchema = z.object({
  body: createSolutionSchema.shape.body.partial().omit({ problemId: true }),
  params: z.object({ id: z.string() }),
});

export const clarityRatingSchema = z.object({
  body: z.object({
    score: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  }),
  params: z.object({ id: z.string() }),
});
