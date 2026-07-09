// Diagram — architecture / UML / data flow / packet flow. Cross-domain
// visual slot. Renders the diagramUrl image when present, ASCII-art
// markdown fallback otherwise. Caption below.
import { Network } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function DiagramSection({ section }) {
    const url = section?.diagramUrl
    const markdown = section?.markdown
    const caption = section?.caption
    if (!url && !markdown) return null
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                <Network className="w-3.5 h-3.5" aria-hidden="true" />
                Diagram
            </h3>
            <figure className="space-y-2">
                <div className="rounded-xl border border-border-default bg-surface-2 p-4">
                    {url ? (
                        <img
                            src={url}
                            alt={caption ?? ''}
                            className="w-full rounded-lg bg-surface-1"
                        />
                    ) : (
                        <MarkdownRenderer content={markdown} size="sm" />
                    )}
                </div>
                {caption && (
                    <figcaption className="text-[11px] text-text-tertiary leading-relaxed">
                        {caption}
                    </figcaption>
                )}
            </figure>
        </section>
    )
}
