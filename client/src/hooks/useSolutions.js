// ============================================================================
// ProbSolver v3.0 — Solutions Hook (Team-Scoped)
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@services/api";
import { useTeamContext } from "./useTeamContext";

// `pollFreshSolutions` opts in to a 5s refetch loop while ANY solution in
// the result is < 90s old AND has no AI feedback yet — covers the brief
// window between submit and the background auto-review landing. Stops
// automatically once the feedback shows up or the solution ages out.
export function useProblemSolutions(problemId, { pollFreshSolutions = false } = {}) {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "solutions", "problem", problemId],
    queryFn: async () => {
      const res = await api.get(`/solutions/problem/${problemId}`);
      return res.data.data;
    },
    enabled: !!problemId,
    refetchInterval: pollFreshSolutions
      ? (query) => {
          const data = query.state.data;
          const solutions = data?.solutions ?? [];
          const stillWaiting = solutions.some((s) => {
            if (!s.createdAt) return false;
            const ageMs = Date.now() - new Date(s.createdAt).getTime();
            if (ageMs > 90_000) return false;
            const hasFeedback = Array.isArray(s.aiFeedback)
              ? s.aiFeedback.length > 0
              : !!s.aiFeedback;
            return !hasFeedback;
          });
          return stillWaiting ? 5000 : false;
        }
      : false,
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
    onSuccess: (_data, { problemId: _problemId }) => {
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
    mutationFn: ({ solutionId, confidence, recallText }) =>
      api.post(`/solutions/${solutionId}/review`, { confidence, recallText }),
    onSuccess: () => {
      // Invalidate review queue — item should disappear from due list
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "review-queue"],
      });
      // Invalidate 6D report — D6 retention score changes
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "report"],
      });
      // Recall analytics recomputes from ReviewAttempt rows
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "recall-analytics"],
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
