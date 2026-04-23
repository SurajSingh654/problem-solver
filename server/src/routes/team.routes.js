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
  getTeamDetails,
  deleteTeam,
} from '../controllers/team.controller.js'

const router = Router()

// ── All routes require authentication ────────────────────────
router.use(authenticate)

// ============================================================================
// TEAM CREATION (any user)
// ============================================================================

/**
 * @swagger
 * /teams:
 *   post:
 *     tags: [Teams]
 *     summary: Create a new team (goes to PENDING)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Google Prep Squad
 *               description:
 *                 type: string
 *               maxMembers:
 *                 type: integer
 *                 example: 20
 *     responses:
 *       201:
 *         description: Team created (pending approval)
 */
router.post('/', validate(createTeamSchema), createTeam)

// ============================================================================
// JOIN / LEAVE (any user)
// ============================================================================

/**
 * @swagger
 * /teams/join:
 *   post:
 *     tags: [Teams]
 *     summary: Join a team by code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [joinCode]
 *             properties:
 *               joinCode:
 *                 type: string
 *                 example: ABCD1234
 *     responses:
 *       200:
 *         description: Joined team, returns new token
 */
router.post('/join', validate(joinTeamSchema), joinTeam)

/**
 * @swagger
 * /teams/leave:
 *   post:
 *     tags: [Teams]
 *     summary: Leave current team
 *     responses:
 *       200:
 *         description: Left team, switched to personal space
 */
router.post('/leave', requireTeamContext, leaveTeam)

// ============================================================================
// CURRENT TEAM — member operations
// ============================================================================

/**
 * @swagger
 * /teams/current:
 *   get:
 *     tags: [Teams]
 *     summary: Get current team details
 *     responses:
 *       200:
 *         description: Team details with member count
 *   put:
 *     tags: [Teams]
 *     summary: Update team settings (TEAM_ADMIN)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               maxMembers:
 *                 type: integer
 *               aiProblemsEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Team updated
 */
router.get('/current', requireTeamContext, getTeam)

/**
 * @swagger
 * /teams/current/members:
 *   get:
 *     tags: [Teams]
 *     summary: List team members
 *     responses:
 *       200:
 *         description: Array of team members
 */
router.get('/current/members', requireTeamContext, getTeamMembers)

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

/**
 * @swagger
 * /teams/current/invite:
 *   post:
 *     tags: [Teams]
 *     summary: Invite members by email (TEAM_ADMIN)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emails]
 *             properties:
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["user1@example.com", "user2@example.com"]
 *     responses:
 *       200:
 *         description: Invitations sent
 */
router.post('/current/invite', requireTeamContext, requireTeamAdmin, validate(inviteMembersSchema), inviteMembers)

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

/**
 * @swagger
 * /teams/current/regenerate-code:
 *   post:
 *     tags: [Teams]
 *     summary: Regenerate join code (TEAM_ADMIN)
 *     responses:
 *       200:
 *         description: New join code generated
 */
router.post('/current/regenerate-code', requireTeamContext, requireTeamAdmin, regenerateJoinCode)

// ============================================================================
// SUPER ADMIN — platform-level team management
// ============================================================================

/**
 * @swagger
 * /teams/pending:
 *   get:
 *     tags: [Platform]
 *     summary: List pending teams (SUPER_ADMIN)
 *     responses:
 *       200:
 *         description: Array of pending teams
 */
router.get('/pending', requireSuperAdmin, listPendingTeams)

/**
 * @swagger
 * /teams/all:
 *   get:
 *     tags: [Platform]
 *     summary: List all teams (SUPER_ADMIN)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, REJECTED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated team list
 */
router.get('/all', requireSuperAdmin, listAllTeams)


/**
 * @swagger
 * /teams/{teamId}/details:
 *   get:
 *     tags: [Platform]
 *     summary: Get team details with members (SUPER_ADMIN)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team details with member list
 */
router.get('/:teamId/details', requireSuperAdmin, getTeamDetails)

/**
 * @swagger
 * /teams/{teamId}:
 *   delete:
 *     tags: [Platform]
 *     summary: Delete a team (SUPER_ADMIN)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Team deleted, members moved to individual mode
 */
router.delete('/:teamId', requireSuperAdmin, deleteTeam)

/**
 * @swagger
 * /teams/{teamId}/review:
 *   post:
 *     tags: [Platform]
 *     summary: Approve or reject a team (SUPER_ADMIN)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               rejectionReason:
 *                 type: string
 *                 description: Required if action=reject
 *     responses:
 *       200:
 *         description: Team approved/rejected
 */
router.post('/:teamId/review', requireSuperAdmin, validate(approveTeamSchema), reviewTeam)

export default router