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

export function useDeleteNotePermanent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => notesApi.deletePermanent(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["notes"] });
            toast.success("Note deleted permanently.");
        },
        onError: (err) =>
            toast.error(pickError(err, "Failed to delete note.")),
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

export function useNotesByEntity(type, id) {
    return useQuery({
        queryKey: ["notes", "by-entity", type, id],
        queryFn: () =>
            notesApi.listByEntity(type, id).then((r) => r.data.data.notes),
        enabled: Boolean(type && id),
        staleTime: 1000 * 30,
    });
}

export function useRelatedForNote(id) {
    return useQuery({
        queryKey: ["notes", "related", id],
        queryFn: () => notesApi.related(id).then((r) => r.data.data),
        enabled: Boolean(id),
        staleTime: 1000 * 60 * 2,
    });
}

export function useNoteTags() {
    return useQuery({
        queryKey: ["notes", "tags"],
        queryFn: () => notesApi.listTags().then((r) => r.data.data.tags),
        staleTime: 1000 * 60,
    });
}

export function useLinkSearch(type, q) {
    return useQuery({
        queryKey: ["notes", "link-search", type, q],
        queryFn: () =>
            notesApi.linkSearch(type, q).then((r) => r.data.data.results),
        enabled: Boolean(type),
        staleTime: 1000 * 15,
    });
}

export function useGenerateNoteSummary() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) =>
            notesApi.generateSummary(id).then((r) => r.data.data),
        onSuccess: (data, id) => {
            // Patch the cache immediately so the UI reflects the new
            // summary without waiting for a refetch round-trip. Without
            // this, a successful retry can briefly still render the
            // previous fallback banner.
            if (data?.summary) {
                qc.setQueryData(KEYS.ITEM(id), (prev) =>
                    prev
                        ? {
                            ...prev,
                            summary: data.summary,
                            summaryGeneratedAt: new Date().toISOString(),
                        }
                        : prev,
                );
            }
            qc.invalidateQueries({ queryKey: KEYS.ITEM(id) });
            if (data?.fallback) {
                toast.error(
                    "AI is currently unavailable — fallback applied. Try again in a moment.",
                );
            } else {
                toast.success("Summary generated.");
            }
        },
        onError: (err) => toast.error(pickError(err, "Failed to generate summary.")),
    });
}

export function useSuggestNoteTags() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => notesApi.suggestTags(id).then((r) => r.data.data),
        onSuccess: (data, id) => {
            if (Array.isArray(data?.tags)) {
                qc.setQueryData(KEYS.ITEM(id), (prev) =>
                    prev ? { ...prev, suggestedTags: data.tags } : prev,
                );
            }
            qc.invalidateQueries({ queryKey: KEYS.ITEM(id) });
            if (data?.fallback) {
                toast.error("AI tag suggestions unavailable — used heuristic fallback.");
            }
        },
        onError: (err) => toast.error(pickError(err, "Failed to suggest tags.")),
    });
}

export function useGenerateNoteFlashcards() {
    return useMutation({
        mutationFn: (id) =>
            notesApi.generateFlashcards(id).then((r) => r.data.data),
        onError: (err) =>
            toast.error(pickError(err, "Failed to generate flashcards.")),
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
