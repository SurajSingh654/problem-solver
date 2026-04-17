/**
 * AI ROUTES
 */
import { Router } from "express";
import {
  reviewSolution,
  generateProblemContent,
  generateHint,
  generateWeeklyPlan,
  getAIStatus,
} from "../controllers/ai.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAI, aiRateLimit } from "../middleware/ai.middleware.js";

const router = Router();

// All AI routes require auth
router.use(requireAuth);

// Status endpoint — no AI required (tells frontend if AI is available)
router.get("/status", getAIStatus);

// AI endpoints — require AI enabled + rate limiting
router.post("/review-solution", requireAI, aiRateLimit, reviewSolution);
router.post(
  "/generate-problem-content",
  requireAI,
  aiRateLimit,
  generateProblemContent,
);
router.post("/generate-hint", requireAI, aiRateLimit, generateHint);
router.post("/weekly-plan", requireAI, aiRateLimit, generateWeeklyPlan);

export default router;
