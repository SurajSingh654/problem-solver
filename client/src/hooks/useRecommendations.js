import { useQuery } from '@tanstack/react-query'
import api from '@services/api'
import { useTeamContext } from './useTeamContext'

export function useRecommendations() {
  const { teamQueryKey } = useTeamContext()
  return useQuery({
    queryKey: [...teamQueryKey, 'recommendations'],
    queryFn: async () => {
      const res = await api.get('/recommendations')
      return res.data.data
    },
    staleTime: 1000 * 60 * 5,
  })
}