// client/src/pages/docs/howto/content/team-admin/fork-template.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx
//   - server/src/services/curriculum/curriculumFork.service.js
//     (deep-clone semantics, DRAFT status on every forked row,
//      ForkDuplicateError → 409, ForkTemplateNotFoundError → 404)
//
// Actual button label + confirm copy verified in source:
//   - "Fork into my team"                → TemplateBrowserPage.jsx:96
//   - Confirm modal "Fork template?"     → TemplateBrowserPage.jsx:120
//   - Confirm button "Fork"              → TemplateBrowserPage.jsx:123
//   - Already-forked chip copy           → TemplateBrowserPage.jsx:81
//
// Route path: /admin/curriculum/templates (client/src/App.jsx:381)
// See CLAUDE.md spec §16 — no raw endpoint paths in visible prose,
// no validator rule numbers in rendered content.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS,
} from '../../components'

export default function ForkTemplateGuide() {
    return (
        <>
            <SummaryBlock>
                Fork a global curriculum template into your team as an editable, DRAFT topic.
                Deep-clones the topic plus every concept and lab in one atomic step.
            </SummaryBlock>

            <PrereqList items={[
                'You are TEAM_ADMIN on the currently-selected team.',
                'A SUPER_ADMIN has synced curriculum templates on the platform. If the template library is empty, ask a SUPER_ADMIN to run a template sync.',
                'Feature flag Curriculum is enabled for your build.',
            ]} />

            <Callout type="info">
                <strong>Forking creates a COPY.</strong> Every row inside your fork (topic, concepts, labs)
                starts as <K>DRAFT</K> regardless of the template&apos;s state. Editing your fork never touches
                the source template, and template updates never override your local edits.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the Template Browser" sub="Sidebar → Curriculum → Templates">
                {/* Route path: /admin/curriculum/templates — App.jsx:381 */}
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the Curriculum Admin page click <strong>Browse templates</strong> (or use the
                    sidebar link). The browser lists every PUBLISHED template your platform admin has
                    synced — name, slug, category, concept count, and estimated hours to mastery per card.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Click Fork into my team" sub="Cards → Fork into my team button">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Every card exposes a primary <strong>Fork into my team</strong> button. A confirm dialog
                    appears — the description spells out that this creates an editable copy, not a live
                    subscription to the template.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Templates you already forked show an <strong>Already forked</strong> chip instead of
                    the button, with a link back to your Curriculum Admin page.
                </p>
            </StepCard>

            <StepCard num="3" {...SUCCESS} title="Land in the 4-tab authoring page" sub="Redirect to admin/curriculum/topics/:id">
                <p className="text-xs text-text-secondary leading-relaxed">
                    On success the app navigates straight to the topic authoring page for your new fork —
                    a 4-tab UI (<K>Metadata</K>, <K>Concepts</K>, <K>Curriculum Review</K>, <K>Publish</K>).
                    You&apos;re now the owner of an editable draft. See the Author a Topic guide for what
                    to edit in each tab, and the Publish a Topic guide for the gates you must clear before
                    it goes live to learners.
                </p>
            </StepCard>

            <IfItFails>
                <li><strong>&ldquo;Already forked&rdquo; chip appears instead of the button</strong> — your team already has a topic with this slug. Click the link in the chip to open the existing topic under Curriculum Admin instead of forking again.</li>
                <li><strong>&ldquo;Template not found&rdquo; error</strong> — the template slug isn&apos;t published on the platform. Ask a SUPER_ADMIN to sync curriculum templates. New templates only appear here after that sync completes.</li>
                <li><strong>Fork button is disabled or 403</strong> — check the sidebar team switcher. You must be a TEAM_ADMIN on the currently-active team; MEMBER role cannot fork.</li>
                <li><strong>Templates page is completely empty</strong> — the platform has no PUBLISHED templates yet. Same fix: ask a SUPER_ADMIN to run a sync.</li>
            </IfItFails>
        </>
    )
}
