// client/src/pages/docs/howto/content/member/edit-solution.jsx
//
// Ripped verbatim from HowToPage.jsx #edit-solution section.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    BRAND, SUCCESS,
} from '../../components'

export default function EditSolutionGuide() {
    return (
        <>
            <SummaryBlock>
                Revise a solution after review — re-run AI scoring with a cleaner attempt.
                Editing appends a new immutable snapshot; old attempts stay intact.
            </SummaryBlock>

            <PrereqList items={[
                'A previously submitted solution on your Profile → Solutions tab.',
            ]} />

            <StepCard num="1" {...BRAND} title="Find your solution" sub="Profile → Solutions tab, or Review Queue">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Each row shows the problem title, overall score, pattern, last-reviewed date,
                    and next SM-2 review date. Click <strong>Edit</strong> on the row (or open it from the problem page).
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Update your content" sub="Same workspace, pre-filled with your previous answer">
                <p className="text-xs text-text-secondary leading-relaxed">
                    All fields load with your last submission. Edit the parts you want to improve —
                    typically the approach, code optimizations, or Feynman explanation after you&apos;ve
                    learned more. Update <strong>Confidence</strong> to reflect your current understanding.
                </p>
            </StepCard>

            <StepCard num="3" {...SUCCESS} title="Re-submit → new AI review" sub="New scores overwrite the old; old attempts are preserved">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Scores, dimension breakdown, strengths, gaps — all replaced. Pattern baseline
                    tracking stays intact: the AI compares this attempt to your historical average
                    on this pattern and calls out improvement or regression explicitly in the review.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    <strong>Editing no longer overwrites your previous answer.</strong> Every submit, edit, and
                    Design Studio bridge appends a <K>SolutionAttempt</K> snapshot — see Attempt History to
                    diff any two attempts side-by-side.
                </p>
                <Callout type="info">
                    SM-2 resets: the next review date is recomputed based on the new confidence rating.
                </Callout>
            </StepCard>
        </>
    )
}
