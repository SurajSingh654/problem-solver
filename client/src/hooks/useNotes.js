// ============================================================================
// Notes — TanStack Query hooks (P0)
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notesApi } from "@services/notes.api";
import { toast } from "@store/useUIStore";

const KEYS = {
    LIST: (params) => ["notes", "list", params],
    ITEM: (id) => ["notes", "item", id],
};

function pickError(err, fallback) {
    return (
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        fallback
    );
}

export function useNotes(params = {}) {
    return useQuery({
        queryKey: KEYS.LIST(params),
        queryFn: () => notesApi.list(params).then((r) => r.data.data),
        staleTime: 1000 * 30,
    });
}

export function useNote(id) {
    return useQuery({
        queryKey: KEYS.ITEM(id),
        queryFn: () => notesApi.get(id).then((r) => r.data.data.note),
        enabled: Boolean(id),
        staleTime: 1000 * 15,
    });
}

export function useCreateNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => notesApi.create(data).then((r) => r.data.data.note),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["notes"] });
            toast.success("Note created.");
        },
        onError: (err) => toast.error(pickError(err, "Failed to create note.")),
    });
}

export function useUpdateNote(id) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => notesApi.update(id, data).then((r) => r.data.data.note),
        onSuccess: (note) => {
            qc.setQueryData(KEYS.ITEM(id), note);
            qc.invalidateQueries({ queryKey: ["notes", "list"] });
        },
        onError: (err) => toast.error(pickError(err, "Failed to save note.")),
    });
}

export function useArchiveNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => notesApi.archive(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["notes"] });
            toast.success("Note archived.");
        },
        onError: (err) => toast.error(pickError(err, "Failed to archive note.")),
    });
}

export function useRestoreNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => notesApi.restore(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["notes"] });
            toast.success("Note restored.");
        },
        onError: (err) => toast.error(pickError(err, "Failed to restore note.")),
    });
}

export function useTogglePinNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => notesApi.togglePin(id).then((r) => r.data.data.note),
        onSuccess: (note) => {
            qc.setQueryData(KEYS.ITEM(note.id), note);
            qc.invalidateQueries({ queryKey: ["notes", "list"] });
        },
        onError: (err) => toast.error(pickError(err, "Failed to update pin.")),
    });
}
