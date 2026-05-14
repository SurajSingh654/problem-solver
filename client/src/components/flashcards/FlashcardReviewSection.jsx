// ============================================================================
// FlashcardReviewSection — drop-in panel for ReviewQueuePage
// ============================================================================
//
// Self-contained: hidden when the notes feature flag is off, otherwise
// renders a panel showing due-flashcard count + a "Review now" CTA that
// cycles through the queue via FlashcardReviewModal. The Solutions
// review flow on the same page is untouched.
// ============================================================================
import { useState, useMemo } from "react";
import { useFlashcardQueue } from "@hooks/useFlashcards";
import FlashcardReviewModal from "./FlashcardReviewModal";
import { Button } from "@components/ui/Button";
import { Spinner } from "@components/ui/Spinner";

export default function FlashcardReviewSection() {
    const flagOn = import.meta.env.VITE_FEATURE_NOTES_ENABLED === "true";
    const { data, isLoading } = useFlashcardQueue({ enabled: flagOn });
    const [reviewing, setReviewing] = useState(false);
    const [index, setIndex] = useState(0);

    const due = useMemo(() => data?.due || [], [data]);
    const upcoming = data?.upcoming || [];

    if (!flagOn) return null;

    function handleStart() {
        if (due.length === 0) return;
        setIndex(0);
        setReviewing(true);
    }

    function handleAdvance() {
        if (index + 1 >= due.length) {
            setReviewing(false);
            return;
        }
        setIndex(index + 1);
    }

    return (
        <div className="rounded-xl bg-surface-1 border border-border-default p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-sm font-extrabold text-text-primary">
                        🃏 Flashcards
                    </h2>
                    <p className="text-[11px] text-text-tertiary">
                        Spaced-repetition cards from your notes.
                    </p>
                </div>
                {isLoading ? (
                    <Spinner size="sm" />
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="text-[10px] text-text-disabled">
                            <span className="font-bold text-warning-fg">{due.length}</span> due ·{" "}
                            <span className="font-bold text-text-secondary">{upcoming.length}</span> upcoming
                        </div>
                        <Button onClick={handleStart} disabled={due.length === 0}>
                            {due.length === 0 ? "Nothing due" : `Review ${due.length}`}
                        </Button>
                    </div>
                )}
            </div>

            {reviewing && due[index] && (
                <FlashcardReviewModal
                    card={due[index]}
                    onAdvance={handleAdvance}
                    onClose={() => setReviewing(false)}
                />
            )}
        </div>
    );
}
