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
import {
  listTopics,
  getTopicDetail,
  enrollInTopic,
  getConceptDetail,
  submitAttempt,
  getAttempt,
  revealReference,
  submitCheckIn,
} from "../controllers/curriculum.controller.js";

const router = Router();

router.use(authenticate, requireTeamContext);

// ── Topic catalog + detail ─────────────────────────────────────────
router.get("/topics", listTopics);
router.get("/topics/:slug", getTopicDetail);

// ── Enrollment (idempotent upsert) ─────────────────────────────────
router.post("/topics/:slug/enroll", enrollInTopic);

// ── Concept detail (no reference solution / starter code leak) ─────
router.get("/concepts/:slug", getConceptDetail);

// ── Lab attempts (W4.T2 — async 202 pattern) ───────────────────────
// POST is AI-backed (fires runValidator("CODE_REVIEW", ...) in the
// background) so it chains the per-user aiLimiter + per-team
// aiTeamLimiter on top of the mount-level apiLimiter. GET is a plain
// DB poll — apiLimiter (chained at mount) is sufficient.
router.post(
  "/labs/:id/attempts",
  aiLimiter,
  aiTeamLimiter,
  submitAttempt,
);
router.get("/labs/:id/attempts/:attemptId", getAttempt);

// ── Reveal reference solution (struggle-first gate, W4.T3) ─────────
// Deterministic DB check — no AI. Parent-level apiLimiter is sufficient.
router.post("/labs/:id/reveal-reference", revealReference);

// ── Concept check-in submit (3-question grader, W4.T3) ─────────────
// AI-backed (CHECK_IN validator, AI_MODEL_FAST). Chain aiLimiter +
// aiTeamLimiter on top of the mount-level apiLimiter.
router.post(
  "/concepts/:slug/checkin",
  aiLimiter,
  aiTeamLimiter,
  submitCheckIn,
);

export default router;
