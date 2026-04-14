import prisma from "../lib/prisma.js";
import { hashPassword, comparePassword } from "../lib/hash.js";
import { signToken } from "../lib/jwt.js";
import { env } from "../config/env.js";
import {
  successResponse,
  createdResponse,
  errorResponse,
  unauthorizedResponse,
} from "../utils/response.js";

// ── Helpers ────────────────────────────────────────────

// Shape the user object we send to the client
// Never send passwordHash
function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return {
    ...safe,
    targetCompanies: JSON.parse(safe.targetCompanies || "[]"),
    preferences: JSON.parse(safe.preferences || "{}"),
    mustChangePassword: safe.mustChangePassword || false,
  };
}

// ── POST /api/auth/register ────────────────────────────
export async function register(req, res) {
  const { username, email, password } = req.body;

  // Check username taken
  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUsername) {
    return errorResponse(
      res,
      "Username is already taken",
      409,
      "USERNAME_TAKEN",
    );
  }

  // Check email taken
  const existingEmail = await prisma.user.findUnique({
    where: { email },
  });
  if (existingEmail) {
    return errorResponse(
      res,
      "An account with this email already exists",
      409,
      "EMAIL_TAKEN",
    );
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: "MEMBER",
      avatarColor: generateAvatarColor(username),
    },
  });

  // Sign token
  const token = signToken({ userId: user.id, role: user.role });

  return createdResponse(
    res,
    {
      user: sanitizeUser(user),
      token,
    },
    "Account created successfully",
  );
}

// ── POST /api/auth/login ───────────────────────────────
export async function login(req, res) {
  const { email, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return unauthorizedResponse(res, "No account found with this email");
  }

  // Check password
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    return unauthorizedResponse(res, "Incorrect password");
  }

  // Update last active date + streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

  let streak = user.streak;

  if (lastActive) {
    const lastDay = new Date(lastActive);
    lastDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - lastDay) / 86400000);

    if (diffDays === 0) {
      // Same day login — streak unchanged
    } else if (diffDays === 1) {
      // Consecutive day — increment streak
      streak = streak + 1;
    } else {
      // Gap — reset streak
      streak = 0;
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastActiveDate: new Date(),
      streak,
      longestStreak: Math.max(user.longestStreak, streak),
    },
  });

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  const token = signToken({ userId: user.id, role: user.role });

  return successResponse(
    res,
    {
      user: sanitizeUser(updatedUser),
      token,
    },
    "Logged in successfully",
  );
}

// ── GET /api/auth/me ───────────────────────────────────
export async function getMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      _count: {
        select: {
          solutions: true,
          simSessions: true,
        },
      },
    },
  });

  if (!user) return unauthorizedResponse(res, "User not found");

  return successResponse(res, sanitizeUser(user));
}

// ── PUT /api/auth/me ───────────────────────────────────
export async function updateProfile(req, res) {
  const {
    username,
    avatarColor,
    targetCompanies,
    targetRole,
    targetDate,
    currentLevel,
    preferences,
  } = req.body;

  // Check username uniqueness if changing it
  if (username && username !== req.user.username) {
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      return errorResponse(
        res,
        "Username is already taken",
        409,
        "USERNAME_TAKEN",
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(username && { username }),
      ...(avatarColor && { avatarColor }),
      ...(targetCompanies !== undefined && {
        targetCompanies: JSON.stringify(targetCompanies),
      }),
      ...(targetRole !== undefined && { targetRole }),
      ...(targetDate !== undefined && {
        targetDate: targetDate ? new Date(targetDate) : null,
      }),
      ...(currentLevel && { currentLevel }),
      ...(preferences !== undefined && {
        preferences: JSON.stringify(preferences),
      }),
    },
  });

  return successResponse(res, sanitizeUser(updated), "Profile updated");
}

// ── POST /api/auth/admin/claim ─────────────────────────
export async function claimAdmin(req, res) {
  const { password } = req.body;

  // Already admin
  if (req.user.role === "ADMIN") {
    return errorResponse(res, "You are already an Admin", 400);
  }

  // Verify password
  if (password !== env.ADMIN_PASSWORD) {
    return unauthorizedResponse(res, "Incorrect admin password");
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { role: "ADMIN" },
  });

  // Issue new token with updated role
  const token = signToken({ userId: updated.id, role: "ADMIN" });

  return successResponse(
    res,
    {
      user: sanitizeUser(updated),
      token,
    },
    "Admin access granted",
  );
}

// ── POST /api/auth/admin/revoke ────────────────────────
export async function revokeAdmin(req, res) {
  if (req.user.role !== "ADMIN") {
    return errorResponse(res, "You are not an Admin", 400);
  }

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { role: "MEMBER" },
  });

  const token = signToken({ userId: updated.id, role: "MEMBER" });

  return successResponse(
    res,
    {
      user: sanitizeUser(updated),
      token,
    },
    "Admin access revoked",
  );
}

// ── Helper: deterministic avatar color from username ───
function generateAvatarColor(username) {
  const colors = [
    "#7c6ff7",
    "#22c55e",
    "#3b82f6",
    "#ef4444",
    "#eab308",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#a855f7",
    "#06b6d4",
    "#84cc16",
    "#f43f5e",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ── POST /api/auth/password ────────────────────────────
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return unauthorizedResponse(res, "User not found");

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    return errorResponse(
      res,
      "Current password is incorrect",
      400,
      "WRONG_PASSWORD",
    );
  }

  const passwordHash = await hashPassword(newPassword);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });

  return successResponse(
    res,
    sanitizeUser(updated),
    "Password changed successfully",
  );
}

// ── POST /api/auth/reset-password (admin only) ─────────
export async function resetUserPassword(req, res) {
  const { userId, temporaryPassword } = req.body;

  // Only admin can reset others' passwords
  if (req.user.role !== "ADMIN") {
    return forbiddenResponse(res, "Admin access required");
  }

  // Can't reset your own via this endpoint
  if (userId === req.user.id) {
    return errorResponse(
      res,
      "Use change password to update your own password",
      400,
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return notFoundResponse(res, "User");

  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  return successResponse(
    res,
    {
      userId: user.id,
      username: user.username,
    },
    `Temporary password set for ${user.username}`,
  );
}
