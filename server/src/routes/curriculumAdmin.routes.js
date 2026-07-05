// ============================================================================
// curriculumAdmin.routes.js — Team-scoped curriculum authoring routes (W3.T2)
// ============================================================================
//
// All routes require TEAM_ADMIN (SUPER_ADMIN also passes — see the
// `requireTeamAdmin` middleware). Mount at `/curriculum/admin` from
// `index.js::mountRoutes()` so the URLs materialize at both
// `/api/v1/curriculum/admin/*` and `/api/curriculum/admin/*`.
//
// Middleware chain (applied once via router.use):
//   authenticate       → decode JWT, populate req.user
//   requireTeamContext → validate team is ACTIVE, populate req.teamId
//   requireTeamAdmin   → require TEAM_ADMIN role (SUPER_ADMIN also passes)
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  requireTeamContext,
  requireTeamAdmin,
} from "../middleware/team.middleware.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import { aiTeamLimiter } from "../middleware/aiTeamLimiter.middleware.js";
import {
  listTemplates,
  listTopics,
  createTopic,
  updateTopic,
  forkFromTemplate,
  getTemplateStatus,
  createConcept,
  updateConcept,
  createLab,
  updateLab,
  reviewTopic,
  reviewConcept,
  reviewLab,
  publishTopic,
  publishConcept,
} from "../controllers/curriculumAdmin.controller.js";

const router = Router();

router.use(authenticate, requireTeamContext, requireTeamAdmin);

// ── Template library (read-only from TEAM_ADMIN) ─────────────────────
// The list is small (a few dozen PUBLISHED templates at most) so no
// pagination — client renders them as a cards grid.
router.get("/templates", listTemplates);

// List + create — team's topic collection.
router.get("/topics", listTopics);
router.post("/topics", createTopic);

// Update metadata. Slug + teamId are immutable via this route by design.
router.patch("/topics/:id", updateTopic);

// Fork a global TopicTemplate into the current team.
router.post("/topics/from-template/:templateSlug", forkFromTemplate);

// Drift indicator for the "template updated" chip.
router.get("/topics/:id/template-status", getTemplateStatus);

// ── Concept CRUD (W3.T3) ────────────────────────────────────────────
// Team scope enforced via parent Topic ownership check inside the
// controller — the router itself doesn't need to know about tenancy.
router.post("/concepts", createConcept);
router.patch("/concepts/:id", updateConcept);

// ── Lab CRUD (W3.T3) ────────────────────────────────────────────────
// 1:1 with Concept; DUPLICATE_LAB (409) on second attach. Team scope
// bubbles up from the parent Concept.
router.post("/labs", createLab);
router.patch("/labs/:id", updateLab);

// ── Review triggers (W3.T4) ─────────────────────────────────────────
// Topic + Concept reviews are AI-backed — chain aiLimiter (per-user
// 15-min) + aiTeamLimiter (per-team daily) before the controller so
// both quotas fire independently. Lab review is deterministic and
// rides the parent apiLimiter only.
router.post("/topics/:id/review", aiLimiter, aiTeamLimiter, reviewTopic);
router.post("/concepts/:id/review", aiLimiter, aiTeamLimiter, reviewConcept);
router.post("/labs/:id/review", reviewLab);

// ── Publish gates (W3.T4) ───────────────────────────────────────────
// Pure DB reads (latest ContentReviewLog verdict + child-state check).
// No AI, no rate-limiter chaining beyond the parent apiLimiter.
router.post("/topics/:id/publish", publishTopic);
router.post("/concepts/:id/publish", publishConcept);

export default router;
