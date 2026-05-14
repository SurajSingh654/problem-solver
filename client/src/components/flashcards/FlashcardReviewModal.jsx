// ============================================================================
// FlashcardReviewModal — Recall → Reveal → Rate
// ============================================================================
//
// Mirrors the three-phase active-recall flow used by the Solutions
// review modal. SM-2 calculation runs server-side; the modal only sends
// a 1-5 confidence integer.
// ============================================================================
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReviewFlashcard } from "@hooks/useFlashcards";
import { MarkdownRenderer } from "@components/ui/MarkdownRenderer";
import { Button } from "@components/ui/Button";
import { CONFIDENCE_LEVELS } from "@utils/constants";
import { cn } from "@utils/cn";

export default function FlashcardReviewModal({ card, onClose, onAdvance }) {
    const [phase, setPhase] = useState("recall"); // 'recall' | 'reveal' | 'rate'
    const [confidence, setConfidence] = useState(null);
    const review = useReviewFlashcard();

    useEffect(() => {
        // Reset state when the card changes — the parent advances by
        // updating the `card` prop, not by remounting.
        setPhase("recall");
        setConfidence(null);
    }, [card?.id]);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function handleSubmit() {
        if (!confidence) return;
        await review.mutateAsync({ id: card.id, confidence });
        onAdvance?.();
    }

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
                className="w-full max-w-2xl bg-surface-1 border border-border-default
                           rounded-2xl shadow-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto"
            >
                {/* Phase indicator */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-text-disabled">Flashcard review</span>
                        <span className="text-text-tertiary">·</span>
                        <PhasePip active={phase === "recall"} label="Recall" />
                        <PhasePip active={phase === "reveal"} label="Reveal" />
                        <PhasePip active={phase === "rate"} label="Rate" />
                    </div>
                    <button
                        onClick={onClose}
                        className="text-text-tertiary hover:text-text-primary text-sm"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* FRONT — always visible */}
                <div className="rounded-xl border border-border-default bg-surface-2 p-5 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                        Prompt
                    </p>
                    <div className="text-base font-bold text-text-primary leading-relaxed">
                        {card.front}
                    </div>
                </div>

                {/* RECALL — encourage thinking before reveal */}
                {phase === "recall" && (
                    <div className="space-y-3">
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Try to recall the answer in your own head before revealing.
                            Active recall is the whole point — peeking immediately
                            short-circuits the SM-2 schedule.
                        </p>
                        <Button onClick={() => setPhase("reveal")}>
                            Reveal answer
                        </Button>
                    </div>
                )}

                {/* REVEAL */}
                {phase !== "recall" && (
                    <div className="rounded-xl border border-brand-line bg-brand-soft/40 p-5 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-fg-soft">
                            Answer
                        </p>
                        <MarkdownRenderer content={card.back} />
                    </div>
                )}

                {phase === "reveal" && (
                    <Button onClick={() => setPhase("rate")}>How well did you recall?</Button>
                )}

                {/* RATE */}
                {phase === "rate" && (
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                            Rate your recall
                        </p>
                        <div className="flex gap-2 flex-wrap">
                            {CONFIDENCE_LEVELS.map((c) => (
                                <button
                                    key={c.value}
                                    onClick={() => setConfidence(c.value)}
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all",
                                        "min-w-[68px]",
                                        confidence === c.value
                                            ? "bg-brand-soft border-brand-line scale-105"
                                            : "bg-surface-3 border-border-default hover:border-border-strong",
                                    )}
                                >
                                    <span className="text-xl">{c.emoji}</span>
                                    <span
                                        className={cn(
                                            "text-[10px] font-bold text-center leading-tight",
                                            confidence === c.value ? c.color : "text-text-disabled",
                                        )}
                                    >
                                        {c.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <Button
                            onClick={handleSubmit}
                            disabled={!confidence || review.isPending}
                        >
                            {review.isPending ? "Saving…" : "Save & next"}
                        </Button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

function PhasePip({ active, label }) {
    return (
        <span
            className={cn(
                "px-1.5 py-px rounded-full",
                active
                    ? "bg-brand-soft text-brand-fg-soft"
                    : "text-text-disabled",
            )}
        >
            {label}
        </span>
    );
}
