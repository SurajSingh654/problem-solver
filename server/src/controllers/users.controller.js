// ============================================================================
// ProbSolver v3.0 — Users Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ── GET /api/users — list team members ─────────────────
export async function getUsers(req, res) {
  try {
    const where = {};
    const teamId = req.user.currentTeamId;

    if (teamId) {
      where.currentTeamId = teamId;
    } else if (req.user.globalRole !== "SUPER_ADMIN") {
      return success(res, { users: [], count: 0 });
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        globalRole: true,
        teamRole: true,
        streak: true,
        lastActiveAt: true,
        activityStatus: true,
        targetCompany: true,
        createdAt: true,
        _count: {
          select: {
            solutions: true,
            simSessions: true,
            quizAttempts: true,
            interviewSessions: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const enriched = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      globalRole: u.globalRole,
      teamRole: u.teamRole,
      streak: u.streak,
      lastActiveAt: u.lastActiveAt,
      activityStatus: u.activityStatus,
      targetCompany: u.targetCompany,
      createdAt: u.createdAt,
      solutionCount: u._count.solutions,
      simCount: u._count.simSessions,
      quizCount: u._count.quizAttempts,
      interviewCount: u._count.interviewSessions,
    }));

    return success(res, { users: enriched, count: enriched.length });
  } catch (err) {
    console.error("Get users error:", err);
    return error(res, "Failed to fetch users.", 500);
  }
}

// ── GET /api/users/:id — get user profile ──────────────
export async function getUserProfile(req, res) {
  try {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        globalRole: true,
        teamRole: true,
        currentTeamId: true,
        streak: true,
        lastSolvedAt: true,
        lastActiveAt: true,
        activityStatus: true,
        targetCompany: true,
        interviewDate: true,
        preferredLanguage: true,
        createdAt: true,
        _count: {
          select: {
            solutions: true,
            simSessions: true,
            quizAttempts: true,
            interviewSessions: true,
          },
        },
      },
    });

    if (!user) {
      return error(res, "User not found.", 404);
    }

    const isSameTeam =
      req.user.currentTeamId && user.currentTeamId === req.user.currentTeamId;
    const isSuperAdmin = req.user.globalRole === "SUPER_ADMIN";
    const isSelf = user.id === req.user.id;

    if (!isSameTeam && !isSuperAdmin && !isSelf) {
      return success(res, {
        user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      });
    }

    const solutionWhere = { userId: id };
    if (!isSuperAdmin) {
      const teamId = req.user.currentTeamId;
      if (teamId) solutionWhere.teamId = teamId;
    }

    const recentSolutions = await prisma.solution.findMany({
      where: solutionWhere,
      select: {
        id: true,
        confidence: true,
        pattern: true,
        createdAt: true,
        problem: {
          select: { id: true, title: true, difficulty: true, category: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return success(res, {
      user: {
        id: user.id,
        name: user.name,
        email: isSelf || isSuperAdmin ? user.email : undefined,
        avatarUrl: user.avatarUrl,
        globalRole: user.globalRole,
        teamRole: user.teamRole,
        streak: user.streak,
        lastSolvedAt: user.lastSolvedAt,
        activityStatus: user.activityStatus,
        targetCompany: user.targetCompany,
        interviewDate: user.interviewDate,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        solutionCount: user._count.solutions,
        simCount: user._count.simSessions,
        quizCount: user._count.quizAttempts,
        interviewCount: user._count.interviewSessions,
        recentSolutions,
      },
    });
  } catch (err) {
    console.error("Get user profile error:", err);
    return error(res, "Failed to fetch user profile.", 500);
  }
}

// ── DELETE /api/users/:id — remove user (admin) ────────
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return error(res, "You cannot delete your own account.", 400);
    }

    const user = await prisma.user.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        globalRole: true,
        currentTeamId: true,
        personalTeamId: true,
        teamRole: true,
      },
    });

    if (!user) {
      return error(res, "User not found.", 404);
    }
    if (user.globalRole === "SUPER_ADMIN") {
      return error(res, "Cannot delete a super admin account.", 400);
    }

    if (user.currentTeamId && user.currentTeamId !== user.personalTeamId) {
      if (user.teamRole === "TEAM_ADMIN") {
        const otherAdmins = await prisma.user.count({
          where: {
            currentTeamId: user.currentTeamId,
            teamRole: "TEAM_ADMIN",
            id: { not: id },
          },
        });

        if (otherAdmins === 0) {
          const nextMember = await prisma.user.findFirst({
            where: { currentTeamId: user.currentTeamId, id: { not: id } },
            select: { id: true, name: true },
          });

          if (nextMember) {
            // Update both User.teamRole and TeamMembership.role
            await prisma.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: nextMember.id },
                data: { teamRole: "TEAM_ADMIN" },
              });
              await tx.teamMembership.updateMany({
                where: {
                  userId: nextMember.id,
                  teamId: user.currentTeamId,
                  isActive: true,
                },
                data: { role: "TEAM_ADMIN" },
              });
            });
          }
        }
      }
    }

    // TeamMembership records cascade-delete with User (onDelete: Cascade)
    await prisma.user.delete({ where: { id } });

    if (user.personalTeamId) {
      await prisma.team.delete({ where: { id: user.personalTeamId } });
    }

    return success(res, { message: `${user.name} has been deleted.`, id });
  } catch (err) {
    console.error("Delete user error:", err);
    return error(res, "Failed to delete user.", 500);
  }
}

// ── PATCH /api/users/:id/role — update team role ───────
export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["TEAM_ADMIN", "MEMBER"].includes(role)) {
      return error(res, "Invalid role. Must be TEAM_ADMIN or MEMBER.", 400);
    }
    if (id === req.user.id) {
      return error(res, "You cannot change your own role.", 400);
    }

    const user = await prisma.user.findFirst({
      where: { id },
      select: { id: true, name: true, currentTeamId: true },
    });

    if (!user) {
      return error(res, "User not found.", 404);
    }

    if (
      req.user.globalRole !== "SUPER_ADMIN" &&
      user.currentTeamId !== req.user.currentTeamId
    ) {
      return error(res, "User is not in your team.", 403);
    }

    // Update both User.teamRole (cache) and TeamMembership.role (authoritative)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { teamRole: role },
      });

      await tx.teamMembership.updateMany({
        where: { userId: id, teamId: user.currentTeamId, isActive: true },
        data: { role },
      });
    });

    return success(res, {
      message: `${user.name} is now ${role === "TEAM_ADMIN" ? "a team admin" : "a member"}.`,
      user: { id, name: user.name, teamRole: role },
    });
  } catch (err) {
    console.error("Update user role error:", err);
    return error(res, "Failed to update role.", 500);
  }
}
