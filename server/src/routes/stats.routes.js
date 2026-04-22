import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireSuperAdmin } from '../middleware/superAdmin.middleware.js'
import { requireTeamContext } from '../middleware/team.middleware.js'
import {
  getPersonalStats,
  getLeaderboard,
  get6DReport,
  getPlatformStats,
  getShowcaseStats,
} from '../controllers/stats.controller.js'

const router = Router()
router.use(authenticate)

router.get('/personal', requireTeamContext, getPersonalStats)
router.get('/leaderboard', requireTeamContext, getLeaderboard)
router.get('/report', requireTeamContext, get6DReport)
router.get('/showcase', requireTeamContext, getShowcaseStats)
router.get('/platform', requireSuperAdmin, getPlatformStats)

export default router