// ============================================================================
// ProbSolver v3.0 — Report Hooks (Team-Scoped)
// ============================================================================
import { useQuery } from "@tanstack/react-query";
import api from "@services/api";
import { useTeamContext } from "./useTeamContext";

export function use6DReport() {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "report", "6d"],
    queryFn: async () => {
      const res = await api.get("/stats/report");
      return res.data.data.report;
    },
  });
}

export function usePersonalStats() {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "stats", "personal"],
    queryFn: async () => {
      const res = await api.get("/stats/personal");
      return res.data.data.stats;
    },
  });
}

export function useLeaderboard() {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "leaderboard"],
    queryFn: async () => {
      const res = await api.get("/stats/leaderboard");
      return res.data.data.leaderboard;
    },
  });
}
