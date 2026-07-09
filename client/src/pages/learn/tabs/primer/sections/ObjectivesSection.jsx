// Objectives — the reader's contract for what they'll be able to DO after
// this concept. 2-6 items. Bloom-verb label optional.
import { Target } from 'lucide-react'

const BLOOM_TONE = {
    remember:   'bg-surface-3     text-text-tertiary   border-border-default',
    understand: 'bg-info-soft     text-info-fg         border-info-line',
    apply:      'bg-brand-soft    text-brand-fg-soft   border-brand-line',
    analyze:    'bg-warning-soft  text-warning-fg      border-warning-line',
    evaluate:   'bg-warning-soft  text-warning-fg      border-warning-line',
    create:     'bg-success-soft  text-success-fg      border-success-line',
}

export default function ObjectivesSection({ section }) {
    const items = Array.isArray(section?.items) ? section.items : []
    if (items.length === 0) return null
    return (
        <section className="space-y-3" aria-labelledby="primer-objectives-heading">
            <h3
                id="primer-objectives-heading"
                className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2"
            >
                <Target className="w-3.5 h-3.5" aria-hidden="true" />
                Learning objectives
            </h3>
            <ol className="space-y-2">
                {items.map((it, i) => (
                    <li
                        key={i}
                        className="bg-surface-2 border border-border-default rounded-xl p-3 flex items-start gap-3"
                    >
                        <span className="text-[10px] font-bold font-mono text-text-tertiary shrink-0 mt-0.5">
                            {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="flex-1">
                            <p className="text-sm text-text-primary leading-snug">
                                <span className="font-semibold">{it.verb}</span>{' '}
                                <span>{it.outcome}</span>
                            </p>
                            {it.bloomLevel && (
                                <span
                                    className={`inline-flex items-center rounded-full border font-semibold leading-none whitespace-nowrap text-[10px] uppercase tracking-wider px-2 py-0.5 mt-1.5 ${BLOOM_TONE[it.bloomLevel] ?? BLOOM_TONE.remember}`}
                                >
                                    {it.bloomLevel}
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    )
}
