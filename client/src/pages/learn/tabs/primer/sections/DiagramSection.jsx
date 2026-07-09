// Diagram — architecture / UML / data flow / packet flow. Cross-domain
// visual slot. Render precedence (highest → lowest):
//   1. inline Excalidraw scene (Phase D — preferred; travels with concept)
//   2. hosted image URL
//   3. ASCII-art markdown fallback
// Caption below either.
import { useMemo } from 'react'
import { Network } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'

/**
 * Parse the stored Excalidraw JSON (a stringified `elements` array from
 * ExcalidrawEditor.onChange) into the `initialData` shape the component
 * expects. Return null on malformed JSON so the caller can fall through
 * to the next render tier.
 */
function parseExcalidrawScene(raw) {
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return null
        return { elements: parsed }
    } catch {
        return null
    }
}

export default function DiagramSection({ section }) {
    const url = section?.diagramUrl
    const markdown = section?.markdown
    const excalidraw = section?.excalidraw
    const caption = section?.caption
    const excalidrawScene = useMemo(
        () => parseExcalidrawScene(excalidraw),
        [excalidraw],
    )
    if (!url && !markdown && !excalidrawScene) return null
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                <Network className="w-3.5 h-3.5" aria-hidden="true" />
                Diagram
            </h3>
            <figure className="space-y-2">
                <div className="rounded-xl border border-border-default bg-surface-2 p-4">
                    {excalidrawScene ? (
                        // View-mode: pans + zooms but no edits. Fixed height
                        // matches the read-only Design Studio treatment.
                        <div className="h-[420px] w-full rounded-lg overflow-hidden bg-surface-1">
                            <ExcalidrawEditor
                                initialData={excalidrawScene}
                                viewModeEnabled
                            />
                        </div>
                    ) : url ? (
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
