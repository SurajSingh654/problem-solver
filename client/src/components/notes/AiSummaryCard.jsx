// ============================================================================
// AiSummaryCard — renders the persisted note.summary blob
// ============================================================================
import { useGenerateNoteSummary } from "@hooks/useNotes";
import { Button } from "@components/ui/Button";

export default function AiSummaryCard({ note }) {
    const generate = useGenerateNoteSummary();
    const summary = note.summary;
    const generated = !!summary;
    const isFallback = !!summary?._fallback;

    function handleGenerate() {
        generate.mutate(note.id);
    }

    if (!generated) {
        return (
            <div className="rounded-xl bg-surface-1 border border-border-default p-4 space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        ✨ AI summary
                    </h3>
                    <Button
                        size="sm"
                        onClick={handleGenerate}
                        disabled={generate.isPending}
                    >
                        {generate.isPending ? "Generating…" : "Generate summary"}
                    </Button>
                </div>
                <p className="text-xs text-text-disabled italic">
                    Get a TL;DR + key takeaways + open questions in seconds.
                </p>
            </div>
        );
    }

    // Distinct UI for fallback — the previous design rendered the
    // fallback's filler text the same way as a real summary, which made
    // it look like AI succeeded when it hadn't.
    if (isFallback) {
        const reason = note._lastSummaryFallbackReason;
        return (
            <div className="rounded-xl bg-warning-soft border border-warning-line p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-warning-fg">
                        ⚠️ AI summary unavailable
                    </h3>
                    <Button
                        size="sm"
                        onClick={handleGenerate}
                        disabled={generate.isPending}
                    >
                        {generate.isPending ? "Retrying…" : "Retry"}
                    </Button>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                    The AI service couldn't be reached or returned an output that
                    failed validation. No summary was generated. Your note is unchanged.
                </p>
                {reason && (
                    <div className="text-[11px] text-text-disabled">
                        <span className="font-bold">Reason:</span>{" "}
                        <code className="font-mono">{reason}</code>
                    </div>
                )}
                <p className="text-[11px] text-text-disabled">
                    Common causes: <code className="font-mono text-[10px]">OPENAI_API_KEY</code> not set,
                    daily AI limit hit, model returned malformed JSON, or note exceeds the input window.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl bg-surface-1 border border-border-default p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    ✨ AI summary
                </h3>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleGenerate}
                        disabled={generate.isPending}
                    >
                        {generate.isPending ? "Regenerating…" : "Regenerate"}
                    </Button>
                </div>
            </div>

            {summary.tldr && (
                <p className="text-sm font-bold text-text-primary leading-relaxed">
                    {summary.tldr}
                </p>
            )}

            {summary.keyTakeaways?.length > 0 && (
                <Section title="Key takeaways">
                    <ul className="space-y-1.5">
                        {summary.keyTakeaways.map((t, i) => (
                            <li
                                key={i}
                                className="text-xs text-text-secondary leading-relaxed pl-3
                                           border-l-2 border-brand-line"
                            >
                                {t}
                            </li>
                        ))}
                    </ul>
                </Section>
            )}

            {summary.openQuestions?.length > 0 && (
                <Section title="Open questions">
                    <ul className="space-y-1">
                        {summary.openQuestions.map((q, i) => (
                            <li key={i} className="text-xs text-text-tertiary italic">
                                ❓ {q}
                            </li>
                        ))}
                    </ul>
                </Section>
            )}

            {summary.suggestedReviewFocus && (
                <Section title="Review focus">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        {summary.suggestedReviewFocus}
                    </p>
                </Section>
            )}

            {note.summaryGeneratedAt && (
                <p className="text-[10px] text-text-disabled text-right">
                    Generated{" "}
                    {new Date(note.summaryGeneratedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                    })}
                </p>
            )}
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                {title}
            </p>
            {children}
        </div>
    );
}
