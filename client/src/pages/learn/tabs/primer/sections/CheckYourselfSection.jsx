// Check Yourself — retrieval prompts sourced from concept.expectedQuestions.
// The section body has revealMode:
//   - "click"  → each prompt in a <details> accordion (default)
//   - "static" → plain read-only list (legacy pre-Phase-B behaviour)
//
// Section itself carries no content — it references the concept-level
// `expectedQuestions` JSON array. Optional `questionSlugs` filter is
// declared in the schema but not yet used by content — the current
// question shape is a plain string array.
export default function CheckYourselfSection({ section, concept }) {
    const questions = Array.isArray(concept?.expectedQuestions)
        ? concept.expectedQuestions
        : []
    if (questions.length === 0) return null
    const revealMode = section?.revealMode ?? 'click'

    return (
        <section className="space-y-3" aria-labelledby="primer-check-heading">
            <h3
                id="primer-check-heading"
                className="text-xs font-bold uppercase tracking-widest text-text-tertiary"
            >
                Check yourself
            </h3>
            <p className="text-xs text-text-tertiary leading-relaxed">
                If you can answer these without re-reading, you've understood
                the surface. Mastery shows up in practice and teaching, not
                reading. These are the exact prompts the Check-in tab will
                grade you on.
            </p>
            <ol className="space-y-2">
                {questions.map((q, i) => {
                    const label = (
                        <span className="text-[10px] font-bold font-mono text-text-tertiary shrink-0 mt-0.5">
                            Q{i + 1}
                        </span>
                    )
                    const body = (
                        <p className="text-xs text-text-secondary leading-relaxed">
                            {q}
                        </p>
                    )
                    if (revealMode === 'static') {
                        return (
                            <li
                                key={i}
                                className="bg-surface-1 border border-border-default rounded-xl p-3 flex items-start gap-3"
                            >
                                {label}
                                {body}
                            </li>
                        )
                    }
                    // "click" — the retrieval-practice affordance. Native
                    // <details> gives keyboard + screen-reader semantics
                    // free; author can later fill a sample answer here.
                    return (
                        <li key={i}>
                            <details className="bg-surface-1 border border-border-default rounded-xl group">
                                <summary className="cursor-pointer select-none p-3 flex items-start gap-3">
                                    {label}
                                    {body}
                                </summary>
                                <div className="px-3 pb-3 pt-1 pl-9 text-[11px] text-text-tertiary leading-relaxed">
                                    Try answering out loud before checking the
                                    primer. If you're stuck, that's the signal —
                                    re-read the mental model, then come back.
                                </div>
                            </details>
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}
