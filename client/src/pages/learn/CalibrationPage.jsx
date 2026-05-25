// ============================================================================
// Topic Mastery Tracks — Calibration Quiz (v1)
// ============================================================================
//
// Day-1 baseline. Single-page layout: header, optional existing-result
// banner, all questions visible, sticky submit. After submit, render the
// result screen with score + per-concept breakdown + rationales for misses,
// and a primary CTA that navigates to the recomputed nextAction.
//
// Honest UX framing per the project quality bar: clear copy, no penalty
// language, retake is allowed (banner explains overwrite).
// ============================================================================

import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import {
    useTopic,
    useTopicCalibration,
    useSubmitCalibration,
} from '@hooks/useTopics'
import { cn } from '@utils/cn'

export default function CalibrationPage() {
    const { slug } = useParams()

    const topicQ = useTopic(slug)
    const calibrationQ = useTopicCalibration(slug)
    const submit = useSubmitCalibration(slug)

    // Local response map { questionId -> 'A'|'B'|'C'|'D' }.
    const [responses, setResponses] = useState({})

    if (calibrationQ.isLoading || topicQ.isLoading) {
        return (
            <div className="p-6 flex justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    if (calibrationQ.isError) {
        const status = calibrationQ.error?.response?.status
        if (status === 404) {
            return (
                <EmptyEnrollmentNotice slug={slug} topicName={topicQ.data?.topic?.name} />
            )
        }
        return (
            <div className="p-6 max-w-[720px] mx-auto">
                <p className="text-sm text-danger-fg">
                    Failed to load calibration. Try again in a moment.
                </p>
            </div>
        )
    }

    const data = calibrationQ.data
    const topic = topicQ.data?.topic

    // Result-screen mode kicks in after a successful submit.
    if (submit.isSuccess && submit.data) {
        return (
            <ResultScreen
                slug={slug}
                topic={topic}
                result={submit.data.data}
                onRetake={() => {
                    submit.reset()
                    setResponses({})
                }}
            />
        )
    }

    return (
        <QuizScreen
            topic={topic}
            data={data}
            responses={responses}
            setResponses={setResponses}
            onSubmit={() => {
                const arr = Object.entries(responses).map(([questionId, answer]) => ({
                    questionId,
                    answer,
                }))
                submit.mutate(arr)
            }}
            submitting={submit.isPending}
            submitError={submit.error}
        />
    )
}

// ── Question screen ─────────────────────────────────────────────────

function QuizScreen({ topic, data, responses, setResponses, onSubmit, submitting, submitError }) {
    const total = data.questions.length
    const answered = Object.keys(responses).length
    const allAnswered = answered === total

    return (
        <div className="p-6 max-w-[800px] mx-auto pb-32 space-y-6">
            <header className="space-y-2">
                <Link
                    to={`/learn/${topic?.slug ?? ''}`}
                    className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
                >
                    ← Back to {topic?.name ?? 'topic'}
                </Link>
                <h1 className="text-2xl font-extrabold text-text-primary">
                    Calibration · {topic?.name ?? 'Topic'}
                </h1>
                <p className="text-sm text-text-tertiary leading-relaxed max-w-2xl">
                    Day-1 baseline. ~10 minutes, {total} multiple-choice questions across
                    the topic's spine concepts. Honest answers help the mentor personalize
                    your path — there's no penalty for wrong answers, and you'll see
                    explanations for everything when you submit.
                </p>
                {data.existing && (
                    <div className="bg-warning-soft border border-warning-line rounded-xl p-3 flex items-start gap-3">
                        <span className="text-lg">🔁</span>
                        <p className="text-xs text-warning-fg leading-relaxed">
                            You completed this on{' '}
                            <strong>{new Date(data.existing.takenAt).toLocaleDateString()}</strong>
                            {' '}with a score of <strong>{data.existing.score}/{data.existing.total}</strong>.
                            Re-taking will overwrite the previous result.
                        </p>
                    </div>
                )}
            </header>

            <ol className="space-y-4">
                {data.questions.map((q, i) => (
                    <QuestionCard
                        key={q.id}
                        index={i + 1}
                        question={q}
                        selected={responses[q.id]}
                        onSelect={(key) =>
                            setResponses((r) => ({ ...r, [q.id]: key }))
                        }
                    />
                ))}
            </ol>

            {/* Sticky submit bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-surface-1 border-t border-border-default backdrop-blur">
                <div className="max-w-[800px] mx-auto p-4 flex items-center justify-between gap-4">
                    <div className="text-xs text-text-secondary">
                        <span className={cn('font-bold', allAnswered ? 'text-success-fg' : 'text-text-primary')}>
                            {answered} of {total}
                        </span>{' '}
                        answered
                    </div>
                    <Button
                        variant="primary"
                        size="md"
                        disabled={!allAnswered || submitting}
                        onClick={onSubmit}
                    >
                        {submitting ? 'Submitting…' : 'Submit calibration'}
                    </Button>
                </div>
                {submitError && (
                    <div className="max-w-[800px] mx-auto px-4 pb-3">
                        <p className="text-xs text-danger-fg">
                            {submitError?.response?.data?.error?.message ??
                                'Submission failed. Please try again.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

function QuestionCard({ index, question, selected, onSelect }) {
    return (
        <motion.li
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-3"
        >
            <div className="flex items-start gap-3">
                <span className="text-[11px] font-bold font-mono text-text-tertiary mt-1">
                    Q{index}
                </span>
                <p className="text-sm font-medium text-text-primary leading-relaxed flex-1">
                    {question.prompt}
                </p>
            </div>
            <div className="grid gap-2">
                {question.choices.map((c) => {
                    const isSelected = selected === c.key
                    return (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => onSelect(c.key)}
                            className={cn(
                                'text-left p-3 rounded-xl border transition-colors flex items-start gap-3',
                                isSelected
                                    ? 'bg-brand-soft border-brand-line text-brand-fg-soft'
                                    : 'bg-surface-2 border-border-default text-text-primary hover:bg-surface-3',
                            )}
                        >
                            <span
                                className={cn(
                                    'text-[10px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5',
                                    isSelected
                                        ? 'bg-brand-fg-soft text-surface-1'
                                        : 'bg-surface-3 text-text-secondary',
                                )}
                            >
                                {c.key}
                            </span>
                            <span className="text-xs leading-relaxed">{c.text}</span>
                        </button>
                    )
                })}
            </div>
        </motion.li>
    )
}

// ── Result screen ───────────────────────────────────────────────────

function ResultScreen({ slug, topic, result, onRetake }) {
    const navigate = useNavigate()
    const concepts = Object.entries(result.perConceptCorrectness)
    const correctCount = concepts.filter(([, v]) => v).length
    const nextUrl = result.nextAction?.surface?.route ?? `/learn/${slug}`
    const nextLabel = result.nextAction?.concept?.name
        ? `Start with ${result.nextAction.concept.name} →`
        : 'Continue →'

    // Map perQuestionCorrectness (for showing rationale on misses).
    const missedQuestionRationales = Object.entries(result.perQuestionCorrectness)
        .filter(([, correct]) => !correct)
        .map(([qid]) => ({ id: qid, rationale: result.rationales[qid] }))

    return (
        <div className="p-6 max-w-[720px] mx-auto space-y-6">
            <Link
                to={`/learn/${topic?.slug ?? slug}`}
                className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
            >
                ← Back to {topic?.name ?? 'topic'}
            </Link>

            <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-success-soft border border-success-line rounded-2xl p-6 text-center space-y-2"
            >
                <p className="text-[10px] font-bold uppercase tracking-widest text-success-fg">
                    Calibration complete
                </p>
                <p className="text-5xl font-extrabold text-text-primary">
                    {result.score}
                    <span className="text-2xl text-text-tertiary"> / {result.total}</span>
                </p>
                <p className="text-xs text-text-secondary leading-relaxed max-w-md mx-auto">
                    {correctCount} of {concepts.length} concepts answered correctly across the board.
                    The mentor now has your baseline and can plan accordingly.
                </p>
            </motion.div>

            <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    Per-concept breakdown
                </h2>
                <ul className="grid gap-2">
                    {concepts.map(([conceptSlug, isCorrect]) => (
                        <li
                            key={conceptSlug}
                            className={cn(
                                'flex items-center gap-3 px-4 py-2.5 rounded-xl border',
                                isCorrect
                                    ? 'bg-success-soft border-success-line'
                                    : 'bg-warning-soft border-warning-line',
                            )}
                        >
                            <span className="text-base">{isCorrect ? '✓' : '✗'}</span>
                            <span
                                className={cn(
                                    'text-xs font-medium',
                                    isCorrect ? 'text-success-fg' : 'text-warning-fg',
                                )}
                            >
                                {conceptSlug.replace(/-/g, ' ')}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            {missedQuestionRationales.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        Worth reviewing
                    </h2>
                    <ul className="space-y-2">
                        {missedQuestionRationales.map((m) => (
                            <li
                                key={m.id}
                                className="bg-surface-2 border border-border-default rounded-xl p-4 text-xs text-text-secondary leading-relaxed"
                            >
                                {m.rationale}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex items-center justify-between gap-3 pt-4">
                <Button variant="ghost" size="sm" onClick={onRetake}>
                    Retake
                </Button>
                <Button
                    variant="primary"
                    size="md"
                    onClick={() => navigate(nextUrl)}
                >
                    {nextLabel}
                </Button>
            </div>
        </div>
    )
}

// ── Empty state when not enrolled ───────────────────────────────────

function EmptyEnrollmentNotice({ slug, topicName }) {
    return (
        <div className="p-6 max-w-[600px] mx-auto text-center space-y-4">
            <p className="text-base font-bold text-text-primary">
                You need to enroll in {topicName ?? 'this topic'} first.
            </p>
            <p className="text-xs text-text-tertiary leading-relaxed">
                Calibration is part of the enrollment flow — set your goal, timeline,
                and weekly hours on the topic page, then come back here.
            </p>
            <Link
                to={`/learn/${slug}`}
                className="inline-block text-xs font-bold text-brand-fg-soft hover:text-text-primary transition-colors"
            >
                ← Go to topic
            </Link>
        </div>
    )
}
