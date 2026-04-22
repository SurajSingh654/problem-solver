// ============================================================================
// ProbSolver v3.0 — Super Admin Middleware
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Separation from auth: Authentication (who are you?) is handled
//    by auth.middleware.js. This file handles authorization (are you
//    allowed to do this?). Keeping them separate follows the single
//    responsibility principle and makes route definitions readable:
//    router.post('/approve', authenticate, requireSuperAdmin, handler)
//
// 2. JWT-only check: globalRole is embedded in the JWT at login time.
//    We don't query the database here — if someone was demoted from
//    SUPER_ADMIN, their old token still works until it expires. This
//    is an acceptable tradeoff for a 7-day token in an internal tool.
//    For higher security, add a database check or use shorter tokens.
//
// 3. Clear error messages: Each middleware returns a specific error
//    with an HTTP 403 (Forbidden, not 401 Unauthorized). 401 means
//    "not authenticated" — 403 means "authenticated but not allowed."
//    This distinction matters for the frontend to show the right UI
//    (redirect to login vs show "access denied" page).
//
// ============================================================================

/**
 * Require SUPER_ADMIN global role.
 *
 * Gates platform-level operations:
 * - Approving/rejecting team creation requests
 * - Platform-wide analytics and health metrics
 * - Managing global settings
 * - Future: creating competitions
 *
 * Must be used AFTER authenticate middleware.
 *
 * Usage: router.post('/teams/approve', authenticate, requireSuperAdmin, handler)
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    })
  }

  if (req.user.globalRole !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'This action requires platform administrator access.',
      code: 'SUPER_ADMIN_REQUIRED',
    })
  }

  next()
}

/**
 * Require either SUPER_ADMIN or TEAM_ADMIN role.
 *
 * Gates operations that both platform admins and team admins
 * can perform (e.g., viewing analytics, managing content).
 * SUPER_ADMIN can do anything across all teams.
 * TEAM_ADMIN can only operate within their own team.
 *
 * Must be used AFTER authenticate middleware.
 *
 * Usage: router.get('/analytics', authenticate, requireAnyAdmin, handler)
 */
export function requireAnyAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    })
  }

  const isSuperAdmin = req.user.globalRole === 'SUPER_ADMIN'
  const isTeamAdmin = req.user.teamRole === 'TEAM_ADMIN'

  if (!isSuperAdmin && !isTeamAdmin) {
    return res.status(403).json({
      success: false,
      error: 'This action requires administrator access.',
      code: 'ADMIN_REQUIRED',
    })
  }

  next()
}