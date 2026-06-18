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
    // Accept either a string solutionId (legacy) or an object with optional
    // `force`. `force=true` bypasses the server-side input-hash cache and
    // re-runs OpenAI even if inputs haven't changed.
    mutationFn: (arg) => {
      const { solutionId, force = false } =
        typeof arg === "string" ? { solutionId: arg } : arg;
      return api.post(`/ai/review/${solutionId}`, { force });
    },
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
    // 90s — generation runs Stage 2 (selection) + Stage 3 (parallel content
    // gen, max 5). Wall-clock can hit 45–60s on a full batch; the global
    // 30s default cuts off legit work mid-flight.
    mutationFn: (data) => api.post("/ai/generate-problems", data, { timeout: 90000 }),
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

// Semantic AI grading of a structured recall attempt against the solution's
// stored notes. Replaces the legacy word-diff which produced false negatives
// when synonymous concepts were used (e.g. "HashMap" vs "Hashing").
// Reported by Sooraj Singh, 2026-05-25 (feedback ID cmpl5lefk0006bvxu3gppm9ph).
export function useReviewGrade() {
  return useMutation({
    mutationFn: ({ solutionId, recall }) =>
      api.post(`/ai/review-grade/${solutionId}`, { recall }),
  });
}

export function useAIStatus() {
  return { data: { enabled: true }, isLoading: false };
}
