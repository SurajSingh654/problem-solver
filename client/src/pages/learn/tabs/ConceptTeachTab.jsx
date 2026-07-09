// ============================================================================
// ConceptTeachTab — teaching-ready gate + schedule CTA (W4.T7, minimal)
// ============================================================================
//
// The "teaching" step is the last checkpoint in the concept flow — mastery
// score ≥ 80 (server derives `teachingReady: true` in ConceptMastery). Once
// the user is teaching-ready we surface a green banner + a CTA that
// deep-links into the teaching-session create form with the concept ID
// prefilled. TeachingNewPage doesn't consume `?conceptId=` today — the
// prefill is a forward-looking URL that lands the user on the right screen
// without breaking anything; wiring the prefill into TeachingNewPage is
// scheduled for Phase 2 polish.
//
// The "past sessions on this concept" list is also Phase 2 — the
// teachingSessions relation isn't included on the concept detail response
// yet, and adding a second query here is over-scope for W4.
// ============================================================================
import { Link } from 'react-router-dom'
import { Button } from '@components/ui/Button'
import { Sparkles } from 'lucide-react'

export default function ConceptTeachTab({ concept, onGoToLab, onGoToCheckIn }) {
    const ready = concept.mastery?.teachingReady === true

    if (ready) {
        // Prefill topic + suggested title on the TeachingNewPage. Passing
        // the name/slug directly avoids a second fetch on that page just
        // to look up the concept. `conceptId` is included for future
        // relation-linking (e.g. attaching the resulting TeachingSession
        // back to this concept's TEACH signal).
        const params = new URLSearchParams({
            conceptId: concept.id,
            topic: concept.name,
            title: `Teach: ${concept.name}`,
        })
        const scheduleHref = `/teaching/new?${params.toString()}`
        return (
            <div className="max-w-2xl mx-auto py-10 space-y-6">
                <div className="bg-success-soft border border-success-line rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-success-fg" />
                        <h2 className="text-base font-bold text-success-fg">
                            You're ready to teach this!
                        </h2>
                    </div>
                    <p className="text-sm text-success-fg leading-relaxed">
                        Your mastery on {concept.name} cleared the teaching-ready
                        threshold. The strongest signal that you own a concept is
                        being able to explain it — schedule a session, invite
                        teammates, and rate yourself against their questions.
                    </p>
                </div>

                <div className="bg-surface-1 border border-border-default rounded-xl p-5 space-y-4">
                    <div className="space-y-1">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                            Schedule a session
                        </h3>
                        <p className="text-xs text-text-tertiary leading-relaxed">
                            Opens the teaching-session create form. Set a time,
                            invite your team, and host live.
                        </p>
                    </div>
                    <Link to={scheduleHref}>
                        <Button variant="primary" size="md">
                            Schedule a session on this concept →
                        </Button>
                    </Link>
                </div>

                <p className="text-[11px] text-text-tertiary leading-relaxed">
                    Past sessions on this concept will appear here in Phase 2.
                </p>
            </div>
        )
    }

    // Not teaching-ready — explain what unlocks it. The two CTAs deep-link
    // back into Lab and Check-in so the user has a next step.
    return (
        <div className="max-w-2xl mx-auto py-10 space-y-6">
            <div className="bg-surface-1 border border-border-default rounded-xl p-5 space-y-3">
                <h2 className="text-base font-bold text-text-primary">
                    Teaching unlocks after mastery
                </h2>
                <p className="text-sm text-text-tertiary leading-relaxed">
                    Complete the lab with a STRONG or ADEQUATE verdict, then pass
                    the check-in. Your mastery score climbs on those real signals
                    and the "teach" step opens once you've cleared the bar. This
                    is deliberate — teaching a concept you haven't practised makes
                    you look wrong to your team, and undoes what confidence you
                    had.
                </p>
                {concept.mastery?.score != null && (
                    <p className="text-xs text-text-tertiary font-mono">
                        Current mastery: {Math.round(concept.mastery.score)}%
                        (need ≥ 80 for teaching-ready)
                    </p>
                )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <Button variant="primary" size="md" onClick={onGoToLab}>
                    Go to lab →
                </Button>
                <Button variant="secondary" size="md" onClick={onGoToCheckIn}>
                    Go to check-in →
                </Button>
            </div>
        </div>
    )
}
