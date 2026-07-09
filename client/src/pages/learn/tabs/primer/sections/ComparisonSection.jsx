// Comparison — tradeoffs, pattern-vs-pattern, language versions, protocol
// choice, DB choice. Cross-domain "how does X differ from Y" slot.
// Author-supplied dimensions render as chips above the markdown to nudge
// a structured comparison shape (usually a markdown table).
import { GitCompare } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function ComparisonSection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    const dimensions = Array.isArray(section?.dimensions) ? section.dimensions : []
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
                Comparison
            </h3>
            {dimensions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {dimensions.map((d) => (
                        <span
                            key={d}
                            className="inline-flex items-center rounded-full border border-border-default bg-surface-2 text-text-tertiary font-semibold leading-none whitespace-nowrap text-[10px] uppercase tracking-wider px-2 py-0.5"
                        >
                            {d}
                        </span>
                    ))}
                </div>
            )}
            <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                <MarkdownRenderer content={markdown} size="sm" />
            </div>
        </section>
    )
}
