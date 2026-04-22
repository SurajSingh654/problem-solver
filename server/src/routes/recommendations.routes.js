import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireTeamContext } from '../middleware/team.middleware.js'
import { getRecommendations } from '../controllers/recommendations.controller.js'

const router = Router()
router.use(authenticate, requireTeamContext)

router.get('/', getRecommendations)

export default router