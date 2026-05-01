// ============================================================================
// ProbSolver v3.0 — Quiz Hooks
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@services/api";
import { useTeamContext } from "./useTeamContext";

const AI_TIMEOUT = { timeout: 60000 };

export function useGenerateQuiz() {
  return useMutation({
    mutationFn: (data) => api.post("/quizzes/generate", data, AI_TIMEOUT),
  });
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: ({ quizId, answers, timeSpent }) =>
      api.post(`/quizzes/${quizId}/submit`, { answers, timeSpent }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...teamQueryKey, "quiz-history"],
      });
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, "stats"] });
    },
  });
}

// Polls GET /:quizId every 3 seconds until aiAnalysis is populated.
// The 'enabled' prop is controlled by the consumer to stop polling.
// Consumer should disable after a timeout to prevent infinite polling.
export function useQuizAnalysis(quizId, enabled = true) {
  return useQuery({
    queryKey: ["quiz-analysis", quizId],
    queryFn: async () => {
      const res = await api.get(`/quizzes/${quizId}`);
      return res.data.data.quiz;
    },
    enabled: !!quizId && enabled,
    refetchInterval: (data) => {
      // Stop polling once analysis is present
      if (data?.aiAnalysis) return false;
      // Poll every 3 seconds
      return 3000;
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useSaveQuizFeedback() {
  return useMutation({
    mutationFn: ({ quizId, feedback, flaggedQuestions }) =>
      api.post(`/quizzes/${quizId}/feedback`, { feedback, flaggedQuestions }),
  });
}

export function useQuizHistory(page = 1) {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "quiz-history", page],
    queryFn: async () => {
      const res = await api.get("/quizzes/history", { params: { page } });
      return res.data.data;
    },
  });
}

export function useQuiz(quizId) {
  return useQuery({
    queryKey: ["quiz", quizId],
    queryFn: async () => {
      const res = await api.get(`/quizzes/${quizId}`);
      return res.data.data.quiz;
    },
    enabled: !!quizId,
  });
}
