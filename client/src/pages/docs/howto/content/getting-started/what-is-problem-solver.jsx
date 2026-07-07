// Getting Started · What is Problem Solver? · role: '*'
import { SummaryBlock, Callout } from '../../components'

export default function WhatIsProblemSolverGuide() {
    return (
        <>
            <SummaryBlock>
                Six surfaces you should know before diving in — each solves a different piece of interview prep.
            </SummaryBlock>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">📚 Curriculum</div>
                    <p className="text-xs text-text-tertiary">
                        Structured topics with primers, labs, and check-ins. Learn a concept end-to-end,
                        prove you can teach it back.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">📝 Problems + Recall</div>
                    <p className="text-xs text-text-tertiary">
                        Team-curated problems across 7 categories. Every submission is scored on 5 dimensions.
                        Review Queue uses recall-before-reveal for spaced repetition.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">🏗️ Design Studio</div>
                    <p className="text-xs text-text-tertiary">
                        AI-coached SD + LLD practice with an Excalidraw canvas and a pinned right rail.
                        Post-eval unlocks reference architectures for compare.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">📊 Intelligence Report</div>
                    <p className="text-xs text-text-tertiary">
                        Calibrated readiness signal with a grounded AI verdict. Dimensions without enough
                        data show an activation message, not a fake score.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">🎯 Quiz + Mock</div>
                    <p className="text-xs text-text-tertiary">
                        AI-generated multiple-choice on any topic. Mock Interview runs a live AI interviewer
                        over WebSocket — text or voice.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">💬 Feedback</div>
                    <p className="text-xs text-text-tertiary">
                        File bugs and feature requests. Similar-report dedup surfaces duplicates. Tracked to
                        resolution.
                    </p>
                </div>
            </div>

            <Callout type="info">
                Pick your role&apos;s <strong>Your first 30 minutes</strong> guide next for a role-specific
                starting path.
            </Callout>
        </>
    )
}
