import { Router } from "express";
import {
  startInterviewSession,
  getInterviewSession,
  getMySessions,
  endInterviewSession,
  abandonInterviewSession,
  generateInterviewDebrief,
} from "../controllers/interview.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);

router.post("/start", startInterviewSession);
router.get("/my-sessions", getMySessions);
router.get("/:id", getInterviewSession);
router.patch("/:id/end", endInterviewSession);
router.patch("/:id/abandon", abandonInterviewSession);
router.post('/:id/debrief', generateInterviewDebrief)

export default router;
