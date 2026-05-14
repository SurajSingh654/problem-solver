// ============================================================================
// FlashcardList — note-side flashcard panel
// ============================================================================
//
// Renders cards attached to a note. "+ New card" opens FlashcardForm.
// Each card shows front + a small SM-2 status pill (due / learning / reviewed).
// ============================================================================
import { useState } from "react";
import { useFlashcards, useArchiveFlashcard } from "@hooks/useFlashcards";
import FlashcardForm from "./FlashcardForm";
import FlashcardDraftReview from "@components/notes/FlashcardDraftReview";
import { Spinner } from "@components/ui/Spinner";
import { formatRelativeDate } from "@utils/formatters";
import { cn } from "@utils/cn";

function statusFor(card) {
    const due = new Date(card.nextReviewDate) <= new Date();
    if (due) return { label: "Due", classes: "bg-warning-soft text-warning-fg" };
    if (card.sm2Repetitions === 0)
        return { label: "New", classes: "bg-brand-soft text-brand-fg-soft" };
    return { label: "Learning", classes: "bg-surface-2 text-text-tertiary" };
}

export default function FlashcardList({ noteId }) {
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);
    const [reviewingDrafts, setReviewingDrafts] = useState(false);
    const { data: cards, isLoading } = useFlashcards({ noteId });
    const archive = useArchiveFlashcard();

    return (
        <div className="rounded-xl bg-surface-1 border border-border-default p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    🃏 Flashcards
                </h3>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setReviewingDrafts(true)}
                        className="text-[10px] font-bold text-brand-fg-soft hover:underline"
                    >
                        ✨ Generate from note
                    </button>
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="text-[10px] font-bold text-text-tertiary hover:text-text-primary"
                    >
                        + New card
                    </button>
                </div>
            </div>

            {isLoading ? (
                <Spinner size="sm" />
            ) : (cards?.length || 0) === 0 ? (
                <p className="text-xs text-text-disabled italic">
                    No flashcards yet. Create one manually, or wait for AI suggestions.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {cards.map((c) => {
                        const s = statusFor(c);
                        return (
                            <li
                                key={c.id}
                                className="rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors
                                           p-3 group"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditing(c)}
                                        className="text-left min-w-0 flex-1"
                                    >
                                        <p className="text-xs font-bold text-text-primary line-clamp-2">
                                            {c.front}
                                        </p>
                                        <p className="text-[10px] text-text-disabled mt-0.5">
                                            Next review {formatRelativeDate(c.nextReviewDate)}
                                            {c.aiGenerated ? " · ✨ AI" : ""}
                                        </p>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span
                                            className={cn(
                                                "text-[9px] font-bold uppercase tracking-widest px-1.5 py-px rounded-full",
                                                s.classes,
                                            )}
                                        >
                                            {s.label}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => archive.mutate(c.id)}
                                            className="text-text-disabled hover:text-danger-fg
                                                       opacity-0 group-hover:opacity-100 text-xs px-1"
                                            aria-label="Archive flashcard"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {creating && (
                <FlashcardForm noteId={noteId} onClose={() => setCreating(false)} />
            )}
            {editing && (
                <FlashcardForm
                    noteId={noteId}
                    existing={editing}
                    onClose={() => setEditing(null)}
                />
            )}
            {reviewingDrafts && (
                <FlashcardDraftReview
                    noteId={noteId}
                    onClose={() => setReviewingDrafts(false)}
                />
            )}
        </div>
    );
}
