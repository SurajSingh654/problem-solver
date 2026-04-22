// ============================================================================
// ProbSolver v3.0 — Team Context Hook
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Single hook for all team-context needs: Returns the current
//    teamId, mode flags, and a queryKey prefix that ensures TanStack
//    Query caches are isolated per team.
//
// 2. Query key prefix: Every useQuery call should start with
//    [...teamQueryKey, 'resource-name']. When the user switches
//    teams, teamQueryKey changes, and TanStack Query treats it
//    as a completely different cache — no stale cross-team data.
//
// 3. Cache invalidation on switch: When teamId changes (via the
//    Zustand store), all components re-render with the new teamId
//    in their query keys. TanStack Query fetches fresh data for
//    the new team. Old team data stays in cache (gcTime) but is
//    never shown because the key is different.
//
// ============================================================================

import useAuthStore from '@store/useAuthStore'

export function useTeamContext() {
  const user = useAuthStore((s) => s.user)

  const teamId = user?.currentTeamId || null
  const isPersonalMode = user?.currentTeamId === user?.personalTeamId
  const isTeamAdmin = user?.teamRole === 'TEAM_ADMIN'
  const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
  const teamName = isPersonalMode ? 'My Practice' : (user?.currentTeam?.name || 'Team')

  // Query key prefix — every TanStack Query uses this
  // When teamId changes, all queries refetch automatically
  const teamQueryKey = teamId ? ['team', teamId] : ['personal']

  return {
    teamId,
    teamName,
    isPersonalMode,
    isTeamAdmin,
    isSuperAdmin,
    teamQueryKey,
    user,
  }
}