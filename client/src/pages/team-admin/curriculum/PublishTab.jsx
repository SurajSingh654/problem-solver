// ============================================================================
// PublishTab — enforce publish gates and flip Topic.status → PUBLISHED (W3.T9)
// ============================================================================
//
// Flow:
//   1. Reviewer clicks "Publish topic".
//   2. useConfirm dialog confirms.
//   3. usePublishTopic (silent toasting mutation) fires the POST.
//   4. Success (200) → invalidate topic detail → status badge flips to
//      PUBLISHED → toast fires from this tab (hook is silent to keep gate
//      failures inline-only).
//   5. Failure (400 PUBLISH_GATE_BLOCKED) → response carries
//      `error.details.gates[]` → render inline via PublishGateChecklist.
//
// Client-side pre-flight hints (below):
//   The server is authoritative on gates, but the client can predict the
//   two most common failures from the loaded topic tree — no curriculum
//   review verdict yet, or child concepts still in DRAFT. Surfacing those
//   above the Publish button saves a round-trip and points the reviewer
//   at the tab they need to switch to. The hints do NOT gate the button;
//   the reviewer can still click Publish and let the server refuse.
// ============================================================================
import { useState } from 'react'
import { UploadCloud, ExternalLink, CheckCircle2 } from 'lucide-react'
import { VerdictBadge, PublishGateChecklist } from '@components/curriculum'
import { Button } from '@components/ui/Button'
import { toast } from '@store/useUIStore'
import { useConfirm } from '@hooks/useConfirm'
import { usePublishTopic, extractErrorCode } from '@hooks/useCurriculumAdmin'
import { extractErrorMessage } from '@services/api'

export default function PublishTab({ topic, onGoToConcepts, onGoToReview }) {
    const confirm = useConfirm()
    const publish = usePublishTopic(topic.id)
    const [gates, setGates] = useState(null)   // gates[] from a failed publish
    const [otherError, setOtherError] = useState(null) // non-gate error text

    const concepts = topic.concepts ?? []
    const draftConcepts = concepts.filter((c) => c.status !== 'PUBLISHED')
    const alreadyPublished = topic.status === 'PUBLISHED'

    // Preemptive hints — advisory only. The server enforces truth.
    const hints = []
    if (concepts.length === 0) {
        hints.push({
            id: 'no-concepts',
            text: 'This topic has no concepts. Add at least one concept before publishing.',
            action: onGoToConcepts,
            actionLabel: 'Go to Concepts',
        })
    } else if (draftConcepts.length > 0) {
        hints.push({
            id: 'draft-concepts',
            text: `${draftConcepts.length} of ${concepts.length} concept${concepts.length === 1 ? '' : 's'} not yet published.`,
            action: onGoToConcepts,
            actionLabel: 'Go to Concepts',
        })
    }
    if (!topic.lastReviewedAt) {
        hints.push({
            id: 'no-review',
            text: 'No curriculum review has been run yet. Run the review before publishing.',
            action: onGoToReview,
            actionLabel: 'Go to Curriculum Review',
        })
    }

    const doPublish = async () => {
        const ok = await confirm({
            title: 'Publish this topic?',
            description:
                'Learners in your team will see this topic. You can update it after publishing.',
            confirmLabel: 'Publish',
            cancelLabel: 'Cancel',
        })
        if (!ok) return
        setGates(null)
        setOtherError(null)
        try {
            await publish.mutateAsync()
            toast.success('Topic published.')
        } catch (err) {
            if (extractErrorCode(err) === 'PUBLISH_GATE_BLOCKED') {
                setGates(err.response?.data?.error?.details?.gates ?? [])
            } else {
                setOtherError(extractErrorMessage(err) ?? 'Publish failed.')
            }
        }
    }

    return (
        <div className="space-y-5">
            {/* Status card ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-border-default bg-surface-2 p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-text-primary">Publish topic</h3>
                        <VerdictBadge verdict={topic.status} />
                    </div>
                    <p className="text-xs text-text-tertiary mt-1">
                        {alreadyPublished
                            ? 'This topic is live. You can still edit metadata and concepts; changes will not remove it from learners.'
                            : 'Flip status to PUBLISHED. Learners see published topics only.'}
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="md"
                    onClick={doPublish}
                    loading={publish.isPending}
                    disabled={alreadyPublished || publish.isPending}
                >
                    <UploadCloud className="w-4 h-4" />
                    {alreadyPublished ? 'Already published' : 'Publish topic'}
                </Button>
            </div>

            {/* Success — mirrored to a lightweight card since the toast fades */}
            {alreadyPublished && (
                <div className="rounded-xl border border-success-line bg-success-soft p-3 flex items-center gap-2 text-xs text-success-fg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Topic is published and visible to learners.</span>
                </div>
            )}

            {/* Client-side hints ──────────────────────────────── */}
            {!alreadyPublished && hints.length > 0 && (
                <div className="rounded-2xl border border-warning-line bg-warning-soft/40 p-5 space-y-3">
                    <p className="text-xs font-semibold text-warning-fg uppercase tracking-wider">
                        Things to check first
                    </p>
                    <ul className="space-y-2">
                        {hints.map((h) => (
                            <li key={h.id} className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                                <span className="min-w-0">{h.text}</span>
                                {h.action && (
                                    <button
                                        type="button"
                                        onClick={h.action}
                                        className="text-xs font-semibold text-brand-fg-soft hover:underline inline-flex items-center gap-1 shrink-0"
                                    >
                                        {h.actionLabel}
                                        <ExternalLink className="w-3 h-3" />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[11px] text-text-tertiary italic">
                        Advisory only. The server enforces the final publish gates.
                    </p>
                </div>
            )}

            {/* Gate failure inline ───────────────────────────── */}
            {gates && (
                <div className="rounded-2xl border border-danger-line bg-danger-soft/40 p-5 space-y-3">
                    <p className="text-sm font-semibold text-danger-fg">
                        Publish blocked
                    </p>
                    <PublishGateChecklist gates={gates} />
                    <div className="text-xs text-text-secondary pt-1 border-t border-danger-line/40">
                        💡 Confused about a gate?{' '}
                        <a href="/docs/how-to/task/publish-topic" className="text-brand-fg-soft underline">
                            Read the Publish gates guide →
                        </a>
                    </div>
                </div>
            )}

            {/* Other errors (500 etc.) ──────────────────────── */}
            {otherError && (
                <div className="rounded-xl border border-danger-line bg-danger-soft/40 p-3 text-xs text-danger-fg">
                    {otherError}
                </div>
            )}
        </div>
    )
}
