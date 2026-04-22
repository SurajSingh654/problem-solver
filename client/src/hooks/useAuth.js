// ============================================================================
// ProbSolver v3.0 — Auth Hooks (v2 compatible)
// ============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../services/auth.api.js";
import useAuthStore from "../store/useAuthStore.js";
import { toast } from "../store/useUIStore.js";
import { QUERY_KEYS } from "../utils/constants.js";

// ── Get current user (protected pages) ────────────────
export function useMe() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: QUERY_KEYS.ME,
    queryFn: async () => {
      const res = await authApi.getMe();
      // v3.0 returns { success, user } — not nested in .data
      return res.data.user || res.data.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

// ── Register ───────────────────────────────────────────
export function useRegister() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data) => authApi.register(data),
    onSuccess: (res) => {
      // v3.0 registration does NOT return a token — user must verify email first
      const data = res.data;
      toast.info("Check your email for a verification code");
      navigate("/auth/verify-email", { state: { email: data.user?.email } });
    },
    onError: (err) => {
      console.error("[Register] Error:", err.response?.data);
      const msg = err.response?.data?.error || "Registration failed";
      toast.error(msg, "Error");
    },
  });
}

// ── Login ──────────────────────────────────────────────
export function useLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess: (res) => {
      // v3.0 response: { success, token, user }
      const { user, token } = res.data;

      // v3.0 store: setAuth(token, user) — token first
      useAuthStore.getState().setAuth(token, user);
      queryClient.setQueryData(QUERY_KEYS.ME, user);

      if (!user.isVerified) {
        toast.info("Please verify your email first");
        navigate("/auth/verify-email", { state: { email: user.email } });
      } else if (user.mustChangePassword) {
        toast.info("Please set a new password");
        navigate("/auth/change-password");
      } else if (user.globalRole === "SUPER_ADMIN") {
        toast.success(`Welcome back, ${user.name}!`);
        navigate("/super-admin");
      } else if (!user.onboardingComplete) {
        navigate("/onboarding");
      } else {
        toast.success(`Welcome back, ${user.name}!`);
        navigate("/");
      }
    },
    onError: (err) => {
      console.error("[Login] Error:", err.response?.data);
      const msg = err.response?.data?.error || "Login failed";
      toast.error(msg, "Error");
    },
  });
}

// ── Logout ─────────────────────────────────────────────
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return () => {
    // v3.0 store method is 'logout', not 'clearAuth'
    useAuthStore.getState().logout();
    queryClient.clear();
    navigate("/auth/login");
    toast.info("Logged out successfully");
  };
}

// ── Update profile ─────────────────────────────────────
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => authApi.updateProfile(data),
    onSuccess: (res) => {
      // v3.0 returns { success, message, user }
      const user = res.data.user || res.data.data;
      useAuthStore.getState().updateUser(user);
      queryClient.setQueryData(QUERY_KEYS.ME, user);
      toast.success("Profile updated");
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Update failed");
    },
  });
}

// ── Claim admin (v2 — may not exist in v3.0, kept for compatibility) ──
export function useClaimAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password) => authApi.claimAdmin(password),
    onSuccess: (res) => {
      const data = res.data;
      const user = data.user || data.data?.user;
      const token = data.token || data.data?.token;
      if (token && user) {
        useAuthStore.getState().setAuth(token, user);
        queryClient.setQueryData(QUERY_KEYS.ME, user);
      }
      toast.success("Admin access granted", "Role Updated");
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Incorrect password");
    },
  });
}

// ── Change password ────────────────────────────────────
export function useChangePassword() {
  return useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: () => {
      useAuthStore.getState().updateUser({ mustChangePassword: false });
      toast.success("Password changed successfully");
    },
    onError: (err) => {
      const msg = err.response?.data?.error || "Failed to change password";
      toast.error(msg);
    },
  });
}

// ── Admin reset password ───────────────────────────────
export function useResetUserPassword() {
  return useMutation({
    mutationFn: (data) => authApi.resetPassword(data),
    onSuccess: (res) => {
      toast.success(res.data.message || "Temporary password set");
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to reset password");
    },
  });
}

// ── Change email (initiate) ────────────────────────────
export function useChangeEmail() {
  return useMutation({
    mutationFn: (newEmail) => authApi.initiateEmailChange(newEmail),
    onSuccess: () => {
      toast.success("Verification code sent to your new email");
    },
    onError: (err) => {
      toast.error(
        err.response?.data?.error || "Failed to initiate email change",
      );
    },
  });
}

// ── Change email (confirm) ─────────────────────────────
export function useConfirmEmailChange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code) => authApi.confirmEmailChange(code),
    onSuccess: (res) => {
      const data = res.data;
      const user = data.user || data.data?.user;
      const token = data.token || data.data?.token;
      if (token && user) {
        useAuthStore.getState().setAuth(token, user);
        queryClient.setQueryData(QUERY_KEYS.ME, user);
      }
      toast.success("Email changed successfully!");
    },
    onError: (err) => {
      const msg = err.response?.data?.error || "Email change failed";
      toast.error(msg);
    },
  });
}
