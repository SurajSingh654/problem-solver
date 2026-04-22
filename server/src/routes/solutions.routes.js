import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireTeamContext } from '../middleware/team.middleware.js'
import {
  submitSolution,
  getProblemSolutions,
  getUserSolutions,
  updateSolution,
  rateSolutionClarity,
  getReviewQueue,
} from '../controllers/solutions.controller.js'

const router = Router()
router.use(authenticate, requireTeamContext)

router.post('/:problemId', submitSolution)
router.get('/problem/:problemId', getProblemSolutions)
router.get('/user/:userId?', getUserSolutions)
router.put('/:solutionId', updateSolution)
router.post('/:solutionId/rate', rateSolutionClarity)
router.get('/review/queue', getReviewQueue)

export default router