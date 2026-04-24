// ============================================================================
// ProbSolver v3.0 — Auth Store (Zustand)
// ============================================================================
import { create } from "zustand";
import api from "@services/api";

const useAuthStore = create((set, get) => ({
  // ── Auth state ─────────────────────────────────────────
  token: localStorage.getItem("token") || null,
  user: JSON.parse(localStorage.getItem("user") || "null"),
  isAuthenticated: !!localStorage.getItem("token"),
  isLoading: false,

  // ── Computed getters (derived from user) ───────────────
  get isSuperAdmin() {
    return get().user?.globalRole === "SUPER_ADMIN";
  },

  get isTeamAdmin() {
    return get().user?.teamRole === "TEAM_ADMIN";
  },

  get isPersonalMode() {
    const user = get().user;
    if (!user) return false;
    return user.currentTeamId === user.personalTeamId;
  },

  get currentTeamId() {
    return get().user?.currentTeamId || null;
  },

  get needsOnboarding() {
    const user = get().user;
    return user && !user.onboardingComplete;
  },

  get needsPasswordChange() {
    return get().user?.mustChangePassword === true;
  },

  // ── Actions ────────────────────────────────────────────

  setAuth: (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("pendingTeam");
    set({ token: null, user: null, isAuthenticated: false });
  },

  updateUser: (userData) => {
    const current = get().user;
    const updated = { ...current, ...userData };
    localStorage.setItem("user", JSON.stringify(updated));
    set({ user: updated });
  },

  // ── Switch team context ────────────────────────────────
  switchTeam: async (teamId) => {
    set({ isLoading: true });
    try {
      const res = await api.post("/auth/switch-team", { teamId });
      const { token, user } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.removeItem("pendingTeam");
      set({ token, user, isAuthenticated: true, isLoading: false });
      return { success: true, message: res.data.data.message };
    } catch (err) {
      set({ isLoading: false });
      return {
        success: false,
        error: err.response?.data?.error?.message || "Failed to switch team.",
      };
    }
  },

  // ── Complete onboarding ────────────────────────────────
  completeOnboarding: async (data) => {
    set({ isLoading: true });
    try {
      const res = await api.post("/auth/onboarding", data);
      const { token, user, pendingTeam } = res.data.data;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      if (pendingTeam) {
        localStorage.setItem("pendingTeam", JSON.stringify(pendingTeam));
      }
      set({ token, user, isAuthenticated: true, isLoading: false });
      return {
        success: true,
        message: res.data.data.message,
        pendingTeam,
      };
    } catch (err) {
      set({ isLoading: false });
      return {
        success: false,
        error: err.response?.data?.error?.message || "Onboarding failed.",
      };
    }
  },

  // ── Refresh user data from server ──────────────────────
  refreshUser: async () => {
    try {
      const res = await api.get("/auth/me");
      const user = res.data.data.user;
      localStorage.setItem("user", JSON.stringify(user));
      const pending = localStorage.getItem("pendingTeam");
      if (
        pending &&
        user.currentTeamId &&
        user.currentTeamId !== user.personalTeamId
      ) {
        localStorage.removeItem("pendingTeam");
      }
      set({ user });
    } catch {
      get().logout();
    }
  },
}));

export default useAuthStore;
