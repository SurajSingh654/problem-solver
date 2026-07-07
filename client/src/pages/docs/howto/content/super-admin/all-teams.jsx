// client/src/pages/docs/howto/content/super-admin/all-teams.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/AllTeamsPage.jsx
//     Filter tabs: All / ACTIVE / PENDING / REJECTED (lines 146-150)
//     Row click expands member drawer (loadTeamDetail at line 46)
//     PENDING teams show Approve / Reject buttons (lines 208-220)
//     ACTIVE teams show Delete (lines 222-229) — confirm modal warns
//       "All members will be moved to individual mode"
//     Inside expand: promote / demote per member (handleChangeRole at 64)
//     Join code visible in expanded panel (lines 300-305)
//   - client/src/App.jsx:220 → /super-admin/teams route
//   - client/src/components/layout/Sidebar.jsx:40 → sidebar entry
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS, WARN,
} from '../../components'

export default function AllTeamsGuide() {
    return (
        <>
            <SummaryBlock>
                Review every team on the platform in one list. Approve or reject pending team
                applications, delete active teams, and drill into any team to see its members,
                promote or demote them, or read the join code.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
            ]} />

            <StepCard num="1" {...BRAND} title="Open the All Teams page" sub="Sidebar → All Teams">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>All Teams</strong>. The page loads with the
                    <strong> All</strong> filter selected — up to 100 teams, sorted by creation date,
                    each row showing name, status badge, creator, member count, problem count, and
                    creation date.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Filter by status" sub="All / Active / Pending / Rejected">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The tab strip at the top scopes the list to a single status. The four buckets:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><K>ACTIVE</K> — approved teams that can be used. Includes personal-mode auto-teams.</li>
                    <li><K>PENDING</K> — team-creation requests awaiting super-admin review. Shows Approve / Reject buttons.</li>
                    <li><K>REJECTED</K> — team applications you turned down. Kept for audit.</li>
                </ul>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Drill into a team" sub="Click the team name to expand">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Clicking anywhere on a team card opens an inline members drawer:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>Every member with their <strong>Admin</strong> or <strong>Member</strong> role chip and solve count.</li>
                    <li>A <strong>Promote</strong> / <strong>Demote</strong> button per member to flip their team role.</li>
                    <li>The team&apos;s current <strong>Join Code</strong> in a highlighted panel — copy this to onboard a new member outside the invite flow.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Click the team name again to collapse.
                </p>
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Approve or Reject pending teams" sub="Only visible on PENDING rows">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    On a PENDING row two buttons appear:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Approve</strong> — flips status to ACTIVE. The creator gets access immediately and can invite members.</li>
                    <li><strong>Reject</strong> — prompts for a rejection reason (required), then flips status to REJECTED. The reason is stored on the team record for audit.</li>
                </ul>
            </StepCard>

            <StepCard num="5" {...WARN} title="Delete an active team" sub="Destructive — confirm modal warns explicitly">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The <strong>Delete</strong> button on an ACTIVE row opens a confirm modal warning that
                    <em> all members will be moved to individual mode</em> and the action cannot be undone.
                    On confirm the team is cascade-deleted server-side — all team-scoped problems, curricula,
                    and enrollments go with it. Use this only for spam, abandoned test teams, or violations.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Personal-mode teams show up too.</strong> Every user gets an auto-created personal
                team on signup. These are marked <K>isPersonal: true</K> in the schema and appear in the
                list. Do not delete personal teams — the owner will be moved to individual mode and lose
                their private problems.
            </Callout>

            <IfItFails>
                <li><strong>List is empty</strong> — check the filter tab. Fresh installs default to All; if you land on REJECTED and no team has been rejected, the list is empty by design.</li>
                <li><strong>Approve / Reject buttons don&apos;t appear</strong> — the row&apos;s status is not PENDING. Only PENDING teams show those buttons.</li>
                <li><strong>Delete confirm modal is stuck</strong> — the delete request failed silently. Check the browser network tab; a 500 usually means a foreign-key cascade issue in the DB.</li>
                <li><strong>Promote / Demote does nothing</strong> — the user is a SUPER_ADMIN. Global role trumps team role and this action is ignored server-side.</li>
                <li><strong>Team creator shows as &ldquo;Unknown&rdquo;</strong> — the creator was deleted. Team is orphaned; safe to delete if unused.</li>
            </IfItFails>
        </>
    )
}
