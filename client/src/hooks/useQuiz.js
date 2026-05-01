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

export function useQuizAnalysis(quizId) {
  return useQuery({
    queryKey: ["quiz-analysis", quizId],
    queryFn: async () => {
      const res = await api.get(`/quizzes/${quizId}`);
      return res.data.data.quiz;
    },
    enabled: !!quizId,
    // v5 refetchInterval: receives the query data directly
    // Return false to stop polling, number to continue
    refetchInterval: (data) => {
      // Stop if analysis is ready
      if (data?.aiAnalysis) return false;
      // Continue polling every 3 seconds
      return 3000;
    },
    // Do not retry on error — stops polling immediately on any failure
    retry: false,
    // Don't refetch when window regains focus — prevents extra calls
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect — analysis either exists or it doesn't
    refetchOnReconnect: false,
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
