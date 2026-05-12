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
  "GROOVY",
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
  // Confidence is an explicit 1-5 self-rating. 0/null is "unset" — the
  // client must resolve that before POSTing; the server will not coerce.
  confidence: z.number().int().min(1).max(5),
  // Multi-select patterns — empty array = no pattern claimed.
  // Cap at 10 to prevent abusive payloads; labels capped at 100 chars.
  patterns: z.array(z.string().min(1).max(100)).max(10).default([]),
  patternIdentificationTime: z.number().int().positive().nullable().optional(),
  // Category-specific structured data (HR/Behavioral/TK/DB workspaces etc.)
  // Stored as Prisma `Json?` — shape varies per category.
  categorySpecificData: z.record(z.any()).nullable().optional(),
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

// ── SM-2 review submission ───────────────────────────────
// POST /solutions/:solutionId/review
export const submitReviewSchema = z.object({
  confidence: z.number().int().min(1).max(5),
});

// ── Peer clarity rating ──────────────────────────────────
// POST /solutions/:solutionId/rate
export const rateSolutionClaritySchema = z.object({
  rating: z.number().int().min(1).max(5),
});
