import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { problemsApi } from "@services/problems.api";
import { useTeamContext } from "./useTeamContext";

export function useCanonicalAnswer(problemId, { enabled = true } = {}) {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "canonical", problemId],
    queryFn: async () => {
      const res = await problemsApi.getCanonical(problemId);
      return res.data?.data ?? res.data;
    },
    enabled: enabled && !!problemId,
    staleTime: Infinity,
  });
}

export function useUpdateCanonicalAnswer(problemId) {
  const qc = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: (body) => problemsApi.patchCanonical(problemId, body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...teamQueryKey, "canonical", problemId],
      });
    },
  });
}
