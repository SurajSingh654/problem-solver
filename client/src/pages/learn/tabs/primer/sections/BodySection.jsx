// Body — free-form deep-dive markdown. Uses the shared MarkdownRenderer
// which already promotes authored `##` to `<h3>` so the primer outline
// nests properly under the page's h1 + tabpanel structure.
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

export default function BodySection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    return (
        <section className="space-y-3">
            {section?.heading && (
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    {section.heading}
                </h3>
            )}
            <MarkdownRenderer content={markdown} />
        </section>
    )
}
