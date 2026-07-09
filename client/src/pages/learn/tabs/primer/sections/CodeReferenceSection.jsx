// Code Reference — syntax / API / config / query examples. Reused across
// programming-language, framework, SQL, and AI Eng SDK curricula.
import { Terminal } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function CodeReferenceSection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    const kindLabel = section?.kind ?? section?.language ?? null
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                Code reference
                {kindLabel && (
                    <span className="text-[10px] font-mono opacity-60 normal-case tracking-normal">
                        · {kindLabel}
                    </span>
                )}
            </h3>
            <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                <MarkdownRenderer content={markdown} size="sm" />
            </div>
        </section>
    )
}
