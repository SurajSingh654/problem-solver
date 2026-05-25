// ============================================================================
// Topic Mastery Tracks — Hooks (v1 scaffold)
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { topicsApi } from "@services/topics.api";

const KEYS = {
    list: ["topics"],
    detail: (slug) => ["topics", slug],
    state: (slug) => ["topics", slug, "state"],
    calibration: (slug) => ["topics", slug, "calibration"],
    concept: (slug, conceptSlug) => ["topics", slug, "concepts", conceptSlug],
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

export function useTopicCalibration(slug) {
    return useQuery({
        queryKey: KEYS.calibration(slug),
        queryFn: async () => (await topicsApi.getCalibration(slug)).data.data,
        enabled: !!slug,
        // Calibration questions don't change in-session; cache aggressively.
        staleTime: 5 * 60 * 1000,
    });
}

export function useSubmitCalibration(slug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (responses) => topicsApi.submitCalibration(slug, responses),
        onSuccess: () => {
            // Mentor next-action depends on calibration; invalidate state.
            // Calibration query also refetches so the existing-result banner
            // updates if the user re-takes from the same session.
            qc.invalidateQueries({ queryKey: KEYS.list });
            qc.invalidateQueries({ queryKey: KEYS.state(slug) });
            qc.invalidateQueries({ queryKey: KEYS.calibration(slug) });
        },
    });
}

export function useConcept(slug, conceptSlug) {
    return useQuery({
        queryKey: KEYS.concept(slug, conceptSlug),
        queryFn: async () =>
            (await topicsApi.getConcept(slug, conceptSlug)).data.data,
        enabled: !!slug && !!conceptSlug,
        staleTime: 5 * 60 * 1000,
    });
}

export function useMarkConceptRead(slug, conceptSlug) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => topicsApi.markConceptRead(slug, conceptSlug),
        onSuccess: () => {
            // Mark-read changes mastery + nextAction; refresh both views.
            qc.invalidateQueries({ queryKey: KEYS.state(slug) });
            qc.invalidateQueries({ queryKey: KEYS.concept(slug, conceptSlug) });
        },
    });
}
