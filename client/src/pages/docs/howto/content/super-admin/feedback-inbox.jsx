// client/src/pages/docs/howto/content/super-admin/feedback-inbox.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/FeedbackInboxPage.jsx
//     Summary bar: Open / Acknowledged / In Progress / Critical (SummaryBar line 62)
//     5 statuses: OPEN / ACKNOWLEDGED / IN_PROGRESS / RESOLVED / WONT_FIX (line 40)
//     3 types: BUG / SUGGESTION / QUESTION (line 48)
//     4 severities: CRITICAL / HIGH / MEDIUM / LOW (line 54)
//     Suggested notes per status (line 13)
//     Multi-select + FeedbackExportBar for CSV/JSON/Markdown export (line 412)
//     Admin note is optional and visible to the submitter (line 277)
//   - client/src/App.jsx:223 → /super-admin/feedback route
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS,
} from '../../components'

export default function FeedbackInboxGuide() {
    return (
        <>
            <SummaryBlock>
                Triage every member-submitted bug report, suggestion, and question in one queue.
                Update status inline, leave a note visible to the submitter, and export a selection
                as CSV / JSON / Markdown for AI-assisted resolution or handoff.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
                'At least one report has been filed — see File Feedback.',
            ]} />

            <StepCard num="1" {...BRAND} title="Open the Feedback Inbox" sub="Sidebar → Feedback Inbox">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>Feedback Inbox</strong>. The top of the
                    page shows a four-tile summary: <strong>Open</strong>, <strong>Acknowledged</strong>,
                    <strong> In Progress</strong>, <strong>Critical</strong>. Below that, an export bar,
                    filter chips, and the report list.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Filter the queue" sub="Status × Type — chip strips">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Two chip strips scope the list. Combine them for precise slices.
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Status</strong>: <K>OPEN</K> / <K>ACKNOWLEDGED</K> / <K>IN_PROGRESS</K> / <K>RESOLVED</K> / <K>WONT_FIX</K>. Default is All.</li>
                    <li><strong>Type</strong>: 🐛 Bugs / 💡 Suggestions / ❓ Questions. Default is All Types.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    A common triage flow: filter to <K>OPEN</K> + <K>BUG</K> and sort by severity.
                    Critical bugs surface with a red border on the card.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Read a report" sub="Click to expand">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Every card shows: type icon, title, severity dot, submitter name, relative age,
                    team, affected area chip, and current status. Click the card to expand and see:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Description</strong> — free-form body from the submitter.</li>
                    <li><strong>Steps to Reproduce</strong> — sanitized HTML (for bugs).</li>
                    <li><strong>Your Note</strong> — the admin-facing note you left previously, if any.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Update status + leave a note" sub="Quick-suggestion chips per status">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Click <strong>Update Status</strong> inside the expanded card. A status picker and
                    a note textarea appear. The note is <em>optional and visible to the submitter</em> —
                    the platform will show it when they open their feedback log.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    A <strong>Quick suggestions</strong> row appears above the textarea with two or three
                    canned replies for the status you picked (Acknowledged / In Progress / Resolved /
                    Won&apos;t Fix). Click any suggestion to fill the textarea, then edit before saving.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click <strong>Save</strong> — the card&apos;s status chip updates immediately.
                </p>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Export selected reports" sub="Checkbox per row → CSV / JSON / Markdown">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Every card has a checkbox in the top-left. There&apos;s also a <strong>Select all on
                    this page</strong> toggle at the top of the list. Once you have a selection, the
                    export bar at the top exposes CSV / JSON / Markdown export formats.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    The Markdown export is designed to paste into an AI chat for triage — every field is
                    labeled and the file naming is deterministic. Use JSON if you want to load into a
                    spreadsheet or Airtable; use CSV for a plain-text audit trail.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Admin notes are user-facing.</strong> Anything you type in the note field is
                shown to the submitter when they open their feedback log. Do not paste internal
                context, stack traces, or profanity. Use the export flow to hand off to an AI or
                external tool if you need a private working document.
            </Callout>

            <IfItFails>
                <li><strong>Empty inbox with 📭 icon</strong> — no reports match your filters. Clear filters or check All Statuses / All Types.</li>
                <li><strong>Status update saves but doesn&apos;t stick after refresh</strong> — likely a network error the client swallowed. Check the browser console for a failed request and retry.</li>
                <li><strong>Export button is disabled</strong> — you haven&apos;t selected any rows. Tick at least one checkbox.</li>
                <li><strong>Quick suggestion overwrites text you were typing</strong> — clicking a suggestion replaces the current note. This is by design; type from scratch or edit after clicking.</li>
                <li><strong>Steps-to-Reproduce panel looks broken</strong> — the submitter&apos;s markup was sanitized. Original raw HTML is stored in the DB if you need it.</li>
            </IfItFails>
        </>
    )
}
