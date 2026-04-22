import prisma from "../lib/prisma.js";
import {
  success,
  notFoundResponse,
  error,
} from "../utils/response.js";

function sanitizeUser(u) {
  const { passwordHash, ...safe } = u;
  return {
    ...safe,
    targetCompanies: JSON.parse(safe.targetCompanies || "[]"),
    preferences: JSON.parse(safe.preferences || "{}"),
  };
}

// ── GET /api/users ─────────────────────────────────────
export async function getUsers(req, res) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      avatarColor: true,
      role: true,
      streak: true,
      longestStreak: true,
      joinedAt: true,
      currentLevel: true,
      targetCompanies: true,
      _count: {
        select: { solutions: true, simSessions: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return success(
    res,
    users.map((u) => ({
      ...u,
      targetCompanies: JSON.parse(u.targetCompanies || "[]"),
      solutionCount: u._count.solutions,
      simCount: u._count.simSessions,
    })),
  );
}

// ── GET /api/users/:username ───────────────────────────
export async function getUserByUsername(req, res) {
  const { username } = req.params;

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      solutions: {
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              tags: true,
            },
          },
        },
        orderBy: { solvedAt: "desc" },
      },
      _count: {
        select: { solutions: true, simSessions: true },
      },
    },
  });

  if (!user) return notFoundResponse(res, "User");

  const sanitized = sanitizeUser(user);
  return success(res, {
    ...sanitized,
    solutions: sanitized.solutions?.map((s) => ({
      ...s,
      followUpAnswers: JSON.parse(s.followUpAnswers || "[]"),
      reviewDates: JSON.parse(s.reviewDates || "[]"),
      problem: {
        ...s.problem,
        tags: JSON.parse(s.problem.tags || "[]"),
      },
    })),
    solutionCount: user._count.solutions,
    simCount: user._count.simSessions,
  });
}

// ── DELETE /api/users/:id ──────────────────────────────
export async function deleteUser(req, res) {
  const { id } = req.params;
  const requestingUser = req.user;

  // Can't delete yourself
  if (id === requestingUser.id) {
    return error(res, "You cannot delete your own account", 400);
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return notFoundResponse(res, "User");

  // Can't delete another admin
  if (user.role === "ADMIN") {
    return error(res, "Cannot delete an admin account", 400);
  }

  await prisma.user.delete({ where: { id } });
  return success(res, { id }, "User deleted");
}

// ── PATCH /api/users/:id/role ──────────────────────────
export async function updateUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body;

  if (!["ADMIN", "MEMBER"].includes(role)) {
    return error(res, "Invalid role", 400);
  }

  // Can't change your own role
  if (id === req.user.id) {
    return error(res, "Use Settings to change your own role", 400);
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return notFoundResponse(res, "User");

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
  });

  return success(
    res,
    {
      id: updated.id,
      username: updated.username,
      role: updated.role,
    },
    `Role updated to ${role}`,
  );
}
