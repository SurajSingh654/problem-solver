// ============================================================================
// ProbSolver v3.0 — Authentication Middleware
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Token-only auth: The JWT contains everything needed for access
//    control decisions. We do NOT query the database on every request
//    to verify the user still exists — that would add ~5ms latency
//    to every API call. Instead, we trust the token until it expires.
//    If a user is deleted/banned, their token naturally expires. [2]
//    For immediate revocation (future), add a token blacklist in Redis.
//
// 2. req.user shape: After this middleware runs, `req.user` contains:
//    { id, globalRole, currentTeamId, teamRole }
//    Every downstream handler and middleware can rely on this shape.
//
// 3. Activity tracking: On every authenticated request, we update
//    the user's lastActiveAt in the background (fire-and-forget).
//    This is non-blocking — we don't await it and don't fail the
//    request if it errors. This powers the ACTIVE/INACTIVE/DORMANT
//    activity status without any cron jobs.
//
// 4. Soft-deleted users: Since the Prisma middleware auto-filters
//    soft-deleted users, the background activity update will silently
//    fail for deleted users (user not found). Their token will expire
//    naturally. No explicit check needed here.
//
// ============================================================================

import { verifyToken } from "../lib/jwt.js";
import prisma from "../lib/prisma.js";

/**
 * Core authentication middleware.
 *
 * Extracts and verifies the JWT from the Authorization header.
 * Attaches decoded user context to `req.user`.
 * Updates lastActiveAt in the background.
 *
 * Usage: router.get('/endpoint', authenticate, handler)
 */
export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Authentication required. Please log in.",
          code: "AUTH_REQUIRED",
        },
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Authentication token missing.",
          code: "TOKEN_MISSING",
        },
      });
    }

    const decoded = verifyToken(token);

    req.user = {
      id: decoded.id,
      globalRole: decoded.globalRole,
      currentTeamId: decoded.currentTeamId,
      teamRole: decoded.teamRole,
    };

    updateActivity(decoded.id).catch(() => {});

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: {
          message: "Session expired. Please log in again.",
          code: "TOKEN_EXPIRED",
        },
      });
    }

    if (err.name === "TokenVersionError") {
      return res.status(401).json({
        success: false,
        error: {
          message: "Session outdated. Please log in again.",
          code: "TOKEN_OUTDATED",
        },
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: {
          message: "Invalid authentication token.",
          code: "TOKEN_INVALID",
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: "Authentication failed.", code: "AUTH_ERROR" },
    });
  }
}

/**
 * Optional authentication — attaches user if token present,
 * but doesn't fail if missing. Useful for public endpoints
 * that behave differently for logged-in users.
 *
 * Usage: router.get('/public', optionalAuth, handler)
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    req.user = {
      id: decoded.id,
      globalRole: decoded.globalRole,
      currentTeamId: decoded.currentTeamId,
      teamRole: decoded.teamRole,
    };

    updateActivity(decoded.id).catch(() => {});
  } catch {
    req.user = null;
  }

  next();
}

/**
 * Middleware: require that the user has completed onboarding.
 * Must run AFTER authenticate.
 *
 * Users who haven't completed onboarding can only access
 * the onboarding endpoints and auth routes.
 *
 * Usage: router.get('/endpoint', authenticate, requireOnboarding, handler)
 */
export function requireOnboarding(req, res, next) {
  if (req.user.globalRole === "SUPER_ADMIN") {
    return next();
  }

  prisma.user
    .findUnique({
      where: { id: req.user.id },
      select: { onboardingComplete: true },
    })
    .then((user) => {
      if (!user) {
        return res.status(401).json({
          success: false,
          error: { message: "User not found.", code: "USER_NOT_FOUND" },
        });
      }

      if (!user.onboardingComplete) {
        return res.status(403).json({
          success: false,
          error: {
            message: "Please complete onboarding first.",
            code: "ONBOARDING_REQUIRED",
          },
        });
      }

      next();
    })
    .catch(() => {
      return res.status(500).json({
        success: false,
        error: {
          message: "Failed to verify onboarding status.",
          code: "INTERNAL_ERROR",
        },
      });
    });
}

/**
 * Middleware: require the user to change their temporary password.
 * Must run AFTER authenticate.
 *
 * Usage: router.get('/endpoint', authenticate, requirePasswordChanged, handler)
 */
export function requirePasswordChanged(req, res, next) {
  prisma.user
    .findUnique({
      where: { id: req.user.id },
      select: { mustChangePassword: true },
    })
    .then((user) => {
      if (!user) {
        return res.status(401).json({
          success: false,
          error: { message: "User not found.", code: "USER_NOT_FOUND" },
        });
      }

      if (user.mustChangePassword) {
        return res.status(403).json({
          success: false,
          error: {
            message: "You must change your password before continuing.",
            code: "PASSWORD_CHANGE_REQUIRED",
          },
        });
      }

      next();
    })
    .catch(() => {
      return res.status(500).json({
        success: false,
        error: {
          message: "Failed to verify password status.",
          code: "INTERNAL_ERROR",
        },
      });
    });
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Update user's lastActiveAt and recompute activityStatus.
 *
 * Called on every authenticated request (fire-and-forget).
 * Uses a 5-minute debounce to avoid hammering the DB:
 * if lastActiveAt was updated <5 min ago, skip the write.
 *
 * @param {string} userId
 */
const ACTIVITY_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

async function updateActivity(userId) {
  // ── Debounce check: fetch current lastActiveAt ─────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActiveAt: true },
  });

  if (!user) return;

  const now = new Date();
  const lastActive = user.lastActiveAt;

  // Skip if updated less than 5 minutes ago
  if (lastActive && now - lastActive < ACTIVITY_DEBOUNCE_MS) {
    return;
  }

  // ── Update lastActiveAt + recompute status ─────────────
  // ACTIVE: activity within last 14 days
  // INACTIVE: no activity for 14-60 days
  // DORMANT: no activity for 60+ days
  //
  // Since we're updating NOW, the status is always ACTIVE here.
  // The INACTIVE/DORMANT transitions happen when this function
  // DOESN'T run (user stops making requests). A periodic job
  // or on-next-login check handles the downgrade.
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastActiveAt: now,
      activityStatus: "ACTIVE",
    },
  });
}
