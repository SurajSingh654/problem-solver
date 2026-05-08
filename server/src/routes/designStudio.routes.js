// ============================================================================
// ProbSolver v3.0 — Design Studio Routes
// ============================================================================
//
// ROUTE ARCHITECTURE:
//
// All routes require authentication. Team context is optional (works in
// both team and individual mode via optionalTeamContext middleware).
//
// AI coaching endpoints use aiLimiter (expensive GPT calls).
// CRUD endpoints use apiLimiter (standard rate limiting).
//
// Route order follows REST conventions:
//   Collection routes first (/), then resource routes (/:id),
//   then sub-resource routes (/:id/phases, /:id/ai, etc.).
//
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { optionalTeamContext } from "../middleware/team.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  savePhase,
  saveDiagram,
  updateTiming,
  updateStatus,
  askAICoach,
  generateScenarios,
  submitScenarioResponse,
  evaluateScenario,
  saveFlowSimulation,
  saveScaleAnalysis,
  requestFinalEvaluation,
} from "../controllers/designStudio.controller.js";
import {
  createDesignSessionSchema,
  savePhaseSchema,
  saveDiagramSchema,
  aiCoachingSchema,
  submitScenarioResponseSchema,
  saveFlowSimulationSchema,
  saveScaleAnalysisSchema,
  updateTimingSchema,
  updateSessionStatusSchema,
} from "../schemas/designStudio.schema.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Collection routes ────────────────────────────────────

// Create a new design session
router.post(
  "/",
  optionalTeamContext,
  validate(createDesignSessionSchema),
  createSession,
);

// List user's design sessions (with optional filters)
router.get("/", optionalTeamContext, listSessions);

// ── Resource routes (session-specific) ───────────────────

// Get a single session with all data
router.get("/:sessionId", getSession);

// Delete/abandon a session
router.delete("/:sessionId", deleteSession);

// ── Phase data routes ────────────────────────────────────

// Save phase content (auto-save on each keystroke/blur)
router.patch(
  "/:sessionId/phases",
  validate(savePhaseSchema),
  savePhase,
);

// Save diagram data (Excalidraw state + annotations)
router.patch(
  "/:sessionId/diagram",
  validate(saveDiagramSchema),
  saveDiagram,
);

// ── Session metadata routes ──────────────────────────────

// Update timing data (called periodically by frontend timer)
router.patch(
  "/:sessionId/timing",
  validate(updateTimingSchema),
  updateTiming,
);

// Update session status (transition lifecycle)
router.patch(
  "/:sessionId/status",
  validate(updateSessionStatusSchema),
  updateStatus,
);

// ── AI coaching routes (rate limited — expensive) ────────

// Ask AI coach (validate/guide/teach modes)
router.post(
  "/:sessionId/ai/coach",
  aiLimiter,
  validate(aiCoachingSchema),
  askAICoach,
);

// Generate validation scenarios (AI reads full design, creates tailored scenarios)
router.post(
  "/:sessionId/ai/scenarios",
  aiLimiter,
  generateScenarios,
);

// Submit a response to a specific scenario
router.post(
  "/:sessionId/scenarios/:scenarioId/respond",
  validate(submitScenarioResponseSchema),
  submitScenarioResponse,
);

// Evaluate a scenario response (AI judges if the design handles it)
router.post(
  "/:sessionId/scenarios/:scenarioId/evaluate",
  aiLimiter,
  evaluateScenario,
);

// ── Flow simulation routes ───────────────────────────────

// Save a flow simulation trace
router.post(
  "/:sessionId/flows",
  validate(saveFlowSimulationSchema),
  saveFlowSimulation,
);

// ── Scale analysis routes ────────────────────────────────

// Save scale analysis (1x/10x/100x reasoning)
router.patch(
  "/:sessionId/scale",
  validate(saveScaleAnalysisSchema),
  saveScaleAnalysis,
);

// ── Final evaluation route ───────────────────────────────

// Request comprehensive AI evaluation (GPT-4o, 10 dimensions)
router.post(
  "/:sessionId/ai/evaluate",
  aiLimiter,
  requestFinalEvaluation,
);

export default router;