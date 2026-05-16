// ============================================================================
// Topic Mastery Tracks — Hooks (v1 scaffold)
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { topicsApi } from "@services/topics.api";

const KEYS = {
    list: ["topics"],
    detail: (slug) => ["topics", slug],
    state: (slug) => ["topics", slug, "state"],
};

export function useTopics() {
    return useQuery({
        queryKey: KEYS.list,
        queryFn: async () => (await topicsApi.list()).data.data,
    });
}

export function useTopic(slug) {
    return useQuery({
        queryKey: KEYS.detail(slug),
        queryFn: async () => (await topicsApi.get(slug)).data.data,
        enabled: !!slug,
    });
}

export function useTopicState(slug) {
    return useQuery({
        queryKey: KEYS.state(slug),
        queryFn: async () => (await topicsApi.state(slug)).data.data,
        enabled: !!slug,
    });
}

export function useEnrollInTopic() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ slug, preferences }) => topicsApi.enroll(slug, preferences),
        onSuccess: (_data, { slug }) => {
            qc.invalidateQueries({ queryKey: KEYS.list });
            qc.invalidateQueries({ queryKey: KEYS.state(slug) });
        },
    });
}

export function useUpdateEnrollment() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ slug, ...data }) => topicsApi.updateEnrollment(slug, data),
        onSuccess: (_data, { slug }) => {
            qc.invalidateQueries({ queryKey: KEYS.list });
            qc.invalidateQueries({ queryKey: KEYS.state(slug) });
        },
    });
}
