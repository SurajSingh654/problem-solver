import { Router } from "express";
import {
  generateQuiz,
  submitQuizAttempt,
  analyzeQuizAttempt,
  getMyAttempts,
  getAttemptById,
  getMySubjects,
} from "../controllers/quiz.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAI, aiRateLimit } from "../middleware/ai.middleware.js";

const router = Router();
router.use(requireAuth);

// Quiz generation (requires AI)
router.post("/generate", requireAI, aiRateLimit, generateQuiz);

// Submit and analyze
router.post("/submit", submitQuizAttempt);
router.post("/attempt/:id/analyze", requireAI, aiRateLimit, analyzeQuizAttempt);

// History
router.get("/my-attempts", getMyAttempts);
router.get("/attempt/:id", getAttemptById);
router.get("/subjects", getMySubjects);

export default router;
