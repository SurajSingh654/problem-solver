// ══════════════════════════════════════════════════════════════════════
// ReferenceTradeoffCard — named trade-off from a reference architecture
// ══════════════════════════════════════════════════════════════════════
//
// Each reference ships with 3–5 trade-offs the author explicitly named:
// `{ choice, alternative, reason }` triples. Rendering them as named
// alternatives (rather than a single "answer") prevents the "the book
// says X is right" framing — it teaches students to see each decision
// as picking among viable options with known cost.
// ══════════════════════════════════════════════════════════════════════
export default function ReferenceTradeoffCard({ tradeoff, index }) {
    if (!tradeoff) return null
    const { choice, alternative, reason } = tradeoff
    return (
        <div className="bg-surface-1 border border-border-default rounded-xl p-3.5">
            <div className="flex items-start gap-2 mb-2">
                <span className="text-[10px] font-mono text-text-disabled mt-px">
                    #{(index ?? 0) + 1}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary leading-snug">
                        {choice}
                    </p>
                    {alternative && (
                        <p className="text-[11px] text-text-tertiary mt-1 leading-snug">
                            <span className="text-text-disabled">Alternative: </span>
                            {alternative}
                        </p>
                    )}
                </div>
            </div>
            {reason && (
                <p className="text-[11px] text-text-secondary leading-relaxed border-t border-border-subtle pt-2">
                    {reason}
                </p>
            )}
        </div>
    )
}
