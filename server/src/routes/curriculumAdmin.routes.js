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
import {
  listTopics,
  createTopic,
  updateTopic,
  forkFromTemplate,
  getTemplateStatus,
} from "../controllers/curriculumAdmin.controller.js";

const router = Router();

router.use(authenticate, requireTeamContext, requireTeamAdmin);

// List + create — team's topic collection.
router.get("/topics", listTopics);
router.post("/topics", createTopic);

// Update metadata. Slug + teamId are immutable via this route by design.
router.patch("/topics/:id", updateTopic);

// Fork a global TopicTemplate into the current team.
router.post("/topics/from-template/:templateSlug", forkFromTemplate);

// Drift indicator for the "template updated" chip.
router.get("/topics/:id/template-status", getTemplateStatus);

export default router;
