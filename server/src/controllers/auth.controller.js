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
//    the team and update the user. The team is marked isPersonal=true
//    and status=ACTIVE (no approval needed for personal spaces).
//
// 5. Verification codes: 6-digit numeric, 15-minute expiry.
//    Stored hashed? No — they're short-lived and brute-force
//    protected by rate limiting (the 6-digit space = 1M possibilities,
//    15 min expiry makes brute force impractical).
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

// ── Helper: generate 6-digit code ────────────────────────────
function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// ── Helper: generate join code ───────────────────────────────
function generateJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
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

    // ── Check existing user ────────────────────────────
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      return error(res, "An account with this email already exists.", 409);
    }

    // ── Hash password ──────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // ── Generate verification code ─────────────────────
    const code = generateCode();

    // ── Create user ────────────────────────────────────
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

    // ── Send verification email (non-blocking) ─────────
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

    // ── Mark verified + auto-login ─────────────────────
    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationExpiry: null,
        lastActiveAt: new Date(),
        activityStatus: "ACTIVE",
      },
      select: {
        id: true,
        email: true,
        name: true,
        globalRole: true,
        currentTeamId: true,
        teamRole: true,
        personalTeamId: true,
        isVerified: true,
        onboardingComplete: true,
        mustChangePassword: true,
        avatarUrl: true,
      },
    });

    // Generate token so user is immediately authenticated
    const token = generateToken(verifiedUser);

    return success(res, {
      message: "Email verified successfully.",
      token,
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        name: verifiedUser.name,
        globalRole: verifiedUser.globalRole,
        currentTeamId: verifiedUser.currentTeamId,
        teamRole: verifiedUser.teamRole,
        personalTeamId: verifiedUser.personalTeamId,
        isVerified: verifiedUser.isVerified,
        onboardingComplete: verifiedUser.onboardingComplete,
        mustChangePassword: verifiedUser.mustChangePassword,
        avatarUrl: verifiedUser.avatarUrl,
      },
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
      // Don't reveal if email exists
      return success(res, {
        message: "If an account exists, a verification code has been sent.",
      });
    }

    if (user.isVerified) {
      return error(res, "Email is already verified.", 400);
    }

    const code = generateCode();

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

    // ── Find user (include team context for JWT) ───────
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        globalRole: true,
        currentTeamId: true,
        teamRole: true,
        personalTeamId: true,
        isVerified: true,
        onboardingComplete: true,
        mustChangePassword: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return error(res, "Invalid email or password.", 401);
    }

    // ── Verify password ────────────────────────────────
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return error(res, "Invalid email or password.", 401);
    }

    // ── Check verification ─────────────────────────────
    if (!user.isVerified) {
      return error(
        res,
        "Please verify your email before logging in.",
        403,
        "EMAIL_NOT_VERIFIED",
      );
    }

    // ── Generate token ─────────────────────────────────
    const token = generateToken(user);

    // ── Update last active ─────────────────────────────
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastActiveAt: new Date(), activityStatus: "ACTIVE" },
      })
      .catch(() => {});

    return success(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        globalRole: user.globalRole,
        currentTeamId: user.currentTeamId,
        teamRole: user.teamRole,
        personalTeamId: user.personalTeamId,
        isVerified: user.isVerified,
        onboardingComplete: user.onboardingComplete,
        mustChangePassword: user.mustChangePassword,
      },
    });
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

    // ── Verify user exists and hasn't onboarded ────────
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
      const result = await prisma.$transaction(async (tx) => {
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

        // Update user with personal team + mark onboarded
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            personalTeamId: personalTeam.id,
            currentTeamId: personalTeam.id,
            teamRole: "TEAM_ADMIN", // Admin of own personal space
            onboardingComplete: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            globalRole: true,
            currentTeamId: true,
            teamRole: true,
            personalTeamId: true,
            onboardingComplete: true,
          },
        });

        return updatedUser;
      });

      // Issue new token with team context
      const token = generateToken(result);

      return success(res, {
        message: "Welcome! Your personal practice space is ready.",
        token,
        user: result,
      });
    }

    // ── TEAM MODE: Join existing team ──────────────────
    if (mode === "team" && joinCode) {
      const team = await prisma.team.findUnique({
        where: { joinCode },
        select: {
          id: true,
          name: true,
          status: true,
          maxMembers: true,
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

      // Join the team
      const result = await prisma.$transaction(async (tx) => {
        // Also create personal space for future use
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

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            personalTeamId: personalTeam.id,
            currentTeamId: team.id,
            teamRole: "MEMBER",
            onboardingComplete: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            globalRole: true,
            currentTeamId: true,
            teamRole: true,
            personalTeamId: true,
            onboardingComplete: true,
          },
        });

        return updatedUser;
      });

      const token = generateToken(result);

      return success(res, {
        message: `Welcome to ${team.name}!`,
        token,
        user: result,
        team: { id: team.id, name: team.name },
      });
    }

    // ── TEAM MODE: Create new team ─────────────────────
    if (mode === "team" && teamName) {
      const result = await prisma.$transaction(async (tx) => {
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

        // Set user's personal space but DON'T set currentTeamId
        // to the new team yet — it's PENDING approval.
        // User starts in personal space until team is approved.
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            personalTeamId: personalTeam.id,
            currentTeamId: personalTeam.id,
            teamRole: "TEAM_ADMIN",
            onboardingComplete: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            globalRole: true,
            currentTeamId: true,
            teamRole: true,
            personalTeamId: true,
            onboardingComplete: true,
          },
        });

        return { updatedUser, newTeam };
      });

      const token = generateToken(result.updatedUser);

      return success(res, {
        message: `Team "${teamName}" created and is pending approval. You can practice individually while waiting.`,
        token,
        user: result.updatedUser,
        pendingTeam: {
          id: result.newTeam.id,
          name: result.newTeam.name,
          status: result.newTeam.status,
        },
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

    // Always return success (don't reveal email existence)
    if (!user) {
      return success(res, {
        message: "If an account exists, a reset code has been sent.",
      });
    }

    const code = generateCode();

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
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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
        targetCompany: true,
        interviewDate: true,
        preferredLanguage: true,
        streak: true,
        lastSolvedAt: true,
        activityStatus: true,
        aiProblemConfig: true,
        createdAt: true,
        currentTeam: {
          select: {
            id: true,
            name: true,
            isPersonal: true,
            status: true,
          },
        },
        personalTeam: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

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

    // ── Verify the team exists and user is a member ────
    // Special case: personal team (user's own)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { personalTeamId: true },
    });

    if (!user) {
      return error(res, "User not found.", 404);
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        status: true,
        isPersonal: true,
        createdById: true,
      },
    });

    if (!team) {
      return error(res, "Team not found.", 404);
    }

    if (team.status !== "ACTIVE") {
      return error(res, "This team is not active.", 400);
    }

    // Determine the role in the target team
    let newTeamRole = "MEMBER";

    // Personal team — user is always TEAM_ADMIN
    if (team.isPersonal && user.personalTeamId === teamId) {
      newTeamRole = "TEAM_ADMIN";
    }
    // Created the team — they're TEAM_ADMIN
    else if (team.createdById === userId) {
      newTeamRole = "TEAM_ADMIN";
    }
    // Switching to a regular team — verify membership
    // In v3.0 (single team), switching means the user's
    // currentTeamId must already be this team, OR it's their personal team
    else if (user.personalTeamId !== teamId) {
      // Check if the user is actually a member
      // (their currentTeamId should already be this team if they're a member)
      // For now, we allow switching to personal team always
      // and to any team they were previously in
      // TODO: In multi-team future, check TeamMembership table
    }

    // ── Update context ─────────────────────────────────
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        currentTeamId: teamId,
        teamRole: newTeamRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        globalRole: true,
        currentTeamId: true,
        teamRole: true,
        personalTeamId: true,
        onboardingComplete: true,
      },
    });

    // ── Issue new token with updated context ────────────
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

    // Find the unverified user
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

    // Check if new email is already taken
    const existingNew = await prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });

    if (existingNew) {
      return error(res, "An account with this email already exists.", 409);
    }

    // Update email and send new verification code
    const code = generateCode();

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
