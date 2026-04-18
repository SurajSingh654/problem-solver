import { Router } from "express";
import {
  getMyStats,
  getTeamStats,
  getLeaderboard,
} from "../controllers/stats.controller.js";
import { getShowcaseStats } from "../controllers/showcase.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/me", getMyStats);
router.get("/team", getTeamStats);
router.get("/leaderboard", getLeaderboard);
router.get("/showcase", requireAdmin, getShowcaseStats); // Admin only

export default router;
