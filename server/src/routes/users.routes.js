import { Router }      from 'express'
import {
  getUsers,
  getUserByUsername,
} from '../controllers/users.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'

const router = Router()

router.use(requireAuth)

router.get('/',            getUsers)
router.get('/:username',   getUserByUsername)

export default router