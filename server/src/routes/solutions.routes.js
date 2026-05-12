import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createSolutionSchema,
  updateSolutionSchema,
  submitReviewSchema,
  rateSolutionClaritySchema,
} from "../schemas/solution.schema.js";
import {
  submitSolution,
  getProblemSolutions,
  getUserSolutions,
  updateSolution,
  rateSolutionClarity,
  getReviewQueue,
  submitReview,
  getSolutionAttempts,
} from "../controllers/solutions.controller.js";

const router = Router();
router.use(authenticate, requireTeamContext);

router.post("/:problemId", validate(createSolutionSchema), submitSolution);
router.get("/problem/:problemId", getProblemSolutions);
router.get("/user/:userId?", getUserSolutions);
router.put("/:solutionId", validate(updateSolutionSchema), updateSolution);
router.post(
  "/:solutionId/rate",
  validate(rateSolutionClaritySchema),
  rateSolutionClarity,
);
// SM-2 review submission — separate from content updates
router.post(
  "/:solutionId/review",
  validate(submitReviewSchema),
  submitReview,
);
router.get("/review/queue", getReviewQueue);
// Per-attempt snapshot history for a solution
router.get("/:solutionId/attempts", getSolutionAttempts);

export default router;
