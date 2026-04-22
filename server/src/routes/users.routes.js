// ============================================================================
// ProbSolver v3.0 — Users Routes
// ============================================================================
import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireAnyAdmin } from '../middleware/superAdmin.middleware.js'
import {
  getUsers,
  getUserProfile,
  deleteUser,
  updateUserRole,
} from '../controllers/users.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', getUsers)
router.get('/:id', getUserProfile)
router.delete('/:id', requireAnyAdmin, deleteUser)
router.patch('/:id/role', requireAnyAdmin, updateUserRole)

export default router
