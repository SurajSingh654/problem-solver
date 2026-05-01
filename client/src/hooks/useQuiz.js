// ============================================================================
// ProbSolver v3.0 — Quiz Hooks
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@services/api";
import { useTeamContext } from "./useTeamContext";

// Bug 5 fix: add 60-second timeout to generation call
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

// Bug 3 fix: dedicated hook to fetch analysis — polls until ready
export function useQuizAnalysis(quizId, enabled = false) {
  return useQuery({
    queryKey: ["quiz-analysis", quizId],
    queryFn: async () => {
      const res = await api.get(`/quizzes/${quizId}/analysis`);
      return res.data.data;
    },
    enabled: !!quizId && enabled,
    // Refetch every 2 seconds until analysis is ready
    refetchInterval: (data) => {
      if (data?.ready) return false; // stop polling once ready
      return 2000; // poll every 2 seconds
    },
    refetchIntervalInBackground: false,
  });
}

// Bug 4 fix: dedicated hook to save feedback
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
