import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { simApi } from "@services/sim.api.js";
import { toast } from "@store/useUIStore.js";

export function useMySessions() {
  return useQuery({
    queryKey: ["sim", "my"],
    queryFn: async () => {
      const res = await simApi.getMy();
      return res.data.data;
    },
    staleTime: 30 * 1000,
  });
}

export function useStartSim() {
  return useMutation({
    mutationFn: (data) => simApi.start(data),
    onError: (err) => {
      toast.error(err.response?.data?.error?.message || "Failed to start session");
    },
  });
}

export function useUseHint() {
  return useMutation({
    mutationFn: ({ id, hintUsedAtSecs }) => simApi.useHint(id, hintUsedAtSecs),
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => simApi.complete(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sim", "my"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.error?.message || "Failed to save session");
    },
  });
}

export function useAbandonSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, timeUsedSecs }) => simApi.abandon(id, timeUsedSecs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sim", "my"] });
    },
  });
}