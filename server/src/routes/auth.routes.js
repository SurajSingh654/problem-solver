// ============================================================================
// ProbSolver v3.0 — Auth Routes
// ============================================================================
//
// ROUTE DESIGN:
//
// Public routes (no auth):
//   POST /auth/register        — Create account
//   POST /auth/login           — Get JWT
//   POST /auth/verify-email    — Verify with 6-digit code
//   POST /auth/resend-verify   — Resend verification code
//   POST /auth/forgot-password — Request reset code
//   POST /auth/reset-password  — Reset with code + new password
//
// Authenticated routes:
//   GET    /auth/me              — Get current user profile
//   PUT    /auth/profile         — Update profile fields
//   POST   /auth/change-password — Change password (logged in)
//   POST   /auth/onboarding     — Choose team or individual mode
//   POST   /auth/switch-team    — Switch active team context
//
// Middleware order matters:
//   1. authenticate — verifies JWT, sets req.user
//   2. validate(schema) — validates req.body against Zod schema
//   Controller runs only if all middleware passes.
//
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  onboardingSchema,
  updateProfileSchema,
} from "../schemas/auth.schema.js";
import {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  completeOnboarding,
  getMe,
  switchTeam,
  updateUnverifiedEmail,
} from "../controllers/auth.controller.js";

const router = Router();

// ── Public routes ────────────────────────────────────────────
/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Suraj Singh
 *               email:
 *                 type: string
 *                 example: suraj@example.com
 *               password:
 *                 type: string
 *                 example: MyPassword1
 *     responses:
 *       201:
 *         description: Account created, verification code sent
 *       409:
 *         description: Email already exists
 */
router.post("/register", validate(registerSchema), register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and get JWT token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@probsolver.com
 *               password:
 *                 type: string
 *                 example: ProbSolver@2026
 *     responses:
 *       200:
 *         description: Login successful, returns JWT + user
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 */
router.post("/login", validate(loginSchema), login);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with 6-digit code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified, returns token + user
 */
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);

/**
 * @swagger
 * /auth/resend-verify:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code sent if account exists
 */
router.post("/resend-verify", validate(resendVerificationSchema), resendVerification);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reset code sent if account exists
 */
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 */
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

/**
 * @swagger
 * /auth/update-unverified-email:
 *   post:
 *     tags: [Auth]
 *     summary: Update email for unverified account
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentEmail, newEmail]
 *             properties:
 *               currentEmail:
 *                 type: string
 *               newEmail:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email updated, new code sent
 */
router.post('/update-unverified-email', updateUnverifiedEmail);

// ── Authenticated routes ─────────────────────────────────────
/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: User profile with team context
 */
router.get("/me", authenticate, getMe);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     tags: [Auth]
 *     summary: Update profile
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               targetCompany:
 *                 type: string
 *               interviewDate:
 *                 type: string
 *                 format: date-time
 *               preferredLanguage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put(
  "/profile",
  authenticate,
  validate(updateProfileSchema),
  async (req, res) => {
    // Inline profile update — simple enough to not need a separate controller fn
    try {
      const prisma = (await import("../lib/prisma.js")).default;
      const { success, error } = await import("../utils/response.js");

      const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: req.body,
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          targetCompany: true,
          interviewDate: true,
          preferredLanguage: true,
          aiProblemConfig: true,
        },
      });

      return success(res, { message: "Profile updated.", user: updated });
    } catch (err) {
      console.error("Profile update error:", err);
      const { error: errorFn } = await import("../utils/response.js");
      return errorFn(res, "Failed to update profile.", 500);
    }
  },
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password (logged in)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed
 */
router.post("/change-password", authenticate, validate(changePasswordSchema), changePassword);


/**
 * @swagger
 * /auth/onboarding:
 *   post:
 *     tags: [Auth]
 *     summary: Complete onboarding — choose team or individual mode
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [team, individual]
 *               joinCode:
 *                 type: string
 *                 description: Required if mode=team and joining existing team
 *               teamName:
 *                 type: string
 *                 description: Required if mode=team and creating new team
 *               teamDescription:
 *                 type: string
 *     responses:
 *       200:
 *         description: Onboarding complete, returns new token + user
 */
router.post("/onboarding", authenticate, validate(onboardingSchema), completeOnboarding);

/**
 * @swagger
 * /auth/switch-team:
 *   post:
 *     tags: [Auth]
 *     summary: Switch active team context
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [teamId]
 *             properties:
 *               teamId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Team switched, returns new token
 */
router.post("/switch-team", authenticate, switchTeam);


export default router;
