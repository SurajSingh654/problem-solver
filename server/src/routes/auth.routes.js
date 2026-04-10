import { Router } from "express";
import {
  register,
  login,
  getMe,
  claimAdmin,
  revokeAdmin,
  updateProfile,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
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
router.post(
  "/admin/claim",
  requireAuth,
  validate(claimAdminSchema),
  claimAdmin,
);
router.post("/admin/revoke", requireAuth, revokeAdmin);

export default router;
