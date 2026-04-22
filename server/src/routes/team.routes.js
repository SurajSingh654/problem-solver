// ============================================================================
// ProbSolver v3.0 — Team Routes
// ============================================================================
//
// ROUTE DESIGN:
//
// Team member routes (authenticated + team context):
//   GET  /teams/current          — Get current team details
//   GET  /teams/current/members  — List team members
//   POST /teams/join             — Join by code
//   POST /teams/leave            — Leave current team
//
// Team admin routes (TEAM_ADMIN):
//   PUT    /teams/current            — Update team settings
//   POST   /teams/current/invite     — Invite members by email
//   PUT    /teams/current/members/:memberId/role — Change member role
//   DELETE /teams/current/members/:memberId      — Remove member
//   POST   /teams/current/regenerate-code        — Regenerate join code
//
// Team creation (any authenticated user):
//   POST /teams — Create new team (goes to PENDING)
//
// Super admin routes:
//   GET  /teams/pending        — List pending teams
//   GET  /teams/all            — List all teams (paginated)
//   POST /teams/:teamId/review — Approve or reject a team
//
// ============================================================================

import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { requireSuperAdmin } from '../middleware/superAdmin.middleware.js'
import { requireTeamContext, requireTeamAdmin } from '../middleware/team.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import {
  createTeamSchema,
  updateTeamSchema,
  joinTeamSchema,
  inviteMembersSchema,
  approveTeamSchema,
  changeMemberRoleSchema,
} from '../schemas/team.schema.js'
import {
  createTeam,
  reviewTeam,
  joinTeam,
  leaveTeam,
  inviteMembers,
  getTeam,
  getTeamMembers,
  changeMemberRole,
  removeMember,
  regenerateJoinCode,
  listPendingTeams,
  listAllTeams,
  updateTeam,
} from '../controllers/team.controller.js'

const router = Router()

// ── All routes require authentication ────────────────────────
router.use(authenticate)

// ============================================================================
// TEAM CREATION (any user)
// ============================================================================

router.post(
  '/',
  validate(createTeamSchema),
  createTeam
)

// ============================================================================
// JOIN / LEAVE (any user)
// ============================================================================

router.post(
  '/join',
  validate(joinTeamSchema),
  joinTeam
)

router.post(
  '/leave',
  requireTeamContext,
  leaveTeam
)

// ============================================================================
// CURRENT TEAM — member operations
// ============================================================================

router.get(
  '/current',
  requireTeamContext,
  getTeam
)

router.get(
  '/current/members',
  requireTeamContext,
  getTeamMembers
)

// ============================================================================
// CURRENT TEAM — admin operations
// ============================================================================

router.put(
  '/current',
  requireTeamContext,
  requireTeamAdmin,
  validate(updateTeamSchema),
  updateTeam
)

router.post(
  '/current/invite',
  requireTeamContext,
  requireTeamAdmin,
  validate(inviteMembersSchema),
  inviteMembers
)

router.put(
  '/current/members/:memberId/role',
  requireTeamContext,
  requireTeamAdmin,
  validate(changeMemberRoleSchema),
  changeMemberRole
)

router.delete(
  '/current/members/:memberId',
  requireTeamContext,
  requireTeamAdmin,
  removeMember
)

router.post(
  '/current/regenerate-code',
  requireTeamContext,
  requireTeamAdmin,
  regenerateJoinCode
)

// ============================================================================
// SUPER ADMIN — platform-level team management
// ============================================================================

router.get(
  '/pending',
  requireSuperAdmin,
  listPendingTeams
)

router.get(
  '/all',
  requireSuperAdmin,
  listAllTeams
)

router.post(
  '/:teamId/review',
  requireSuperAdmin,
  validate(approveTeamSchema),
  reviewTeam
)

export default router