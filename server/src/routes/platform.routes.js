// ============================================================================
// ProbSolver v3.0 — Platform Analytics Routes (SUPER_ADMIN only)
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/superAdmin.middleware.js";
import {
  getPlatformHealth,
  analyzePlatformHealth,
  getLatestAnalysis,
} from "../controllers/platform.controller.js";
import { getVerdictAudit, getAIUsageStats } from "../controllers/stats.controller.js";

const router = Router();

router.use(authenticate);
router.use(requireSuperAdmin);

router.get("/health", getPlatformHealth);
router.post("/health/analyze", analyzePlatformHealth);
router.get("/health/analysis", getLatestAnalysis);

// Verdict audit viewer — paginated VerdictLog rows + 7-day fallback rate.
router.get("/verdicts", getVerdictAudit);

// AI usage telemetry — fallback rate per surface, p99 latency per surface,
// per-team token spend. Reads from UsageTracking populated by ai.usageWriter.
router.get("/ai-usage", getAIUsageStats);

export default router;
