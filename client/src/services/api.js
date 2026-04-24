// ============================================================================
// ProbSolver v3.0 — API Client
// ============================================================================
//
// RESPONSE CONTRACT:
//
// Success: { success: true, data: {...}, meta?: {...} }
//   → Hooks read: res.data.data.fieldName
//
// Error: { success: false, error: { message, code?, details? } }
//   → Hooks read: err.response?.data?.error?.message
//
// ============================================================================
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request interceptor: attach JWT ──────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Helper: extract error message from standardized envelope ──
function extractErrorMessage(error) {
  const data = error.response?.data;
  if (!data) return "Network error";

  // New envelope: { error: { message, code } }
  if (data.error?.message) return data.error.message;

  // Legacy fallback: { error: "string" }
  if (typeof data.error === "string") return data.error;

  return "An unexpected error occurred";
}

function extractErrorCode(error) {
  const data = error.response?.data;
  if (data?.error?.code) return data.error.code;
  if (data?.code) return data.code;
  return null;
}

// ── Response interceptor: centralized error handling ─────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = extractErrorCode(error);

    // Token expired or invalid — force logout and redirect
    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!window.location.pathname.startsWith("/auth")) {
        window.location.href = "/auth/login";
      }
      return Promise.reject(error);
    }

    // 403 with specific codes — redirect to appropriate page
    if (status === 403) {
      switch (code) {
        case "ONBOARDING_REQUIRED":
          if (window.location.pathname !== "/onboarding") {
            window.location.href = "/onboarding";
          }
          break;
        case "PASSWORD_CHANGE_REQUIRED":
          if (window.location.pathname !== "/auth/change-password") {
            window.location.href = "/auth/change-password";
          }
          break;
        case "NO_TEAM_CONTEXT": {
          const user = JSON.parse(localStorage.getItem("user") || "null");
          if (user?.globalRole === "SUPER_ADMIN") {
            if (!window.location.pathname.startsWith("/super-admin")) {
              window.location.href = "/super-admin";
            }
          } else if (window.location.pathname !== "/onboarding") {
            window.location.href = "/onboarding";
          }
          break;
        }
      }
    }

    // SuperAdmin hitting team-scoped endpoint
    if (status === 400 && code === "SUPER_ADMIN_NEEDS_TEAM_OVERRIDE") {
      if (!window.location.pathname.startsWith("/super-admin")) {
        window.location.href = "/super-admin";
      }
    }

    return Promise.reject(error);
  },
);

// Export helper for use in hooks/components
export { extractErrorMessage, extractErrorCode };

export default api;
