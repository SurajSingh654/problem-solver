// client/src/pages/docs/howto/content/team-admin/add-problem-manual.jsx
//
// Ripped verbatim from HowToPage.jsx #add-problem-manual section (legacy).
// See CLAUDE.md spec §16 — no raw endpoint paths in visible prose,
// no validator rule numbers in rendered content.
import {
    SummaryBlock, StepCard, PasteBlock, K,
    BRAND, SUCCESS,
} from '../../components'

export default function AddProblemManualGuide() {
    return (
        <>
            <SummaryBlock>
                For problems the AI wouldn&apos;t generate well — company-specific variants, in-house
                puzzles, niche edge-case challenges. Every field is editable end-to-end.
            </SummaryBlock>

            <StepCard num="1" {...BRAND} title="Switch to Manual tab" sub="Add Problem page → Manual Entry">
                <p className="text-xs text-text-secondary leading-relaxed">
                    A full ProblemForm appears with every field editable. Fields are grouped by section:
                    Basics, Source, Content, Admin Notes, Follow-ups. Requires <K>TEAM_ADMIN</K> or{' '}
                    <K>SUPER_ADMIN</K> role.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Fill the required fields">
                <PasteBlock>{`Title:       "Find Longest Consecutive Run"
Category:    CODING
Difficulty:  MEDIUM
Source:      LEETCODE (or OTHER / INTERNAL)
Source URL:  https://leetcode.com/problems/longest-consecutive-sequence/
Tags:        ["array", "hashmap"]
Company Tags: ["Google", "Amazon"]`}</PasteBlock>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Description + teaching notes" sub="Markdown supported">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    <strong>Description:</strong> full problem statement with input/output format,
                    constraints, and 2 worked examples.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    <strong>Admin Notes:</strong> teaching guide — brute force approach with complexity,
                    optimal approach + key insight, top 3 mistakes, how to explain in interviews.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    <strong>Real-world context + use cases:</strong> where does this pattern show up?
                    Skip for HR / BEHAVIORAL (not applicable).
                </p>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Follow-up questions" sub="3 required: EASY, MEDIUM, HARD">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Each follow-up probes deeper understanding. Include a hint that nudges without
                    giving the answer.
                </p>
                <PasteBlock>{`EASY:   "What's the time complexity of your approach?"
        hint: Count the operations per element.
MEDIUM: "How would you parallelize this across N workers?"
        hint: Think about data partitioning and result merging.
HARD:   "What changes if inputs can contain up to 10^18?"
        hint: Standard integer types won't cut it.`}</PasteBlock>
            </StepCard>

            <StepCard num="5" {...SUCCESS} title="Submit → live in team" sub="No approval step needed for manual entries">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Once created, problems appear in your team&apos;s problem list. You can edit them
                    later via the admin problem list → <strong>Edit</strong>.
                </p>
            </StepCard>
        </>
    )
}
