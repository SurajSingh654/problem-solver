// ============================================================================
// CurriculumReviewTab — trigger + render the topic-level AI review (W3.T9)
// ============================================================================
//
// Fires `useRunCurriculumReview` and renders the returned verdict body
// via a structured breakdown mirroring the curriculum-review schema (see
// ai.schemas.js). The prior review verdict (if any) is loaded from
// `topic.curriculumReview` — the server caches the latest result on the
// Topic row so reopening this tab doesn't require another AI call.
//
// Fallback banner: when `usedFallback === true` we surface a warning; the
// fallback body is deterministic but reflects that the AI output failed
// validation, so re-running is worth suggesting.
//
// Rate-limit: the server chains `aiLimiter + aiTeamLimiter` on this route,
// so a repeat click within the per-user 15-min window comes back 429. We
// don't intercept — the toast surfaces the server message inline.
// ============================================================================
import { useMemo, useState } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import { VerdictBadge } from '@components/curriculum'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { useRunCurriculumReview } from '@hooks/useCurriculumAdmin'
import { formatShortDate } from '@utils/formatters'

// ─────────────────────────────────────────────────────────────────
// Small helpers for section rendering.
// ─────────────────────────────────────────────────────────────────
function Section({ title, children }) {
    return (
        <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider font-semibold text-text-tertiary">
                {title}
            </h4>
            <div className="text-sm text-text-secondary">{children}</div>
        </section>
    )
}

function BulletList({ items }) {
    if (!Array.isArray(items) || items.length === 0) {
        return <p className="text-xs text-text-tertiary italic">None reported.</p>
    }
    return (
        <ul className="list-disc pl-5 space-y-1">
            {items.map((it, i) => (
                <li key={i} className="text-sm text-text-secondary">{it}</li>
            ))}
        </ul>
    )
}

// ─────────────────────────────────────────────────────────────────
// Verdict body renderer — pulls fields from the curriculum-review
// schema. Handles missing fields gracefully because the fallback
// body is thinner than a full valid response.
// ─────────────────────────────────────────────────────────────────
function VerdictBody({ body }) {
    if (!body) return null
    return (
        <div className="space-y-6">
            {body.oneLineSummary && (
                <blockquote className="border-l-4 border-brand-400 pl-4 italic text-sm text-text-secondary">
                    "{body.oneLineSummary}"
                </blockquote>
            )}
            {Array.isArray(body.outcomes) && (
                <Section title="Learning outcomes">
                    <BulletList items={body.outcomes} />
                </Section>
            )}
            {Array.isArray(body.wontTeach) && body.wontTeach.length > 0 && (
                <Section title="Won't teach">
                    <BulletList items={body.wontTeach} />
                </Section>
            )}

            {body.roi && (
                <Section title="ROI">
                    <div className="rounded-xl border border-border-default bg-surface-1 p-4 space-y-2">
                        {body.roi.verdict && (
                            <div className="flex items-center gap-2">
                                <VerdictBadge verdict={body.roi.verdict} />
                                <span className="text-xs text-text-tertiary">overall ROI</span>
                            </div>
                        )}
                        <ul className="text-xs text-text-secondary space-y-1">
                            {body.roi.time            && <li><b>Time:</b> {body.roi.time}</li>}
                            {body.roi.interviewValue  && <li><b>Interview value:</b> {body.roi.interviewValue}</li>}
                            {body.roi.jobValue        && <li><b>Job value:</b> {body.roi.jobValue}</li>}
                            {body.roi.depthVsBreadth  && <li><b>Depth vs breadth:</b> {body.roi.depthVsBreadth}</li>}
                        </ul>
                    </div>
                </Section>
            )}

            {body.retention && (
                <Section title="Retention">
                    <div className="rounded-xl border border-border-default bg-surface-1 p-4 space-y-2">
                        {body.retention.verdict && (
                            <div className="flex items-center gap-2">
                                <VerdictBadge verdict={body.retention.verdict} />
                                <span className="text-xs text-text-tertiary">retention</span>
                            </div>
                        )}
                        {Array.isArray(body.retention.signalsFor) && body.retention.signalsFor.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-success-fg mb-1">Signals for</p>
                                <BulletList items={body.retention.signalsFor} />
                            </div>
                        )}
                        {Array.isArray(body.retention.signalsAgainst) && body.retention.signalsAgainst.length > 0 && (
                            <div>
                                <p className="text-xs font-semibold text-danger-fg mb-1">Signals against</p>
                                <BulletList items={body.retention.signalsAgainst} />
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {body.structuralSanity && (
                <Section title="Structural sanity">
                    <div className="grid gap-2 sm:grid-cols-2 text-xs text-text-secondary">
                        {Object.entries(body.structuralSanity).map(([k, v]) => (
                            <div key={k} className="rounded-lg border border-border-default bg-surface-1 p-2">
                                <div className="font-mono text-text-tertiary">{k}</div>
                                <div>{typeof v === 'boolean' ? (v ? 'PASS' : 'FAIL') : String(v)}</div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {Array.isArray(body.modulesNeedingWork) && body.modulesNeedingWork.length > 0 && (
                <Section title="Modules needing work">
                    <div className="rounded-xl border border-border-default overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-surface-2 text-text-tertiary">
                                <tr className="text-left">
                                    <th className="px-3 py-2 font-semibold">Concept</th>
                                    <th className="px-3 py-2 font-semibold">Issue</th>
                                    <th className="px-3 py-2 font-semibold">Suggested fix</th>
                                </tr>
                            </thead>
                            <tbody>
                                {body.modulesNeedingWork.map((m, i) => (
                                    <tr key={i} className="border-t border-border-default align-top">
                                        <td className="px-3 py-2 font-mono">{m.conceptId ?? m.conceptSlug}</td>
                                        <td className="px-3 py-2">{m.issue}</td>
                                        <td className="px-3 py-2">{m.suggestedFix}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}

            {Array.isArray(body.missingCoverage) && body.missingCoverage.length > 0 && (
                <Section title="Missing coverage">
                    <BulletList items={body.missingCoverage} />
                </Section>
            )}
            {Array.isArray(body.redundantModules) && body.redundantModules.length > 0 && (
                <Section title="Redundant modules">
                    <BulletList items={body.redundantModules} />
                </Section>
            )}
            {Array.isArray(body.strong) && body.strong.length > 0 && (
                <Section title="Strong points">
                    <BulletList items={body.strong} />
                </Section>
            )}

            {body.finalRecommendation && (
                <Section title="Final recommendation">
                    <blockquote className="border-l-4 border-success-line pl-4 text-sm">
                        {body.finalRecommendation}
                    </blockquote>
                </Section>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Tab entry point
// ─────────────────────────────────────────────────────────────────
export default function CurriculumReviewTab({ topic }) {
    const run = useRunCurriculumReview(topic.id)
    // Local state to hold the "just-ran" result so it takes precedence over
    // the topic's cached prior verdict without waiting for the invalidated
    // topic detail to refetch.
    const [freshRun, setFreshRun] = useState(null)

    const priorVerdict = useMemo(() => {
        if (!topic.curriculumReview) return null
        // The server-cached body IS the review payload directly (not wrapped).
        // Since we don't cache the verdict enum on Topic under a separate
        // column, we surface whatever is on the body's `verdict` field if
        // present; else fall back to the topic status.
        return {
            body: topic.curriculumReview,
            verdict: topic.curriculumReview.verdict ?? topic.status,
            lastReviewedAt: topic.lastReviewedAt,
            usedFallback: false,
        }
    }, [topic.curriculumReview, topic.lastReviewedAt, topic.status])

    const display = freshRun ?? priorVerdict

    const doRun = async () => {
        try {
            const data = await run.mutateAsync()
            setFreshRun(data)
        } catch {
            // toast handled by hook
        }
    }

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-border-default bg-surface-2 p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                <div className="min-w-0">
                    <h3 className="text-base font-bold text-text-primary">Curriculum review</h3>
                    <p className="text-xs text-text-tertiary mt-1">
                        Sends the topic outline + all concept primers to the AI validator. Typically 5–30 seconds.
                        {topic.lastReviewedAt && (
                            <>
                                {' '}Last run {formatShortDate(topic.lastReviewedAt)}.
                            </>
                        )}
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="md"
                    onClick={doRun}
                    loading={run.isPending}
                >
                    <Sparkles className="w-4 h-4" />
                    {display ? 'Re-run review' : 'Run review'}
                </Button>
            </div>

            {run.isPending && (
                <div className="rounded-2xl border border-border-default bg-surface-2 p-8 flex items-center justify-center gap-3 text-sm text-text-tertiary">
                    <Spinner size="sm" />
                    <span>Running curriculum review…</span>
                </div>
            )}

            {display && !run.isPending && (
                <div className="rounded-2xl border border-border-default bg-surface-2 p-5 space-y-5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <VerdictBadge verdict={display.verdict} />
                        <span className="text-xs text-text-tertiary">
                            {freshRun ? 'Fresh verdict (just run)' : 'Cached verdict (from last run)'}
                        </span>
                    </div>
                    {display.usedFallback && (
                        <div className="rounded-xl border border-warning-line bg-warning-soft p-3 flex items-start gap-2 text-xs text-warning-fg">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Automated review failed validation — a conservative fallback body was used. Re-run for a real verdict.
                            </span>
                        </div>
                    )}
                    <VerdictBody body={display.body} />
                </div>
            )}

            {!display && !run.isPending && (
                <div className="rounded-2xl border border-border-default bg-surface-2 p-8 text-center text-sm text-text-tertiary">
                    No review has been run yet. Click "Run review" to generate a verdict.
                </div>
            )}
        </div>
    )
}
