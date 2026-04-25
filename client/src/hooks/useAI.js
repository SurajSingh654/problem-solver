// ============================================================================
// ProbSolver v3.0 — AI Hooks (Team-Scoped)
// ============================================================================
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@services/api";
import { useTeamContext } from "./useTeamContext";

export function useAIReview() {
  const queryClient = useQueryClient();
  const { teamQueryKey } = useTeamContext();

  return useMutation({
    mutationFn: (solutionId) => api.post(`/ai/review/${solutionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "solutions"],
      });
    },
  });
}

export function useAIHint() {
  return useMutation({
    mutationFn: ({ problemId, level }) =>
      api.post(`/ai/hint/${problemId}`, { level }),
  });
}

export function useWeeklyPlan() {
  return useMutation({
    mutationFn: () => api.get("/ai/weekly-plan"),
  });
}

export function useGenerateContent() {
  return useMutation({
    mutationFn: (data) => api.post("/ai/generate-content", data),
  });
}

export function useSimilarProblems() {
  return useMutation({
    mutationFn: (query) => api.post("/ai/similar", { query }),
  });
}

export function useGenerateProblemsAI() {
  return useMutation({
    mutationFn: (data) => api.post("/ai/generate-problems", data),
  });
}

// Returns AI feature availability status
export function useAIStatus() {
  return { data: { enabled: true }, isLoading: false };
}
