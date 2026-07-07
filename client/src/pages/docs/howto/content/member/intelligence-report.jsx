// client/src/pages/docs/howto/content/member/intelligence-report.jsx
//
// Ripped verbatim from HowToPage.jsx #report section. Note: legacy prose
// says "6 dimensions" but the report now returns 10 (kept name `get6DReport`
// for backward-compat). Left legacy language intact per rip-verbatim rule;
// individual dim activation still displays "—" when data is thin.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, K,
    BRAND, SUCCESS,
} from '../../components'

export default function IntelligenceReportGuide() {
    return (
        <>
            <SummaryBlock>
                Calibrated multi-dimension readiness signal with a grounded AI verdict and tier-readiness grid.
                The dashboard you check before claiming you&apos;re &ldquo;ready&rdquo; for an interview.
            </SummaryBlock>

            <PrereqList items={[
                'A few solved problems, reviews, or Design Studio sessions — thin activity produces "—" scores.',
            ]} />

            <Callout type="info">
                <strong>Hard rule:</strong> if a dimension has too few data points, we show <K>—</K> and an
                activation message instead of a number. We refuse to fabricate a score from one solve. That&apos;s
                a feature — overclaim is the failure mode we explicitly engineered against.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the report" sub="Sidebar → Intelligence Report (or Dashboard tile)">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Top: overall score (0-100) with a <strong>95% confidence interval</strong> (Wilson + meanCI),
                    readiness tier badge (Building profile / Junior / Tier 3 / Tier 2 / FAANG), and a coverage
                    strip — &ldquo;Partial profile — X of N dimensions measured&rdquo; when below 50%.
                </p>
                <HowToImage
                    file="report-01-overview.png"
                    alt="Intelligence Report top: overall score with 95% CI, tier readiness badge, coverage strip"
                    caption="Top of the report — overall score with CI, tier badge, coverage strip"
                />
            </StepCard>

            <StepCard num="2" {...BRAND} title="Dimensions" sub="Radar + per-dimension cards">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>D1 — Pattern Recognition:</strong> can you name and apply the right pattern?</li>
                    <li><strong>D2 — Solution Depth:</strong> brute → optimized → complexity reasoning quality.</li>
                    <li><strong>D3 — Communication:</strong> Feynman explanation + interview-tip clarity.</li>
                    <li><strong>D4 — Optimization:</strong> recognize and execute optimization opportunities.</li>
                    <li><strong>D5 — Pressure Performance:</strong> Mock Interview signal under timed pressure.</li>
                    <li><strong>D6 — Knowledge Retention:</strong> FSRS retrievability across your tracked items.</li>
                    <li><strong>D7-D10:</strong> further opt-in dimensions (teaching, design, behavioral, verification) unlock as you use those modalities.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Each dimension card shows score + range bar. <strong>Activation gating</strong>: if the
                    dimension hasn&apos;t hit its data floor, the score is hidden behind an activation message
                    like &ldquo;Solve 3+ problems with confidence ratings to activate.&rdquo;
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="AI verdict card" sub="Grounded, anti-hallucination, validator-checked">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Below the radar: a written verdict from the AI. Hard rules in the system prompt prevent
                    overclaim — the verdict refuses to say &ldquo;ready&rdquo; without evidence, won&apos;t cite
                    dimensions that haven&apos;t activated, and falls through to a deterministic fallback if it
                    violates any rule. Cached for 5 minutes; full audit trail in the super-admin{' '}
                    <K>/super-admin/verdicts</K> page.
                </p>
                <HowToImage
                    file="report-02-verdict.png"
                    alt="AI verdict card with grounded summary, evidence list, and structural anti-hallucination markers"
                    caption="AI verdict — grounded, structured, evidence-cited, fallback-safe"
                />
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Company tier grid" sub="Ready / Close / Not yet per tier">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Bottom of the page: a tier-readiness grid covering FAANG / Tier 2 / Tier 3 / Junior. Each row
                    shows a verdict (✅ Ready / 🟡 Close / ❌ Not yet) and the <strong>specific failing dimension</strong>{' '}
                    if not ready — so &ldquo;Not yet&rdquo; comes with a concrete next step, not a generic shrug.
                </p>
                <HowToImage
                    file="report-03-tiers.png"
                    alt="Company tier grid with per-tier readiness verdict and failing-dimension callout"
                    caption="Tier grid — concrete failing dimension per non-ready tier"
                />
            </StepCard>

            <Callout type="success">
                The whole report is grounded in research: Wilson 1927 + Agresti &amp; Coull 1998 (proportion CIs),
                FSRS v4+ retrievability formula (D6), Anthropic prompting + OpenAI cookbook reliability
                techniques (validator + fallback). Every threshold has a citation in the source.
            </Callout>
        </>
    )
}
