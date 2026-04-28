// ============================================================================
// ProbSolver v3.0 — Auth Controller
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Registration creates USER role only. SUPER_ADMIN is created
//    via seed script — never through the registration endpoint.
//
// 2. Login returns a JWT with team context embedded. If the user
//    has a currentTeamId, it's in the token. Frontend uses this
//    to determine what UI to show.
//
// 3. Onboarding endpoint: After registration + email verification,
//    the user hits POST /auth/onboarding with either:
//    - { mode: 'individual' } → auto-creates personal team
//    - { mode: 'team', joinCode: 'ABC123' } → joins existing team
//    - { mode: 'team', teamName: 'My Team' } → creates new team (PENDING)
//
// 4. Personal team creation: Uses a transaction to atomically create
//    the team, update the user, AND create a TeamMembership record.
//    The team is marked isPersonal=true and status=ACTIVE.
//
// 5. TeamMembership is the authoritative source for team access.
//    User.teamRole is a denormalized cache for the current team only.
//    switchTeam reads role from TeamMembership, not from User.
//
// 6. buildUserResponse: Every auth response includes memberships[]
//    so the client always has the complete picture of all teams
//    the user belongs to, regardless of current context.
//
// ============================================================================
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { generateToken } from "../lib/jwt.js";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} from "../services/email.service.js";
import {
  BCRYPT_ROUNDS,
  VERIFICATION_CODE_EXPIRY_MINUTES,
  TEAM_MAX_MEMBERS_DEFAULT,
} from "../config/env.js";
import { success, error } from "../utils/response.js";

// ── Helper: build complete user response with memberships ─────
// Called by login, getMe, verifyEmail, switchTeam, completeOnboarding.
// Always returns user with memberships[] for the sidebar switcher.
async function buildUserResponse(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      globalRole: true,
      currentTeamId: true,
      teamRole: true,
      personalTeamId: true,
      onboardingComplete: true,
      mustChangePassword: true,
      isVerified: true,
      targetCompany: true,
      interviewDate: true,
      preferredLanguage: true,
      streak: true,
      lastSolvedAt: true,
      activityStatus: true,
      aiProblemConfig: true,
      createdAt: true,
      currentTeam: {
        select: { id: true, name: true, isPersonal: true, status: true },
      },
      personalTeam: {
        select: { id: true, name: true },
      },
      // All active team memberships for the sidebar switcher
      memberships: {
        where: { isActive: true },
        select: {
          role: true,
          joinedAt: true,
          team: {
            select: {
              id: true,
              name: true,
              isPersonal: true,
              status: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  return user;
}

// ── Helper: generate 6-digit code ────────────────────────────
function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// ── Helper: generate join code ───────────────────────────────
function generateJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// ── Helper: code expiry date ─────────────────────────────────
function codeExpiry() {
  return new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);
}

// ============================================================================
// REGISTER
// ============================================================================
export async function register(req, res) {
  try {
    const { email, password, name } = req.body;

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return error(res, "An account with this email already exists.", 409);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const code = generateCode();
    console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        globalRole: "USER",
        isVerified: false,
        onboardingComplete: false,
        verificationCode: code,
        verificationExpiry: codeExpiry(),
        activityStatus: "ACTIVE",
        lastActiveAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    sendVerificationEmail(user.email, user.name, code).catch((err) => {
      console.error("Failed to send verification email:", err.message);
    });

    return success(
      res,
      {
        message:
          "Account created. Please check your email for verification code.",
        user: { id: user.id, email: user.email, name: user.name },
      },
      201,
    );
  } catch (err) {
    console.error("Registration error:", err);
    return error(res, "Registration failed. Please try again.", 500);
  }
}

// ============================================================================
// VERIFY EMAIL
// ============================================================================
export async function verifyEmail(req, res) {
  try {
    const { email, code } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isVerified: true,
        verificationCode: true,
        verificationExpiry: true,
      },
    });

    if (!user) {
      return error(res, "No account found with this email.", 404);
    }
    if (user.isVerified) {
      return error(res, "Email is already verified.", 400);
    }
    if (!user.verificationCode || user.verificationCode !== code) {
      return error(res, "Invalid verification code.", 400);
    }
    if (!user.verificationExpiry || new Date() > user.verificationExpiry) {
      return error(
        res,
        "Verification code has expired. Please request a new one.",
        400,
      );
    }

    // Mark verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationExpiry: null,
        lastActiveAt: new Date(),
        activityStatus: "ACTIVE",
      },
    });

    // Build complete user with memberships (token uses fullUser)
    const fullUser = await buildUserResponse(user.id);
    const token = generateToken(fullUser);

    return success(res, {
      message: "Email verified successfully.",
      token,
      user: fullUser,
    });
  } catch (err) {
    console.error("Email verification error:", err);
    return error(res, "Verification failed. Please try again.", 500);
  }
}

// ============================================================================
// RESEND VERIFICATION
// ============================================================================
export async function resendVerification(req, res) {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, isVerified: true },
    });

    if (!user) {
      return success(res, {
        message: "If an account exists, a verification code has been sent.",
      });
    }
    if (user.isVerified) {
      return error(res, "Email is already verified.", 400);
    }

    const code = generateCode();
    console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: code,
        verificationExpiry: codeExpiry(),
      },
    });

    sendVerificationEmail(email, user.name, code).catch((err) => {
      console.error("Failed to resend verification:", err.message);
    });

    return success(res, {
      message: "If an account exists, a verification code has been sent.",
    });
  } catch (err) {
    console.error("Resend verification error:", err);
    return error(res, "Failed to resend verification code.", 500);
  }
}

// ============================================================================
// LOGIN
// ============================================================================
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Fetch credentials only — avoid loading full user before auth check
    const credentials = await prisma.user.findUnique({
      where: { email },
      select: { id: true, password: true, isVerified: true },
    });

    if (!credentials) {
      return error(res, "Invalid email or password.", 401);
    }

    const valid = await bcrypt.compare(password, credentials.password);
    if (!valid) {
      return error(res, "Invalid email or password.", 401);
    }

    if (!credentials.isVerified) {
      return error(
        res,
        "Please verify your email before logging in.",
        403,
        "EMAIL_NOT_VERIFIED",
      );
    }

    // Build complete user response with memberships
    const user = await buildUserResponse(credentials.id);
    if (!user) {
      return error(res, "User not found.", 404);
    }

    const token = generateToken(user);

    // Fire-and-forget activity update
    prisma.user
      .update({
        where: { id: credentials.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      })
      .catch(() => {});

    return success(res, { token, user });
  } catch (err) {
    console.error("Login error:", err);
    return error(res, "Login failed. Please try again.", 500);
  }
}

// ============================================================================
// ONBOARDING — Choose team or individual mode
// ============================================================================
export async function completeOnboarding(req, res) {
  try {
    const { mode, joinCode, teamName, teamDescription } = req.body;
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, onboardingComplete: true },
    });

    if (!user) {
      return error(res, "User not found.", 404);
    }
    if (user.onboardingComplete) {
      return error(res, "Onboarding already completed.", 400);
    }

    // ── INDIVIDUAL MODE ────────────────────────────────
    if (mode === "individual") {
      await prisma.$transaction(async (tx) => {
        // Create personal team
        const personalTeam = await tx.team.create({
          data: {
            name: `${user.name}'s Space`,
            description: "Personal practice space",
            isPersonal: true,
            status: "ACTIVE",
            createdById: userId,
            maxMembers: 1,
            aiProblemsEnabled: true,
          },
        });

        // Update user
        await tx.user.update({
          where: { id: userId },
          data: {
            personalTeamId: personalTeam.id,
            currentTeamId: personalTeam.id,
            teamRole: "TEAM_ADMIN",
            onboardingComplete: true,
          },
        });

        // Create TeamMembership record for personal space
        await tx.teamMembership.create({
          data: {
            userId,
            teamId: personalTeam.id,
            role: "TEAM_ADMIN",
            isActive: true,
          },
        });
      });

      const fullUser = await buildUserResponse(userId);
      const token = generateToken(fullUser);

      return success(res, {
        message: "Welcome! Your personal practice space is ready.",
        token,
        user: fullUser,
      });
    }

    // ── TEAM MODE: Join existing team via join code ────
    if (mode === "team" && joinCode) {
      const team = await prisma.team.findUnique({
        where: { joinCode },
        select: {
          id: true,
          name: true,
          status: true,
          maxMembers: true,
          createdById: true,
          _count: { select: { currentMembers: true } },
        },
      });

      if (!team) {
        return error(
          res,
          "Invalid join code. Please check and try again.",
          404,
        );
      }
      if (team.status !== "ACTIVE") {
        return error(res, "This team is not currently accepting members.", 400);
      }
      if (team._count.currentMembers >= team.maxMembers) {
        return error(
          res,
          "This team is full. Please contact the team admin.",
          400,
        );
      }

      // Determine correct role — preserve TEAM_ADMIN if user created this team
      const teamRole = team.createdById === userId ? "TEAM_ADMIN" : "MEMBER";

      await prisma.$transaction(async (tx) => {
        // Create personal space
        const personalTeam = await tx.team.create({
          data: {
            name: `${user.name}'s Space`,
            description: "Personal practice space",
            isPersonal: true,
            status: "ACTIVE",
            createdById: userId,
            maxMembers: 1,
            aiProblemsEnabled: true,
          },
        });

        // Update user — start in the real team context
        await tx.user.update({
          where: { id: userId },
          data: {
            personalTeamId: personalTeam.id,
            currentTeamId: team.id,
            teamRole,
            onboardingComplete: true,
          },
        });

        // Create TeamMembership records for both personal space and real team
        await tx.teamMembership.createMany({
          data: [
            {
              userId,
              teamId: personalTeam.id,
              role: "TEAM_ADMIN",
              isActive: true,
            },
            {
              userId,
              teamId: team.id,
              role: teamRole,
              isActive: true,
            },
          ],
          skipDuplicates: true,
        });
      });

      const fullUser = await buildUserResponse(userId);
      const token = generateToken(fullUser);

      return success(res, {
        message: `Welcome to ${team.name}!`,
        token,
        user: fullUser,
        team: { id: team.id, name: team.name },
      });
    }

    // ── TEAM MODE: Create new team ─────────────────────
    if (mode === "team" && teamName) {
      let pendingTeamData;

      await prisma.$transaction(async (tx) => {
        // Create personal space
        const personalTeam = await tx.team.create({
          data: {
            name: `${user.name}'s Space`,
            description: "Personal practice space",
            isPersonal: true,
            status: "ACTIVE",
            createdById: userId,
            maxMembers: 1,
            aiProblemsEnabled: true,
          },
        });

        // Create the actual team (PENDING approval)
        const newTeam = await tx.team.create({
          data: {
            name: teamName,
            description: teamDescription || null,
            status: "PENDING",
            createdById: userId,
            maxMembers: TEAM_MAX_MEMBERS_DEFAULT,
            aiProblemsEnabled: true,
          },
        });

        // User starts in personal space while team is pending approval
        await tx.user.update({
          where: { id: userId },
          data: {
            personalTeamId: personalTeam.id,
            currentTeamId: personalTeam.id,
            teamRole: "TEAM_ADMIN",
            onboardingComplete: true,
          },
        });

        // Create TeamMembership for personal space now.
        // TeamMembership for the new team will be created when
        // SuperAdmin approves it and the user switches to it.
        await tx.teamMembership.create({
          data: {
            userId,
            teamId: personalTeam.id,
            role: "TEAM_ADMIN",
            isActive: true,
          },
        });

        pendingTeamData = {
          id: newTeam.id,
          name: newTeam.name,
          status: newTeam.status,
        };
      });

      const fullUser = await buildUserResponse(userId);
      const token = generateToken(fullUser);

      return success(res, {
        message: `Team "${teamName}" created and is pending approval. You can practice individually while waiting.`,
        token,
        user: fullUser,
        pendingTeam: pendingTeamData,
      });
    }

    return error(res, "Invalid onboarding configuration.", 400);
  } catch (err) {
    console.error("Onboarding error:", err);
    return error(res, "Onboarding failed. Please try again.", 500);
  }
}

// ============================================================================
// FORGOT PASSWORD
// ============================================================================
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });

    if (!user) {
      return success(res, {
        message: "If an account exists, a reset code has been sent.",
      });
    }

    const code = generateCode();
    console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetCode: code,
        resetExpiry: codeExpiry(),
      },
    });

    sendPasswordResetEmail(email, user.name, code).catch((err) => {
      console.error("Failed to send reset email:", err.message);
    });

    return success(res, {
      message: "If an account exists, a reset code has been sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return error(res, "Failed to process request.", 500);
  }
}

// ============================================================================
// RESET PASSWORD
// ============================================================================
export async function resetPassword(req, res) {
  try {
    const { email, code, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, resetCode: true, resetExpiry: true },
    });

    if (!user) {
      return error(res, "Invalid email or reset code.", 400);
    }
    if (!user.resetCode || user.resetCode !== code) {
      return error(res, "Invalid reset code.", 400);
    }
    if (!user.resetExpiry || new Date() > user.resetExpiry) {
      return error(
        res,
        "Reset code has expired. Please request a new one.",
        400,
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetExpiry: null,
        mustChangePassword: false,
      },
    });

    return success(res, {
      message: "Password reset successfully. Please log in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return error(res, "Password reset failed.", 500);
  }
}

// ============================================================================
// CHANGE PASSWORD (logged in)
// ============================================================================
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true },
    });

    if (!user) {
      return error(res, "User not found.", 404);
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return error(res, "Current password is incorrect.", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    return success(res, { message: "Password changed successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    return error(res, "Failed to change password.", 500);
  }
}

// ============================================================================
// GET CURRENT USER (profile)
// ============================================================================
export async function getMe(req, res) {
  try {
    const user = await buildUserResponse(req.user.id);

    if (!user) {
      return error(res, "User not found.", 404);
    }

    return success(res, { user });
  } catch (err) {
    console.error("Get me error:", err);
    return error(res, "Failed to fetch profile.", 500);
  }
}

// ============================================================================
// SWITCH TEAM CONTEXT
// ============================================================================
export async function switchTeam(req, res) {
  try {
    const { teamId } = req.body;
    const userId = req.user.id;

    if (!teamId) {
      return error(res, "Team ID is required.", 400);
    }

    // Verify team exists and is active
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, status: true, isPersonal: true },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }
    if (team.status !== "ACTIVE") {
      return error(res, "This team is not active.", 400);
    }

    // Verify user has an active membership in this team
    // TeamMembership is the authoritative access check
    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { role: true, isActive: true },
    });

    if (!membership || !membership.isActive) {
      return error(res, "You are not a member of this team.", 403);
    }

    // Update current context — role comes from membership record
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentTeamId: teamId,
        teamRole: membership.role,
      },
    });

    const updatedUser = await buildUserResponse(userId);
    const token = generateToken(updatedUser);

    return success(res, {
      message: team.isPersonal
        ? "Switched to individual mode."
        : `Switched to ${team.name}.`,
      token,
      user: updatedUser,
    });
  } catch (err) {
    console.error("Switch team error:", err);
    return error(res, "Failed to switch team.", 500);
  }
}

// ============================================================================
// UPDATE EMAIL (pre-verification only)
// ============================================================================
export async function updateUnverifiedEmail(req, res) {
  try {
    const { currentEmail, newEmail } = req.body;

    if (!currentEmail || !newEmail) {
      return error(res, "Both current and new email are required.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: currentEmail },
      select: { id: true, isVerified: true, name: true },
    });

    if (!user) {
      return error(res, "No account found with this email.", 404);
    }
    if (user.isVerified) {
      return error(
        res,
        "This account is already verified. Please log in and change email from settings.",
        400,
      );
    }

    const existingNew = await prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });

    if (existingNew) {
      return error(res, "An account with this email already exists.", 409);
    }

    const code = generateCode();
    console.log(
      `[DEV] Verification code: ${code} for ${newEmail || currentEmail || "unknown"}`,
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        verificationCode: code,
        verificationExpiry: codeExpiry(),
      },
    });

    sendVerificationEmail(newEmail, user.name, code).catch((err) => {
      console.error("Failed to send verification email:", err.message);
    });

    return success(res, {
      message: "Email updated. A new verification code has been sent.",
      email: newEmail,
    });
  } catch (err) {
    console.error("Update unverified email error:", err);
    return error(res, "Failed to update email.", 500);
  }
}
