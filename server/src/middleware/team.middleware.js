// ============================================================================
// ProbSolver v3.0 — Team Context Middleware
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Team context from JWT: The user's currentTeamId and teamRole
//    are embedded in the JWT token. This means team-scoped endpoints
//    don't need an extra DB query to determine team membership.
//    When a user switches teams, the frontend requests a new token.
//
// 2. req.teamId convention: After requireTeamContext runs,
//    `req.teamId` is guaranteed to be a valid, non-null team ID.
//    Every downstream controller uses req.teamId for scoped queries.
//    This eliminates the class of bugs where a developer forgets
//    to add the team filter — if they use req.teamId, it's there.
//
// 3. SUPER_ADMIN bypass: Platform admins can optionally pass a
//    `teamId` query parameter to operate on any team. This is
//    essential for admin tools (viewing a specific team's data,
//    approving content, debugging). Regular users cannot override
//    their team context — the JWT is the source of truth.
//
// 4. Team status validation: requireTeamContext verifies the team
//    is in ACTIVE status. This prevents users from accessing data
//    in PENDING or REJECTED teams. The DB query here is acceptable
//    because team-scoped endpoints are the critical path and team
//    status can change (unlike globalRole which rarely changes).
//
// 5. Personal team handling: Individual-mode users have a personal
//    team (isPersonal: true). The middleware treats personal teams
//    the same as regular teams — uniform query patterns everywhere.
//    The only difference is UI-level: the frontend shows "My Practice"
//    instead of a team name.
//
// ============================================================================

import prisma from '../lib/prisma.js'

/**
 * Require an active team context.
 *
 * After this middleware runs, `req.teamId` is guaranteed to be set
 * to a valid, ACTIVE team ID. Every team-scoped controller should
 * use `req.teamId` for all database queries.
 *
 * SUPER_ADMIN can pass `?teamId=xxx` to operate on any team.
 * Regular users use the team from their JWT.
 *
 * Must be used AFTER authenticate middleware.
 *
 * Usage: router.get('/problems', authenticate, requireTeamContext, handler)
 */
export async function requireTeamContext(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      })
    }

    // ── SUPER_ADMIN team override ────────────────────────
    // Platform admins can pass ?teamId=xxx to view any team's data.
    // This powers the admin dashboard's "browse teams" feature.
    if (req.user.globalRole === 'SUPER_ADMIN') {
      const overrideTeamId = req.query.teamId || req.headers['x-team-id']

      if (overrideTeamId) {
        const team = await prisma.team.findUnique({
          where: { id: overrideTeamId },
          select: { id: true, status: true },
        })

        if (!team) {
          return res.status(404).json({
            success: false,
            error: 'Team not found.',
          })
        }

        req.teamId = team.id
        req.teamStatus = team.status
        return next()
      }

      // SUPER_ADMIN without team override — they may not have a team
      // Allow through without team context for platform-wide endpoints
      // Controllers that need team context will check req.teamId
      req.teamId = req.user.currentTeamId || null
      return next()
    }

    // ── Regular user: team from JWT ──────────────────────
    const teamId = req.user.currentTeamId

    if (!teamId) {
      return res.status(403).json({
        success: false,
        error: 'No team selected. Please join a team or switch to individual mode.',
        code: 'NO_TEAM_CONTEXT',
      })
    }

    // ── Verify team is active ────────────────────────────
    // This DB check catches: team was rejected/deleted after the
    // JWT was issued, or team status changed since last login.
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, status: true, isPersonal: true },
    })

    if (!team) {
      return res.status(403).json({
        success: false,
        error: 'Your team no longer exists. Please join another team.',
        code: 'TEAM_NOT_FOUND',
      })
    }

    if (team.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'Your team is not active. It may be pending approval or has been deactivated.',
        code: 'TEAM_NOT_ACTIVE',
      })
    }

    req.teamId = team.id
    req.teamStatus = team.status
    req.isPersonalTeam = team.isPersonal

    next()
  } catch (err) {
    console.error('Team context middleware error:', err)
    return res.status(500).json({
      success: false,
      error: 'Failed to verify team context.',
    })
  }
}

/**
 * Require TEAM_ADMIN role within the current team.
 *
 * Gates team management operations:
 * - Creating/editing/deleting problems
 * - Managing team members (invite, remove, promote)
 * - Configuring AI problem generation
 * - Viewing team analytics
 *
 * SUPER_ADMIN always passes (they can admin any team).
 *
 * Must be used AFTER authenticate AND requireTeamContext.
 *
 * Usage:
 *   router.post('/problems',
 *     authenticate,
 *     requireTeamContext,
 *     requireTeamAdmin,
 *     handler
 *   )
 */
export function requireTeamAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    })
  }

  // SUPER_ADMIN can admin any team
  if (req.user.globalRole === 'SUPER_ADMIN') {
    return next()
  }

  if (req.user.teamRole !== 'TEAM_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'This action requires team administrator access.',
      code: 'TEAM_ADMIN_REQUIRED',
    })
  }

  next()
}

/**
 * Require that the user is a member of a SPECIFIC team.
 *
 * Unlike requireTeamContext (which checks the user's CURRENT team),
 * this verifies membership in a team specified by :teamId param.
 *
 * Use case: accessing a team's public profile or join page where
 * the target team differs from the user's current team.
 *
 * SUPER_ADMIN always passes.
 *
 * Must be used AFTER authenticate.
 *
 * Usage:
 *   router.get('/teams/:teamId/members',
 *     authenticate,
 *     requireTeamMember,
 *     handler
 *   )
 */
export async function requireTeamMember(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      })
    }

    // SUPER_ADMIN can access any team
    if (req.user.globalRole === 'SUPER_ADMIN') {
      req.teamId = req.params.teamId
      return next()
    }

    const targetTeamId = req.params.teamId

    if (!targetTeamId) {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required.',
      })
    }

    // Check if the user's current team matches the target
    if (req.user.currentTeamId !== targetTeamId) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this team.',
        code: 'NOT_TEAM_MEMBER',
      })
    }

    // Verify the team exists and is active
    const team = await prisma.team.findUnique({
      where: { id: targetTeamId },
      select: { id: true, status: true },
    })

    if (!team || team.status !== 'ACTIVE') {
      return res.status(404).json({
        success: false,
        error: 'Team not found or not active.',
      })
    }

    req.teamId = team.id
    next()
  } catch (err) {
    console.error('Team member middleware error:', err)
    return res.status(500).json({
      success: false,
      error: 'Failed to verify team membership.',
    })
  }
}

/**
 * Attach team context if available, but don't require it.
 *
 * For endpoints that work in both team and individual mode
 * (e.g., quizzes, mock interviews). If the user has a team,
 * req.teamId is set. If not, req.teamId is null.
 *
 * Must be used AFTER authenticate.
 *
 * Usage:
 *   router.post('/quizzes',
 *     authenticate,
 *     optionalTeamContext,
 *     handler
 *   )
 */
export async function optionalTeamContext(req, res, next) {
  if (!req.user) {
    req.teamId = null
    return next()
  }

  const teamId = req.user.currentTeamId

  if (!teamId) {
    req.teamId = null
    req.isPersonalTeam = false
    return next()
  }

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, status: true, isPersonal: true },
    })

    if (team && team.status === 'ACTIVE') {
      req.teamId = team.id
      req.isPersonalTeam = team.isPersonal
    } else {
      req.teamId = null
      req.isPersonalTeam = false
    }
  } catch {
    req.teamId = null
    req.isPersonalTeam = false
  }

  next()
}