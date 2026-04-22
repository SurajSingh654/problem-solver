// ============================================================================
// ProbSolver v3.0 — Admin Routes
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAnyAdmin } from "../middleware/superAdmin.middleware.js";
import {
  getProductHealth,
  analyzeProductHealth,
} from "../controllers/analytics.controller.js";

const router = Router();

router.use(authenticate);

router.get("/product-health", requireAnyAdmin, getProductHealth);
router.post("/product-health/analyze", requireAnyAdmin, analyzeProductHealth);

export default router;
