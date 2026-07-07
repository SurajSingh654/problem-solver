// client/src/pages/docs/howto/content/super-admin/verdict-audit.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/VerdictsAuditPage.jsx
//     4 stat cards: 7-day verdicts / 7-day fallback / Fallback rate / Total logged
//     Fallback-rate tone: < 5% healthy / < 15% warning / >= 15% danger (line 156)
//     Two filters: All verdicts / Fallback only (lines 207-236)
//     Each row expands to show Input evidence + Verdict output side-by-side (lines 119-136)
//     25 rows per page with Prev / Next pagination (line 148, 262-286)
//   - client/src/App.jsx:224 → /super-admin/verdicts route
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose,
// no validator rule numbers cited.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND,
} from '../../components'

export default function VerdictAuditGuide() {
    return (
        <>
            <SummaryBlock>
                Spot-check every AI readiness verdict the platform has served. Track the fallback
                rate over the last 7 days, then drill into any single verdict to see the exact
                evidence the model was given and the JSON it emitted.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
                'At least one member has generated an intelligence report (otherwise the log is empty).',
            ]} />

            <Callout type="info">
                <strong>What &ldquo;fallback&rdquo; means.</strong> The AI verdict passes through a suite
                of anti-hallucination validators. If the LLM output trips any of them, the platform
                substitutes a deterministic template verdict. The fallback rate is your leading
                indicator that a prompt or model regressed.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the Verdict Audit page" sub="Sidebar → Verdict Audit">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>Verdict Audit</strong>. The page loads
                    the last 25 verdicts and computes 7-day summary stats.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Read the summary stats" sub="Fallback rate is the health metric">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>7-day verdicts</strong> — total AI verdict calls in the window.</li>
                    <li><strong>7-day fallback</strong> — how many the validator rejected.</li>
                    <li><strong>Fallback rate</strong> — color-coded: green &lt;&nbsp;5%, yellow &lt;&nbsp;15%, red otherwise. This is the number to watch.</li>
                    <li><strong>Total logged</strong> — every verdict on record (filtered when Fallback-only is active).</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    A sudden red spike means a prompt regression or model change is tripping validation.
                    Filter to Fallback only and drill in to find the pattern.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Filter to Fallback only" sub="Fastest way to find regressions">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click the <strong>Fallback only</strong> chip above the table to hide healthy verdicts.
                    Every row now represents a validator rejection. Click any row to expand.
                </p>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Expand a row to see the evidence" sub="Left: LLM input · Right: LLM output">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Every row is a summary line: user + team + verdict headline + timestamp + input hash.
                    Clicking expands two side-by-side JSON panels:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Input evidence</strong> — the exact structured payload the platform gave the LLM (per-dimension scores, sample sizes, tier caps).</li>
                    <li><strong>Verdict output</strong> — the JSON the LLM emitted (or the fallback template, if <K>usedFallback</K> is true).</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Compare the two: a fallback with weak-looking evidence usually points to a specific
                    validator that&apos;s too strict; a fallback with rich evidence usually points to the
                    LLM hallucinating a claim not in the payload.
                </p>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Paginate through history" sub="25 rows per page">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The <strong>Prev / Next</strong> buttons at the bottom paginate through the log 25 at
                    a time. The pagination footer shows the range and total (respects the Fallback-only
                    filter).
                </p>
            </StepCard>

            <Callout type="info">
                <strong>The input hash column.</strong> The short hex string on the right of each row is
                a deterministic hash of the input payload. Two verdicts with the same hash saw the exact
                same evidence — useful for spotting cache thrash or duplicate submissions.
            </Callout>

            <IfItFails>
                <li><strong>&ldquo;No verdicts logged yet&rdquo; message</strong> — nobody on the platform has generated an intelligence report yet. Ask a MEMBER to open their report page.</li>
                <li><strong>Fallback rate shows red but stat card says 0 fallback calls</strong> — sampling artifact when total is very low. Wait for volume before drawing conclusions.</li>
                <li><strong>Row won&apos;t expand</strong> — the click landed on the timestamp column, which has its own text. Click anywhere on the row body.</li>
                <li><strong>Input evidence panel is empty JSON</strong> — the payload was empty at verdict time. Usually means the report was generated with zero activity — the fallback should have kicked in on activation guards.</li>
                <li><strong>Team column shows &ldquo;?&rdquo;</strong> — the team was deleted after the verdict was logged. Verdict is retained for audit.</li>
            </IfItFails>
        </>
    )
}
