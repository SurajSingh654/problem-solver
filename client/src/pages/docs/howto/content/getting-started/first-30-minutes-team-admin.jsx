// Getting Started · Your first 30 minutes — TEAM_ADMIN
import { Link } from 'react-router-dom'
import { SummaryBlock, StepCard, K, BRAND } from '../../components'

export default function First30MinTeamAdminGuide() {
    return (
        <>
            <SummaryBlock>
                Guided path to your first published curriculum topic. Assumes a SUPER_ADMIN has already
                run the template sync.
            </SummaryBlock>

            <StepCard num="1" {...BRAND} title="Fork one template" sub="~3 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>Curriculum</K> → <K>Templates</K>. Pick a template that matches what your
                    team wants to teach → click <strong>Fork Into My Team</strong>. You land in the 4-tab
                    authoring UI.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/fork-template" className="text-brand-fg-soft underline">
                        Fork a Curriculum Template →
                    </Link>
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Author one concept" sub="~15 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    In the forked Topic, open the <K>Concepts</K> tab. Pick the first concept and fill in
                    (or verify) the primer, readiness rubric, expected questions, and lab reference solution.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/author-topic" className="text-brand-fg-soft underline">
                        Author a Topic →
                    </Link>
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Run AI review + publish" sub="~5 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Open the <K>Review</K> tab, click <strong>Run AI review</strong>. Read the verdict, address
                    any actionable feedback, then switch to <K>Publish</K> and pass the gates.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/run-ai-review" className="text-brand-fg-soft underline">
                        Run AI Curriculum Review →
                    </Link>
                    {' · '}
                    <Link to="/docs/how-to/task/publish-topic" className="text-brand-fg-soft underline">
                        Publish a Topic →
                    </Link>
                </p>
            </StepCard>
        </>
    )
}
