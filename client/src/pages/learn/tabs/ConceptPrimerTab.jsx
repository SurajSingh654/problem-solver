// ============================================================================
// ConceptPrimerTab — read-once primer surface (W4.T7)
// ============================================================================
//
// Renders the admin-authored `primerMarkdown` (source-grounded, sanitized
// upstream at the authoring layer via rehype-sanitize per W1.T4) with the
// same `MarkdownRenderer` used elsewhere in the app — code fences,
// syntax-highlighted blocks, safe HTML.
//
// On first mount for a given concept slug we fire the
// `POST /concepts/:slug/mark-primer-read` engagement signal (weight 0 —
// reading is logged but does NOT inflate the mastery score). The
// mutation is intentionally fire-and-forget; no toast, no error UI.
// Server dedups within 24 h so remounting the tab within that window
// is a no-op on the backend either way.
//
// Alongside the primer body we surface:
//   - `workedExample` in a distinct callout block (if present)
//   - `expectedQuestions` as Socratic self-check prompts (if present)
//   - `canonicalSources` sidebar (clickable — same styling as the pre-
//     shell scaffold; carried forward because the reading list is
//     source-grounded honesty, not decoration)
//
// A footer CTA "Ready to practice?" tab-switches to Lab. The handler
// is passed down from ConceptPage; the tab itself doesn't know about
// tab state.
// ============================================================================
import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { Button } from '@components/ui/Button'
import { useMarkPrimerRead } from '@hooks/useCurriculumLearn'

export default function ConceptPrimerTab({ concept, onGoToLab }) {
    const markPrimerRead = useMarkPrimerRead()
    const prefersReducedMotion = useReducedMotion()

    // Fire once per concept-slug mount. Deliberately depends ONLY on the
    // slug — re-running when the mutation identity changes would double-
    // fire on every re-render. The lint suppression is intentional.
    useEffect(() => {
        if (concept?.slug) {
            // .mutate — no await, no toast, no error handling. Server
            // dedups within 24h; failures are silently dropped on the
            // client because this is engagement telemetry, not a user
            // action.
            markPrimerRead.mutate(concept.slug)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [concept?.slug])

    const primer = concept.primerMarkdown ?? ''
    const workedExample = concept.workedExample
    const cheatsheet = concept.cheatsheetMarkdown
    const expectedQuestions = concept.expectedQuestions ?? []
    const canonicalSources = concept.canonicalSources ?? []

    return (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-8">
            {/* ── Primer body ─────────────────────────────────── */}
            <article className="space-y-8">
                {primer ? (
                    <MarkdownRenderer content={primer} />
                ) : (
                    <p className="text-sm text-text-tertiary italic">
                        No primer written yet for this concept.
                    </p>
                )}

                {workedExample && (
                    <section className="space-y-3">
                        {/* h3 (not h2) so the outline nests: page h1 → tabpanel
                            (implicit h2) → section labels + authored primer
                            headings at h3. Screen-reader nav stays linear. */}
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                            Worked example
                        </h3>
                        <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                            <MarkdownRenderer content={workedExample} size="sm" />
                        </div>
                    </section>
                )}

                {cheatsheet && (
                    <section className="space-y-3">
                        {/* Reviewer-authored cheatsheet — previously never
                            rendered on the learner surface despite being an
                            authored field. Collapsed by default so a
                            first-time reader isn't distracted; expanded on
                            demand and on return visits (Phase B will make
                            expansion the default when a prior primer_read
                            signal exists). */}
                        <details className="bg-surface-2 border border-border-default rounded-xl group">
                            <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-text-tertiary hover:text-text-secondary">
                                <span>Cheatsheet</span>
                                <span aria-hidden="true" className="text-[10px] font-mono opacity-60 group-open:hidden">
                                    expand
                                </span>
                                <span aria-hidden="true" className="text-[10px] font-mono opacity-60 hidden group-open:inline">
                                    collapse
                                </span>
                            </summary>
                            <div className="px-4 pb-4 border-t border-border-default pt-3">
                                <MarkdownRenderer content={cheatsheet} size="sm" />
                            </div>
                        </details>
                    </section>
                )}

                {expectedQuestions.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                            Check yourself
                        </h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            If you can answer these without re-reading, you've
                            understood the surface. Mastery shows up in practice
                            and teaching, not reading.
                        </p>
                        <ol className="space-y-2">
                            {expectedQuestions.map((q, i) => (
                                <li
                                    key={i}
                                    className="bg-surface-1 border border-border-default rounded-xl p-3 flex items-start gap-3"
                                >
                                    <span className="text-[10px] font-bold font-mono text-text-tertiary shrink-0 mt-0.5">
                                        Q{i + 1}
                                    </span>
                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        {q}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}

                {/* Footer CTA — tab-switch to Lab.
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
            <aside className="space-y-4 md:sticky md:top-6 md:self-start">
                {canonicalSources.length > 0 && (
                    <section className="space-y-2">
                        <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                            Canonical sources
                        </h2>
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
