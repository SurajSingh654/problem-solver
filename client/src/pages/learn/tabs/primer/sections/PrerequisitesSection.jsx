// Prerequisites — links to prereq concepts + author-supplied hint notes.
// Data comes from the parent concept's `prerequisites` relation (fetched
// on getConceptDetail) — the section entry may only carry a top-level
// note. If both are empty we render nothing.
import { Link } from 'react-router-dom'
import { ArrowUpRight, GraduationCap } from 'lucide-react'

export default function PrerequisitesSection({ section, concept, topicSlug }) {
    const prereqs = Array.isArray(concept?.prerequisites) ? concept.prerequisites : []
    const note = section?.note

    if (prereqs.length === 0 && !note) return null

    return (
        <section
            className="space-y-3 rounded-xl border border-warning-line bg-warning-soft p-4"
            aria-labelledby="primer-prereqs-heading"
        >
            <h3
                id="primer-prereqs-heading"
                className="text-xs font-bold uppercase tracking-widest text-warning-fg flex items-center gap-2"
            >
                <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />
                Before you start
            </h3>
            {note && (
                <p className="text-sm text-warning-fg leading-relaxed">{note}</p>
            )}
            {prereqs.length > 0 && (
                <ul className="space-y-2">
                    {prereqs.map((p) => {
                        const prereq = p.prereq
                        if (!prereq) return null
                        const isPublished = prereq.status === 'PUBLISHED'
                        return (
                            <li key={p.id}>
                                {isPublished ? (
                                    <Link
                                        to={`/learn/${topicSlug}/concepts/${prereq.slug}`}
                                        className="group flex items-start gap-2 rounded-lg bg-surface-1 border border-border-default p-3 hover:border-warning-line transition-colors"
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-text-primary group-hover:text-warning-fg">
                                                {prereq.name}
                                            </p>
                                            {p.hintNote && (
                                                <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                                                    {p.hintNote}
                                                </p>
                                            )}
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-text-tertiary group-hover:text-warning-fg shrink-0 mt-0.5" />
                                    </Link>
                                ) : (
                                    <div className="rounded-lg bg-surface-1 border border-border-default p-3 opacity-70">
                                        <p className="text-sm font-semibold text-text-secondary">
                                            {prereq.name}{' '}
                                            <span className="text-[10px] font-mono text-text-tertiary">
                                                (not yet published)
                                            </span>
                                        </p>
                                        {p.hintNote && (
                                            <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                                                {p.hintNote}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
