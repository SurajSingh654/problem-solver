// ============================================================================
// ProbSolver v3.0 — Auth Hooks
// ============================================================================
//
// RESPONSE CONTRACT: All API responses follow { success, data, meta }
// Hooks read: res.data.data.fieldName
//
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../services/auth.api.js";
import useAuthStore from "../store/useAuthStore.js";
import { toast } from "../store/useUIStore.js";
import { QUERY_KEYS } from "../utils/constants.js";
import { extractErrorMessage } from "../services/api.js";

// ── Get current user (protected pages) ────────────────
export function useMe() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: QUERY_KEYS.ME,
    queryFn: async () => {
      const res = await authApi.getMe();
      const user = res.data.data.user;
      // Sync fresh server data back to auth store
      // This ensures currentTeam, streak, etc. stay current
      useAuthStore.getState().updateUser(user);
      return user;
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
      const { user } = res.data.data;
      toast.info("Check your email for a verification code");
      navigate("/auth/verify-email", { state: { email: user?.email } });
    },
    onError: (err) => {
      console.error("[Register] Error:", err.response?.data);
      toast.error(extractErrorMessage(err));
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
      const { user, token } = res.data.data;

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
      const code = err.response?.data?.error?.code;
      const msg = extractErrorMessage(err);

      if (code === "EMAIL_NOT_VERIFIED") {
        toast.info("Please verify your email first");
        const email = err.config?.data
          ? JSON.parse(err.config.data)?.email
          : null;
        navigate("/auth/verify-email", { state: { email } });
        return;
      }

      toast.error(msg);
    },
  });
}

// ── Logout ─────────────────────────────────────────────
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return () => {
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
      const { user } = res.data.data;
      useAuthStore.getState().updateUser(user);
      queryClient.setQueryData(QUERY_KEYS.ME, user);
      toast.success("Profile updated");
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
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
      toast.error(extractErrorMessage(err));
    },
  });
}

// ── Admin reset password ───────────────────────────────
export function useResetUserPassword() {
  return useMutation({
    mutationFn: (data) => authApi.resetPassword(data),
    onSuccess: (res) => {
      toast.success(res.data.data.message || "Temporary password set");
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
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
      toast.error(extractErrorMessage(err));
    },
  });
}

// ── Change email (confirm) ─────────────────────────────
export function useConfirmEmailChange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code) => authApi.confirmEmailChange(code),
    onSuccess: (res) => {
      const { user, token } = res.data.data;
      if (token && user) {
        useAuthStore.getState().setAuth(token, user);
        queryClient.setQueryData(QUERY_KEYS.ME, user);
      }
      toast.success("Email changed successfully!");
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err));
    },
  });
}
