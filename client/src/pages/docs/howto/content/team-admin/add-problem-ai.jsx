// client/src/pages/docs/howto/content/team-admin/add-problem-ai.jsx
//
// Ripped verbatim from HowToPage.jsx #add-problem-ai section (legacy).
// See CLAUDE.md spec §16 — no raw endpoint paths in visible prose,
// no validator rule numbers in rendered content.
import {
    SummaryBlock, StepCard, HowToImage, Callout, PasteBlock, K,
    BRAND, SUCCESS, WARN,
} from '../../components'

export default function AddProblemAiGuide() {
    return (
        <>
            <SummaryBlock>
                Fastest way to populate your team&apos;s problem bank — AI generates 1–5 problems at a time
                with full teaching notes, complete with URL confidence and duplicate-detection safeguards.
            </SummaryBlock>

            <Callout type="info">
                Accessible at <K>/admin/add-problem</K> or via sidebar → Admin → Add Problem.
                Requires <K>TEAM_ADMIN</K> or <K>SUPER_ADMIN</K> role.
            </Callout>

            <StepCard num="1" {...BRAND} title="Pick AI Generation tab" sub="Default tab on the Add Problem page">
                <p className="text-xs text-text-secondary leading-relaxed">
                    You&apos;ll see a setup form and a live preview panel. Fill the setup, click Generate,
                    then approve or reject each generated problem individually.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Category — pick one of seven">
                <PasteBlock>{`CODING               — LeetCode-style algorithm problems
SYSTEM_DESIGN        — Distributed system design questions
LOW_LEVEL_DESIGN     — OOP / class design problems
BEHAVIORAL           — STAR story prompts
CS_FUNDAMENTALS      — Concept explanation (OS, networking, DB internals, …)
HR                   — Company-fit questions
SQL                  — Query or schema-design problems`}</PasteBlock>
                <p className="text-xs text-text-secondary leading-relaxed">
                    The AI uses different prompts per category. CODING + SQL try to generate real LeetCode
                    URLs; all others are self-contained.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Count + difficulty + team context">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Count:</strong> 1–5 problems per batch (hard cap — Railway timeout).</li>
                    <li><strong>Difficulty:</strong> <K>auto</K> (AI picks based on team context) or <K>custom: 2 EASY, 2 MEDIUM, 1 HARD</K>.</li>
                    <li><strong>Target Company</strong> (optional): tailors problem selection to that company&apos;s style (e.g. Goldman Sachs HR, Meta algorithmic).</li>
                    <li><strong>Focus Areas</strong> (optional): &ldquo;Graph traversal + DP&rdquo; narrows the AI&apos;s pick.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Generate → Preview" sub="~10–30s depending on count">
                <HowToImage
                    file="add-ai-04-preview.png"
                    alt="AI-generated problem preview cards with Approve/Reject buttons and expandable teaching notes"
                    caption="Generated problem previews — approve or reject individually"
                />
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Each generated problem appears as a card with:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>Title + difficulty + source (LeetCode link if confident, otherwise OTHER)</li>
                    <li>Description + tags + company tags</li>
                    <li>Real-world context + 5–6 use cases (except HR — empty for HR)</li>
                    <li>Admin teaching notes (numbered approaches, edge cases, interview tip)</li>
                    <li>3 follow-up questions (EASY → MEDIUM → HARD) with hints</li>
                </ul>
            </StepCard>

            <StepCard num="5" {...SUCCESS} title="Approve or Reject each one" sub="Granular control — cherry-pick the good ones">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Expand a card to review the admin notes and follow-ups in full. Click{' '}
                    <strong>Approve</strong> to publish it to your team, or <strong>Reject</strong> to
                    discard. Approved problems appear in your team&apos;s problem list immediately.
                </p>
            </StepCard>

            <StepCard num="6" {...WARN} title="Three admin aids on every preview card" sub="URL confidence · Search fallback · Duplicate detection">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Each generated card surfaces three signals so you don&apos;t silently approve broken or
                    redundant content:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>
                        <strong>URL Confidence pill</strong> next to the source link:
                        <K>✓ verified</K> (AI confident, link should work) /
                        <K>⚠ unverified</K> (best guess) /
                        <K>✗ Search fallback</K> (AI couldn&apos;t generate a real URL — see below).
                        Always sanity-check ⚠ and ✗ before approving.
                    </li>
                    <li>
                        <strong>Search-fallback URL</strong> — when the AI can&apos;t produce a confident link,
                        instead of leaving it blank we drop in a platform search URL like{' '}
                        <K>leetcode.com/problemset/?search=…</K> or <K>geeksforgeeks.org/?s=…</K>.
                        The user lands somewhere useful instead of a dead page; you fix it before approval.
                    </li>
                    <li>
                        <strong>⚠️ Possible Duplicate panel</strong> appears above the source link when the
                        generated title overlaps an existing team problem ≥ 50% (token-Jaccard, stopword filtered).
                        Up to 3 matches with overlap %. Catches &ldquo;Two Sum II&rdquo; vs existing &ldquo;Two Sum&rdquo;
                        before it lands in the team&apos;s queue.
                    </li>
                </ul>
                <HowToImage
                    file="add-ai-04-confidence.png"
                    alt="Generated problem card with URL confidence pill next to source link and search-fallback indicator"
                    caption="URL confidence pill + search fallback — admin sees instantly which links to verify"
                />
                <HowToImage
                    file="add-ai-04-duplicate.png"
                    alt="Generated problem card with Possible Duplicate panel listing similar existing problems and their overlap percentages"
                    caption="Duplicate-detection panel — listed similar titles with token-Jaccard overlap %"
                />
            </StepCard>
        </>
    )
}
