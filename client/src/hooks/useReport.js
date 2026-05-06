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
    staleTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60 * 2,
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
    staleTime: 1000 * 60 * 5,
  });
}

// NEW: Combined dashboard data hook
// Fetches personal stats and 6D report in parallel.
// Single coordinated loading state for the dashboard.
// Avoids the race condition in the old dashboard where
// recommendations were checked before data loaded.
export function useDashboardData() {
  const { teamQueryKey } = useTeamContext();

  const statsQuery = useQuery({
    queryKey: [...teamQueryKey, "stats", "personal"],
    queryFn: async () => {
      const res = await api.get("/stats/personal");
      return res.data.data.stats;
    },
    staleTime: 1000 * 60 * 2,
  });

  const reportQuery = useQuery({
    queryKey: [...teamQueryKey, "report", "6d"],
    queryFn: async () => {
      const res = await api.get("/stats/report");
      return res.data.data.report;
    },
    staleTime: 1000 * 60 * 5,
  });

  return {
    stats: statsQuery.data,
    report: reportQuery.data,
    isLoading: statsQuery.isLoading || reportQuery.isLoading,
    isError: statsQuery.isError || reportQuery.isError,
  };
}

// NEW: Team activity feed hook
export function useTeamActivity() {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "activity"],
    queryFn: async () => {
      const res = await api.get("/stats/activity");
      return res.data.data;
    },
    staleTime: 1000 * 60 * 2,
    // Activity feed is team-only — in personal mode
    // this gracefully returns empty since requireTeamContext
    // will still work with a personal team
  });
}
