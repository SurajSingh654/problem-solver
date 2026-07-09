// Complexity — DSA time/space, SQL query plan cost, system-design
// throughput/latency, networking bandwidth. Cross-domain quantitative
// characterization. Author-supplied dimensions render as badges above
// the analysis prose.
import { Gauge } from 'lucide-react'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'

const DIMENSION_TONE = {
    time:      'bg-brand-soft   text-brand-fg-soft   border-brand-line',
    space:     'bg-info-soft    text-info-fg         border-info-line',
    io:        'bg-warning-soft text-warning-fg      border-warning-line',
    bandwidth: 'bg-success-soft text-success-fg      border-success-line',
    cost:      'bg-danger-soft  text-danger-fg       border-danger-line',
}

export default function ComplexitySection({ section }) {
    const markdown = section?.markdown
    if (!markdown) return null
    const dimensions = Array.isArray(section?.dimensions) ? section.dimensions : []
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5" aria-hidden="true" />
                Complexity
            </h3>
            {dimensions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {dimensions.map((d) => (
                        <span
                            key={d}
                            className={`inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap text-[10px] uppercase tracking-wider px-2 py-0.5 ${DIMENSION_TONE[d] ?? DIMENSION_TONE.time}`}
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
