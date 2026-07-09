// Worked Example — a concrete walk-through applying the mental model.
// Bordered callout matching the pre-Phase-B visual treatment so learners
// see it as "here's it in action" not "here's more prose".
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function WorkedExampleSection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                Worked example
            </h3>
            <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                <MarkdownRenderer content={markdown} size="sm" />
            </div>
        </section>
    )
}
