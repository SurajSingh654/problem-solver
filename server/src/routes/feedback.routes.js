import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/superAdmin.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { teamContext } from "../middleware/team.middleware.js";
import {
  submitFeedback,
  listFeedback,
  updateFeedbackStatus,
  getFeedback,
  getSimilarReports, // NEW
} from "../controllers/feedback.controller.js";
import {
  createFeedbackSchema,
  updateFeedbackStatusSchema,
} from "../schemas/feedback.schema.js";

const router = Router();

router.use(authenticate);

// NEW: Similar reports — called as user types, before submission
// Must come before /:feedbackId to avoid route conflict
router.get("/similar", teamContext({ required: false }), getSimilarReports);

router.post(
  "/",
  teamContext({ required: false }),
  validate(createFeedbackSchema),
  submitFeedback,
);

router.get("/", teamContext({ required: false }), listFeedback);

router.get("/:feedbackId", getFeedback);

router.patch(
  "/:feedbackId/status",
  requireSuperAdmin,
  validate(updateFeedbackStatusSchema),
  updateFeedbackStatus,
);

export default router;
