import { Router }      from 'express'
import {
  getUsers,
  getUserByUsername,
  deleteUser,
  updateUserRole,
} from '../controllers/users.controller.js'
import { requireAuth }  from '../middleware/auth.middleware.js'
import { requireAdmin } from '../middleware/admin.middleware.js'


const router = Router()
router.use(requireAuth)

router.get('/',                    getUsers)
router.get('/:username',           getUserByUsername)
router.delete('/:id',              requireAdmin, deleteUser)
router.patch('/:id/role',          requireAdmin, updateUserRole)

export default router