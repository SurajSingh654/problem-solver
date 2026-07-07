// client/src/pages/docs/howto/content/super-admin/diagnostics.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/SuperAdminDiagnosticsPage.jsx
//     One server call → categorized cards with severity + recommendedFix
//     Severity: OK / INFO / WARNING / ERROR (line 15)
//     Header shows Overall / Errors / Warnings / Info counts (line 118)
//     Env grid: AI enabled / Daily limit / Fast model / Premium model (line 133)
//     Refresh button re-runs all checks server-side (line 109)
//     Categories list findings (title / detail / recommended fix per item)
//   - client/src/App.jsx:226 → /super-admin/diagnostics route
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, WARN,
} from '../../components'

export default function DiagnosticsGuide() {
    return (
        <>
            <SummaryBlock>
                One-page runtime health dashboard. Runs every AI, database, schema, and runtime
                check server-side on demand and surfaces categorized findings with a recommended
                fix per finding.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
            ]} />

            <Callout type="info">
                <strong>Read-only.</strong> Diagnostics performs no writes. It executes probes,
                reads database counts, checks environment variables, and returns findings. Safe to
                run at any time; results are not cached.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the Diagnostics page" sub="Sidebar → Diagnostics">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>Diagnostics</strong>. The page loads
                    and runs every check server-side. Loading state reads &ldquo;Running diagnostics
                    across AI, database, schema, runtime…&rdquo;.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Read the header summary" sub="Overall severity + counts + environment">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The header card shows four things:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Overall severity badge</strong> — worst finding wins: OK / INFO / WARNING / ERROR.</li>
                    <li><strong>Counts</strong> — how many Errors / Warnings / Info findings across every category.</li>
                    <li><strong>Last run + duration</strong> — the timestamp of the current results and how long the checks took.</li>
                    <li><strong>Env grid</strong> — AI enabled, daily limit, fast model name, premium model name. Sanity check that env vars are what you expect.</li>
                </ul>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Scan the category cards" sub="Each category = one subsystem">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Below the header, one card per subsystem (AI, Database, Schema, Runtime, …). Each
                    card&apos;s border color reflects its severity — red for ERROR, yellow for WARNING,
                    green for OK. Inside each card, findings are listed as:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Icon + title</strong> — what the check found.</li>
                    <li><strong>Detail</strong> — the evidence (counts, values, error strings).</li>
                    <li><strong>Recommended</strong> — the fix. Read this before clicking through elsewhere.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Refresh after fixing" sub="Server re-runs every check on click">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click the <strong>Refresh</strong> button in the header after applying a fix.
                    The page shows &ldquo;Running…&rdquo; and re-runs the same server-side probe suite.
                    Findings update in place — a resolved ERROR should now be OK or gone entirely.
                    Results are not cached so every click is a fresh run.
                </p>
            </StepCard>

            <StepCard num="5" {...WARN} title="Prioritize by severity" sub="Errors first, warnings second, info for context">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><K>ERROR</K> — something is broken. AI provider is down, DB is unreachable, a required env var is missing. Act now.</li>
                    <li><K>WARNING</K> — degraded but functional. Rate-limit budget near cap, fallback rate elevated, migration status drifting. Investigate today.</li>
                    <li><K>INFO</K> — observability. Notable counts (users, teams, problems, curriculum content) — not actionable on their own.</li>
                    <li><K>OK</K> — passing check. Kept in the list so you can see coverage.</li>
                </ul>
            </StepCard>

            <IfItFails>
                <li><strong>&ldquo;Diagnostics request failed&rdquo; red banner</strong> — the server itself is unhealthy or your token is not SUPER_ADMIN. Check the error message in the banner. If it&apos;s a 5xx, hit the server logs.</li>
                <li><strong>Page spins forever on &ldquo;Running…&rdquo;</strong> — a single probe is hanging (usually a slow external call). Reload the page; the previous request will time out server-side.</li>
                <li><strong>Refresh button stays disabled</strong> — a fetch is already in flight. Wait for it to finish; results will update in place.</li>
                <li><strong>ERROR count stays high after fixing the underlying issue</strong> — you didn&apos;t click Refresh. Findings do not auto-update; they reflect the last run only.</li>
                <li><strong>Env grid shows &ldquo;undefined&rdquo; or an unexpected model name</strong> — env vars are missing or misconfigured on the host. See <K>server/.env.example</K> for canonical values and confirm the deployed runtime has them set.</li>
            </IfItFails>
        </>
    )
}
