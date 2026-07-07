// client/src/pages/docs/howto/content/super-admin/teaching-flags.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/TeachingFlagsPage.jsx
//     4 filter tabs: OPEN / REVIEWED / DISMISSED / ALL (line 157)
//     Two actions per OPEN row: Uphold (cancel) / Dismiss (lines 82-95)
//     Uphold confirm modal warns "session will be CANCELLED, attendees see room close" (line 132)
//     Dismiss has no confirm (line 140)
//     Row shows: status pill / session title link / host / flag count / reason / reporter / timestamp
//     More button toggles full reason panel (line 96)
//     Uphold also broadcasts teaching:ended over WS (comment line 6-8)
//     Visible to TEAM_ADMIN of the team OR any SUPER_ADMIN (line 10-11)
//   - client/src/App.jsx:228 → /super-admin/teaching-flags route
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, WARN,
} from '../../components'

export default function TeachingFlagsGuide() {
    return (
        <>
            <SummaryBlock>
                Triage teaching-session flags submitted by attendees. Dismiss false positives with
                one click, or uphold real issues to cancel the session and close its live room —
                any connected attendee sees the room end immediately.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform, OR TEAM_ADMIN of the team the flagged session belongs to.',
                'At least one attendee has filed a flag on a teaching session.',
            ]} />

            <StepCard num="1" {...BRAND} title="Open the Teaching Flags page" sub="Sidebar → Flags">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>Flags</strong>. Default filter is
                    <K>OPEN</K> — the queue of flags that need a decision. The pill shows the current
                    open count.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Read a flag row" sub="What each field tells you">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Status pill</strong> — <K>OPEN</K> yellow, <K>REVIEWED</K> green (upheld), <K>DISMISSED</K> gray.</li>
                    <li><strong>Session title</strong> — links directly to the teaching session for context. If it says <em>(deleted session)</em>, the session was already removed.</li>
                    <li><strong>host</strong> — the teacher running the session.</li>
                    <li><strong>N flags total</strong> — red chip if the session has been flagged more than once. Multiple flags on one session is a strong signal.</li>
                    <li><strong>Reason</strong> — the attendee&apos;s free-text explanation. Click <strong>More</strong> to see the full text if truncated.</li>
                    <li><strong>Reporter + timestamp</strong> — anonymous if the attendee opted for anonymity.</li>
                </ul>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Dismiss a false positive" sub="One-click, no confirm">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click <strong>Dismiss</strong> on an OPEN row. The flag flips to DISMISSED
                    immediately; the session is not touched. Use this for misfires, misunderstandings,
                    or non-actionable feedback.
                </p>
            </StepCard>

            <StepCard num="4" {...WARN} title="Uphold and cancel a session" sub="Destructive — attendees see the room close">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Click <strong>Uphold (cancel)</strong> on an OPEN row. A confirm modal appears —
                    it explicitly states:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>The session will be <strong>CANCELLED</strong>.</li>
                    <li>Any connected attendees will see the room close.</li>
                    <li>This cannot be undone.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    On confirm, the flag flips to REVIEWED and the session status flips to CANCELLED.
                    A <K>teaching:ended</K> broadcast fires over the teaching WebSocket so every
                    live attendee sees the room close in real time. Reserve this for policy violations
                    or content that must not continue.
                </p>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Switch status filter to see history" sub="OPEN / REVIEWED / DISMISSED / ALL">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The four tabs at the top scope the list. Use <K>REVIEWED</K> to audit past
                    upholds; use <K>DISMISSED</K> to review your own past dismissals; use <K>ALL</K>
                    to see everything. Dismissed and reviewed flags display any resolution note you
                    left in a right-hand italic pull-quote.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Upholds are irreversible.</strong> Once you cancel a session, there is no
                undo — the room closes, attendees are notified, and the session record is stamped
                CANCELLED. If in doubt, dismiss for now and revisit; you can always uphold later.
            </Callout>

            <IfItFails>
                <li><strong>Empty queue with &ldquo;No open flags&rdquo;</strong> — nothing to triage. Switch the tab to ALL to see historical flags.</li>
                <li><strong>Uphold succeeded but attendees stayed in the room</strong> — WS delivery lag or a disconnected client. The server-side session is still CANCELLED; the browser will surface the close on next reconnect.</li>
                <li><strong>Session title reads &ldquo;(deleted session)&rdquo;</strong> — the session was already removed. Dismiss the flag; nothing left to action.</li>
                <li><strong>Uphold button not showing on a row</strong> — the row is not <K>OPEN</K>. Only OPEN flags expose actions.</li>
                <li><strong>Wrong-team flag appears</strong> — you have SUPER_ADMIN, which sees every team&apos;s flags. TEAM_ADMINs only see their own team&apos;s.</li>
            </IfItFails>
        </>
    )
}
