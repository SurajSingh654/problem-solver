// client/src/pages/docs/howto/content/member/learn-curriculum-topic.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/learn/LearnPage.jsx (catalog + Enroll button)
//   - client/src/pages/learn/TopicDetailPage.jsx (goal-setting + concept list)
//   - client/src/pages/learn/ConceptPage.jsx (5-tab shell)
//   - client/src/pages/learn/tabs/ConceptPrimerTab.jsx
//   - client/src/pages/learn/tabs/ConceptLabTab.jsx
//     (202-async submit, poll, reveal gate: STRONG/ADEQUATE + PASS check-in)
//   - client/src/pages/learn/tabs/ConceptCheckInTab.jsx
//     (3-question form, gated by ≥1 STRONG/ADEQUATE lab)
//   - client/src/pages/learn/tabs/ConceptTeachTab.jsx
//     (teaching-ready = mastery ≥ 80 → schedule session)
//
// Actual button labels verified in-source:
//   - "Enroll"                 → LearnPage.jsx:194
//   - "Submit for review"      → ConceptLabTab.jsx:324
//   - "Reveal reference solution" → ConceptLabTab.jsx:412
//   - "Submit check-in"        → ConceptCheckInTab.jsx:349
//   - "Schedule a session on this concept →" → ConceptTeachTab.jsx (:65)
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function LearnCurriculumTopicGuide() {
    return (
        <>
            <SummaryBlock>
                End-to-end walkthrough for the Learn track: enroll on a topic your team published,
                work each concept through Primer → Lab → Check-in → reveal → Teach.
            </SummaryBlock>

            <PrereqList items={[
                'You are enrolled on a team whose admin has published at least one curriculum topic.',
                'Basic familiarity with the language(s) your team’s labs use.',
            ]} />

            <Callout type="info">
                <strong>The order matters.</strong> Primer, then Lab, then Check-in, then Reveal — the
                reveal button is deliberately gated until you have a STRONG or ADEQUATE lab verdict
                AND a PASS on the check-in. Struggle first, then compare.
            </Callout>

            <StepCard num="1" {...BRAND} title="Enroll on a topic" sub="Sidebar → Learn → topic card → Enroll">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar &rarr; <strong>Learn</strong> opens the catalog of topics your team has published.
                    Each card shows the topic name, description, concept count, and estimated hours to mastery.
                    Click <strong>Enroll</strong> on a card to enroll and land on the topic detail page — you
                    can refine your target outcome (interview / job / general) from the enrollment card there.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Open the first concept" sub="Topic detail → concept list → concept row">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The topic detail page lists concepts in curriculum order with a mastery pill per row.
                    Click the first row to open the 5-tab concept shell: <strong>Primer</strong>,
                    <strong> Lab</strong>, <strong>Check-in</strong>, <strong>Notes</strong>, <strong>Teach</strong>.
                    Tabs are URL-synced (<K>?tab=primer</K>, <K>?tab=lab</K> …) so the browser back button flips tabs.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Read the Primer tab" sub="Admin-authored primer, no AI-invented content">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Primers are markdown-rendered explanations reviewed by your team admin before publish —
                    no un-vetted AI content reaches you here. Read through the primer completely; the check-in
                    later probes recall, not reference-lookup.
                </p>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Attempt the Lab tab" sub="Monaco editor + Submit for review">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Lab</strong> tab shows the task markdown, a language chip, and a Monaco
                    editor. Draft is autosaved to <K>localStorage</K> so a refresh won&apos;t lose your code.
                    When ready, click <strong>Submit for review</strong>.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Submit returns immediately (async 202) — the AI code review runs in the background.
                    The page polls every ~3 seconds and also listens on a WebSocket for a review-ready signal,
                    so whichever channel wins refreshes the attempt row into the <strong>Latest attempt</strong> panel
                    with a verdict badge: <K>STRONG</K> / <K>ADEQUATE</K> / <K>WEAK</K>.
                    {/* per client/src/pages/learn/tabs/ConceptLabTab.jsx:355 — reviewStatus poll */}
                </p>
                <Callout type="warning">
                    Only STRONG or ADEQUATE lab verdicts unlock the reveal-reference button and the check-in tab.
                    WEAK verdicts come with actionable improvement feedback — read it, edit, resubmit.
                </Callout>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Take the Check-in tab" sub="3 recall questions + confidence">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Check-in unlocks once your lab lands at STRONG or ADEQUATE. Three prompts —
                    <strong> Recall</strong> (state it), <strong>Apply</strong> (use it on a scenario),
                    <strong> Build</strong> (explain a variant from scratch).
                    Answer without re-reading the primer — the check-in measures retrieval, not comprehension.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Pick your pre-answer confidence (1–5) and click <strong>Submit check-in</strong>. The AI grades
                    it as PASS or FAIL. A PASS combined with your STRONG/ADEQUATE lab is what flips the
                    concept&apos;s <K>teachingReady</K> flag for you.
                </p>
            </StepCard>

            <StepCard num="6" {...SUCCESS} title="Reveal the reference solution" sub="Gated on lab + check-in">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Back on the <strong>Lab</strong> tab: click <strong>Reveal reference solution</strong>.
                    The reveal is logged, so it&apos;s an honest signal (not a shortcut). A side-by-side diff
                    opens comparing your submitted attempt to the reference. Refreshing the page after reveal
                    keeps the &ldquo;revealed&rdquo; timestamp — the button becomes
                    <strong> View reference solution</strong> to reopen the diff.
                </p>
            </StepCard>

            <StepCard num="7" {...INFO} title="Notes tab — capture your own words" sub="Personal notes tied to this concept">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The <strong>Notes</strong> tab is a lightweight scratchpad tied to the concept. Jot the
                    &ldquo;aha&rdquo; moment, edge cases you missed, or a mental model that clicked for you.
                    See the Personal Notes guide for the full notes surface.
                </p>
            </StepCard>

            <StepCard num="8" {...SUCCESS} title="Teach tab — the final checkpoint" sub="Schedule a live teaching session">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Once mastery on this concept crosses ~80, the <strong>Teach</strong> tab flips to green with
                    <strong> Schedule a session on this concept →</strong>. Being able to explain the concept
                    live to teammates is the strongest ownership signal — it deep-links into the teaching-session
                    create form with this concept prefilled.
                </p>
            </StepCard>

            <IfItFails>
                <li><strong>Lab review stuck on &ldquo;Waiting for review&rdquo;</strong> — the poll runs every ~3s and WebSocket also signals ready. If it stays PENDING for &gt;60s the review timed out; refresh the tab and resubmit.</li>
                <li><strong>Check-in tab is locked</strong> — you don&apos;t yet have a STRONG or ADEQUATE lab attempt on this concept. Use <strong>Go to lab →</strong> on the locked screen; resubmit until the verdict lands.</li>
                <li><strong>Reveal button won&apos;t enable</strong> — read the 🔒 message next to it. Either the lab isn&apos;t COMPLETED yet, or the verdict is WEAK, or the check-in hasn&apos;t passed. All three gates must clear.</li>
                <li><strong>Teach tab says &ldquo;unlocks after mastery&rdquo;</strong> — your mastery score isn&apos;t at the teaching-ready threshold yet. The tab tells you exactly which of primer / lab / check-in is missing.</li>
            </IfItFails>
        </>
    )
}
