import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { optionalTeamContext } from '../middleware/team.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { generateQuiz, submitQuizAnswers, getQuizHistory, getQuiz } from '../controllers/quiz.controller.js'

const router = Router()
router.use(authenticate, optionalTeamContext)

router.post('/generate', generateQuiz)
router.post('/:quizId/submit', submitQuizAnswers)
router.get('/history', getQuizHistory)
router.get('/:quizId', getQuiz)

export default router