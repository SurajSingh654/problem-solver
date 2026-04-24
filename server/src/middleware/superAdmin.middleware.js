// ============================================================================
// ProbSolver v3.0 — Super Admin Middleware
// ============================================================================

export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: "Authentication required.", code: "AUTH_REQUIRED" },
    });
  }

  if (req.user.globalRole !== "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      error: {
        message: "This action requires platform administrator access.",
        code: "SUPER_ADMIN_REQUIRED",
      },
    });
  }

  next();
}

export function requireAnyAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: "Authentication required.", code: "AUTH_REQUIRED" },
    });
  }

  const isSuperAdmin = req.user.globalRole === "SUPER_ADMIN";
  const isTeamAdmin = req.user.teamRole === "TEAM_ADMIN";

  if (!isSuperAdmin && !isTeamAdmin) {
    return res.status(403).json({
      success: false,
      error: {
        message: "This action requires administrator access.",
        code: "ADMIN_REQUIRED",
      },
    });
  }

  next();
}
