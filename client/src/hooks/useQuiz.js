import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quizApi } from "@services/quiz.api.js";
import { toast } from "@store/useUIStore.js";

export function useGenerateQuiz() {
  return useMutation({
    mutationFn: async (data) => {
      const res = await quizApi.generate(data);
      return res;
    },
    onError: (err) => {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      const msg = err.response?.data?.error;

      console.error("[Quiz] Generation failed:", { status, code, msg });
      console.error("[Quiz] Full error:", err.message, err.code);

      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        toast.error(
          "Quiz generation timed out. AI is taking too long — try fewer questions or a simpler subject.",
        );
        return;
      }

      if (!err.response) {
        toast.error("Network error — check your connection and try again.");
        return;
      }

      if (code === "AI_RATE_LIMITED") {
        toast.warning("Daily AI limit reached. Try again tomorrow.");
      } else if (code === "AI_DISABLED") {
        toast.info("AI features are not enabled.");
      } else if (code === "AI_UNAVAILABLE") {
        toast.warning(
          "AI service temporarily unavailable. Try again in a moment.",
        );
      } else if (code === "AI_VALIDATION_ERROR") {
        toast.error("AI generated an invalid response. Try again.");
      } else {
        toast.error(msg || "Failed to generate quiz. Try again.");
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
