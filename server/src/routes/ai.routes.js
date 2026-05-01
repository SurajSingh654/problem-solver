import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  requireTeamContext,
  requireTeamAdmin,
} from "../middleware/team.middleware.js";
import {
  reviewSolution,
  getHint,
  getWeeklyPlan,
  generateProblemContent,
  findSimilarProblems,
  generateProblemsAI,
  generateReviewHints,
} from "../controllers/ai.controller.js";

const router = Router();
router.use(authenticate);

router.post("/review/:solutionId", requireTeamContext, reviewSolution);
router.post(
  "/review-hints/:solutionId",
  requireTeamContext,
  generateReviewHints,
);
router.post("/hint/:problemId", requireTeamContext, getHint);
router.get("/weekly-plan", requireTeamContext, getWeeklyPlan);
router.post(
  "/generate-content",
  requireTeamContext,
  requireTeamAdmin,
  generateProblemContent,
);
router.post(
  "/generate-problems",
  requireTeamContext,
  requireTeamAdmin,
  generateProblemsAI,
);
router.post("/similar", requireTeamContext, findSimilarProblems);

export default router;
