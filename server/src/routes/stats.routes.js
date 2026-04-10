import { Router }      from 'express'
import {
  getMyStats,
  getTeamStats,
  getLeaderboard,
} from '../controllers/stats.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireAuth)

router.get('/me',          getMyStats)
router.get('/team',        getTeamStats)
router.get('/leaderboard', getLeaderboard)

export default router