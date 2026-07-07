// Getting Started · Your first 30 minutes — MEMBER
import { Link } from 'react-router-dom'
import { SummaryBlock, StepCard, HowToImage, K, BRAND } from '../../components'

export default function First30MinMemberGuide() {
    const featureCurriculum = import.meta.env.VITE_FEATURE_CURRICULUM === 'true'

    return (
        <>
            <SummaryBlock>
                A guided path to your first meaningful signal in the app. Do these in order — each unlocks the next.
            </SummaryBlock>

            {featureCurriculum && (
                <StepCard num="1" {...BRAND} title="Browse the topic catalog" sub="~5 min">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Sidebar → <K>Curriculum</K>. Your team publishes topics with primers, labs, and check-ins.
                        Open one that matches what you want to learn — the catalog view shows all published topics.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-2">
                        Full walkthrough:{' '}
                        <Link to="/docs/how-to/task/learn-curriculum-topic"
                              className="text-brand-fg-soft underline">
                            Learn a Curriculum Topic →
                        </Link>
                    </p>
                </StepCard>
            )}

            <StepCard num={featureCurriculum ? '2' : '1'} {...BRAND} title="Solve one problem" sub="~15 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>Problems</K> → pick a MEDIUM CODING problem → <K>Submit Solution</K>.
                    Fill Pattern + Confidence + Solve Method, write your code + all structured explanation
                    fields. Submit → wait ~10s for the AI review.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/solve-problem" className="text-brand-fg-soft underline">
                        Solve a Problem →
                    </Link>
                </p>
                <HowToImage file="gs-mb-solve.png" alt="Submit Solution workspace"
                            caption="Submit Solution — code + explanation fields" />
            </StepCard>

            <StepCard num={featureCurriculum ? '3' : '2'} {...BRAND} title="Try one Design Studio session" sub="~15 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Pick an easier SD problem (e.g. &ldquo;URL Shortener&rdquo;) →{' '}
                    <K>Practice in Design Studio</K>. Walk 3 phases (Requirements → Estimation → API), even
                    briefly. Click <K>Am I on track?</K> in the right rail to see the AI Coach in action.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/design-studio-sd" className="text-brand-fg-soft underline">
                        Design Studio — System Design →
                    </Link>
                </p>
            </StepCard>

            <StepCard num={featureCurriculum ? '4' : '3'} {...BRAND} title="Check your Intelligence Report" sub="~5 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>Intelligence Report</K>. Most dimensions will still show &mdash; (not enough
                    data for a real number yet — that&apos;s a feature, not a bug). Read the activation
                    messages to understand what each dimension needs.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough:{' '}
                    <Link to="/docs/how-to/task/intelligence-report" className="text-brand-fg-soft underline">
                        Intelligence Report →
                    </Link>
                </p>
            </StepCard>
        </>
    )
}
