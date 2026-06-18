import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireTeamContext, requireTeamAdmin } from '../middleware/team.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import {
  createProblemSchema,
  updateProblemSchema,
  batchCreateProblemsSchema,
  toggleProblemFlagSchema,
  canonicalPatchSchema,
} from '../schemas/problem.schema.js'
import {
  listProblems,
  getProblem,
  getCanonical,
  patchCanonical,
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
// Admin override — auth gate enforced inside handler (SUPER_ADMIN check).
// Registered before /:problemId for the same reason as GET above.
router.patch('/:id/canonical', requireTeamContext, validate(canonicalPatchSchema), patchCanonical)
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
