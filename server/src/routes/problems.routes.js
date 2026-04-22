import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireTeamContext, requireTeamAdmin } from '../middleware/team.middleware.js'
import {
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  toggleProblemFlag,
} from '../controllers/problems.controller.js'

const router = Router()
router.use(authenticate)

// ── Member operations ────────────────────────────────────────
router.get('/', requireTeamContext, listProblems)
router.get('/:problemId', requireTeamContext, getProblem)

// ── Admin operations ─────────────────────────────────────────
router.post('/', requireTeamContext, requireTeamAdmin, createProblem)
router.put('/:problemId', requireTeamContext, requireTeamAdmin, updateProblem)
router.delete('/:problemId', requireTeamContext, requireTeamAdmin, deleteProblem)
router.patch('/:problemId/flag', requireTeamContext, requireTeamAdmin, toggleProblemFlag)

export default router