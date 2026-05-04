import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireSuperAdmin } from '../middleware/superAdmin.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { optionalTeamContext } from '../middleware/team.middleware.js'
import {
    submitFeedback,
    listFeedback,
    updateFeedbackStatus,
    getFeedback,
    getSimilarReports,
} from '../controllers/feedback.controller.js'
import {
    createFeedbackSchema,
    updateFeedbackStatusSchema,
} from '../schemas/feedback.schema.js'

const router = Router()

router.use(authenticate)

// Similar reports — called as user types, before submission
router.get(
    '/similar',
    optionalTeamContext,
    getSimilarReports
)

// Submit feedback — works in team and individual mode
router.post(
    '/',
    optionalTeamContext,
    validate(createFeedbackSchema),
    submitFeedback
)

// List feedback — role-scoped server-side
router.get(
    '/',
    optionalTeamContext,
    listFeedback
)

// Get single report
router.get('/:feedbackId', getFeedback)

// Update status — SUPER_ADMIN only
router.patch(
    '/:feedbackId/status',
    requireSuperAdmin,
    validate(updateFeedbackStatusSchema),
    updateFeedbackStatus
)

export default router