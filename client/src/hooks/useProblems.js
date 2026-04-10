import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { problemsApi } from '@services/problems.api.js'
import { QUERY_KEYS }  from '@utils/constants.js'
import { toast }       from '@store/useUIStore.js'

export function useProblems(params = {}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.PROBLEMS, params],
    queryFn : async () => {
      const res = await problemsApi.getAll(params)
      return res.data.data
    },
    staleTime: 60 * 1000,
  })
}

export function useProblem(id) {
  return useQuery({
    queryKey: QUERY_KEYS.PROBLEM(id),
    queryFn : async () => {
      const res = await problemsApi.getById(id)
      return res.data.data
    },
    enabled : !!id,
    staleTime: 30 * 1000,
  })
}

export function useCreateProblem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data) => problemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROBLEMS })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Problem added successfully', 'Created')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to create problem')
    },
  })
}

export function useUpdateProblem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }) => problemsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROBLEMS })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROBLEM(id) })
      toast.success('Problem updated')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to update problem')
    },
  })
}

export function useDeleteProblem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id) => problemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROBLEMS })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Problem deleted')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to delete problem')
    },
  })
}