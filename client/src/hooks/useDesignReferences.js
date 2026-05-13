// ============================================================================
// Design Reference hooks
// ============================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { designReferencesApi } from '@services/designReferences.api'
import { toast } from '@store/useUIStore'

const KEYS = {
    list: (params) => ['design-references', 'list', params],
    detail: (id) => ['design-references', 'detail', id],
}

export function useDesignReferences({ problemId, designType } = {}) {
    return useQuery({
        queryKey: KEYS.list({ problemId, designType }),
        enabled: !!problemId,
        queryFn: async () => {
            const res = await designReferencesApi.list({ problemId, designType })
            return res.data.data.references || []
        },
        staleTime: 1000 * 60 * 5,
    })
}

export function useDesignReference(id) {
    return useQuery({
        queryKey: KEYS.detail(id),
        enabled: !!id,
        queryFn: async () => {
            const res = await designReferencesApi.get(id)
            return res.data.data.reference
        },
        staleTime: 1000 * 60 * 5,
    })
}

export function useCreateDesignReference() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data) => designReferencesApi.create(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['design-references'] })
            toast.success('Reference created.')
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to create reference.')
        },
    })
}

export function useUpdateDesignReference() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }) => designReferencesApi.update(id, data),
        onSuccess: (_, { id }) => {
            qc.invalidateQueries({ queryKey: ['design-references'] })
            qc.invalidateQueries({ queryKey: KEYS.detail(id) })
            toast.success('Reference updated.')
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to update reference.')
        },
    })
}

export function useDeleteDesignReference() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id) => designReferencesApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['design-references'] })
            toast.success('Reference deleted.')
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message || 'Failed to delete reference.')
        },
    })
}
