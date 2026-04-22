import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@services/api'
import { useTeamContext } from './useTeamContext'

export function useGenerateQuiz() {
  return useMutation({
    mutationFn: (data) => api.post('/quizzes/generate', data),
  })
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient()
  const { teamQueryKey } = useTeamContext()

  return useMutation({
    mutationFn: ({ quizId, answers, timeSpent }) =>
      api.post(`/quizzes/${quizId}/submit`, { answers, timeSpent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'quiz-history'] })
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'stats'] })
    },
  })
}

export function useQuizHistory(page = 1) {
  const { teamQueryKey } = useTeamContext()

  return useQuery({
    queryKey: [...teamQueryKey, 'quiz-history', page],
    queryFn: async () => {
      const res = await api.get('/quizzes/history', { params: { page } })
      return res.data
    },
  })
}

export function useQuiz(quizId) {
  return useQuery({
    queryKey: ['quiz', quizId],
    queryFn: async () => {
      const res = await api.get(`/quizzes/${quizId}`)
      return res.data.quiz
    },
    enabled: !!quizId,
  })
}// ── v2 compatibility aliases ─────────────────────────────
export const useMyQuizAttempts = useQuizHistory
export const useAnalyzeQuiz = useSubmitQuiz
