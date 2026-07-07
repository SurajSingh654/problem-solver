// client/src/pages/docs/howto/content/super-admin/sync-templates.jsx
//
// NEW content — written from source-reading of:
//   - server/scripts/curriculum-sync.js
//     (CLI wrapper — root always resolves to `<cwd>/curriculum`,
//      --dry-run flag prints diff without writing, exit code 1 on failure)
//   - server/package.json scripts:
//     "curriculum:sync"      → node scripts/curriculum-sync.js
//     "curriculum:sync:dry"  → node scripts/curriculum-sync.js --dry-run
//   - server/src/routes/curriculumTemplates.routes.js
//     (SUPER_ADMIN-only admin sync route; auth chain
//      authenticate → requireSuperAdmin covers both 401 and 403)
//   - server/src/services/curriculumSync.service.js
//     (parses server/curriculum/*, upserts TopicTemplate rows, returns diff)
//
// Per CLAUDE.md spec §16: no raw endpoint paths in visible prose,
// no validator rule numbers. There is NO current UI page for template
// sync — this guide is frank about that, and describes the two
// invocation methods (CLI + admin API endpoint) honestly.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND, SUCCESS,
} from '../../components'

export default function SyncTemplatesGuide() {
    return (
        <>
            <SummaryBlock>
                Push new or edited curriculum content from the repo&apos;s <K>server/curriculum/</K> tree
                into the platform&apos;s <strong>template library</strong> so TEAM_ADMINs can fork it. There
                is no in-app UI for this today — you run it as a CLI script on the server host or
                invoke the admin sync endpoint from a super-admin API tool.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
                'Curriculum content edits have already landed in server/curriculum/ (usually via a repo PR).',
                'For the CLI path — you have shell access to the server (Railway shell / local dev / SSH).',
                'For the admin-endpoint path — you have a valid SUPER_ADMIN bearer token and an API tool (curl, HTTPie, Postman).',
            ]} />

            <Callout type="info">
                <strong>Templates vs Topics.</strong> Sync only touches the global <K>TopicTemplate</K> rows.
                Every team&apos;s forked <K>Topic</K> (a deep clone) is unaffected — team edits and publish
                state never get overwritten. Sync is safe to re-run.
            </Callout>

            <StepCard num="1" {...BRAND} title="Option A — Run the CLI script" sub="Fastest path when you have server shell access">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    From the <K>server/</K> directory on the host that has the curriculum content on disk:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><K>npm run curriculum:sync:dry</K> — parses <K>server/curriculum/</K> and prints the diff (created / updated / deleted templates) as JSON without touching the database. Always run this first.</li>
                    <li><K>npm run curriculum:sync</K> — parses and writes. Exit code 0 on success, 1 on any parse or DB error.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    The script always resolves the root as <K>&lt;cwd&gt;/curriculum</K>. It intentionally
                    does not accept a <K>--root</K> flag so prod syncs cannot be pointed at the wrong folder.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Option B — Invoke the admin sync endpoint" sub="When you don't have shell access">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    From any API tool (curl, HTTPie, Postman) with a SUPER_ADMIN bearer token, send a POST
                    to the curriculum-templates sync route. There is no UI button for this — the endpoint
                    is protected by <K>authenticate</K> + <K>requireSuperAdmin</K> so both 401 (no token) and
                    403 (wrong role) return before the controller runs.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Pass <K>?dryRun=true</K> to get the diff without writing (mirrors the CLI dry-run). The
                    response is the same shape either way — a JSON diff of created / updated / deleted
                    template slugs.
                </p>
                {/* Endpoint (not shown in prose per spec §16):
                    POST /api/v1/super-admin/curriculum/templates/sync[?dryRun=true] */}
            </StepCard>

            <StepCard num="3" {...SUCCESS} title="Verify: browse the Template library" sub="TEAM_ADMIN view">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sign in as a TEAM_ADMIN (or switch teams to one you administer) and open the
                    <strong> Template Browser</strong> from the sidebar. Your synced templates should appear
                    with the correct slug, category, and concept count. Any team that has already forked a
                    template will see the <strong>Already forked</strong> chip — they are not affected by
                    the re-sync; only fresh forks pick up the new content.
                </p>
            </StepCard>

            <Callout type="warning">
                <strong>Sync is authoring-side only.</strong> Once a team forks a template, updates to the
                template do <em>not</em> propagate into their fork. Their fork is a deep clone, owned by the
                team. Communicate template updates through changelog messages; team admins can re-fork if
                they want the newer content.
            </Callout>

            <IfItFails>
                <li><strong>Drift detected / Prisma migration prompt</strong> — you ran the sync against a database whose migrations haven&apos;t been applied. Run <K>npx prisma migrate deploy</K> first, then re-run sync.</li>
                <li><strong>Parse error on a specific template folder</strong> — the folder is malformed. The CLI prints the folder path and the parse error. Fix the frontmatter or file structure in <K>server/curriculum/</K> and re-run the dry-run to confirm.</li>
                <li><strong>Admin endpoint returns 500</strong> — check server logs on the host. Most 500s here are the same parse errors surfaced from the sync service; the response body includes the underlying message.</li>
                <li><strong>401 / 403 from the endpoint</strong> — your bearer token isn&apos;t a SUPER_ADMIN token (or is expired). Re-sign in as a SUPER_ADMIN and copy a fresh token.</li>
                <li><strong>Dry-run shows &ldquo;deleted&rdquo; entries you didn&apos;t intend</strong> — you&apos;re running against the wrong branch of the curriculum tree. Cancel, check out the correct git ref, and re-run.</li>
            </IfItFails>
        </>
    )
}
