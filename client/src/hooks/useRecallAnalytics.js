import { useQuery } from '@tanstack/react-query'
import api from '@services/api'
import { useTeamContext } from './useTeamContext'

/**
 * Fetch recall-quality analytics for the current user+team.
 * Response:
 *   {
 *     overall:   { totalAttempts, recallRate, avgConfidence },
 *     trend:     [{ weekStart, attempts, recallRate, avgConfidence }, ...],
 *     byPattern: [{ pattern, attempts, recallRate, avgConfidence }, ...]
 *   }
 *
 * 5 min staleTime — ReviewAttempt rows only change when the user submits
 * a review, and the component renders alongside the very button that does
 * that, so on-success invalidations from useSubmitReview already refresh
 * this feed.
 */
export function useRecallAnalytics() {
    const { teamQueryKey } = useTeamContext()
    return useQuery({
        queryKey: [...teamQueryKey, 'recall-analytics'],
        queryFn: async () => {
            const res = await api.get('/solutions/review/analytics')
            return res.data.data
        },
        staleTime: 5 * 60 * 1000,
    })
}
