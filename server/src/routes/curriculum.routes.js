// ============================================================================
// curriculum.routes.js — Learner-facing curriculum routes (W4.T1)
// ============================================================================
//
// Regular team members (MEMBER + TEAM_ADMIN + SUPER_ADMIN) all reach these
// routes. Distinct from `curriculumAdmin.routes.js` which requires
// TEAM_ADMIN and lives under `/curriculum/admin`. Order matters at the
// mount site — the admin router is registered at `/curriculum/admin`
// BEFORE this router at `/curriculum`, so Express's longest-prefix match
// dispatches `/curriculum/admin/*` to the admin router and everything
// else here.
//
// Rate limiter (chained at mount time in `index.js`): `apiLimiter`.
// Middleware chain (applied once via router.use):
//   authenticate       → decode JWT, populate req.user
//   requireTeamContext → validate team is ACTIVE, populate req.teamId
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import { aiTeamLimiter } from "../middleware/aiTeamLimiter.middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  listTopics,
  getTopicDetail,
  enrollInTopic,
  getConceptDetail,
  submitAttempt,
  getAttempt,
  revealReference,
  getWalkthrough,
  retryWalkthrough,
  submitCheckIn,
  markPrimerRead,
} from "../controllers/curriculum.controller.js";

const router = Router();

router.use(authenticate, requireTeamContext);

// Every learner handler below is wrapped in `asyncHandler` so a rejected
// Prisma promise (network blip, constraint violation, missing row) reaches
// `errorHandler` via `next(err)` instead of an unhandled rejection that
// hangs the client and warns on the Node process.
//
// ── Topic catalog + detail ─────────────────────────────────────────
router.get("/topics", asyncHandler(listTopics));
router.get("/topics/:slug", asyncHandler(getTopicDetail));

// ── Enrollment (idempotent upsert) ─────────────────────────────────
router.post("/topics/:slug/enroll", asyncHandler(enrollInTopic));

// ── Concept detail (no reference solution / starter code leak) ─────
router.get("/concepts/:slug", asyncHandler(getConceptDetail));

// ── Lab attempts (W4.T2 — async 202 pattern) ───────────────────────
// POST is AI-backed (fires runValidator("CODE_REVIEW", ...) in the
// background) so it chains the per-user aiLimiter + per-team
// aiTeamLimiter on top of the mount-level apiLimiter. GET is a plain
// DB poll — apiLimiter (chained at mount) is sufficient.
router.post(
  "/labs/:id/attempts",
  aiLimiter,
  aiTeamLimiter,
  asyncHandler(submitAttempt),
);
router.get("/labs/:id/attempts/:attemptId", asyncHandler(getAttempt));

// ── Reveal reference solution (struggle-first gate, W4.T3) ─────────
// Deterministic DB check for the reveal itself, but when
// FEATURE_CURRICULUM_WALKTHROUGH is ON it fire-and-forget dispatches a
// CODE_WALKTHROUGH task via the per-team semaphore. That makes reveal
// AI-backed at the tail, so we chain aiLimiter + aiTeamLimiter per the
// SecurityManager review (2026-07-11): otherwise a learner could hammer
// reveals across many attempts to burn the AI budget.
router.post(
  "/labs/:id/reveal-reference",
  aiLimiter,
  aiTeamLimiter,
  asyncHandler(revealReference),
);

// ── Reveal Walkthrough (Phase R.1, 2026-07-11) ─────────────────────
// GET returns the walkthrough body when walkthroughStatus === COMPLETED,
// stamps walkthroughViewedAt on first successful hit (D10 signal). Cheap
// DB read; parent apiLimiter is sufficient.
router.get(
  "/labs/:id/attempts/:attemptId/walkthrough",
  asyncHandler(getWalkthrough),
);
// POST re-enters the AI dispatch path for an ERROR-state walkthrough. Chain
// aiLimiter + aiTeamLimiter — this triggers a fresh AI call.
router.post(
  "/labs/:id/attempts/:attemptId/walkthrough/retry",
  aiLimiter,
  aiTeamLimiter,
  asyncHandler(retryWalkthrough),
);

// ── Concept check-in submit (3-question grader, W4.T3) ─────────────
// AI-backed (CHECK_IN validator, AI_MODEL_FAST). Chain aiLimiter +
// aiTeamLimiter on top of the mount-level apiLimiter.
router.post(
  "/concepts/:slug/checkin",
  aiLimiter,
  aiTeamLimiter,
  asyncHandler(submitCheckIn),
);

// ── Primer-read engagement signal (W4.T4) ──────────────────────────
// No AI, small write, dedup'd 24h server-side. Parent apiLimiter is
// sufficient — this endpoint is spammable-safe by design (dedup).
router.post("/concepts/:slug/mark-primer-read", asyncHandler(markPrimerRead));

export default router;
