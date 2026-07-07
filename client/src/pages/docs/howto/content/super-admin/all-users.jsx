// client/src/pages/docs/howto/content/super-admin/all-users.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/AllUsersPage.jsx
//     Search box filters by name or email (line 77)
//     Row-click navigates to /super-admin/profile/:id (line 109)
//     Columns: User / Role / Team / Solved / Status / Joined (line 95)
//     Role chips: SUPER_ADMIN / TEAM_ADMIN / MEMBER (lines 125-136)
//     Activity status: ACTIVE / INACTIVE / DORMANT (lines 63-67)
//     Delete button hidden for SUPER_ADMIN accounts (line 162)
//   - client/src/App.jsx:221 → /super-admin/users route
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, WARN,
} from '../../components'

export default function AllUsersGuide() {
    return (
        <>
            <SummaryBlock>
                Search every user on the platform, jump into a full profile, or delete a user
                account. The table shows role, team membership, solve count, activity status,
                and join date at a glance.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
            ]} />

            <StepCard num="1" {...BRAND} title="Open the All Users page" sub="Sidebar → All Users">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>All Users</strong>. The header shows the
                    total user count; below it, a search input and a table with every user.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Search by name or email" sub="Client-side filter">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The search input above the table is case-insensitive and matches on either
                    <K>name</K> or <K>email</K>. The list narrows as you type — no submit required.
                    Clear the input to see everyone again.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Scan the columns" sub="Six meaningful signals per row">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>User</strong> — name + email + avatar initial.</li>
                    <li><strong>Role</strong> — <K>Super Admin</K>, <K>Admin</K> (TEAM_ADMIN on their currently-selected team), or <K>Member</K>. The colored chip reflects the highest role visible.</li>
                    <li><strong>Team</strong> — the team name the user is currently attached to, or a dash if personal-only.</li>
                    <li><strong>Solved</strong> — lifetime solution count across all teams.</li>
                    <li><strong>Status</strong> — <K>ACTIVE</K> / <K>INACTIVE</K> / <K>DORMANT</K> — computed from recent activity.</li>
                    <li><strong>Joined</strong> — signup date.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Open a user profile" sub="Click any row">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Clicking anywhere on a row (except the Delete button) navigates to that user&apos;s
                    profile page — the same page they see for themselves, plus super-admin actions.
                    Use this to review a specific member&apos;s solution history or intelligence report
                    when investigating a bug report or flag.
                </p>
            </StepCard>

            <StepCard num="5" {...WARN} title="Delete a user account" sub="Destructive — cascades to personal data">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The <strong>Delete</strong> button on the right of each row is hidden for SUPER_ADMIN
                    accounts (safeguard). For any other user, clicking Delete opens a confirm modal.
                    Deletion is a soft-delete via <K>deletedAt</K> — the row is filtered out of future
                    queries. Authored content (problems, curriculum edits) stays attributed to
                    &ldquo;[deleted user]&rdquo; but personal data (solutions, notes, sessions) cascades
                    per the Prisma schema.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Deletes cannot be triggered on yourself or another SUPER_ADMIN.</strong> The
                UI hides the button for that row, and the server rejects the request even if you
                bypass the UI. Demote a SUPER_ADMIN to USER first via a direct DB action if you
                genuinely need to remove one.
            </Callout>

            <IfItFails>
                <li><strong>Table shows no users</strong> — first load; check the network tab for a failed request to the users list. A 403 means your token is not SUPER_ADMIN.</li>
                <li><strong>Search returns 0 hits but you know the user exists</strong> — check for typos or extra whitespace. Search matches substrings on lowercased name / email only.</li>
                <li><strong>Delete button is disabled after clicking</strong> — the delete is in flight. On success the row disappears; on failure a console error surfaces the underlying reason.</li>
                <li><strong>Row click doesn&apos;t open profile</strong> — you clicked the Delete button. Clicks on the button stop propagation so the row navigation doesn&apos;t fire.</li>
                <li><strong>User&apos;s team column is dash but you know they&apos;re on a team</strong> — they&apos;re currently on their personal auto-team; the API only reports the currently-selected team.</li>
            </IfItFails>
        </>
    )
}
