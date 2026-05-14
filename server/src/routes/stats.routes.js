import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/superAdmin.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import {
  getPersonalStats,
  getLeaderboard,
  get6DReport,
  getPlatformStats,
  getShowcaseStats,
  getTeamActivity,
  generateReadinessVerdict,
} from "../controllers/stats.controller.js";
import { getUserSkillProfile } from '../services/skillComputation.service.js'
import { success, error } from "../utils/response.js";

const router = Router();

router.use(authenticate);

router.get("/personal", requireTeamContext, getPersonalStats);
router.get("/leaderboard", requireTeamContext, getLeaderboard);
router.get("/report", requireTeamContext, get6DReport);
router.get("/showcase", requireTeamContext, getShowcaseStats);
router.get("/platform", requireSuperAdmin, getPlatformStats);
// NEW: Team activity feed for dashboard
router.get("/activity", requireTeamContext, getTeamActivity);
// NEW: AI-generated readiness verdict (cached 5 min via VerdictLog).
// ai.service.js enforces the per-user daily AI quota, and the cache
// collapses repeat calls on the same evidence — so the default
// apiLimiter that wraps /stats routes is sufficient protection here.
router.get("/verdict", requireTeamContext, generateReadinessVerdict);
router.get('/skills', requireTeamContext, async (req, res) => {
    try {
        const profiles = await getUserSkillProfile(req.user.id)
        return success(res, { skills: profiles })
    } catch (err) {
        console.error('Get skill profile error:', err)
        return error(res, 'Failed to fetch skill profile.', 500)
    }
})

export default router;
