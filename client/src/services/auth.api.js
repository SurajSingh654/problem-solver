// ============================================================================
// ProbSolver v3.0 — Auth API Service
// ============================================================================
import api from "./api.js";

export const authApi = {
  // ── Registration & Verification ────────────────────────
  register: (data) => api.post("/auth/register", data),
  verifyEmail: (data) => api.post("/auth/verify-email", data),
  resendVerification: (data) => api.post("/auth/resend-verify", data),

  // ── Login ──────────────────────────────────────────────
  login: (data) => api.post("/auth/login", data),

  // ── Profile ────────────────────────────────────────────
  getMe: () => api.get("/auth/me"),
  updateProfile: (data) => api.put("/auth/profile", data),

  // ── Password ───────────────────────────────────────────
  changePassword: (data) => api.post("/auth/change-password", data),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (data) => api.post("/auth/reset-password", data),

  // emai-verification
  updateUnverifiedEmail: (data) => api.post("/auth/update-unverified-email", data),

  // ── Onboarding & Team Context ──────────────────────────
  onboarding: (data) => api.post("/auth/onboarding", data),
  switchTeam: (teamId) => api.post("/auth/switch-team", { teamId }),

  // ── Email Change (endpoints to be built) ───────────────
  initiateEmailChange: (newEmail) =>
    api.post("/auth/change-email", { newEmail }),
  confirmEmailChange: (code) =>
    api.post("/auth/confirm-email-change", { code }),
};
