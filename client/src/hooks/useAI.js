import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@services/api'
import { useTeamContext } from './useTeamContext'

export function useAIReview() {
  const queryClient = useQueryClient()
  const { teamQueryKey } = useTeamContext()

  return useMutation({
    mutationFn: (solutionId) => api.post(`/ai/review/${solutionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'solutions'] })
    },
  })
}

export function useAIHint() {
  return useMutation({
    mutationFn: ({ problemId, level }) =>
      api.post(`/ai/hint/${problemId}`, { level }),
  })
}

export function useWeeklyPlan() {
  const { teamQueryKey } = useTeamContext()

  return useMutation({
    mutationFn: () => api.get('/ai/weekly-plan'),
  })
}

export function useGenerateContent() {
  return useMutation({
    mutationFn: (data) => api.post('/ai/generate-content', data),
  })
}

export function useSimilarProblems() {
  return useMutation({
    mutationFn: (query) => api.post('/ai/similar', { query }),
  })
}// ── v2 compatibility aliases ─────────────────────────────
export function useAIStatus() {
  const { AI_ENABLED } = { AI_ENABLED: true }
  return { data: { enabled: AI_ENABLED }, isLoading: false }
}
export const useAIGenerateHint = useAIHint
export const useAIGenerateProblemContent = useGenerateContent
export const useAIReviewSolution = useAIReview
