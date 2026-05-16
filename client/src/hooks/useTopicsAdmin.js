// ============================================================================
// Topic Mastery Tracks — Admin hooks (SuperAdmin)
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { topicsAdminApi } from "@services/topicsAdmin.api";

const KEYS = {
    list: ["admin", "topics"],
    detail: (slug) => ["admin", "topics", slug],
};

function unwrap(promise) {
    return promise.then((r) => r.data.data);
}

export function useAdminTopics() {
    return useQuery({
        queryKey: KEYS.list,
        queryFn: () => unwrap(topicsAdminApi.listTopics()),
    });
}

export function useAdminTopic(slug) {
    return useQuery({
        queryKey: KEYS.detail(slug),
        queryFn: () => unwrap(topicsAdminApi.getTopic(slug)),
        enabled: !!slug,
    });
}

function invalidate(qc, slug) {
    qc.invalidateQueries({ queryKey: KEYS.list });
    if (slug) qc.invalidateQueries({ queryKey: KEYS.detail(slug) });
}

export function useUpdateTopic(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrap(topicsAdminApi.updateTopic(slug, data)),
        onSuccess: () => invalidate(qc, slug),
    });
}

export function useCreateConcept(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => unwrap(topicsAdminApi.createConcept(slug, data)),
        onSuccess: () => invalidate(qc, slug),
    });
}

export function useUpdateConcept(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) =>
            unwrap(topicsAdminApi.updateConcept(id, data)),
        onSuccess: () => invalidate(qc, slug),
    });
}

export function useDeleteConcept(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => unwrap(topicsAdminApi.deleteConcept(id)),
        onSuccess: () => invalidate(qc, slug),
    });
}

export function useAddPrereq(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, prereqId }) =>
            unwrap(topicsAdminApi.addPrereq(id, prereqId)),
        onSuccess: () => invalidate(qc, slug),
    });
}

export function useRemovePrereq(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, depId }) =>
            unwrap(topicsAdminApi.removePrereq(id, depId)),
        onSuccess: () => invalidate(qc, slug),
    });
}
