// ============================================================================
// ProbSolver v3.0 — Users Routes
// ============================================================================
import { Router } from 'express'
import { authenticate } from '../middleware/auth.middleware.js'
import { optionalTeamContext } from '../middleware/team.middleware.js'
import { requireAnyAdmin } from '../middleware/superAdmin.middleware.js'
import {
  getUsers,
  getUserProfile,
  deleteUser,
  updateUserRole,
} from '../controllers/users.controller.js'
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} from '../controllers/mcpTokens.controller.js'

const router = Router()

// `optionalTeamContext` (not `requireTeamContext`) because SUPER_ADMIN calls
// `getUsers` from AllUsersPage without a team override — the SA sees every
// user across every team. For regular members, optionalTeamContext sets
// `req.teamId = null` if their team isn't ACTIVE, which the controllers
// treat as "no team access" (empty list / restricted profile). This closes
// the pre-existing team-status bypass where a user of a SUSPENDED team
// could still list team members using the raw JWT currentTeamId.
router.use(authenticate, optionalTeamContext)

// ── MCP token self-management (Phase MCP-4) ─────────────────
// Each user manages their own tokens — no admin override. Mounted BEFORE
// /:id routes so /me/mcp-tokens isn't shadowed by the /:id pattern.
router.post('/me/mcp-tokens', createMcpToken)
router.get('/me/mcp-tokens', listMcpTokens)
router.delete('/me/mcp-tokens/:jti', revokeMcpToken)

router.get('/', getUsers)
router.get('/:id', getUserProfile)
router.delete('/:id', requireAnyAdmin, deleteUser)
router.patch('/:id/role', requireAnyAdmin, updateUserRole)

export default router
