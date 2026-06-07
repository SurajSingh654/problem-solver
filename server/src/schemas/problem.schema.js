// ============================================================================
// ProbSolver v3.0 — Problem Validation Schemas
// ============================================================================
//
// Flat Zod schemas consumed by `validate()` in middleware/validate.middleware.js
// (which parses req.body directly — no `{body: ...}` wrapper).
//
// Schemas match the Prisma `Problem` model exactly. `source` is the
// provenance enum (MANUAL | AI_GENERATED) — platform origin (LeetCode,
// GFG, …) lives inside `categoryData.platform`, not as a top-level field.
// ============================================================================

import { z } from "zod";

const DIFFICULTY = z.enum(["EASY", "MEDIUM", "HARD"]);

const CATEGORY = z.enum([
  "CODING",
  "SYSTEM_DESIGN",
  "LOW_LEVEL_DESIGN",
  "BEHAVIORAL",
  "CS_FUNDAMENTALS",
  "HR",
  "SQL",
]);

const SOURCE = z.enum(["MANUAL", "AI_GENERATED"]);

const followUpSchema = z.object({
  // Present when the client is round-tripping an existing follow-up (edit
  // flow); absent for newly-added items. The update controller diffs on
  // this id to preserve user answers attached to existing rows.
  id: z.string().min(1).optional(),
  question: z.string().min(5).max(500),
  difficulty: DIFFICULTY.default("MEDIUM"),
  hint: z.string().max(500).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

// `.strict()` everywhere so unknown keys produce a 400 instead of being
// silently dropped. Pairs with the boundary-logger in validate.middleware.

// ── Create ───────────────────────────────────────────────────
export const createProblemSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().nullable().optional(),
  difficulty: DIFFICULTY.default("MEDIUM"),
  category: CATEGORY.default("CODING"),
  source: SOURCE.default("MANUAL"),
  // Prisma `Json?` — category-specific fields (sourceUrl, platform, etc.)
  categoryData: z.record(z.any()).nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(30).default([]),
  // Separate from `tags` on input for clarity; controller merges both
  // into the `tags[]` column so title/tag search covers companies.
  companyTags: z.array(z.string().min(1).max(50)).max(30).default([]),
  // Curriculum-source labels (e.g. "Striver A2Z", "Neetcode 150"). Soft
  // allowlist via sourceListTaxonomy.js — non-canonical entries pass
  // with a warning.
  sourceLists: z.array(z.string().min(1).max(50)).max(30).default([]),
  realWorldContext: z.string().nullable().optional(),
  // Controller joins array → "\n"; schema accepts either shape.
  useCases: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  // Strict string. Client normalizes any AI object-form upstream.
  adminNotes: z.string().nullable().optional(),
  isPinned: z.boolean().default(false),
  followUps: z.array(followUpSchema).max(10).default([]),
}).strict();

// ── Update ───────────────────────────────────────────────────
// `source` is intentionally absent — immutable after creation.
// Admin-only flags (isPublished, isPinned, isHidden) are included here.
export const updateProblemSchema = z
  .object({
    title: z.string().min(2).max(200).optional(),
    description: z.string().nullable().optional(),
    difficulty: DIFFICULTY.optional(),
    category: CATEGORY.optional(),
    categoryData: z.record(z.any()).nullable().optional(),
    tags: z.array(z.string().min(1).max(50)).max(30).optional(),
    sourceLists: z.array(z.string().min(1).max(50)).max(30).optional(),
    realWorldContext: z.string().nullable().optional(),
    useCases: z.union([z.string(), z.array(z.string())]).nullable().optional(),
    adminNotes: z.string().nullable().optional(),
    isPublished: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    // Edit flow round-trips the full follow-up set. Controller diffs by
    // `id` so unchanged rows preserve their attached SolutionFollowUpAnswer
    // records. Removed rows are deleted (cascade is intentional — orphaned
    // answers have no question to answer).
    followUps: z.array(followUpSchema).max(10).optional(),
  })
  .strict();

// ── Batch create — capped at 5 to match Railway timeout budget ──
export const batchCreateProblemsSchema = z
  .object({
    problems: z.array(createProblemSchema).min(1).max(5),
  })
  .strict();

// ── Pin/hide toggle ──────────────────────────────────────────
export const toggleProblemFlagSchema = z
  .object({
    flag: z.enum(["pin", "hide"]),
  })
  .strict();
