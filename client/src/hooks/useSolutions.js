// ============================================================================
// ProbSolver v3.0 — Solutions Hook (Team-Scoped)
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@services/api";
import { useTeamContext } from "./useTeamContext";

export function useProblemSolutions(problemId) {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "solutions", "problem", problemId],
    queryFn: async () => {
      const res = await api.get(`/solutions/problem/${problemId}`);
      return res.data.data;
    },
    enabled: !!problemId,
  });
}

export function useUserSolutions(userId, page = 1) {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "solutions", "user", userId, page],
    queryFn: async () => {
      const url = userId ? `/solutions/user/${userId}` : "/solutions/user";
      const res = await api.get(url, { params: { page } });
      return res.data.data;
    },
  });
}

export function useSubmitSolution() {
  const queryClient = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: ({ problemId, data }) =>
      api.post(`/solutions/${problemId}`, data),
    onSuccess: (_, { problemId }) => {
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "solutions"],
      });
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "problems"],
      });
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, "stats"] });
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "leaderboard"],
      });
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "review-queue"],
      });
    },
  });
}

export function useUpdateSolution() {
  const queryClient = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: ({ solutionId, data }) =>
      api.put(`/solutions/${solutionId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "solutions"],
      });
    },
  });
}

// ── SM-2 Review submission ────────────────────────────
// Separate mutation from useUpdateSolution because:
// 1. Different endpoint, different validation
// 2. Review success invalidates the review queue and report (D6)
// 3. Review response contains SM-2 state for UI feedback
export function useSubmitReview() {
  const queryClient = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: ({ solutionId, confidence }) =>
      api.post(`/solutions/${solutionId}/review`, { confidence }),
    onSuccess: () => {
      // Invalidate review queue — item should disappear from due list
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "review-queue"],
      });
      // Invalidate 6D report — D6 retention score changes
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "report"],
      });
    },
  });
}

export function useRateSolution() {
  const queryClient = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: ({ solutionId, rating }) =>
      api.post(`/solutions/${solutionId}/rate`, { rating }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "solutions"],
      });
    },
  });
}

// ── Review Queue — uses server-side filtered endpoint ─
// Previously used useMySolutions and filtered client-side.
// Now uses dedicated endpoint that only returns due/upcoming items
// with SM-2 state, overdueDays, and retentionEstimate precomputed.
export function useReviewQueue() {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "review-queue"],
    queryFn: async () => {
      const res = await api.get("/solutions/review/queue");
      return res.data.data;
    },
    // Refetch every 5 minutes — due items change as time passes
    staleTime: 1000 * 60 * 5,
  });
}

export function useMySolutions() {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "my-solutions"],
    queryFn: async () => {
      const res = await api.get("/solutions/user");
      return res.data.data.solutions || [];
    },
  });
}
