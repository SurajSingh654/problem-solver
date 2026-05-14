// ============================================================================
// FlashcardDraftReview — review AI-generated flashcard drafts
// ============================================================================
//
// Loads drafts from POST /notes/:id/ai/flashcards. User toggles each
// card's "accept" checkbox, optionally edits front/back, then bulk
// creates the accepted set via POST /flashcards.
// ============================================================================
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useGenerateNoteFlashcards } from "@hooks/useNotes";
import { useCreateFlashcards } from "@hooks/useFlashcards";
import { Button } from "@components/ui/Button";
import { Spinner } from "@components/ui/Spinner";
import { cn } from "@utils/cn";

const TYPE_PILL = {
    CONCEPT: { label: "Concept", classes: "bg-brand-soft text-brand-fg-soft" },
    DEFINITION: { label: "Definition", classes: "bg-success-soft text-success-fg" },
    CONTRAST: { label: "Contrast", classes: "bg-warning-soft text-warning-fg" },
};

export default function FlashcardDraftReview({ noteId, onClose }) {
    const generate = useGenerateNoteFlashcards();
    const create = useCreateFlashcards();
    const [drafts, setDrafts] = useState([]);
    const [accepted, setAccepted] = useState(new Set());
    const [fallback, setFallback] = useState(false);

    // Fire generation on mount
    useEffect(() => {
        let mounted = true;
        generate.mutate(noteId, {
            onSuccess: (data) => {
                if (!mounted) return;
                setDrafts(data?.drafts || []);
                setFallback(!!data?.fallback);
                // Default to all accepted; user opts out per card.
                setAccepted(new Set((data?.drafts || []).map((_, i) => i)));
            },
        });
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteId]);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    function toggle(i) {
        const next = new Set(accepted);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        setAccepted(next);
    }

    function patchDraft(i, patch) {
        setDrafts(drafts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    }

    async function handleConfirm() {
        const cards = drafts
            .filter((_, i) => accepted.has(i))
            .map((d) => ({
                front: d.front,
                back: d.back,
                tags: d.tagSuggestions || [],
                aiGenerated: true,
            }));
        if (cards.length === 0) return;
        await create.mutateAsync({ noteId, cards });
        onClose?.();
    }

    const isLoading = generate.isPending && drafts.length === 0;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm
                       flex items-center justify-center p-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-3xl bg-surface-1 border border-border-default
                           rounded-2xl shadow-2xl flex flex-col max-h-[88vh]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div>
                        <h2 className="text-base font-extrabold text-text-primary">
                            ✨ AI flashcard drafts
                        </h2>
                        <p className="text-[11px] text-text-tertiary">
                            Review each draft, edit if needed, accept the keepers.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-text-tertiary hover:text-text-primary text-sm"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center gap-2">
                            <Spinner />
                            <p className="text-xs text-text-disabled">
                                Extracting flashcards from your note…
                            </p>
                        </div>
                    ) : drafts.length === 0 ? (
                        <p className="text-xs text-text-disabled italic text-center py-8">
                            No drafts returned. Try adding more content to the note first.
                        </p>
                    ) : (
                        <>
                            {fallback && (
                                <div className="p-3 rounded-lg bg-warning-soft border border-warning-line text-[11px] text-warning-fg">
                                    AI is currently unavailable — these drafts come from a
                                    deterministic fallback. Edit before accepting.
                                </div>
                            )}
                            {drafts.map((d, i) => {
                                const isAccepted = accepted.has(i);
                                const pill = TYPE_PILL[d.type] || TYPE_PILL.CONCEPT;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "rounded-xl border p-4 space-y-2 transition-colors",
                                            isAccepted
                                                ? "bg-surface-2 border-brand-line"
                                                : "bg-surface-1 border-border-subtle opacity-60",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isAccepted}
                                                    onChange={() => toggle(i)}
                                                    className="w-4 h-4 accent-brand-400"
                                                />
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                                                    Accept
                                                </span>
                                            </label>
                                            <span
                                                className={cn(
                                                    "text-[9px] font-bold uppercase tracking-widest px-1.5 py-px rounded-full",
                                                    pill.classes,
                                                )}
                                            >
                                                {pill.label}
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                                                Front
                                            </label>
                                            <textarea
                                                value={d.front}
                                                onChange={(e) =>
                                                    patchDraft(i, { front: e.target.value })
                                                }
                                                disabled={!isAccepted}
                                                rows={2}
                                                maxLength={200}
                                                className="w-full text-xs p-2 rounded-md bg-surface-3
                                                           border border-border-default outline-none
                                                           focus:border-brand-line resize-none
                                                           disabled:opacity-60"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                                                Back
                                            </label>
                                            <textarea
                                                value={d.back}
                                                onChange={(e) =>
                                                    patchDraft(i, { back: e.target.value })
                                                }
                                                disabled={!isAccepted}
                                                rows={3}
                                                maxLength={500}
                                                className="w-full text-xs p-2 rounded-md bg-surface-3
                                                           border border-border-default outline-none
                                                           focus:border-brand-line resize-none
                                                           disabled:opacity-60"
                                            />
                                        </div>

                                        {(d.tagSuggestions || []).length > 0 && (
                                            <div className="flex items-center flex-wrap gap-1">
                                                <span className="text-[10px] text-text-disabled">
                                                    Tags:
                                                </span>
                                                {d.tagSuggestions.map((t) => (
                                                    <span
                                                        key={t}
                                                        className="text-[10px] font-bold px-1.5 py-px rounded
                                                                   bg-surface-3 text-text-tertiary border border-border-subtle"
                                                    >
                                                        #{t}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-5 border-t border-border-subtle">
                    <p className="text-[11px] text-text-tertiary">
                        {accepted.size} of {drafts.length} selected
                    </p>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={accepted.size === 0 || create.isPending}
                        >
                            {create.isPending
                                ? "Creating…"
                                : `Create ${accepted.size} card${accepted.size === 1 ? "" : "s"}`}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
