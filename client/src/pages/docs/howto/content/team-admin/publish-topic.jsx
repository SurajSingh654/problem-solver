// client/src/pages/docs/howto/content/team-admin/publish-topic.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/team-admin/curriculum/PublishTab.jsx
//     (client-side pre-flight hints + confirm modal + inline gate render)
//   - server/src/controllers/curriculumAdmin.controller.js
//     (Topic publish gates lines 995-1053: curriculum_review_verdict = WORTH_LEARNING
//      AND concepts_all_published; Concept publish gates lines 1091-1136:
//      lesson_review_verdict = READY AND readiness_rubric_present; Lab
//      publish gates lines 1186-1220: reference_solution_present + timebox_present)
//
// Actual button + banner copy verified in source:
//   - "Publish topic" / "Already published" → PublishTab.jsx:114
//   - Confirm modal "Publish this topic?"   → PublishTab.jsx:70
//   - "Publish blocked" title               → PublishTab.jsx:159
//   - "Things to check first"               → PublishTab.jsx:130
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose,
// no validator rule numbers. There is NO curriculumPublishGates.js file —
// gate logic is inlined in curriculumAdmin.controller.js.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS, WARN,
} from '../../components'

export default function PublishTopicGuide() {
    return (
        <>
            <SummaryBlock>
                Flip a topic from DRAFT to PUBLISHED so learners can see it. Publish is gated at three
                levels — Topic, Concept, and Lab — and the server enforces each gate before flipping status.
            </SummaryBlock>

            <PrereqList items={[
                'You ran the AI curriculum review — see Run AI Curriculum Review.',
                'Every concept on the topic has been individually published.',
            ]} />

            <Callout type="info">
                <strong>Three gate levels, checked bottom-up.</strong> Labs publish independently. Concepts
                won&apos;t publish without a READY lesson review AND a readiness rubric. Topics won&apos;t
                publish without a WORTH_LEARNING curriculum review AND every child concept PUBLISHED. If
                you skip the middle layer, the topic-level Publish fails with a gate checklist.
            </Callout>

            <StepCard num="1" {...BRAND} title="Publish each Lab (via the concept row)" sub="Reference solution + timebox required">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Labs have two deterministic gates (no AI involved):
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Reference solution present</strong> — non-empty <K>referenceSolution</K> field. This is what the reveal-gate on the learner side shows after they clear the lab.</li>
                    <li><strong>Timebox present</strong> — a positive integer number of minutes. The lab UI depends on a countdown.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Starter code is <em>not</em> gated — an empty starter is fine, the learner starts from
                    a blank editor. Fix both required fields in the lab editor and save; the concept row
                    will then be able to publish.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Publish each Concept" sub="READY verdict + non-null readiness rubric">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    On the Concepts tab, click <strong>Publish</strong> on each concept row. Two gates run:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Lesson review verdict = READY</strong> — you must have run <em>Run lesson review</em> on the row and gotten a READY verdict. Any other verdict (NEEDS_WORK, WEAK, or missing) fails this gate.</li>
                    <li><strong>Readiness rubric present</strong> — the concept&apos;s <K>readinessRubric</K> field is non-null. At least one of the 8 rubric fields (Explain to junior, Sketch architecture, Build from scratch, etc.) must be filled.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Gate failures render inline under the row as a red checklist showing PASS/FAIL per gate
                    with the specific reason. Fix each FAIL row and click Publish again.
                </p>
            </StepCard>

            <StepCard num="3" {...WARN} title="Read the pre-flight hints" sub="Publish tab → Things to check first">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    On the topic&apos;s <strong>Publish</strong> tab, a yellow <strong>Things to check first</strong>
                    panel surfaces client-side hints for the two most common gate failures:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>&ldquo;This topic has no concepts&rdquo; / &ldquo;N of M concepts not yet published&rdquo; — jump to Concepts and publish each one.</li>
                    <li>&ldquo;No curriculum review has been run yet&rdquo; — jump to Curriculum Review and run one.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    These are advisory only — you can still click Publish and let the server refuse. The
                    server is the source of truth on gates; the panel just saves you a round-trip.
                </p>
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Click Publish topic" sub="Two gates enforced server-side">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Click <strong>Publish topic</strong>. A confirm dialog appears; confirm to fire the request.
                    Two topic-level gates run:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Curriculum review verdict = WORTH_LEARNING</strong> — the latest cached curriculum review verdict on the topic must be exactly <K>WORTH_LEARNING</K>. Missing or NEEDS_WORK fails this gate.</li>
                    <li><strong>All concepts PUBLISHED</strong> — every child concept&apos;s status must equal <K>PUBLISHED</K>. Any DRAFT concept fails this gate with a list of missing slugs.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    On success, the topic&apos;s status badge flips to PUBLISHED, a success toast fires,
                    and a green &ldquo;Topic is published and visible to learners&rdquo; card appears. From
                    that moment enrolled learners on your team see this topic in their Learn catalog.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Editing a published topic.</strong> Metadata and concept edits on a published topic
                stay live — the topic is not un-published by editing. Only an admin can flip status back
                to DRAFT (not surfaced in Phase 1), so treat Publish as the point where your changes affect
                real learners.
            </Callout>

            <IfItFails>
                <li><strong>Publish blocked — curriculum_review_verdict FAIL</strong> — run the AI curriculum review from the Curriculum Review tab. If the verdict is NEEDS_WORK, fix the flagged modules and re-run until it lands at WORTH_LEARNING.</li>
                <li><strong>Publish blocked — concepts_all_published FAIL</strong> — the failure message lists the missing slugs. Go to Concepts, publish each one, then retry the topic publish.</li>
                <li><strong>Concept publish fails — lesson_review_verdict FAIL</strong> — click <strong>Run lesson review</strong> on the row. Read the verdict body; if it&apos;s not READY, edit the primer or rubric per the feedback and re-run.</li>
                <li><strong>Concept publish fails — readiness_rubric_present FAIL</strong> — open the Rubric modal on the row and fill at least one field (Explain to junior is the fastest). Save the rubric, then retry Publish.</li>
                <li><strong>Lab won&apos;t publish</strong> — check the lab editor: reference solution must be non-empty, timebox must be a positive integer. Save, then retry.</li>
                <li><strong>Non-gate error banner appears</strong> — a 500 or unexpected server error; retry, and if it persists check server logs / open a feedback report.</li>
            </IfItFails>
        </>
    )
}
