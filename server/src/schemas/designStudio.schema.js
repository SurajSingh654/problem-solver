/**
 * DESIGN STUDIO SCHEMAS — Zod validation for Design Studio endpoints.
 *
 * DESIGN DECISIONS:
 *
 * 1. createSession validates only the initial config (designType, title,
 *    difficulty, problemId). Phase data is saved incrementally via savePhase.
 *
 * 2. savePhase uses a loose schema (phaseId + content as string) because
 *    phase content varies wildly by designType and phaseId. The controller
 *    handles per-phase structural validation where needed.
 *
 * 3. AI coaching requests validate mode (validate/guide/teach) + optional
 *    userQuery. The controller assembles the full context from the session.
 *
 * 4. Scenario responses are validated as arrays of { scenarioId, response }
 *    pairs. AI generates the scenarios; the user only submits responses.
 */
import { z } from "zod";

// ── Create a new Design Studio session ───────────────────
export const createDesignSessionSchema = z.object({
  designType: z.enum(["SYSTEM_DESIGN", "LOW_LEVEL_DESIGN"]),
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be under 200 characters"),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  problemId: z.string().optional().nullable(),
});

// ── Save phase content (incremental auto-save) ───────────
export const savePhaseSchema = z.object({
  phaseId: z
    .string()
    .min(1, "Phase ID is required")
    .max(50, "Phase ID too long"),
  content: z
    .string()
    .max(50000, "Phase content too long — keep it under 50,000 characters")
    .default(""),
});

// ── Save diagram data (Excalidraw state) ─────────────────
export const saveDiagramSchema = z.object({
  diagramData: z
    .string()
    .max(500000, "Diagram data too large")
    .nullable()
    .default(null),
  componentAnnotations: z
    .array(
      z.object({
        componentName: z.string().max(100),
        purpose: z.string().max(500).optional().default(""),
        technology: z.string().max(100).optional().default(""),
        notes: z.string().max(500).optional().default(""),
      }),
    )
    .max(30, "Too many component annotations — max 30")
    .optional()
    .default([]),
  dataFlowDescription: z
    .string()
    .max(5000, "Data flow description too long")
    .optional()
    .default(""),
});

// ── AI coaching request ──────────────────────────────────
// Three modes:
//   validate — "Am I on the right track?" (sends current phase content for review)
//   guide    — "I'm stuck" (sends context, gets guiding questions back)
//   teach    — "Teach me this concept" (sends a specific question, gets focused explanation)
export const aiCoachingSchema = z.object({
  mode: z.enum(["validate", "guide", "teach"]),
  phaseId: z.string().min(1, "Phase ID is required").max(50),
  userQuery: z
    .string()
    .max(1000, "Query too long — keep it under 1000 characters")
    .optional()
    .default(""),
});

// ── Submit scenario responses ────────────────────────────
// After AI generates scenarios, user responds to each one.
export const submitScenarioResponseSchema = z.object({
  scenarioId: z.string().min(1, "Scenario ID is required"),
  response: z
    .string()
    .min(10, "Response must be at least 10 characters")
    .max(10000, "Response too long — keep it under 10,000 characters"),
});

// ── Save flow simulation data ────────────────────────────
export const saveFlowSimulationSchema = z.object({
  flowName: z.string().min(1, "Flow name is required").max(100),
  hops: z
    .array(
      z.object({
        from: z.string().max(100),
        to: z.string().max(100),
        latencyMs: z.number().min(0).max(60000).optional().default(0),
        payload: z.string().max(500).optional().default(""),
        failureHandling: z.string().max(500).optional().default(""),
      }),
    )
    .min(1, "At least one hop is required")
    .max(20, "Too many hops — max 20"),
});

// ── Save scale analysis ──────────────────────────────────
export const saveScaleAnalysisSchema = z.object({
  current: z.string().max(5000).optional().default(""),
  tenX: z.string().max(5000).optional().default(""),
  hundredX: z.string().max(5000).optional().default(""),
  failureAtScale: z.string().max(5000).optional().default(""),
});

// ── Update session timing ────────────────────────────────
export const updateTimingSchema = z.object({
  totalTimeSpent: z.number().min(0).max(86400), // max 24 hours
  phaseTimings: z.record(z.string(), z.number().min(0).max(86400)).optional(),
});

// ── Update session status ────────────────────────────────
export const updateSessionStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "VALIDATING", "COMPLETED", "ABANDONED"]),
});
