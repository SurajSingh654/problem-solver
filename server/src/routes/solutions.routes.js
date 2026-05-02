import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import {
  submitSolution,
  getProblemSolutions,
  getUserSolutions,
  updateSolution,
  rateSolutionClarity,
  getReviewQueue,
  submitReview,
} from "../controllers/solutions.controller.js";

const router = Router();
router.use(authenticate, requireTeamContext);

router.post("/:problemId", submitSolution);
router.get("/problem/:problemId", getProblemSolutions);
router.get("/user/:userId?", getUserSolutions);
router.put("/:solutionId", updateSolution);
router.post("/:solutionId/rate", rateSolutionClarity);
// SM-2 review submission — separate from content updates
router.post("/:solutionId/review", submitReview);
router.get("/review/queue", getReviewQueue);

export default router;
