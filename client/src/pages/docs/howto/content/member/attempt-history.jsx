// client/src/pages/docs/howto/content/member/attempt-history.jsx
//
// Ripped verbatim from HowToPage.jsx #history section.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, K,
    BRAND, SUCCESS,
} from '../../components'

export default function AttemptHistoryGuide() {
    return (
        <>
            <SummaryBlock>
                Every submit, edit, and Design Studio bridge appends an immutable <K>SolutionAttempt</K> snapshot.
                The history page shows your trajectory and lets you diff any two attempts.
            </SummaryBlock>

            <PrereqList items={[
                'At least one submitted solution on a problem.',
            ]} />

            <StepCard num="1" {...BRAND} title="Open the history page" sub="Edit Solution → View history (or Profile → Solutions)">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Each solution has a <strong>View history</strong> link. Direct route is{' '}
                    <K>/solutions/:id/history</K>. The page is read-only — editing still happens on the Edit Solution page.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Confidence trajectory" sub="Recharts line — oldest → newest">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Top of the page: a confidence chart over attempt number. See whether you&apos;re trending up,
                    flat, or regressing across re-attempts. Pulled directly from each <K>SolutionAttempt.confidence</K>{' '}
                    — no extra recompute.
                </p>
                <HowToImage
                    file="history-02-trajectory.png"
                    alt="Confidence trajectory line chart with attempt-number x-axis and 1-5 confidence y-axis"
                    caption="Confidence trajectory — answers 'am I improving on this problem?'"
                />
            </StepCard>

            <StepCard num="3" {...BRAND} title="Timeline + trigger badges" sub="Newest first, badged by what created the snapshot">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Each row shows the attempt number, timestamp, confidence, and a trigger badge:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><K>SUBMIT</K> — created from Submit Solution.</li>
                    <li><K>EDIT</K> — created when you re-saved on Edit Solution.</li>
                    <li><K>DESIGN_BRIDGE</K> — created when a Design Studio session was bridged into this solution.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="A/B picker → side-by-side diff" sub="Pick any two attempts to compare">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Pick attempt <strong>A</strong> and attempt <strong>B</strong> from the timeline. The right pane diffs:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Code:</strong> line-level diff via the <K>diff</K> npm package.</li>
                    <li><strong>Prose:</strong> character-level diff across Approach / Brute / Optimized / Key Insight / Feynman.</li>
                    <li><strong>AI feedback:</strong> snapshot of the review at that attempt — see how your scores moved.</li>
                </ul>
                <HowToImage
                    file="history-04-diff.png"
                    alt="A/B picker with two attempts selected and a side-by-side diff view of code and prose changes"
                    caption="A/B diff — pick any two attempts, line-level code + character-level prose"
                />
            </StepCard>

            <Callout type="info">
                All snapshots are immutable. The currently-displayed answer on Submit Solution is always the
                latest <K>SolutionAttempt</K>; the timeline is your full provenance.
            </Callout>
        </>
    )
}
