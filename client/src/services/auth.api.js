import api from "./api.js";

export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  getMe: () => api.get("/auth/me"),
  updateProfile: (data) => api.put("/auth/me", data),
  claimAdmin: (password) => api.post("/auth/admin/claim", { password }),
  revokeAdmin: () => api.post("/auth/admin/revoke"),
  changePassword: (data) => api.post("/auth/password", data),
  resetPassword: (data) => api.post("/auth/reset-password", data),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPasswordWithCode: (data) =>
    api.post("/auth/reset-password-with-code", data),
  initiateEmailChange: (newEmail) =>
    api.post("/auth/change-email", { newEmail }),
  confirmEmailChange: (code) =>
    api.post("/auth/confirm-email-change", { code }),
};
