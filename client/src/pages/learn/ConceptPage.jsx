// ============================================================================
// Topic Mastery Tracks — Concept Primer Reader
// ============================================================================
//
// Full-page reader for a single concept. Renders:
//   - the curated primerMarkdown (admin-authored, source-grounded)
//   - canonical sources sidebar (clickable links)
//   - expectedQuestions as Socratic self-check prompts
//   - prereq satisfaction advisory if relevant
//   - "Mark as read" CTA that records a primer_read signal (weight 0 —
//     reading is logged, but does NOT inflate mastery score)
//
// Honesty principle: reading is the start of learning, not proof of it.
// The mark-read action only advances the mentor's INTAKE pointer; mastery
// score still requires real signals (quiz, practice, teaching, mock).
// ============================================================================

import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { useConcept, useMarkConceptRead } from '@hooks/useTopics'
import { cn } from '@utils/cn'

export default function ConceptPage() {
    const { slug, conceptSlug } = useParams()
    const navigate = useNavigate()

    const conceptQ = useConcept(slug, conceptSlug)
    const markRead = useMarkConceptRead(slug, conceptSlug)

    if (conceptQ.isLoading) {
        return (
            <div className="p-6 flex justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    if (conceptQ.isError) {
        const status = conceptQ.error?.response?.status
        const message =
            status === 404
                ? "This concept isn't available yet — it may not be published, or you may not be enrolled."
                : 'Failed to load concept. Try again in a moment.'
        return (
            <div className="p-6 max-w-[600px] mx-auto text-center space-y-3">
                <p className="text-sm text-text-secondary">{message}</p>
                <Link
                    to={`/learn/${slug}`}
                    className="inline-block text-xs font-bold text-brand-fg-soft hover:text-text-primary transition-colors"
                >
                    ← Back to topic
                </Link>
            </div>
        )
    }

    const { topic, concept, mastery, prereqs } = conceptQ.data

    const handleMarkRead = async () => {
        const result = await markRead.mutateAsync()
        const next = result?.data?.data?.nextAction
        // Deep-link to the next stage if the mentor produced one; otherwise
        // bounce back to the topic page.
        const url = next?.surface?.route ?? `/learn/${slug}`
        navigate(url)
    }

    const fragilePrereqs = prereqs.filter((p) => (p.score ?? 0) < 50)

    return (
        <div className="p-6 max-w-[860px] mx-auto pb-24 space-y-6">
            {/* ── Breadcrumb ──────────────────────────────────────────── */}
            <nav className="text-xs text-text-tertiary flex items-center gap-2">
                <Link
                    to="/learn"
                    className="hover:text-text-primary transition-colors"
                >
                    Learn
                </Link>
                <span>/</span>
                <Link
                    to={`/learn/${topic.slug}`}
                    className="hover:text-text-primary transition-colors"
                >
                    {topic.name}
                </Link>
                <span>/</span>
                <span className="text-text-secondary">{concept.name}</span>
            </nav>

            {/* ── Header ──────────────────────────────────────────────── */}
            <header className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary font-mono">
                        Concept {concept.order}
                    </span>
                    {mastery.primerRead && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full border bg-success-soft text-success-fg border-success-line">
                            primer read
                        </span>
                    )}
                    {mastery.score != null && (
                        <span
                            className={cn(
                                'text-[9px] font-bold px-1.5 py-px rounded-full border font-mono',
                                mastery.score >= 80
                                    ? 'bg-success-soft text-success-fg border-success-line'
                                    : mastery.score >= 50
                                        ? 'bg-warning-soft text-warning-fg border-warning-line'
                                        : 'bg-danger-soft text-danger-fg border-danger-line',
                            )}
                        >
                            {mastery.score}/100
                        </span>
                    )}
                </div>
                <h1 className="text-2xl font-extrabold text-text-primary">
                    {concept.name}
                </h1>
            </header>

            {/* ── Prereq advisory ─────────────────────────────────────── */}
            {fragilePrereqs.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-warning-soft border border-warning-line rounded-xl p-4 flex items-start gap-3"
                >
                    <span className="text-lg">💡</span>
                    <div className="space-y-1">
                        <p className="text-xs font-bold text-warning-fg uppercase tracking-widest">
                            Heads up
                        </p>
                        <p className="text-xs text-text-secondary leading-relaxed">
                            This concept builds on{' '}
                            {fragilePrereqs
                                .map((p) => (
                                    <Link
                                        key={p.slug}
                                        to={`/learn/${slug}/concepts/${p.slug}`}
                                        className="font-bold text-warning-fg hover:underline"
                                    >
                                        {p.name}
                                    </Link>
                                ))
                                .reduce((acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]), [])}
                            . You're below developing on{' '}
                            {fragilePrereqs.length === 1 ? 'it' : 'them'} — consider revisiting first.
                        </p>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-8">
                {/* ── Primer body ─────────────────────────────────── */}
                <article>
                    <MarkdownRenderer content={concept.primerMarkdown} />

                    {concept.workedExample && (
                        <section className="mt-8 space-y-3">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                                Worked example
                            </h2>
                            <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                                <MarkdownRenderer content={concept.workedExample} size="sm" />
                            </div>
                        </section>
                    )}

                    {concept.expectedQuestions?.length > 0 && (
                        <section className="mt-8 space-y-3">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                                Check yourself
                            </h2>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                If you can answer these without re-reading, you've understood the
                                surface. Mastery shows up in practice and teaching, not reading.
                            </p>
                            <ol className="space-y-2">
                                {concept.expectedQuestions.map((q, i) => (
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
                </article>

                {/* ── Sources sidebar ─────────────────────────────── */}
                <aside className="space-y-4 md:sticky md:top-6 md:self-start">
                    {concept.canonicalSources?.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
                                Canonical sources
                            </h2>
                            <ul className="space-y-2">
                                {concept.canonicalSources.map((src, i) => (
                                    <li key={i}>
                                        <a
                                            href={src.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block bg-surface-1 border border-border-default rounded-lg p-3 hover:bg-surface-2 transition-colors"
                                        >
                                            <p className="text-xs font-bold text-text-primary leading-snug">
                                                {src.title}
                                            </p>
                                            {src.type && (
                                                <p className="text-[10px] text-text-tertiary mt-0.5 font-mono uppercase">
                                                    {src.type}
                                                </p>
                                            )}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <section className="space-y-2 text-[10px] text-text-tertiary leading-relaxed">
                        <p>
                            Reading is logged but doesn't bump your mastery score. Score moves on
                            real signals: quiz, practice, teaching, mock.
                        </p>
                    </section>
                </aside>
            </div>

            {/* ── Mark-as-read CTA ───────────────────────────────────── */}
            <div className="border-t border-border-default pt-6 flex items-center justify-between gap-4">
                <Link
                    to={`/learn/${slug}`}
                    className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
                >
                    ← Back to topic
                </Link>
                <Button
                    variant="primary"
                    size="md"
                    onClick={handleMarkRead}
                    disabled={markRead.isPending}
                >
                    {mastery.primerRead
                        ? markRead.isPending
                            ? 'Continuing…'
                            : 'Continue →'
                        : markRead.isPending
                            ? 'Saving…'
                            : 'Mark as read & continue →'}
                </Button>
            </div>
            {markRead.isError && (
                <p className="text-xs text-danger-fg text-right">
                    {markRead.error?.response?.data?.error?.message ??
                        'Failed to save. Try again.'}
                </p>
            )}
        </div>
    )
}
