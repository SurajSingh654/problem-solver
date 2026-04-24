// ============================================================================
// ProbSolver v3.0 — Problems Hook (Team-Scoped)
// ============================================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@services/api'
import { useTeamContext } from './useTeamContext'

export function useProblems(filters = {}) {
  const { teamQueryKey } = useTeamContext()
  const { category, difficulty, search, page = 1, limit = 20 } = filters

  return useQuery({
    queryKey: [...teamQueryKey, 'problems', { category, difficulty, search, page, limit }],
    queryFn: async () => {
      const params = { page, limit }
      if (category) params.category = category
      if (difficulty) params.difficulty = difficulty
      if (search) params.search = search
      const res = await api.get('/problems', { params })
      return res.data.data
    },
  })
}

export function useProblem(problemId) {
  const { teamQueryKey } = useTeamContext()
  return useQuery({
    queryKey: [...teamQueryKey, 'problem', problemId],
    queryFn: async () => {
      const res = await api.get(`/problems/${problemId}`)
      return res.data.data.problem
    },
    enabled: !!problemId,
  })
}

export function useCreateProblem() {
  const queryClient = useQueryClient()
  const { teamQueryKey } = useTeamContext()
  return useMutation({
    mutationFn: (data) => api.post('/problems', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'problems'] })
    },
  })
}

export function useUpdateProblem() {
  const queryClient = useQueryClient()
  const { teamQueryKey } = useTeamContext()
  return useMutation({
    mutationFn: ({ problemId, data }) => api.put(`/problems/${problemId}`, data),
    onSuccess: (_, { problemId }) => {
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'problems'] })
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'problem', problemId] })
    },
  })
}

export function useDeleteProblem() {
  const queryClient = useQueryClient()
  const { teamQueryKey } = useTeamContext()
  return useMutation({
    mutationFn: (problemId) => api.delete(`/problems/${problemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...teamQueryKey, 'problems'] })
    },
  })
}