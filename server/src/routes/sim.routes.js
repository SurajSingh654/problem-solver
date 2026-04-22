import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireTeamContext } from '../middleware/team.middleware.js'
import { startSim, completeSim, abandonSim, getSimHistory } from '../controllers/sim.controller.js'

const router = Router()
router.use(authenticate, requireTeamContext)

router.post('/start', startSim)
router.post('/:sessionId/complete', completeSim)
router.post('/:sessionId/abandon', abandonSim)
router.get('/history', getSimHistory)

export default router