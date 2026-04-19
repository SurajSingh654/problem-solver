import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../services/auth.api.js";
import { useAuthStore } from "../store/useAuthStore.js";
import { toast } from "../store/useUIStore.js";
import { QUERY_KEYS } from "../utils/constants.js";

// ── Get current user (protected pages) ────────────────
export function useMe() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: QUERY_KEYS.ME,
    queryFn: async () => {
      const res = await authApi.getMe();
      return res.data.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

// ── Register ───────────────────────────────────────────
export function useRegister() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => authApi.register(data),

    onSuccess: (res) => {
      console.log("[Register] Full API response:", JSON.stringify(res.data));

      const { user, token } = res.data.data;

      console.log("[Register] User object:", JSON.stringify(user));
      console.log("[Register] emailVerified value:", user.emailVerified);
      console.log("[Register] emailVerified type:", typeof user.emailVerified);
      console.log("[Register] !emailVerified:", !user.emailVerified);

      setAuth(user, token);
      localStorage.setItem("ps_token", token);
      queryClient.setQueryData(QUERY_KEYS.ME, user);

      if (!user.emailVerified) {
        console.log("[Register] → Redirecting to /verify-email");
        toast.info("Check your email for a verification code");
        navigate("/verify-email", { state: { email: user.email } });
      } else {
        console.log("[Register] → Redirecting to / (email already verified)");
        toast.success("Welcome to ProbSolver! 🎉", "Account Created");
        navigate("/");
      }
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
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => authApi.login(data),

    onSuccess: (res) => {
      console.log("[Login] Full API response:", JSON.stringify(res.data));

      const { user, token } = res.data.data;

      console.log("[Login] User object:", JSON.stringify(user));
      console.log("[Login] emailVerified value:", user.emailVerified);
      console.log("[Login] emailVerified type:", typeof user.emailVerified);
      console.log("[Login] mustChangePassword:", user.mustChangePassword);

      setAuth(user, token);
      localStorage.setItem("ps_token", token);
      queryClient.setQueryData(QUERY_KEYS.ME, user);

      if (!user.emailVerified) {
        console.log("[Login] → Redirecting to /verify-email");
        toast.info("Please verify your email first");
        navigate("/verify-email", { state: { email: user.email } });
      } else if (user.mustChangePassword) {
        console.log("[Login] → Redirecting to /change-password");
        toast.info("Please set a new password");
        navigate("/change-password");
      } else {
        console.log("[Login] → Redirecting to / (all checks passed)");
        toast.success(`Welcome back, ${user.username}!`);
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
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return () => {
    clearAuth();
    localStorage.removeItem("ps_token");
    queryClient.clear();
    navigate("/login");
    toast.info("Logged out successfully");
  };
}

// ── Update profile ─────────────────────────────────────
export function useUpdateProfile() {
  const { updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => authApi.updateProfile(data),

    onSuccess: (res) => {
      const user = res.data.data;
      updateUser(user);
      queryClient.setQueryData(QUERY_KEYS.ME, user);
      toast.success("Profile updated");
    },

    onError: (err) => {
      toast.error(err.response?.data?.error || "Update failed");
    },
  });
}

// ── Claim admin ────────────────────────────────────────
export function useClaimAdmin() {
  const { setAuth, user } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password) => authApi.claimAdmin(password),

    onSuccess: (res) => {
      const { user: updatedUser, token } = res.data.data;
      setAuth(updatedUser, token);
      localStorage.setItem("ps_token", token);
      queryClient.setQueryData(QUERY_KEYS.ME, updatedUser);
      toast.success("Admin access granted ⚡", "Role Updated");
    },

    onError: (err) => {
      toast.error(err.response?.data?.error || "Incorrect password");
    },
  });
}

// ── Change password ────────────────────────────────────
export function useChangePassword() {
  const { updateUser } = useAuthStore();
  return useMutation({
    mutationFn: (data) => authApi.changePassword(data),
    onSuccess: (res) => {
      // Clear mustChangePassword flag in store
      updateUser({ mustChangePassword: false });
      toast.success("Password changed successfully");
    },
    onError: (err) => {
      const code = err.response?.data?.code;
      if (code === "WRONG_PASSWORD") {
        toast.error("Current password is incorrect");
      } else {
        toast.error(err.response?.data?.error || "Failed to change password");
      }
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
