// Cheatsheet — compact reference. Collapsed by default (first-visit
// learner isn't distracted; return-visit learner expands or Phase D
// flips it to open-by-default when a prior primer_read signal exists).
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function CheatsheetSection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    return (
        <section className="space-y-3">
            <details className="bg-surface-2 border border-border-default rounded-xl group">
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-text-tertiary hover:text-text-secondary">
                    <span>Cheatsheet</span>
                    <span aria-hidden="true" className="text-[10px] font-mono opacity-60 group-open:hidden">
                        expand
                    </span>
                    <span aria-hidden="true" className="text-[10px] font-mono opacity-60 hidden group-open:inline">
                        collapse
                    </span>
                </summary>
                <div className="px-4 pb-4 border-t border-border-default pt-3">
                    <MarkdownRenderer content={markdown} size="sm" />
                </div>
            </details>
        </section>
    )
}
