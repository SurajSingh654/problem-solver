// Cheatsheet — compact reference. Collapsed by default on first visit;
// PrimerSectionRenderer passes `openByDefault` when a prior primer_read
// signal exists so return-visit learners see the reference expanded
// (their most likely intent when re-opening a concept for review).
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function CheatsheetSection({ section, openByDefault = false }) {
    const markdown = section?.markdown
    if (!markdown) return null
    return (
        <section className="space-y-3">
            <details
                open={openByDefault || undefined}
                className="bg-surface-2 border border-border-default rounded-xl group"
            >
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
