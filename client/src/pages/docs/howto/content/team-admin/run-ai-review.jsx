// client/src/pages/docs/howto/content/team-admin/run-ai-review.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/team-admin/curriculum/CurriculumReviewTab.jsx
//     (button label + verdict body renderer + fallback banner + cached
//      prior verdict from topic.curriculumReview)
//
// Actual button labels verified in source:
//   - "Run review" / "Re-run review"    → CurriculumReviewTab.jsx:244
//   - Empty state copy                  → CurriculumReviewTab.jsx:277
//   - Fallback warning line             → CurriculumReviewTab.jsx:267
//
// Rate-limit note per source: server chains aiLimiter + aiTeamLimiter
// on this route; repeat within the per-user window comes back 429.
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose,
// no validator rule numbers in rendered content — describe outcomes.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS,
} from '../../components'

export default function RunAiReviewGuide() {
    return (
        <>
            <SummaryBlock>
                Send your topic outline plus every concept primer to the AI curriculum reviewer.
                Verdict: <K>WORTH_LEARNING</K> or <K>NEEDS_WORK</K>, plus per-section feedback.
            </SummaryBlock>

            <PrereqList items={[
                'You authored a topic — see Author a Topic.',
                'At least one concept exists on the topic (the review reads their primers).',
            ]} />

            <Callout type="info">
                <strong>What it checks.</strong> The review evaluates outcomes, ROI (time vs interview vs
                job value), retention signals, structural sanity, and per-concept coverage. It also flags
                redundant modules and missing coverage. The bar is senior-level readiness — the review
                pushes back when a topic reads like a bullet-point index instead of an actual teaching plan.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the Curriculum Review tab" sub="Topic authoring → Curriculum Review">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Inside your topic&apos;s authoring page, click the <strong>Curriculum Review</strong> tab.
                    If a prior review has run for this topic, its cached verdict renders immediately — no
                    fresh AI call happens on tab open. The tab header shows &ldquo;Last run …&rdquo; when
                    a previous verdict exists.
                </p>
            </StepCard>

            <StepCard num="2" {...SUCCESS} title="Click Run review" sub="~5–30 seconds; both aiLimiter and aiTeamLimiter apply">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Click <strong>Run review</strong> (or <strong>Re-run review</strong> if a prior verdict
                    is already displayed). The verdict body renders below the button with structured sections:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>One-line summary</strong> — the reviewer&apos;s TL;DR of the topic.</li>
                    <li><strong>Learning outcomes</strong> — what learners can do after completing the topic.</li>
                    <li><strong>ROI</strong> — time cost vs interview / job value; a WORTH / NEUTRAL / SKIP verdict on ROI overall.</li>
                    <li><strong>Retention</strong> — signals for and against long-term recall.</li>
                    <li><strong>Structural sanity</strong> — PASS/FAIL for concept ordering, primer depth, lab presence.</li>
                    <li><strong>Modules needing work</strong> — table with concept slug, issue, and suggested fix.</li>
                    <li><strong>Missing coverage / redundant modules / strong points / final recommendation</strong>.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    The verdict pill at the top of the panel is the source of truth for the Publish gate.
                    A <K>WORTH_LEARNING</K> verdict is required before you can publish the topic.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Fallback banner.</strong> If the AI response fails validation, a yellow
                &ldquo;Fallback used&rdquo; banner appears above the verdict. The body is deterministic in
                that case but reflects a validator failure, not a real review — re-running is worth trying
                before you take the verdict at face value.
            </Callout>

            <IfItFails>
                <li><strong>429 Too Many Requests</strong> — you hit the per-user AI rate limit (a chained limiter runs across all AI features). Wait out the window, then retry. Consecutive re-runs on the same topic count.</li>
                <li><strong>Verdict comes back NEEDS_WORK</strong> — read the &ldquo;Modules needing work&rdquo; table row-by-row. Each row spells out the issue and a suggested fix on a specific concept slug. Edit those concepts&apos; primers or rubrics on the Concepts tab, then re-run the review.</li>
                <li><strong>&ldquo;Fallback used&rdquo; banner</strong> — the AI output failed schema validation. Click <strong>Re-run review</strong>. If it happens twice in a row on the same content, simplify or shorten the primers — extremely long or malformed primer markdown is the usual cause.</li>
                <li><strong>Nothing happens after clicking Run review</strong> — check the topic has at least one concept with a non-empty primer. The reviewer needs content to evaluate.</li>
            </IfItFails>
        </>
    )
}
