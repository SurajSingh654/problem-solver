// Mental Model — the "picture in your head" section. Distinct callout
// treatment so it stands out from the deep-dive body.
import { Lightbulb } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function MentalModelSection({ section }) {
    const markdown = section?.markdown
    const diagramUrl = section?.diagramUrl
    if (!markdown && !diagramUrl) return null
    return (
        <section
            className="space-y-3 rounded-xl border border-brand-line bg-brand-soft/40 p-5"
            aria-labelledby="primer-mental-model-heading"
        >
            <h3
                id="primer-mental-model-heading"
                className="text-xs font-bold uppercase tracking-widest text-brand-fg-soft flex items-center gap-2"
            >
                <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                Mental model
            </h3>
            {diagramUrl && (
                <img
                    src={diagramUrl}
                    alt=""
                    className="w-full rounded-lg border border-brand-line bg-surface-1"
                />
            )}
            {markdown && <MarkdownRenderer content={markdown} size="sm" />}
        </section>
    )
}
