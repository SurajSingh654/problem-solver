// client/src/pages/docs/howto/content/team-admin/manage-team.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/team/TeamManagePage.jsx
//     (join code + invite + members list + role change + remove flow)
//   - client/src/components/layout/Sidebar.jsx (:663-673)
//     (team switcher → "Manage Teams" button navigates to /team)
//
// Actual button labels + copy verified in source:
//   - "Manage Teams" link                → Sidebar.jsx:672
//   - "Join Code" panel                  → TeamManagePage.jsx:474
//   - "Show" / "Hide" / "Copy" / "Regenerate" → TeamManagePage.jsx:481-495
//   - "Invite Members by Email"          → TeamManagePage.jsx:515
//   - "Send Invites"                     → TeamManagePage.jsx:545
//   - "Promote" / "Demote" / "Remove"    → TeamManagePage.jsx:627/635
//   - "Max 10 per batch"                 → TeamManagePage.jsx:538
//   - "Switch to Individual" / "Leave"   → TeamManagePage.jsx:451/460
//
// Route path: /team (client/src/App.jsx:312)
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function ManageTeamGuide() {
    return (
        <>
            <SummaryBlock>
                Invite members, share the join code, promote or demote by role, and remove people from
                your team — all from the Team Management page. TEAM_ADMIN role required.
            </SummaryBlock>

            <PrereqList items={[
                'You are TEAM_ADMIN on the currently-selected team.',
                'The team is not in personal-mode (personal auto-teams have no members list to manage).',
            ]} />

            <Callout type="info">
                <strong>How to get there.</strong> Sidebar → click your team badge at the top → click
                <strong> Manage Teams</strong> at the bottom of the switcher dropdown. Or navigate directly
                to <K>/team</K>. Non-admin members see a read-only view of the same page.
            </Callout>

            <StepCard num="1" {...BRAND} title="Share your join code" sub="Team page → Join Code panel (admin-only)">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The <strong>Join Code</strong> panel at the top of the page shows your team&apos;s 8-character
                    code (masked by default). Click <strong>Show</strong> to reveal it, <strong>Copy</strong>{' '}
                    to put it on your clipboard, or <strong>Regenerate</strong> to rotate it. Regenerating
                    invalidates the old code immediately — anyone who was mid-join will need the new value.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Invite members by email" sub="Email invitation flow — up to 10 per batch">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click <strong>Invite Members by Email</strong>. A textarea appears — paste one or more
                    email addresses separated by commas or newlines. Click <strong>Send Invites</strong>.
                    Results render inline: <K>✓ email@example.com — invited</K> for successes,{' '}
                    <K>⊘ email@example.com — reason</K> for skips (e.g. already on the team, invalid address).
                    Max 10 addresses per batch.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Manage members inline" sub="Members list → Promote / Demote / Remove">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Members</strong> list at the bottom shows every current teammate with role
                    pill (Admin / Member), inactive tag if applicable, and streak. Admin-only actions on
                    each row (except your own):
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Promote</strong> — flip a MEMBER to TEAM_ADMIN. They gain access to Curriculum Admin, Add Problem, and team analytics.</li>
                    <li><strong>Demote</strong> — flip a TEAM_ADMIN back to MEMBER.</li>
                    <li><strong>Remove</strong> — kick the member out. Confirmation dialog appears; on confirm they lose access to all team content.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...INFO} title="Personal auto-team model" sub="Every user has one — treat like any team">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Every user has an auto-created personal team (<K>isPersonal: true</K>) alongside real
                    teams. When you&apos;re in your personal team the sidebar reads &ldquo;Individual mode&rdquo;
                    — the Team page shows Join / Create options instead of the members list. Personal
                    teams are single-member and cannot be shared. To switch: sidebar team switcher →
                    another team, or click <strong>Switch to Individual</strong> on this page.
                </p>
            </StepCard>

            <StepCard num="5" {...SUCCESS} title="Leaving a team" sub="Team page → Leave (right of header)">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click <strong>Leave</strong> (top-right of the page) to remove yourself from the team.
                    Confirmation dialog appears — on confirm you&apos;re switched back to individual mode.
                    Note: if you&apos;re the last TEAM_ADMIN on a team, you cannot leave without first
                    promoting another member.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Regenerating the join code.</strong> The old code stops working the instant you
                regenerate. If you shared the code broadly (Slack, docs, email templates), rotate carefully
                — anyone mid-join with the old value will bounce and need the new code.
            </Callout>

            <IfItFails>
                <li><strong>Invite Members button is missing</strong> — you&apos;re not TEAM_ADMIN on the currently-selected team. Check the sidebar team switcher; the role pill under the team name reads Admin or Member.</li>
                <li><strong>&ldquo;Send Invites&rdquo; returns errors for every address</strong> — check the addresses are well-formed. The server rejects malformed emails; skipped ones show the reason inline.</li>
                <li><strong>Cannot Leave — server rejects</strong> — you are likely the sole TEAM_ADMIN. Promote a MEMBER first, then Leave.</li>
                <li><strong>Members list is empty on a team you know has members</strong> — check that you&apos;re on the right team (sidebar switcher) and reload the page.</li>
                <li><strong>Regenerate join code button does nothing</strong> — network error. Try again; if it persists open a Feedback report.</li>
            </IfItFails>
        </>
    )
}
