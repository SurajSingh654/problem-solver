import { Router } from "express";
import {
  getProductHealth,
  analyzeProductHealth,
} from "../controllers/analytics.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { requireAI, aiRateLimit } from "../middleware/ai.middleware.js";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get("/product-health", getProductHealth);
router.post(
  "/product-health/analyze",
  requireAI,
  aiRateLimit,
  analyzeProductHealth,
);

export default router;
