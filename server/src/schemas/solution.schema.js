/**
 * SOLUTION SCHEMAS — v3.0
 * Matches the v3 Solution model and controller field names exactly.
 */
import { z } from "zod";

// Reusable: accepts string or null, transforms empty to null
const optStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : (v ?? null)));

const SUPPORTED_LANGUAGES = [
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
  "SQL",
  "OTHER",
];

export const createSolutionSchema = z.object({
  approach: optStr,
  code: optStr,
  language: z.enum(SUPPORTED_LANGUAGES).nullable().optional(),
  bruteForce: optStr,
  optimizedApproach: optStr,
  timeComplexity: optStr,
  spaceComplexity: optStr,
  keyInsight: optStr,
  feynmanExplanation: optStr,
  realWorldConnection: optStr,
  confidence: z.number().int().min(0).max(5).default(3),
  pattern: optStr,
  patternIdentificationTime: z.number().int().positive().nullable().optional(),
  // Follow-up answers — array of { followUpQuestionId, answerText }
  followUpAnswers: z
    .array(
      z.object({
        followUpQuestionId: z.string().min(1),
        answerText: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
});

export const updateSolutionSchema = createSolutionSchema.partial();
