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
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);
router.post(
  "/resend-verify",
  validate(resendVerificationSchema),
  resendVerification,
);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// ── Authenticated routes ─────────────────────────────────────
router.get("/me", authenticate, getMe);
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

router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  changePassword,
);
router.post(
  "/onboarding",
  authenticate,
  validate(onboardingSchema),
  completeOnboarding,
);
router.post("/switch-team", authenticate, switchTeam);
router.post("/update-unverified-email", updateUnverifiedEmail);

export default router;
