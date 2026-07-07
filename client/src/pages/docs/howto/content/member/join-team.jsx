// client/src/pages/docs/howto/content/member/join-team.jsx
//
// NEW content — written from source-reading of:
//   - client/src/components/layout/Sidebar.jsx:585-680 (team switcher)
//   - client/src/pages/team/TeamManagePage.jsx:290-360 (Join a Team panel)
//   - client/src/pages/OnboardingPage.jsx (first-time join flow)
//
// Join code shape verified from placeholder in TeamManagePage.jsx:339
// (example placeholder: "e.g. PROB-X7K2").
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function JoinTeamGuide() {
    return (
        <>
            <SummaryBlock>
                Enter a team join code to become a MEMBER of a shared team, or use the sidebar team
                switcher to move between teams you already belong to. Every new user also gets a
                personal auto-team for individual practice.
            </SummaryBlock>

            <PrereqList items={[
                'You are signed in.',
                'A team admin has shared a join code with you (usually of the form PROB-XXXX).',
            ]} />

            <Callout type="info">
                <strong>Personal mode auto-teams.</strong> Every user gets a personal team (flagged
                <K>isPersonal: true</K>) on signup — that&apos;s the &ldquo;🧠 My Practice&rdquo; entry in the
                sidebar team switcher. It behaves like any other team but is scoped to you. Joining a
                shared team never removes your personal team.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open Team management" sub="Sidebar → team switcher → Manage Teams (or Settings → Team)">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click the team pill at the top of the sidebar. A dropdown shows every team you belong to
                    plus a <strong>⚙️ Manage Teams</strong> row at the bottom. Click it to open the team
                    management page. Alternately, sidebar &rarr; <strong>Settings</strong> &rarr; <strong>Team</strong>{' '}
                    has the same entry point.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Expand Join a Team" sub="Manage Teams → Join a Team panel">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The Team Management page has a <strong>Join a Team</strong> panel at the top with the tagline
                    &ldquo;Enter a join code from your team admin.&rdquo; Click the row to expand it.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Enter the join code" sub="Format like PROB-X7K2">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Type the code your admin gave you (it uppercases as you type). Click <strong>Join</strong>.
                    On success you become a MEMBER of that team and can switch into it right away.
                </p>
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Switch between teams" sub="Sidebar team switcher">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The pill at the top of the sidebar shows your <strong>current</strong> team + your role in it
                    (Admin / Member / Individual mode). Click it to see every team you belong to — including
                    your personal auto-team — and click any row to switch. Switching reloads your team-scoped
                    data (problems, curricula, reviews) into the app.
                </p>
                {/* per client/src/components/layout/Sidebar.jsx:634-663 — switcher lists memberships, current team is filtered out */}
            </StepCard>

            <StepCard num="5" {...INFO} title="First-time signup path" sub="Onboarding — Join Team option">
                <p className="text-xs text-text-secondary leading-relaxed">
                    If you have a join code before you sign up: create your account, then on the onboarding screen
                    pick <strong>Join Team</strong> (instead of &ldquo;Personal Mode&rdquo; or &ldquo;Create Team&rdquo;)
                    and paste your code there. Same effect as joining later.
                </p>
            </StepCard>

            <IfItFails>
                <li><strong>&ldquo;Invalid join code&rdquo;</strong> — codes are team-specific and case-insensitive; double-check with your admin. Codes can also be rotated by the admin.</li>
                <li><strong>Pending admin approval</strong> — some teams require admin approval on join. You&apos;ll see a PENDING chip; refresh the page to check status.</li>
                <li><strong>Team switcher shows only your personal team</strong> — you are not a MEMBER of any shared team yet. Join one first.</li>
                <li><strong>Data disappeared after switching</strong> — expected. Problems, curricula, and reviews are team-scoped; switching flips the whole view. Switch back to see the original team&apos;s data.</li>
            </IfItFails>
        </>
    )
}
