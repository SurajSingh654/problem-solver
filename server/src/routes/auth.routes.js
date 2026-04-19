import { Router } from "express";
import {
  register,
  login,
  getMe,
  updateProfile,
  claimAdmin,
  revokeAdmin,
  changePassword,
  resetUserPassword,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPasswordWithCode,
  initiateEmailChange,
  confirmEmailChange,
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  claimAdminSchema,
  updateProfileSchema,
} from "../schemas/auth.schema.js";

const router = Router();

// ── Public ────────────────────────────────────────────
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

// ── Protected ─────────────────────────────────────────
router.get("/me", requireAuth, getMe);
router.put("/me", requireAuth, validate(updateProfileSchema), updateProfile);
router.post("/password", requireAuth, changePassword);
router.post(
  "/admin/claim",
  requireAuth,
  validate(claimAdminSchema),
  claimAdmin,
);
router.post("/admin/revoke", requireAuth, revokeAdmin);
router.post('/change-email',         requireAuth, initiateEmailChange)
router.post('/confirm-email-change', requireAuth, confirmEmailChange)

// ── Admin only ────────────────────────────────────────
router.post("/reset-password", requireAuth, requireAdmin, resetUserPassword);

// Add these public routes (no auth required)
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

// Add these public routes (no auth required)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password-with-code", resetPasswordWithCode);

export default router;
