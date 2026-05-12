import { useQuery } from '@tanstack/react-query'
import api from '@services/api'
import { useTeamContext } from './useTeamContext'

/**
 * Fetch the SolutionAttempt history for a solution, newest first.
 * Response shape (server-side):
 *   { solution, attempts: SolutionAttempt[], attemptCount: number }
 */
export function useSolutionAttempts(solutionId) {
    const { teamQueryKey } = useTeamContext()
    return useQuery({
        queryKey: [...teamQueryKey, 'solution-attempts', solutionId],
        queryFn: async () => {
            const res = await api.get(`/solutions/${solutionId}/attempts`)
            return res.data.data
        },
        enabled: !!solutionId,
        staleTime: 60_000,
    })
}
