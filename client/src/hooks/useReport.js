import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@services/stats.api.js'

export function useMyStats() {
  return useQuery({
    queryKey: ['stats', 'me'],
    queryFn : async () => {
      const res = await statsApi.getMyStats()
      return res.data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useTeamStats() {
  return useQuery({
    queryKey: ['stats', 'team'],
    queryFn : async () => {
      const res = await statsApi.getTeamStats()
      return res.data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['stats', 'leaderboard'],
    queryFn : async () => {
      const res = await statsApi.getLeaderboard()
      return res.data.data
    },
    staleTime: 60 * 1000,
  })
}