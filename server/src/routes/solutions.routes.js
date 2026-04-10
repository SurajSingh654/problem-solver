import { Router } from "express";
import {
  getMySolutions,
  getSolutionsForProblem,
  createSolution,
  updateSolution,
  deleteSolution,
  rateSolutionClarity,
  reviewSolution,
} from "../controllers/solutions.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createSolutionSchema,
  updateSolutionSchema,
  clarityRatingSchema,
} from "../schemas/solution.schema.js";

const router = Router();

router.use(requireAuth);

// ── Routes ────────────────────────────────────────────
router.get("/", getMySolutions);
router.get("/problem/:problemId", getSolutionsForProblem);
router.post("/", validate(createSolutionSchema), createSolution);
router.put("/:id", validate(updateSolutionSchema), updateSolution);
router.delete("/:id", deleteSolution);
router.post("/:id/clarity", validate(clarityRatingSchema), rateSolutionClarity);
router.post("/:id/review", reviewSolution);

export default router;
