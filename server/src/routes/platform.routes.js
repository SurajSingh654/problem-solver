// ============================================================================
// ProbSolver v3.0 — Platform Analytics Routes (SUPER_ADMIN only)
// ============================================================================
import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireSuperAdmin } from '../middleware/superAdmin.middleware.js'
import {
  getPlatformHealth,
  analyzePlatformHealth,
  getLatestAnalysis,
} from '../controllers/platform.controller.js'

const router = Router()

router.use(authenticate)
router.use(requireSuperAdmin)

router.get('/health', getPlatformHealth)
router.post('/health/analyze', analyzePlatformHealth)
router.get('/health/analysis', getLatestAnalysis)

export default router