import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quizApi } from "@services/quiz.api.js";
import { toast } from "@store/useUIStore.js";

export function useGenerateQuiz() {
  return useMutation({
    mutationFn: (data) => quizApi.generate(data),
    onError: (err) => {
      const code = err.response?.data?.code;
      if (code === "AI_RATE_LIMITED") {
        toast.warning("Daily AI limit reached. Try again tomorrow.");
      } else {
        toast.error(err.response?.data?.error || "Failed to generate quiz");
      }
    },
  });
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => quizApi.submit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to submit quiz");
    },
  });
}

export function useAnalyzeQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => quizApi.analyze(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["quizzes", "attempt", id] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Analysis failed");
    },
  });
}

export function useMyQuizAttempts() {
  return useQuery({
    queryKey: ["quizzes", "my-attempts"],
    queryFn: async () => {
      const res = await quizApi.getMyAttempts();
      return res.data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useQuizAttempt(id) {
  return useQuery({
    queryKey: ["quizzes", "attempt", id],
    queryFn: async () => {
      const res = await quizApi.getAttempt(id);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useMyQuizSubjects() {
  return useQuery({
    queryKey: ["quizzes", "subjects"],
    queryFn: async () => {
      const res = await quizApi.getSubjects();
      return res.data.data;
    },
    staleTime: 60 * 1000,
  });
}
