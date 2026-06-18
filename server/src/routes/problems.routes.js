import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireTeamContext, requireTeamAdmin } from '../middleware/team.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import {
  createProblemSchema,
  updateProblemSchema,
  batchCreateProblemsSchema,
  toggleProblemFlagSchema,
} from '../schemas/problem.schema.js'
import {
  listProblems,
  getProblem,
  getCanonical,
  createProblem,
  batchCreateProblems,
  updateProblem,
  deleteProblem,
  toggleProblemFlag,
} from '../controllers/problems.controller.js'

const router = Router()
router.use(authenticate)

// ── Member operations ────────────────────────────────────────
router.get('/', requireTeamContext, listProblems)
// Registered before /:problemId to prevent Express matching "canonical"
// as a problemId param.
router.get('/:id/canonical', requireTeamContext, getCanonical)
router.get('/:problemId', requireTeamContext, getProblem)

// ── Admin operations ─────────────────────────────────────────
router.post(
  '/',
  requireTeamContext,
  requireTeamAdmin,
  validate(createProblemSchema),
  createProblem,
)

// Batch create — registered BEFORE /:problemId to prevent Express
// from matching the literal string "batch" as a problemId param
router.post(
  '/batch',
  requireTeamContext,
  requireTeamAdmin,
  validate(batchCreateProblemsSchema),
  batchCreateProblems,
)

router.put(
  '/:problemId',
  requireTeamContext,
  requireTeamAdmin,
  validate(updateProblemSchema),
  updateProblem,
)
router.delete('/:problemId', requireTeamContext, requireTeamAdmin, deleteProblem)
router.patch(
  '/:problemId/flag',
  requireTeamContext,
  requireTeamAdmin,
  validate(toggleProblemFlagSchema),
  toggleProblemFlag,
)

export default router
