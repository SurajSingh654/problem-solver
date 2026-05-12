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

// Active recall hints — called during review session after user reveals notes.
// When the user typed a recall attempt, pass it so the AI can tailor its
// follow-up questions to what specifically was missed instead of asking
// generic questions every review.
//
// Accepts either `solutionId` (legacy) or `{ solutionId, recallText }`.
export function useReviewHints() {
  return useMutation({
    mutationFn: (arg) => {
      const { solutionId, recallText } = typeof arg === "string"
        ? { solutionId: arg, recallText: undefined }
        : arg;
      return api.post(`/ai/review-hints/${solutionId}`, { recallText });
    },
  });
}

export function useAIStatus() {
  return { data: { enabled: true }, isLoading: false };
}
