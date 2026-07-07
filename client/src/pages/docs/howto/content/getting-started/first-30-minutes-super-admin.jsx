// Getting Started · Your first 30 minutes — SUPER_ADMIN
import { Link } from 'react-router-dom'
import { SummaryBlock, StepCard, K, BRAND } from '../../components'

export default function First30MinSuperAdminGuide() {
    return (
        <>
            <SummaryBlock>
                Guided path to a working platform state: templates synced, teams visible, feedback triaged.
            </SummaryBlock>

            <StepCard num="1" {...BRAND} title="Run curriculum template sync" sub="~3 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    On the server host, run the sync script (CLI). Templates are shared across teams —
                    without a sync, TEAM_ADMINs have nothing to fork.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/sync-templates" className="text-brand-fg-soft underline">
                        Sync Curriculum Templates →
                    </Link>
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Browse teams and users" sub="~10 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>All Teams</K> and <K>All Users</K>. Sanity-check status, personal-mode flags,
                    and last-active timestamps. Fix anything obviously stale.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/all-teams" className="text-brand-fg-soft underline">
                        View All Teams →
                    </Link>
                    {' · '}
                    <Link to="/docs/how-to/task/all-users" className="text-brand-fg-soft underline">
                        View All Users →
                    </Link>
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Triage the feedback inbox" sub="~10 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>Feedback</K>. Move OPEN items through the pipeline. Dupes get dedupe-linked,
                    features go to LATER, bugs get accepted or WONT_FIX with a reason.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/feedback-inbox" className="text-brand-fg-soft underline">
                        Feedback Inbox — Triage →
                    </Link>
                </p>
            </StepCard>
        </>
    )
}
