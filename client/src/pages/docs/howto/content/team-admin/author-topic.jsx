// client/src/pages/docs/howto/content/team-admin/author-topic.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/team-admin/curriculum/TopicAuthoringPage.jsx
//     (4-tab shell: Metadata / Concepts / Curriculum Review / Publish)
//   - client/src/pages/team-admin/curriculum/TopicMetadataTab.jsx
//     (name / description / category / estimatedHoursToMastery /
//      cheatsheetMarkdown — Save metadata button gated on dirty diff)
//   - client/src/pages/team-admin/curriculum/ConceptsListTab.jsx
//     (per-concept row with Primer / Rubric / Lab / Run lesson review /
//      Publish; New concept form; rubric = 8 fields)
//
// Actual button labels verified in source:
//   - "Save metadata"              → TopicMetadataTab.jsx:179
//   - "New concept"                → ConceptsListTab.jsx:768
//   - "Create concept"             → ConceptsListTab.jsx:243
//   - "Save primer"                → ConceptsListTab.jsx:287
//   - "Save rubric"                → ConceptsListTab.jsx:361
//   - "Create lab"/"Save lab"      → ConceptsListTab.jsx:540
//   - "Run lesson review"          → ConceptsListTab.jsx:637
//   - "Publish" (per-concept)      → ConceptsListTab.jsx:646
//
// Route path: /admin/curriculum/topics/:id (client/src/App.jsx:389)
import {
    SummaryBlock, PrereqList, StepCard, Callout,
    IfItFails,
    BRAND, INFO,
} from '../../components'

export default function AuthorTopicGuide() {
    return (
        <>
            <SummaryBlock>
                The 4-tab topic authoring workspace: Metadata, Concepts, Curriculum Review, Publish.
                Edit each concept&apos;s primer, readiness rubric, and lab; run the AI review; then flip to PUBLISHED.
            </SummaryBlock>

            <PrereqList items={[
                'You forked a template or created a topic — see Fork a Curriculum Template.',
                'Feature flag Curriculum is enabled for your build.',
            ]} />

            <Callout type="info">
                <strong>Order of operations.</strong> Metadata → Concepts (primer + rubric + lab per concept) →
                Curriculum Review → Publish. The Publish gates check the AI verdict AND that every concept
                has been individually published, so plan on iterating through all four tabs before you flip
                the topic live.
            </Callout>

            <StepCard num="1" {...BRAND} title="Metadata tab — set topic-level fields" sub="Name · Description · Category · Hours · Cheatsheet">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Metadata</strong> tab (open by default) exposes topic-level fields:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Name:</strong> what learners see on their catalog card.</li>
                    <li><strong>Category:</strong> one of Low-Level Design, High-Level Design, AI Engineering, Data Structures.</li>
                    <li><strong>Description:</strong> short pitch — 2–3 sentences, appears on the catalog card body.</li>
                    <li><strong>Estimated hours to mastery:</strong> optional integer; sets learner expectations.</li>
                    <li><strong>Cheatsheet (markdown):</strong> a quick-reference block rendered at the top of the topic detail page. HTML is sanitized server-side before persist.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Edit the fields you want to change, then click <strong>Save metadata</strong>.
                    The button stays disabled when no field has diverged from its saved value, so you
                    can safely leave-and-return without triggering a stray save.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Concepts tab — the bulk of authoring" sub="Per-concept: primer + rubric + lab">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Concepts</strong> tab lists every concept in order. Each row exposes five actions:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Primer</strong> — opens a markdown editor for the primer body. This is the concept&apos;s teaching text; learners see the compiled HTML in the Primer tab of the concept shell.</li>
                    <li><strong>Rubric</strong> — 8 short expectations (Explain to junior, Sketch architecture, Build from scratch, Name failure modes, Compare alternatives, Estimate cost, Blast radius, Debug from symptoms). At least one field is required for the concept to publish; empty fields are dropped from the persisted rubric.</li>
                    <li><strong>Lab</strong> / <strong>Attach lab</strong> — opens the lab editor. Fill title, task markdown, reference solution (required), starter code (optional), timebox, and expected artifacts. Language is Java in Phase 1.</li>
                    <li><strong>Run lesson review</strong> — sends the concept to the AI reviewer; verdict renders inline under the row.</li>
                    <li><strong>Publish</strong> — flips this single concept to PUBLISHED, subject to two gates (READY lesson-review verdict + readiness rubric present). The gate failure renders inline as a checklist.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    To add a new concept click <strong>New concept</strong>. Slug, name, order, and primer are
                    required in the shell; other fields default sensibly on the server. You can then open
                    the row&apos;s Primer / Rubric / Lab editors like any other concept.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Attach a lab that&apos;s worth publishing" sub="Reference solution + timebox are gated fields">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Two gate-relevant fields to fill carefully in the lab editor:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Reference solution</strong> — this is what the reveal-gate on the learner side shows after a STRONG or ADEQUATE attempt. It must be non-empty for the lab to publish.</li>
                    <li><strong>Timebox (minutes)</strong> — the lab UI on the learner side depends on a countdown. Set a positive integer; the lab won&apos;t publish otherwise.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Optionally use <strong>Run lab shape check</strong> under an attached lab to have the AI
                    sanity-check the task markdown, reference solution shape, and expected artifacts before
                    you commit to publishing.
                </p>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Curriculum Review tab — topic-level AI verdict" sub="Runs against outline + all primers">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Once the topic&apos;s concepts and primers are in a reasonable state, jump to the
                    <strong> Curriculum Review</strong> tab and click <strong>Run review</strong>. The AI
                    reads the topic outline plus every concept&apos;s primer and returns a verdict
                    (WORTH_LEARNING or NEEDS_WORK) plus per-section feedback. See the Run AI Curriculum
                    Review guide for the full breakdown of what it checks.
                </p>
            </StepCard>

            <StepCard num="5" {...INFO} title="Publish tab — the final step" sub="Enforces publish gates + flips Topic.status">
                <p className="text-xs text-text-secondary leading-relaxed">
                    When the review lands at WORTH_LEARNING <em>and</em> every child concept is PUBLISHED,
                    open the <strong>Publish</strong> tab and click <strong>Publish topic</strong>. The
                    Publish tab surfaces advisory hints (missing review, unpublished concepts) BEFORE you
                    click, and inline gate-failure checklists AFTER, so you always know exactly which
                    condition failed. Full detail in the Publish a Topic guide.
                </p>
            </StepCard>

            <IfItFails>
                <li><strong>Save metadata is disabled</strong> — nothing has changed from the saved value. Edit at least one field to enable the button.</li>
                <li><strong>Concept publish is greyed out</strong> — the concept is already PUBLISHED. Updates to a published concept still go live via Save.</li>
                <li><strong>Concept publish fails with a gate checklist</strong> — read the FAIL rows. Fix each (usually: run a lesson review that lands at READY, or fill at least one rubric field), then retry.</li>
                <li><strong>Lab modal won&apos;t save</strong> — reference solution is required. Also check the language dropdown; Phase 1 ships Java only.</li>
                <li><strong>&ldquo;Template updated&rdquo; chip appears at the top</strong> — the source template shifted since you forked. This is informational for Phase 1; a proper diff view lands in Phase 2.</li>
            </IfItFails>
        </>
    )
}
