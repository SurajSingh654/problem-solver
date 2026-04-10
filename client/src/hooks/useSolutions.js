import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { solutionsApi } from "@services/solutions.api.js";
import { QUERY_KEYS } from "@utils/constants.js";
import { toast } from "@store/useUIStore.js";

export function useMySolutions() {
  return useQuery({
    queryKey: QUERY_KEYS.MY_SOLUTIONS,
    queryFn: async () => {
      const res = await solutionsApi.getMine();
      return res.data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useProblemSolutions(problemId) {
  return useQuery({
    queryKey: QUERY_KEYS.PROBLEM_SOLUTIONS(problemId),
    queryFn: async () => {
      const res = await solutionsApi.getForProblem(problemId);
      return res.data.data;
    },
    enabled: !!problemId,
    staleTime: 30 * 1000,
  });
}

export function useCreateSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => solutionsApi.create(data),
    onSuccess: (res) => {
      const sol = res.data.data;
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_SOLUTIONS });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROBLEM_SOLUTIONS(sol.problemId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROBLEM(sol.problemId),
      });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Solution saved! 🎉", "Submitted");
    },
    onError: (err) => {
      const msg = err.response?.data?.error || "Failed to save solution";
      toast.error(msg);
    },
  });
}

export function useUpdateSolution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => solutionsApi.update(id, data),
    onSuccess: (res) => {
      const sol = res.data.data;
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_SOLUTIONS });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PROBLEM_SOLUTIONS(sol.problemId),
      });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Solution updated");
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to update solution");
    },
  });
}

export function useRateClarity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ solutionId, score, comment }) =>
      solutionsApi.rateClarity(solutionId, { score, comment }),
    onSuccess: (_, { problemId }) => {
      if (problemId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.PROBLEM_SOLUTIONS(problemId),
        });
      }
      toast.success("Clarity rating saved");
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to save rating");
    },
  });
}

export function useReviewSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confidenceLevel }) =>
      solutionsApi.review(id, confidenceLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_SOLUTIONS });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || "Failed to save review");
    },
  });
}
