import { useQuery, useMutation } from "@tanstack/react-query";
import { aiApi } from "@services/ai.api.js";
import { toast } from "@store/useUIStore.js";

// ── AI Status ──────────────────────────────────────────
export function useAIStatus() {
  return useQuery({
    queryKey: ["ai", "status"],
    queryFn: async () => {
      const res = await aiApi.getStatus();
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

// ── Review Solution ────────────────────────────────────
export function useAIReviewSolution() {
  return useMutation({
    mutationFn: (data) => aiApi.reviewSolution(data),
    onError: (err) => {
      const code = err.response?.data?.code;
      if (code === "AI_RATE_LIMITED") {
        toast.warning("Daily AI limit reached. Try again tomorrow.");
      } else if (code === "AI_DISABLED") {
        toast.info("AI features are not enabled yet.");
      } else {
        toast.error(
          err.response?.data?.error || "AI review failed. Try again.",
        );
      }
    },
  });
}

// ── Generate Problem Content ───────────────────────────
export function useAIGenerateProblemContent() {
  return useMutation({
    mutationFn: (data) => aiApi.generateProblemContent(data),
    onError: (err) => {
      const code = err.response?.data?.code;
      if (code === "AI_RATE_LIMITED") {
        toast.warning("Daily AI limit reached. Try again tomorrow.");
      } else if (code === "AI_DISABLED") {
        toast.info("AI features are not enabled yet.");
      } else {
        toast.error(
          err.response?.data?.error || "Content generation failed. Try again.",
        );
      }
    },
  });
}

// ── Generate Hint ──────────────────────────────────────
export function useAIGenerateHint() {
  return useMutation({
    mutationFn: (data) => aiApi.generateHint(data),
    onError: (err) => {
      toast.error(err.response?.data?.error || "Hint generation failed.");
    },
  });
}

// ── Weekly Plan ────────────────────────────────────────
export function useAIWeeklyPlan() {
  return useMutation({
    mutationFn: (data) => aiApi.generateWeeklyPlan(data),
    onError: (err) => {
      toast.error(err.response?.data?.error || "Plan generation failed.");
    },
  });
}
