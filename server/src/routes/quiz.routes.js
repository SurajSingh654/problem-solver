import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { optionalTeamContext } from "../middleware/team.middleware.js";
import {
  generateQuiz,
  submitQuizAnswers,
  getQuizAnalysis,
  saveQuizFeedback,
  getQuizHistory,
  getQuiz,
} from "../controllers/quiz.controller.js";

const router = Router();
router.use(authenticate, optionalTeamContext);

router.post("/generate", generateQuiz);
router.post("/:quizId/submit", submitQuizAnswers);
router.get("/:quizId/analysis", getQuizAnalysis); // Bug 3 fix
router.post("/:quizId/feedback", saveQuizFeedback); // Bug 4 fix
router.get("/history", getQuizHistory);
router.get("/:quizId", getQuiz);

export default router;
