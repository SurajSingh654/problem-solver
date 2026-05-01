import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { optionalTeamContext } from "../middleware/team.middleware.js";
import {
  generateQuiz,
  submitQuizAnswers,
  saveQuizFeedback,
  getQuizHistory,
  getQuiz,
} from "../controllers/quiz.controller.js";

const router = Router();
router.use(authenticate, optionalTeamContext);

// Specific routes before parameterized routes
router.post("/generate", generateQuiz);
router.get("/history", getQuizHistory);

// Parameterized routes last
router.post("/:quizId/submit", submitQuizAnswers);
router.post("/:quizId/feedback", saveQuizFeedback);
router.get("/:quizId", getQuiz);

export default router;
