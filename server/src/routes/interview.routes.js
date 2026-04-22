import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { optionalTeamContext } from '../middleware/team.middleware.js'
import {
  startInterview,
  getInterview,
  endInterview,
  getInterviewHistory,
  getDebrief,
} from '../controllers/interview.controller.js'

const router = Router()
router.use(authenticate, optionalTeamContext)

router.post('/start', startInterview)
router.get('/:sessionId', getInterview)
router.post('/:sessionId/end', endInterview)
router.get('/history/list', getInterviewHistory)
router.get('/:sessionId/debrief', getDebrief)

export default router