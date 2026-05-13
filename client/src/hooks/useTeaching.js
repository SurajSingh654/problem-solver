// ============================================================================
// Team Teaching Sessions — TanStack Query hooks
// ============================================================================
//
// Mirrors useFeedback.js / useDesignStudio.js conventions: namespaced
// query keys, mutation helpers that invalidate, toast on success/error.
//
// P0 covers list / detail / create / update / cancel / start / end. Later
// hooks (rate, flag, submitNotes, etc.) layer on without changing
// the existing surface.
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teachingApi } from "@services/teaching.api";
import { toast } from "@store/useUIStore";

const KEYS = {
    LIST: (params) => ["teaching", "list", params],
    ITEM: (id) => ["teaching", "item", id],
};

export function useTeachingSessions(params = {}) {
    return useQuery({
        queryKey: KEYS.LIST(params),
        queryFn: () => teachingApi.list(params).then((r) => r.data.data),
        staleTime: 1000 * 30,
    });
}

export function useTeachingSession(id, { pollAi = false } = {}) {
    return useQuery({
        queryKey: KEYS.ITEM(id),
        queryFn: () => teachingApi.get(id).then((r) => r.data.data.session),
        // Refetch every 3s for 30s after notes submit so AI artifacts
        // appear without a manual refresh. Caller flips `pollAi=true`
        // immediately after submit, then back to false after 30s.
        refetchInterval: pollAi ? 3000 : false,
        staleTime: 1000 * 15,
        enabled: Boolean(id),
    });
}

export function useCreateTeachingSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => teachingApi.create(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["teaching"] });
            toast.success("Teaching session scheduled.");
        },
        onError: (err) => {
            const msg =
                err?.response?.data?.error?.message ||
                err?.response?.data?.message ||
                "Failed to schedule teaching session.";
            toast.error(msg);
        },
    });
}

export function useUpdateTeachingSession(id) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => teachingApi.update(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["teaching"] });
            toast.success("Session updated.");
        },
        onError: (err) => {
            toast.error(
                err?.response?.data?.error?.message || "Failed to update session.",
            );
        },
    });
}

export function useCancelTeachingSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => teachingApi.cancel(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["teaching"] });
            toast.success("Session cancelled.");
        },
        onError: (err) => {
            toast.error(
                err?.response?.data?.error?.message || "Failed to cancel session.",
            );
        },
    });
}

export function useStartTeachingSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => teachingApi.start(id),
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: ["teaching"] });
            qc.invalidateQueries({ queryKey: KEYS.ITEM(id) });
        },
        onError: (err) => {
            toast.error(
                err?.response?.data?.error?.message || "Failed to start session.",
            );
        },
    });
}

export function useEndTeachingSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => teachingApi.end(id),
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: ["teaching"] });
            qc.invalidateQueries({ queryKey: KEYS.ITEM(id) });
            toast.success("Session ended. Add notes to unlock the AI summary.");
        },
        onError: (err) => {
            toast.error(
                err?.response?.data?.error?.message || "Failed to end session.",
            );
        },
    });
}

// REST mirrors of the WS join/leave handlers — used as a safety net
// when the socket isn't connected yet (e.g. immediately on detail-page
// mount) so attendance is recorded reliably.
export function useJoinTeachingSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => teachingApi.join(id),
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: KEYS.ITEM(id) });
        },
        // Errors from join (capacity, completed) bubble to the caller —
        // we don't toast here because the LiveRoom UI already surfaces
        // them inline.
    });
}

export function useLeaveTeachingSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => teachingApi.leave(id),
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: KEYS.ITEM(id) });
        },
    });
}
