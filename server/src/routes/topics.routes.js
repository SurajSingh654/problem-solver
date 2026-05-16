// ============================================================================
// Topic Mastery Tracks — Routes (v1 scaffold)
// ============================================================================
//
// Personal/user-scoped — uses `authenticate` middleware. NOT team-scoped:
// a Track follows the user across team switches, same as Notes/Flashcards.
// Admin endpoints (publish/unpublish, content edits) live elsewhere.
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  listTopics,
  getTopic,
  enrollInTopic,
  getTopicState,
  updateEnrollment,
} from "../controllers/topics.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", listTopics);
router.get("/:slug", getTopic);
router.get("/:slug/state", getTopicState);
router.post("/:slug/enroll", enrollInTopic);
router.patch("/:slug/enrollment", updateEnrollment);

export default router;
