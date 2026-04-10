import { Router } from "express";
import {
  getProblems,
  getProblemById,
  createProblem,
  updateProblem,
  deleteProblem,
} from "../controllers/problems.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createProblemSchema,
  updateProblemSchema,
  problemParamsSchema,
  problemQuerySchema,
} from "../schemas/problem.schema.js";

const router = Router();

// All problem routes require authentication
router.use(requireAuth);

// ── Public (any member) ───────────────────────────────
router.get("/", validate(problemQuerySchema), getProblems);
router.get("/:id", validate(problemParamsSchema), getProblemById);

// ── Admin only ────────────────────────────────────────
router.post("/", requireAdmin, validate(createProblemSchema), createProblem);
router.put("/:id", requireAdmin, validate(updateProblemSchema), updateProblem);
router.delete(
  "/:id",
  requireAdmin,
  validate(problemParamsSchema),
  deleteProblem,
);

export default router;
