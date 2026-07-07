// client/src/pages/docs/howto/content/super-admin/ai-usage.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/AIUsagePage.jsx
//     Headline stats: 7-day calls / Fallback calls / Fallback rate / Error rate (line 282)
//     Per-surface table: calls / fallback % / p50 / p95 / p99 / tokens (line 84)
//     Per-team table: top 10 by 7-day token spend (line 152)
//     Recent calls table with Fallback-only / Errors-only chips (line 356)
//     Row prunes after 90 days (line 276)
//     Fallback-rate tone: < 5 / < 15 (rateTone at line 65)
//   - client/src/App.jsx:225 → /super-admin/ai-usage route
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND,
} from '../../components'

export default function AIUsageGuide() {
    return (
        <>
            <SummaryBlock>
                Track every AI call the platform makes — per surface, per team, per user. Watch
                fallback rate to catch prompt regressions early; watch p95/p99 latency to catch
                slow prompts; watch per-team token spend for cost attribution.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
                'At least one AI-backed feature has been used in the last 7 days.',
            ]} />

            <StepCard num="1" {...BRAND} title="Open the AI Usage page" sub="Sidebar → AI Usage">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>AI Usage</strong>. The page loads
                    headline stats, a per-surface breakdown, a per-team spend table, and a paginated
                    tail of recent AI calls.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Read the headline stats" sub="Fallback + error rate are the health metrics">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>7-day calls</strong> — total AI invocations across every surface.</li>
                    <li><strong>Fallback calls</strong> — how often the LLM output was rejected by a validator and replaced with a template.</li>
                    <li><strong>Fallback rate</strong> — color-coded: green &lt;&nbsp;5%, yellow &lt;&nbsp;15%, red otherwise.</li>
                    <li><strong>Error rate</strong> — hard failures (timeout, 5xx, model_not_found before fallback). Same color scale.</li>
                </ul>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Per-surface breakdown" sub="Which prompt is the problem?">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Per surface</strong> table lists every AI surface (verdict, code review,
                    curriculum review, quiz, mock, embedding, etc.) with:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>Call counts for 7 and 30 days.</li>
                    <li>Fallback % — color-coded per surface. A single red row is your prompt regression.</li>
                    <li>Latency <K>p50 / p95 / p99</K> in milliseconds. Slow tail = candidate for the fast model tier.</li>
                    <li>Total tokens over 7 days — where the cost is going.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Click any surface row to filter the <strong>Recent calls</strong> table below to
                    just that surface.
                </p>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Per-team spend" sub="Top 10 by 7-day token total">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The <strong>Per team</strong> table lists the ten highest-spending teams over the
                    last 7 days. Personal-mode teams are tagged as such. Prompt and completion tokens
                    are broken out so you can spot teams whose prompts are getting expensive vs.
                    teams whose completions are long. Foundation for future per-team pricing.
                </p>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Drill into recent calls" sub="Row-level detail with fallback / error flags">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Recent calls</strong> table shows the last 25 rows (paginated) with
                    surface / user / team / tokens / latency / flags / timestamp. Three flag chips can
                    appear on a row:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><K>FB</K> — validator rejected the LLM output; the platform used a template fallback.</li>
                    <li><K>ERR</K> — the call errored hard (timeout, 5xx, retry limit).</li>
                    <li><K>STR</K> — streaming call (mock interview, teaching).</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Above the table, the <strong>Fallback only</strong> and <strong>Errors only</strong>
                    chips scope the tail to problem rows for fast triage.
                </p>
            </StepCard>

            <Callout type="info">
                <strong>Rows older than 90 days are pruned daily.</strong> This is telemetry, not an
                audit log. If you need long-term retention for a specific claim, export or screenshot
                before the retention window rolls.
            </Callout>

            <IfItFails>
                <li><strong>All tables empty</strong> — no AI calls in the last 7 days. Either usage is low or the AI provider is down platform-wide.</li>
                <li><strong>Fallback rate 100% on one surface</strong> — that prompt regressed. Cross-reference with Verdict Audit if it&apos;s the verdict surface; otherwise check server logs for the validator that&apos;s tripping.</li>
                <li><strong>p99 spike on the primary model</strong> — model provider is slow or your prompts got longer. Consider bumping the surface to the fast model tier via <K>AI_MODEL_FAST</K>.</li>
                <li><strong>Per-team token spend looks unrealistic</strong> — a team is running an automated script. Check the user column in Recent calls to find the offender.</li>
                <li><strong>Recent calls table shows only 25 rows on a busy day</strong> — pagination. Use Next to page through, or filter to Errors only to jump to signals.</li>
            </IfItFails>
        </>
    )
}
