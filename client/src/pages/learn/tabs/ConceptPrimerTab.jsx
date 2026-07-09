// ============================================================================
// ConceptPrimerTab — shell around the section-model Primer (Phase B)
// ============================================================================
//
// The primer body is now a series of typed sections (objectives, prereqs,
// mental model, body, worked example, check yourself, cheatsheet, code
// reference, diagram, comparison, gotchas, complexity). Ordering comes
// from `concept.primerSections`; each entry dispatches through
// `sectionRegistry` in `./primer/PrimerSectionRenderer`. When the array
// is empty (rare — backfill covered all pre-existing concepts) the
// renderer derives an equivalent from the legacy flat fields.
//
// This shell keeps three concerns that DON'T belong in individual sections:
//   1. Fire the `primer_read` engagement signal on mount (weight 0, dedup 24h).
//   2. The `canonicalSources` sidebar — a cross-cutting reading list
//      (source-grounded honesty), not a per-section artifact.
//   3. The footer CTA to Lab — flow control, owned by the tab shell.
// ============================================================================
import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { useMarkPrimerRead } from '@hooks/useCurriculumLearn'
import PrimerSectionRenderer from './primer/PrimerSectionRenderer'

export default function ConceptPrimerTab({ concept, onGoToLab }) {
    const markPrimerRead = useMarkPrimerRead()
    const prefersReducedMotion = useReducedMotion()

    // Fire once per concept-slug mount. Deliberately depends ONLY on the
    // slug — re-running when the mutation identity changes would double-
    // fire on every re-render. The lint suppression is intentional.
    useEffect(() => {
        if (concept?.slug) {
            markPrimerRead.mutate(concept.slug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [concept?.slug])

    const canonicalSources = concept?.canonicalSources ?? []
    const topicSlug = concept?.topic?.slug

    return (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-8">
            {/* ── Primer body (section-model) ─────────────────────── */}
            <article className="space-y-8 min-w-0">
                <PrimerSectionRenderer concept={concept} topicSlug={topicSlug} />

                {/* Footer CTA — flow to Lab.
                    - `flex-wrap` on narrow screens so the tagline stacks
                      above the button instead of horizontally overflowing.
                    - Fade animation short-circuits when the user has
                      requested reduced motion (framer-motion does NOT
                      respect the media query by default). */}
                <motion.div
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.1 }}
                    className="pt-4 border-t border-border-default flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap"
                >
                    <p className="text-xs text-text-tertiary leading-relaxed max-w-md">
                        Reading is the start of learning, not proof of it —
                        the real signal comes from practising the pattern.
                    </p>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={onGoToLab}
                    >
                        Ready to practise? →
                    </Button>
                </motion.div>
            </article>

            {/* ── Sources sidebar ─────────────────────────────── */}
            <aside
                className="space-y-4 md:sticky md:top-6 md:self-start"
                aria-label="Canonical sources"
            >
                {canonicalSources.length > 0 && (
                    <section className="space-y-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                            Canonical sources
                        </h3>
                        <ul className="space-y-2">
                            {canonicalSources.map((src, i) => {
                                // Author-supplied URLs — refuse anything that
                                // isn't http(s). A `javascript:` URI on an
                                // `<a href>` executes on click even after
                                // React renders — no auto-sanitization.
                                const safeUrl = /^https?:\/\//i.test(src?.url) ? src.url : null
                                const inner = (
                                    <>
                                        <p className="text-xs font-bold text-text-primary leading-snug">
                                            {src.title}
                                        </p>
                                        {src.type && (
                                            <p className="text-[10px] text-text-tertiary mt-0.5 font-mono uppercase">
                                                {src.type}
                                            </p>
                                        )}
                                    </>
                                )
                                return (
                                    <li key={i}>
                                        {safeUrl ? (
                                            <a
                                                href={safeUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block bg-surface-1 border border-border-default rounded-lg p-3 hover:bg-surface-2 transition-colors"
                                            >
                                                {inner}
                                            </a>
                                        ) : (
                                            <div
                                                className="block bg-surface-1 border border-border-default rounded-lg p-3 opacity-70"
                                                title="Source URL blocked (must start with http:// or https://)"
                                            >
                                                {inner}
                                            </div>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )}

                <section className="space-y-2 text-[10px] text-text-tertiary leading-relaxed">
                    <p>
                        Reading is logged but doesn't bump your mastery score.
                        Score moves on real signals: lab, check-in, teaching,
                        mock.
                    </p>
                </section>
            </aside>
        </div>
    )
}
