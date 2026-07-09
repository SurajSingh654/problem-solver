// ============================================================================
// Topic Mastery Tracks — Routes (v1 scaffold)
// ============================================================================
//
// Team-scoped as of 2026-07-04, when Topic.slug moved from global `@unique`
// to composite `@@unique([teamId, slug])`. Every handler in this router
// now filters by `req.teamId`; without `requireTeamContext` the controllers
// would leak cross-team topics (list) or throw a Prisma validation error
// on `findFirst({slug})` (detail).
//
// Admin endpoints (publish/unpublish, content edits) live in
// `curriculumAdmin.controller.js`.
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import {
  listTopics,
  getTopic,
  enrollInTopic,
  getTopicState,
  updateEnrollment,
  getTopicCalibration,
  submitTopicCalibration,
  getTopicConcept,
  markConceptRead,
} from "../controllers/topics.controller.js";

const router = Router();

router.use(authenticate);
router.use(requireTeamContext);

router.get("/", listTopics);
router.get("/:slug", getTopic);
router.get("/:slug/state", getTopicState);
router.post("/:slug/enroll", enrollInTopic);
router.patch("/:slug/enrollment", updateEnrollment);
router.get("/:slug/calibration", getTopicCalibration);
router.post("/:slug/calibration/submit", submitTopicCalibration);
router.get("/:slug/concepts/:conceptSlug", getTopicConcept);
router.post("/:slug/concepts/:conceptSlug/mark-read", markConceptRead);

export default router;
