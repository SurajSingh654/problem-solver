// ============================================================================
// Flashcards — TanStack Query hooks (P5)
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flashcardsApi } from "@services/flashcards.api";
import { toast } from "@store/useUIStore";

const KEYS = {
    LIST: (params) => ["flashcards", "list", params],
    QUEUE: () => ["flashcards", "queue"],
    STATS: () => ["flashcards", "stats"],
};

function pickError(err, fallback) {
    return (
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        fallback
    );
}

export function useFlashcards(params = {}) {
    return useQuery({
        queryKey: KEYS.LIST(params),
        queryFn: () =>
            flashcardsApi.list(params).then((r) => r.data.data.flashcards),
        staleTime: 1000 * 30,
    });
}

export function useFlashcardQueue({ enabled = true } = {}) {
    return useQuery({
        queryKey: KEYS.QUEUE(),
        queryFn: () => flashcardsApi.queue().then((r) => r.data.data),
        staleTime: 1000 * 15,
        enabled,
    });
}

export function useFlashcardStats() {
    return useQuery({
        queryKey: KEYS.STATS(),
        queryFn: () => flashcardsApi.stats().then((r) => r.data.data),
        staleTime: 1000 * 60,
    });
}

export function useCreateFlashcards() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => flashcardsApi.create(data).then((r) => r.data.data),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ["flashcards"] });
            qc.invalidateQueries({ queryKey: ["notes"] });
            const count = data?.count ?? 1;
            toast.success(count === 1 ? "Flashcard created." : `${count} flashcards created.`);
        },
        onError: (err) => toast.error(pickError(err, "Failed to create flashcards.")),
    });
}

export function useUpdateFlashcard(id) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => flashcardsApi.update(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["flashcards"] }),
        onError: (err) => toast.error(pickError(err, "Failed to update flashcard.")),
    });
}

export function useArchiveFlashcard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => flashcardsApi.archive(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["flashcards"] });
            qc.invalidateQueries({ queryKey: ["notes"] });
            toast.success("Flashcard archived.");
        },
        onError: (err) => toast.error(pickError(err, "Failed to archive flashcard.")),
    });
}

export function useReviewFlashcard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, confidence }) =>
            flashcardsApi.review(id, { confidence }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["flashcards"] });
        },
        onError: (err) => toast.error(pickError(err, "Failed to record review.")),
    });
}
