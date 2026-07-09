// Gotchas — anti-patterns, failure modes, common mistakes, edge cases.
// Warning-toned callout so it's visually distinct from the neutral body.
import { AlertTriangle } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function GotchasSection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    return (
        <section
            className="space-y-3 rounded-xl border border-warning-line bg-warning-soft p-5"
            aria-labelledby="primer-gotchas-heading"
        >
            <h3
                id="primer-gotchas-heading"
                className="text-xs font-bold uppercase tracking-widest text-warning-fg flex items-center gap-2"
            >
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Gotchas
            </h3>
            <MarkdownRenderer content={markdown} size="sm" />
        </section>
    )
}
