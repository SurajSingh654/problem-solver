// ============================================================================
// ProbSolver — Product Roadmap Data
// ============================================================================
//
// Item shape:
//   id: string
//   phase: 'NOW' | 'NEXT' | 'LATER' | 'SOMEDAY' | 'BACKLOG' | 'DONE'
//   shippedAt?: 'YYYY-MM-DD'  — required when phase === 'DONE'
//   theme: strategic pillar
//   priority: 'HIGH' | 'MEDIUM' | 'LOW'
//   effort: 'Small' | 'Medium' | 'Large' | 'XLarge'
//   title: user-facing name
//   impact: value statement, user perspective
//   description: what it is
//   why: the reasoning
//   researchBasis?: published research this is grounded in
//   technicalNotes?: implementation detail / file references
// ============================================================================

export const PHASE_CONFIG = {
    NOW: {
        label: 'Now',
        sublabel: 'In progress',
        bg: 'bg-success-soft',
        textColor: 'text-success-fg',
        badge: 'bg-success-soft text-success-fg border-success-line',
        borderLeft: 'border-l-success',
        description: 'Currently building or immediately queued',
        icon: '⚡',
    },
    NEXT: {
        label: 'Next',
        sublabel: '1-3 months',
        bg: 'bg-brand-soft',
        textColor: 'text-brand-fg-soft',
        badge: 'bg-brand-soft text-brand-fg-soft border-brand-line',
        borderLeft: 'border-l-brand-400',
        description: 'Committed for the next development cycle',
        icon: '🎯',
    },
    LATER: {
        label: 'Later',
        sublabel: '3-9 months',
        bg: 'bg-warning-soft',
        textColor: 'text-warning-fg',
        badge: 'bg-warning-soft text-warning-fg border-warning-line',
        borderLeft: 'border-l-warning',
        description: 'Planned with clear design and justification',
        icon: '🗺️',
    },
    SOMEDAY: {
        label: 'Someday',
        sublabel: '9+ months',
        bg: 'bg-info-soft',
        textColor: 'text-info-fg',
        badge: 'bg-info-soft text-info-fg border-info-line',
        borderLeft: 'border-l-info',
        description: 'Validated ideas awaiting the right moment',
        icon: '🔭',
    },
    BACKLOG: {
        label: 'Backlog',
        sublabel: 'No timeline',
        bg: 'bg-surface-2',
        textColor: 'text-text-disabled',
        badge: 'bg-surface-3 text-text-disabled border-border-default',
        borderLeft: 'border-l-border-strong',
        description: 'Valid, no committed timeline',
        icon: '📦',
    },
    DONE: {
        label: 'Shipped',
        sublabel: 'Live',
        bg: 'bg-purple-400/10',
        textColor: 'text-purple-300',
        badge: 'bg-purple-400/10 text-purple-300 border-purple-400/25',
        borderLeft: 'border-l-purple-400',
        description: 'Deployed — complete',
        icon: '✅',
    },
}

// Render order in the main grid. DONE is rendered separately (collapsed behind
// a toggle) so it doesn't dilute attention on what's still ahead.
export const PHASES_ORDER = ['NOW', 'NEXT', 'LATER', 'SOMEDAY', 'BACKLOG']

export const THEME_CONFIG = {
    'Learning Science':       { icon: '🧠', color: 'text-purple-400',    bg: 'bg-purple-400/10 border-purple-400/25' },
    'AI Intelligence':        { icon: '🤖', color: 'text-brand-fg-soft', bg: 'bg-brand-soft border-brand-line' },
    'Retention & Engagement': { icon: '🔥', color: 'text-warning-fg',    bg: 'bg-warning-soft border-warning-line' },
    'Admin Experience':       { icon: '👑', color: 'text-yellow-400',    bg: 'bg-yellow-400/10 border-yellow-400/25' },
    'Content & Problems':     { icon: '📋', color: 'text-info-fg',       bg: 'bg-info-soft border-info-line' },
    'Team & Community':       { icon: '👥', color: 'text-success-fg',    bg: 'bg-success-soft border-success-line' },
    'Growth & Onboarding':    { icon: '🚀', color: 'text-danger-fg',     bg: 'bg-danger-soft border-danger-line' },
    'Infrastructure':         { icon: '⚙️', color: 'text-text-secondary', bg: 'bg-surface-3 border-border-default' },
    'Correctness & Data':     { icon: '🔧', color: 'text-text-secondary', bg: 'bg-surface-3 border-border-default' },
}

export const PRIORITY_CONFIG = {
    HIGH:   { color: 'bg-danger-soft text-danger-fg border-danger-line' },
    MEDIUM: { color: 'bg-warning-soft text-warning-fg border-warning-line' },
    LOW:    { color: 'bg-info-soft text-info-fg border-info-line' },
}

export const EFFORT_CONFIG = {
    Small:  { color: 'bg-success-soft text-success-fg border-success-line', label: 'Small' },
    Medium: { color: 'bg-brand-soft text-brand-fg-soft border-brand-line',  label: 'Medium' },
    Large:  { color: 'bg-warning-soft text-warning-fg border-warning-line', label: 'Large' },
    XLarge: { color: 'bg-danger-soft text-danger-fg border-danger-line',    label: 'X-Large' },
}

// ════════════════════════════════════════════════════════════════════════
// ITEMS
// ════════════════════════════════════════════════════════════════════════

export const ROADMAP_ITEMS = [

    // ── DEFERRED — pending design discussion ────────────────────────────

    {
        id: 'strict-prepush-quality-gate',
        phase: 'NEXT',
        theme: 'Engineering Hygiene',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Strict pre-push code-quality gate',
        impact: 'Server lint + tests are already gated. The next layer extends the .githooks/pre-push hook to also block on (a) client lint --max-warnings 0, (b) `vite build` succeeding, (c) client component tests via a new vitest setup in client/, (d) `prisma migrate status` (no drift). With these in place, the kind of bugs that leaked into prod recently (extractJSON-on-parsed-JSON, hasContent reference, easinessFactor field-name mismatch, missing migration) cannot leave the dev machine.',
        description: 'In progress as of 2026-05-14. Already shipped: server eslint flat config (errors block, warnings tracked), 9 controller integration tests, .githooks/pre-push running server lint:strict + vitest. Pending decisions: (1) client lint strictness — 17 react-hooks/exhaustive-deps warnings need audit before --max-warnings 0 flips, (2) whether to add `vite build` to the gate (~30s overhead per push), (3) whether to set up vitest in client/ and add a thin component-test layer, (4) whether to add prisma migrate status drift check. Discuss + finalize scope with user, then implement.',
        why: 'Cost of pre-push checks (~30s) is much smaller than the cost of a bug shipping to prod. The recent bug class (silent fallbacks, undefined refs, schema-field mismatches) is exactly what static checks + integration tests catch — but only if they run before push. Manual discipline does not scale.',
        researchBasis: 'Standard CI/CD discipline. Pre-commit/pre-push hooks at major engineering orgs (Google, Meta, Stripe) gate on lint + types + unit tests at minimum. The cost-benefit favours expanding this gate even further when the team finds a bug class that escaped.',
        technicalNotes: '.githooks/pre-push currently runs server lint + vitest. Client lint runs only when PRE_PUSH_CLIENT_LINT=1 is set (opt-in until 17 hook-deps warnings are addressed). server/eslint.config.js splits hard errors from warnings; lint:strict fails on any warning. Server has 9 controller integration tests in test/controllers/ + 213 validator/service unit tests = 222 total. Client has no test runner configured.',
    },

    // ── SHIPPED (May 2026 — Intelligence Report + Design Studio + Polish) ─

    {
        id: 'intelligence-report-rebuild',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'AI Intelligence',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Intelligence Report Rebuild — Calibrated 6D + Grounded AI Verdict',
        impact: 'A user with one partial submission used to see Overall=30 yet "Knowledge Retention=89, your strongest signal is Knowledge Retention." Now: dimensions with insufficient data show "—" + an activation message; the AI verdict refuses to claim readiness without evidence; every score carries a 95% confidence interval; tier readiness comes from a single source of truth used by client + server.',
        description: 'Four-layer rebuild. L1 (deterministic stats): wilsonCI / meanCI / combineCIs utilities. L2 (calibration): per-dimension activation floors, FSRS-based D6 retrievability, READINESS_TIERS unified, reportCoverage stat. L3 (AI verdict): structured JSON with 7 hard anti-hallucination rules, validator with deterministic fallback, stored in VerdictLog. L4 (audit): superadmin /super-admin/verdicts page showing 7-day fallback rate + per-row evidence/output diff.',
        why: 'Users who see "ready" and fail real interviews is the failure mode we explicitly engineered against. Every threshold and rule is now grounded in research (FSRS, IRT, Wilson). Overclaim fails noisily — fallback rate is observable.',
        researchBasis: 'Wilson 1927 (proportion intervals); Agresti & Coull 1998 (small-n CI recommendation); FSRS v4+ retrievability formula (R(t,S) = (1+19/81 · t/S)^-0.5); Anthropic prompting best practices (hard rules + few-shot); OpenAI cookbook reliability techniques (validator + fallback).',
        technicalNotes: 'server/src/utils/{dimensionStats,fsrsRetention,readinessTiers}.js · stats.controller.js::generateReadinessVerdict + getVerdictAudit · ai.prompts.js::readinessVerdictPrompt + READINESS_VERDICT_FEWSHOT · prisma model VerdictLog (5-min cache + audit) · client ReportPage rebuilt with DimScore[] shape + AIVerdictCard.',
    },

    {
        id: 'design-studio-rebuild',
        phase: 'DONE',
        shippedAt: '2026-05-13',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Design Studio Workspace Rebuild',
        impact: 'The 2,239-line monolith with hidden AI Coach (users had to scroll past the canvas to find it) became a feature-folder split with a pinned right rail — the coach is the first thing visible. Adds: lifecycle state machine (no more workspaceMode/status drift), unified save coordinator (4 debounce loops collapsed, no more dropped saves on rapid edits), proactive stuck-detector with phase-rubric nudges, coaching history tab to revisit past feedback, curated reference architectures gated post-attempt (Sweller), and a new Interview mode where the AI plays interviewer and can read the live canvas via tool calls.',
        description: '8 commits across server + client. Schema additions: DesignReference (worked examples), DesignSessionMode enum, InterviewSession.designSessionId pairing. Server: state-machine guards on transitions, stuckContext + design-aware stage block in interview.engine.js, LOW_LEVEL_DESIGN rubric added. Client: features/design-studio/* feature folder, useSaveCoordinator + useDesignSessionStore (Zustand outbox with promise-mutex), useStuckDetector with 4-signal idle check, AICoachSection with Coach/History tabs, ReferenceCompareView with key-term diff, InterviewWorkspace + paired Mock Interview UI trim.',
        why: 'SD/LLD practice was the weakest surface in the app. Mock Interview SD/LLD was CODING-shaped (wrong rubric, no LLD rubric at all, AI couldn\'t see diagrams). Design Studio was self-paced with great pedagogy but the UI hid its best feature (AI coach). Rebuild unifies SD/LLD practice in one canvas-aware tool with two modes.',
        researchBasis: 'Sweller (cognitive load + worked examples after retrieval); Bjork (desirable difficulty — practice harder than reality); Ericsson (deliberate practice + immediate specific feedback); Karpicke & Roediger (retrieval practice); FSRS retrievability formula reused for stuck-thresholds.',
        technicalNotes: 'See client/src/features/design-studio/ tree. Migrations 20260920000000_add_design_reference and 20260925000000_add_design_interview_link. Seed JSONs in server/prisma/seeds/design-references/ + standalone scripts/seed-design-references.js.',
    },

    {
        id: 'ui-polish-design-foundation',
        phase: 'DONE',
        shippedAt: '2026-05-13',
        theme: 'Admin Experience',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'UI Polish + Design-System Foundation',
        impact: 'Reusable Skeleton (card/row/text/avatar variants), ErrorBoundary at every route (a crash on one page no longer blanks the whole app), styled ConfirmModal replacing window.confirm() across 11 sites, WAI-ARIA focus trap on modals, prefers-reduced-motion honored everywhere, aria-live regions on streaming AI responses, page-level empty states with explicit CTAs, hardcoded color audit + token migration. Fixes a real CommandPalette hooks-rules-of-hooks crash.',
        description: '4 commits. Phase 3.1: hotfix CommandPalette useTeamCommands/useSuperAdminCommands rename (rules-of-hooks compliance) + missing nav entries. Phase 3.2: components/ui/Skeleton, ErrorBoundary, hooks/useToastingMutation, MotionConfig reducedMotion="user". Phase 3.3: ReportPage progressive loading (skeleton matching final shape — no layout shift), Dashboard empty-state CTAs, MockInterview WS disconnect banner, color-token sweep. Phase 3.4: useFocusTrap, useConfirm + ConfirmProvider, modal a11y (role/aria-modal/aria-labelledby/aria-describedby), aria-live on verdict + chat regions.',
        why: 'Quality bar mandate: clean / elegant / modern / user-friendly. Foundation pieces also unblock future work (Skeleton + ConfirmModal will be reused by every new feature).',
        technicalNotes: 'Audit punch list saved as memory project_ui_polish_punchlist.md. CommandPalette functions renamed get* (not use* — they are not hooks).',
    },

    // ── SHIPPED (earlier this arc) ───────────────────────────────────────

    {
        id: 'retrieval-practice-persistence',
        phase: 'DONE',
        shippedAt: '2026-05-10',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Retrieval Practice Persistence',
        impact: 'A member who types what they remember before revealing their stored solution has that attempt stored, shown to the AI hint generator, and rolled into their recall-quality trend. The retrieval attempt is now load-bearing, not decorative.',
        description: 'The review flow already had recall/reveal/rate phases with a 90-second timer and the stored solution hidden — but the recall text was discarded on save and the AI never saw it. Added the ReviewAttempt table, schema-validated recallText on submitReview, and a prompt upgrade so AI hints tailor to what the user actually tried.',
        why: 'Retrieval practice is among the single most-replicated findings in cognitive psychology (Karpicke & Roediger 2008, Science). Storing the attempt unlocks the entire feedback loop — without it, the UI was theatre.',
        researchBasis: 'Karpicke & Roediger (2008) — the critical importance of retrieval for learning. Roediger & Butler (2011) — the testing effect.',
        technicalNotes: 'Model ReviewAttempt (solutionId FK, recallText, confidence, quality, recalled). submitReview writes Solution + ReviewAttempt atomically. generateReviewHints accepts optional recallText and embeds it in the prompt.',
    },

    {
        id: 'solution-attempt-history',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Solution Attempt History',
        impact: 'Members can see how their solution evolved across submissions and edits — timeline, confidence trajectory, side-by-side diff, AI-score delta. Editing no longer silently erases what you wrote last time.',
        description: 'Each submit, edit, and Design Studio bridge now appends an immutable SolutionAttempt snapshot. New /solutions/:id/history page with recharts confidence chart, trigger-badged timeline, A/B attempt picker, character-level prose diff, and line-level code diff via the `diff` npm package.',
        why: 'Without history, every edit overwrites prior work and the learning signal of "how did my answer improve" is invisible. The snapshots also let the AI compare attempts over time.',
        technicalNotes: 'Model SolutionAttempt (attemptNumber unique per solution, trigger enum SUBMIT/EDIT/DESIGN_BRIDGE, full content snapshot, problemVersion, aiFeedbackSnapshot). Transactional writes in submitSolution, updateSolution, designStudio bridge. Backfilled one SUBMIT row per existing Solution on migration.',
    },

    {
        id: 'recall-quality-analytics',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Recall-Quality Analytics',
        impact: 'Members see their recall rate trend over the last 12 weeks, which patterns they forget most, and how their self-rated confidence tracks vs actual recall. Answers "am I improving?" with real data.',
        description: 'Aggregation endpoint over ReviewAttempt rows: overall, weekly trend, per-pattern breakdown. Recharts dual-axis line chart + sortable pattern table inside a collapsible panel on ReviewQueuePage. Compact sparkline mini-tile on Dashboard.',
        why: 'ReviewAttempt data was accumulating but nothing surfaced it. Visibility closes the loop between reviewing and seeing the improvement.',
        technicalNotes: 'GET /solutions/review/analytics — three parallel raw-SQL queries scoped to (userId, teamId). Pattern rollup uses CROSS JOIN LATERAL unnest(patterns) so multi-pattern solutions contribute to every pattern. Recharts introduced (already in package.json, previously unused). useSubmitReview invalidates recall-analytics on success.',
    },

    {
        id: 'problem-versioning',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Correctness & Data',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Problem Content Versioning',
        impact: 'When an admin edits a problem after members have submitted solutions, each solution remembers the version it was written against. API exposes problemUpdatedSinceSolved so the client can surface a "problem updated since you solved it" indicator.',
        description: 'Problem.version counter bumped on statement changes (not on pin/hide/publish flips). Solution.problemVersion frozen at submit/bridge time. GET /problems enriched with derived problemUpdatedSinceSolved + userSolvedVersion fields.',
        why: 'Without versioning, admin edits silently reshape the problem under anyone who already solved it — solutions referenced a now-different statement with no way to detect drift.',
        technicalNotes: 'Migration 20260908000000_add_problem_versioning — two additive columns. updateProblem splits content fields from admin flags and only increments version on content changes.',
    },

    // ── NOW — currently building or immediately queued ─────────────────

    {
        id: 'url-confidence-indicator',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Admin Experience',
        priority: 'HIGH',
        effort: 'Small',
        title: 'URL Confidence Indicator',
        impact: 'Admins now see a green ✓ / yellow ⚠ / red ✗ pill next to each generated problem\'s source URL so they know at a glance which ones need manual verification before approving — no more silently shipping broken links.',
        description: 'The AI pipeline was already emitting urlConfidence (high/medium/low) per problem but the client never showed it. Added a pill next to the "View on …" link in GeneratedProblemCard.',
        why: 'An admin who knows a URL is low-confidence will edit it; one who doesn\'t will approve a broken link.',
        technicalNotes: 'client/src/pages/admin/AddProblemPage.jsx — GeneratedProblemCard, next to the source link.',
    },

    {
        id: 'ai-url-fallback',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Admin Experience',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Search URL Fallback for Low-Confidence Links',
        impact: 'When the AI is guessing at a problem URL, members get a platform search link (LeetCode / GFG / HackerRank / CodeChef / InterviewBit / Codeforces) that at least lands them on the right platform searching for the title — instead of a dead link.',
        description: 'New server/src/utils/platformSearch.js with getPlatformSearchUrl and a resolveGeneratedSourceUrl policy function. generateProblemsAI stage 3 (both success and partial-fail paths) now uses it instead of silently clearing the URL.',
        why: 'A search URL gives the user a fighting chance to find the problem. A blank URL gives them nothing.',
        technicalNotes: 'Encodes title via encodeURIComponent. Paired with the url-confidence-indicator so admins see the "✗ Search fallback" pill and know to edit before approving.',
    },

    {
        id: 'duplicate-problem-detection',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Admin Experience',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Duplicate Problem Detection at Generation',
        impact: 'Each AI-generated problem preview card now shows a "⚠️ Possible duplicate" panel listing any existing team problems whose titles share ≥50% of their content words — with an overlap percentage per match. Admins catch "Two Sum II" vs existing "Two Sum" before approving.',
        description: 'Token-Jaccard similarity over lowercased, stopword-filtered, single-char-filtered title tokens. Existing team titles fetched once per generation batch (id + title only). Top 3 matches above threshold attached to each generated problem as similarTo.',
        why: 'Silent duplicates waste admin time, confuse members, and dilute practice diversity. Detection costs microseconds in memory — at 10k problems we\'d move it to a raw trigram query, but token-Jaccard is right for the current scale.',
        technicalNotes: 'server/src/utils/titleSimilarity.js (tokenJaccard + findSimilarTitles). generateProblemsAI prefetches existing titles before Stage 3, attaches similarTo to both success and partial-fail return shapes. Client GeneratedProblemCard renders the warning panel above the URL row.',
    },

    {
        id: 'pre-session-confidence',
        phase: 'NOW',
        theme: 'Learning Science',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Pre-Session Confidence Calibration',
        impact: 'Before each mock interview, a 10-second "how prepared do you feel?" prompt. AI uses this to adjust the calibration penalty downstream.',
        description: 'Quick 1-5 prompt on session start. Stored on InterviewSession. Post-session feedback can then say "you rated 4/5 confident going in but scored 2/5 — here\'s the gap."',
        why: 'Self-awareness is a coachable skill. Making the calibration gap visible is the feedback loop.',
        technicalNotes: 'Add preSessionConfidence Int? on InterviewSession. MockInterviewPage prompts before first turn. Debrief surfaces the gap.',
    },

    // ── NEXT — 1-3 months ──────────────────────────────────────────────

    {
        id: 'fsrs-scheduler',
        phase: 'NEXT',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'FSRS Scheduler Migration',
        impact: 'The SRS scheduler uses empirically-fit parameters from millions of real review outcomes instead of the 1990 SM-2 heuristic. Intervals become principled, and the "retention estimate" becomes accurate instead of approximate.',
        description: 'Swap the current SM-2 implementation (plus ad-hoc estimateRetention stability formula) for FSRS v4+ via the ts-fsrs npm package. FSRS models memory as stability + difficulty per card with 19 parameters; Anki switched to FSRS as its default scheduler in 2024.',
        why: 'SM-2 is serviceable but the retention estimate in utils/sm2.js has an admitted ad-hoc stability formula. FSRS is what every modern SRS has moved to because it produces measurably better schedules. This is the last "scientifically polish" item flagged in the original correctness audit.',
        researchBasis: 'Piotr Wozniak\'s SuperMemo algorithm papers + FSRS v4 paper (Ye et al.). Fit on millions of Anki review logs.',
        technicalNotes: 'Add ts-fsrs dependency (user approval required per memory). Keep SM-2 fields for legacy compat but route new reviews through FSRS. Bootstrap existing items via FSRS.init. Replace estimateRetention with FSRS.getRetrievability.',
    },

    {
        id: 'problem-updated-badge',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Correctness & Data',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Problem-Updated Badge in UI',
        impact: 'Members see a "✨ Updated" pill on problems that have been edited since they solved them — on the Problems list and on due-review cards.',
        description: 'Surfaced the existing problemUpdatedSinceSolved flag (shipped with problem versioning) into the UI. ReviewQueuePage select extended to pull problem.version so the flag can be derived per due item.',
        why: 'Data layer was already in place; UI had never caught up.',
        technicalNotes: 'ProblemsPage list row + ReviewQueuePage due card render a warning-tone pill. getReviewQueue now includes problem.version in its select.',
    },

    {
        id: 'forgetting-curve-per-item',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Per-Item Forgetting Curve on Review Queue',
        impact: 'Each due item shows a filled Ebbinghaus decay sparkline with a dashed projection into the future — the member sees at a glance how much they\'ve already forgotten and how much more they\'ll forget if they skip.',
        description: 'Replaced the flat "~X% retained" pill with a tiny per-row SVG curve. Past retention is filled; dashed tail projects forward. Color bucket (green >70, yellow 40-70, red <40) mirrors the recall-by-pattern table palette.',
        why: 'Aggregate trend answers "am I improving?"; per-item decay answers "which one is about to fall off a cliff?"',
        researchBasis: 'Ebbinghaus (1885) forgetting curve. Cepeda et al. (2006) — visualizing retention increases review completion.',
        technicalNotes: 'New ForgettingCurve component (plain SVG, not recharts — 20+ per-row instances would be too heavy). Also fixed a retention-math bug in getReviewQueue that used overdueDays instead of daysSinceReview, systematically over-estimating retention for overdue items.',
    },

    {
        id: 'oauth-social-login',
        phase: 'NEXT',
        theme: 'Growth & Onboarding',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'OAuth / Social Sign-In',
        impact: 'One-click signup with Google or GitHub removes the biggest onboarding friction point — new users land on the dashboard in seconds.',
        description: 'Passport.js + Google + GitHub OAuth strategies. Auto-provision User on first sign-in. Existing email/password flow stays.',
        why: 'Password-based signup is measurably worse conversion than OAuth. Every extra field kills ~10% of new signups.',
        technicalNotes: 'Server: passport + passport-google-oauth20 + passport-github2. Add oauthProvider, oauthId to User. Client: SSO buttons on LoginPage/RegisterPage.',
    },

    {
        id: 'email-notifications',
        phase: 'NEXT',
        theme: 'Retention & Engagement',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Transactional Email Notifications',
        impact: 'Members get reminded to review when they have due items, notified when teammates solve a problem they\'re stuck on, and see a weekly digest of team progress.',
        description: 'Resend integration + three email types: daily review reminder, new-problem notification, weekly digest. User-configurable notificationPrefs JSON on User.',
        why: 'Email is still the single most reliable channel for bringing members back to the product. Missing today.',
        technicalNotes: 'Server: email.service.js wrapping Resend. Daily cron (node-cron): check nextReviewDate, send if dueCount > 0. Weekly Sunday digest. notificationPrefs JSON on User for opt-outs.',
    },

    {
        id: 'multi-platform-search',
        phase: 'NEXT',
        theme: 'Content & Problems',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Multi-Platform Problem URL Resolution',
        impact: 'Team admins can generate problems from GFG, HackerRank, and InterviewBit — not just LeetCode — with verified, working links.',
        description: 'Integrate Serper.dev to resolve real URLs from GFG, HackerRank, InterviewBit, and CodeChef. Search query: "[problem title] site:[platform domain]".',
        why: 'GFG is better for Indian company interviews. HackerRank has unique problem sets. Platform diversity directly improves preparation quality.',
        technicalNotes: 'Create server/src/services/search.service.js with searchProblemUrl(title, platform) → verified URL via Serper.dev. Integration in generateProblemsAI Stage 2.',
    },

    {
        id: 'interview-stage-selector',
        phase: 'NEXT',
        theme: 'Content & Problems',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Interview Stage-Aware Problem Generation',
        impact: 'A team admin preparing members for Google onsites gets Hard optimization problems — not Easy pattern recognition warmups.',
        description: 'Add Interview Stage selector (Phone Screen / Technical Screen / Onsite / Final Round) to AI generation config. AI calibrates difficulty, depth, and follow-up expectations.',
        why: 'Real interview preparation is stage-aware. Generic difficulty selection ignores the most important context variable.',
        technicalNotes: 'Client: interviewStage field in AIGenerateScreen. Server: stage calibration in problemSelectionPrompt.',
    },

    {
        id: 'inline-followup-editing',
        phase: 'NEXT',
        theme: 'Admin Experience',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Inline Follow-Up Editing at Generation Time',
        impact: 'Admins curate the complete problem — including follow-up questions — in a single step before it reaches team members.',
        description: 'When AI generates a problem, admins can see follow-up questions but cannot edit them in the preview. They must approve first, then go to Edit Problem. Unnecessary two-step workflow.',
        why: 'The preview card is the natural curation moment. Follow-up quality directly affects AI review scoring and member learning.',
        technicalNotes: 'GeneratedProblemCard in AddProblemPage.jsx: editable follow-up rows in preview mode.',
    },

    {
        id: 'interleaved-practice',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Interleaved Practice Mode',
        impact: 'A "🔀 Mixed Mode" toggle on the Problems page randomizes order across categories so members practice patterns interleaved rather than blocked. Rohrer & Taylor (2007): interleaved practice produces ~43% better retention at test time.',
        description: 'Deterministic shuffle (djb2 hash of problem id) so the mixed order is stable within a session but interleaves categories. Purely client-side. Factored into `hasFilters` and the Clear button resets it.',
        why: 'Blocked practice feels easier and produces better immediate performance, which is why candidates prefer it. Interleaved feels harder and produces dramatically better long-term retention.',
        researchBasis: 'Rohrer & Taylor (2007) — interleaved practice produces 43% better retention at test time. Kornell & Bjork (2008) — despite feeling harder, interleaving produces superior discrimination learning.',
        technicalNotes: 'ProblemsPage.jsx mixedMode state + stableHash helper. Toggle pill next to the Pinned filter.',
    },

    {
        id: 'commitment-contracts',
        phase: 'NEXT',
        theme: 'Retention & Engagement',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Daily Practice Commitment Contracts',
        impact: 'Members who commit to a daily goal return 2-3x more consistently than those who just track streaks passively.',
        description: 'Set a daily commitment ("I will solve 1 problem every day until my interview"). Single evening reminder if not met. Loss aversion mechanism.',
        why: 'Passive streak tracking produces mild motivation; active commitment produces significantly stronger behavioral change.',
        researchBasis: 'Ariely & Wertenbroch (2002) — commitment devices significantly increase task completion. Gollwitzer (1999) — implementation intentions double goal achievement rates.',
        technicalNotes: 'commitmentGoal JSON on User. Settings page UI. sendCommitmentReminderEmail at 8pm if goal not met.',
    },

    {
        id: 'ai-prompts-overhaul',
        phase: 'NEXT',
        theme: 'AI Intelligence',
        priority: 'HIGH',
        effort: 'Large',
        title: 'AI Prompts & Service Overhaul',
        impact: 'Every AI surface (solution review, scenario generation, weekly plan, mock interview, design coaching, readiness verdict, problem generation, debrief) gets the same anti-hallucination treatment the new readiness verdict has — hard rules in system prompt + validator + deterministic fallback + few-shot calibration where stakes are high. ai.service.js gains usage tracking, model fallback, retry-on-rate-limit, and standardized error envelopes so callers stop reinventing those patterns.',
        description: 'Cross-cutting refactor of every prompt in server/src/services/{ai.prompts,designStudio.prompts,interview.engine}.js plus the central ai.service.js. Standardize: (1) system prompts cache-friendly (static per category/mode), user prompts carry dynamic fields, untrusted content always XML-tagged with the security rule; (2) structured JSON outputs with shared validators in a new server/src/services/ai.validators.js; (3) deterministic fallbacks for every JSON-returning prompt; (4) few-shot examples for high-stakes outputs. Audit existing prompts for token efficiency and drift from current best practices.',
        why: 'Prompts are load-bearing. The verdict prompt rebuild proved that grounded-with-validator beats unverified LLM output. Applying that pattern across the surface raises the AI quality floor everywhere instead of one-off improvements.',
        researchBasis: 'Anthropic prompting best practices (explicit rules, examples, CoT). OpenAI cookbook reliability techniques (techniques_to_improve_reliability). Treisman 2023 study on prompt-cache tokens — keeping system prompts static across calls is now a real cost lever.',
        technicalNotes: 'Per the user\'s ordering this comes after UI polish (Phase 3) and before Database Practice (Phase 1). Track work in audit + 4-5 commits. Reference: existing readinessVerdictPrompt + validateVerdict + buildFallbackVerdict pattern in stats.controller.js.',
    },

    // ── LATER — 3-9 months ─────────────────────────────────────────────

    {
        id: 'database-practice-section',
        phase: 'LATER',
        theme: 'Content & Problems',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Database Practice Section (SQL Workspace)',
        impact: 'A first-class SQL/database practice surface parallel to Design Studio. Real schema + seed data, query workspace with execution + result preview, AI evaluation against expected output and explain plan. Currently SQL is a Mock Interview category but has no dedicated workspace — users either reason about queries in their head or run them in a separate tool.',
        description: 'New top-level feature: schema-aware query editor (Monaco with SQL mode), per-problem seed schemas + sample rows, sandboxed query execution (Postgres in a worker container or Judge0-style), result-set comparison against expected output, query-plan analysis. AI evaluation rubric: queryCorrectness, schemaUnderstanding, optimizationAwareness, edgeCaseHandling. Bridges to Solutions like Design Studio does.',
        why: 'SQL is a recognized interview category we don\'t serve well. The Mock Interview category is text-only — users can\'t actually run queries. Real practice requires real execution against a real schema.',
        researchBasis: 'Same deliberate-practice frame as the Design Studio rebuild (Ericsson, Karpicke). For schema sandboxing: use the Postgres docker-in-worker pattern from open-source SQL training tools (Hasura, sqlpad).',
        technicalNotes: 'Will need: SqlSession Prisma model, SqlSchema seed table, sandboxed Postgres execution path. Open question: managed (Judge0/Piston) vs self-hosted single-container reset-per-query.',
    },

    {
        id: 'notes-section',
        phase: 'DONE',
        shippedAt: '2026-05-14',
        theme: 'Personal Productivity',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Personal Notes + AI-driven SM-2 Flashcards',
        impact: 'Captures the missing layer between solving a problem and remembering it. Users now have a markdown notebook (private, survives team switches) that attaches to Problems, Mock Interviews, Design Sessions, or Teaching Sessions. AI auto-summarizes notes, suggests tags, ranks related notes/problems via embedding similarity, and extracts SM-2 flashcards that flow into the existing Review Queue alongside Solutions — closing the loop between insight capture and long-term retention.',
        description: '7-phase rollout behind FEATURE_NOTES_ENABLED + VITE_FEATURE_NOTES_ENABLED (with matching client/Dockerfile ARG). P0: Note + Flashcard models + pgvector(1536) + HNSW + minimal CRUD UI. P1: optional entity linking with snapshot title (dangling-link safe across team switches), AttachedNotesPanel on Problem/Teaching/Interview detail pages. P2: kebab-case tag input + filter chips + tag aggregation endpoint. P3: per-note background embedding writer (5s debounce, fire-and-forget) + cross-table cosine similarity. P4: 3 AI surfaces (note:summary, note:autotag, note:related) with validate→fallback→few-shot. Related panel does embed→LLM-rank with rationales. P5: Flashcard model + manual create + extended Review Queue (Solutions and Flashcards merged client-side, modal mirrored). P6: AI flashcard drafts (note:flashcards) with accept/reject/edit modal that bulk-creates accepted cards via the existing flashcards endpoint.',
        why: 'A user who solves a problem, takes a great mock interview, or hosts a teaching session has no in-app place to capture insights they want to revisit. They paste into a side notes app or forget. Notes + AI flashcards close the spaced-repetition loop for ANY insight, not just solved problems — so transient understanding stays.',
        researchBasis: 'Karpicke & Roediger (2008) — testing effect: retrieval beats re-reading by 50%+ on long-term retention. Wozniak (1990) — SM-2 algorithm (already powering Solutions review). Pichert & Anderson (1977) — encoding specificity: notes attached to source context (the Problem you solved) recall better than free-floating notes. Anthropic prompting best practices (validate→fallback→few-shot) reused from Notes-feature peers.',
        technicalNotes: 'Server: Note + Flashcard models in schema.prisma (Note has Unsupported("vector(1536)") + idx_notes_embedding_hnsw); 4 new AI prompts (noteSummary/noteAutoTag/noteRelated/noteFlashcards) + matching validators/fallbacks/few-shots; notes.controller.js + flashcards.controller.js (both userId-scoped, no requireTeamContext); notes.embedding.js (5s per-noteId debounce, embedding fire-and-forget). Client: services + hooks (notes.api.js, flashcards.api.js, useNotes, useFlashcards, useGenerateNoteFlashcards), MarkdownEditor (split textarea + preview), EntityLinkPicker, TagInput (kebab normalization mirroring server), RelatedNotesPanel (LLM-ranked w/ rationales + AI badge), AiSummaryCard, SuggestedTagsBar, FlashcardForm + FlashcardList + FlashcardReviewModal + FlashcardReviewSection on ReviewQueuePage, FlashcardDraftReview accept/reject UI. Dockerfile ARG VITE_FEATURE_NOTES_ENABLED added (lesson from Teaching deploy: Railway runtime env doesn\'t auto-flow into vite build).',
    },

    {
        id: 'team-teaching-sessions',
        phase: 'DONE',
        shippedAt: '2026-05-14',
        theme: 'Team & Community',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Team Teaching Sessions (Knowledge Sharing) — v1',
        impact: 'Members schedule peer-to-peer teaching sessions, attend in-app live rooms with Q&A, post markdown notes after, and rate each other 1–5. Hosts earn a new D7 "Teaching Contributions" dimension on the Intelligence Report (activates after ≥1 session + ≥3 ratings, conservative ~10% weight). AI auto-generates a TL;DR summary, a 3–5 question review quiz, and a topic-coverage validator from the host\'s notes — all three validator-protected with deterministic fallbacks via the AI Prompts Overhaul pattern. Moderation is open + flag-and-review with admin upholdable cancellation.',
        description: '6-phase rollout (P0–P5) shipped behind FEATURE_TEACHING_SESSIONS / VITE_FEATURE_TEACHING_SESSIONS feature flags. P0: schema (TeachingSession + Attendee + Rating + Flag) + skeleton API. P1: live room over existing WebSocket — presence + Q&A only, no recording. P2: ratings + flags + admin queue. P3: 3 AI surfaces (summary, quiz, topic-coverage) on Promise.allSettled with validators + fallbacks + few-shot. P4: D7 dimension — opt-in only when user has hosted ≥1 session, so non-teachers see byte-identical 6D reports. P5: 4 transactional emails + 60s cron with CAS-style idempotency for "starting in 5 min" + "live now" broadcasts.',
        why: 'The app previously treated every member as a solo learner. Teams thrive on knowledge sharing; the feedback loop of "explain it to teach" is one of the strongest learning interventions known (Feynman technique, protégé effect). Recognizing teachers in the same currency the app values (Intelligence Report points) makes the system self-reinforcing.',
        researchBasis: 'Roscoe & Chi (2007) — peer-tutoring meta-review showing tutors learn more than tutees ("protégé effect"). Fiorella & Mayer (2013) — teaching expectancy alone produces ~30% better retention than control. Bloom (1984) — peer tutoring is one of the few replicated mechanisms producing sigma-level gains.',
        technicalNotes: 'Server: TeachingSession + 3 child models in schema.prisma; teaching.controller.js (create/list/detail/patch/cancel/start/end/join/leave/rate/flag/admin-flags/notes); 3 AI prompts in ai.prompts.js with validators in ai.validators.js + fallbacks in ai.fallbacks.js; D7 in stats.controller.js conditionally pushed when sessionsHosted ≥ 1; teaching.scheduler.js (60s setInterval, CAS-claim); 4 senders in email.service.js. Client: hooks/useTeaching.js, services/teaching.api.js, pages/teaching/{ListPage,NewPage,DetailPage,NotesPage}, pages/superadmin/TeachingFlagsPage, components/teaching/{LiveTeachingRoom,TeachingRatingForm,TeachingFlagModal}. Recording + transcript-driven AI deferred to v2 pending real-usage data.',
    },

    {
        id: 'test-case-execution',
        phase: 'LATER',
        theme: 'Content & Problems',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Test-Case Execution for CODING',
        impact: 'When a member submits a CODING solution, their code actually runs against real test cases. No more "AI guesses at correctness" — members see which cases pass and which fail, like a real judge.',
        description: 'Integrate Judge0 (managed or self-hosted) or Piston. Store test cases per problem. Execute submissions, capture stdout/stderr, surface pass/fail summary. AI review becomes grounded in actual outcomes, not LLM-guessed correctness.',
        why: 'This is the single biggest correctness gap for CODING problems. Real interview prep requires actual judging.',
        technicalNotes: 'Infrastructure decision: Judge0 Cloud ($), self-hosted Judge0 CE (Docker), or Piston (free). Add testCases JSON on Problem. New /solutions/:id/execute endpoint. Results feed into ai.prompts.js solutionReviewPrompt.',
    },

    {
        id: 'recall-diff-on-reveal',
        phase: 'DONE',
        shippedAt: '2026-05-12',
        theme: 'Learning Science',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Word-Level Recall Diff on Reveal',
        impact: 'After typing a recall and clicking Reveal, members can toggle a Diff view that colors every word: green for what they recalled, red for what they missed, yellow for what they invented. Coverage percentage quantifies the gap.',
        description: 'New RecallDiff component uses diffWordsWithSpace (case-insensitive) to compare the recall text against a concat of stored fields (patterns, keyInsight, complexity, optimizedApproach, feynmanExplanation). Stats strip shows recalled/missed/invented word counts and a coverage %.',
        why: 'The gap between recall and original IS the learning signal (Karpicke & Roediger 2008). Plain side-by-side makes the user hunt for the gap; a diff surfaces it instantly.',
        technicalNotes: 'Toggle (Side-by-side / Diff) on the reveal phase in ReviewQueuePage. Diff view disabled when recall text is empty. AI recall-questions panel renders in both views.',
    },

    {
        id: 'competition-system',
        phase: 'LATER',
        theme: 'Team & Community',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Timed Team Competitions',
        impact: 'Teams experience the real pressure of timed problem-solving together — the closest simulation of an actual interview environment.',
        description: 'Timed competition events where team members solve the same problem set simultaneously. Live leaderboard. Competition and CompetitionEntry models already exist in schema.',
        why: 'Competitions create urgency that regular practice lacks. D5 (Pressure Performance) gets the richest signal from timed events.',
        technicalNotes: 'Competition + CompetitionEntry models already exist. Server routes + WebSocket leaderboard. Client: lobby, live problem view, real-time leaderboard.',
    },

    {
        id: 'peer-learning-pairs',
        phase: 'LATER',
        theme: 'Team & Community',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Weekly Peer Learning Pairs',
        impact: 'Members who explain their solution to a peer show significantly better retention and deeper understanding than those who only self-review.',
        description: 'Match members into weekly pairs where one explains their solution and receives a clarity rating. Structured session, not just peer rating.',
        why: 'Explaining to someone slightly less advanced consolidates understanding more than solo practice. Protégé Effect.',
        researchBasis: 'Chase et al. (2009) — the protégé effect. Roscoe & Chi (2007) — peer tutoring benefits both tutor and tutee.',
        technicalNotes: 'WeeklyPairingSession model. Sunday pairing algorithm matching by 6D weakness similarity. Dashboard shows this week\'s pair + prompts.',
    },

    {
        id: 'voice-interviews',
        phase: 'LATER',
        theme: 'AI Intelligence',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Voice-Based Mock Interviews',
        impact: 'Members practice the actual modality of a real interview — speaking their answer — not just typing it.',
        description: 'User speaks their answer, Whisper STT transcribes, AI responds. Behavioral and HR rounds especially need verbal fluency that text practice cannot build.',
        why: 'Most real interviews are spoken. Voice practice builds confidence that text practice structurally cannot.',
        technicalNotes: 'POST /api/interview-v2/voice/transcribe → Whisper. MediaRecorder client-side. Optional SpeechSynthesis API response.',
    },

    {
        id: 'problem-catalog',
        phase: 'LATER',
        theme: 'Content & Problems',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Curated Problem Catalog with Verified URLs',
        impact: 'AI generates problems from a pre-verified library — 100% reliable links, zero broken URLs, dramatically faster generation.',
        description: 'Internal database of 500+ verified interview problems. AI selects from catalog instead of generating free-form. Catalog grows automatically via search API resolution.',
        why: 'Verified URLs compound over time. Every resolved URL permanently improves the catalog.',
        technicalNotes: 'ProblemCatalog model. Seed with 500 well-known problems. Auto-grow from search-API resolutions. Super Admin admin UI.',
    },

    {
        id: 'cohort-benchmarking',
        phase: 'LATER',
        theme: 'AI Intelligence',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Role-Appropriate Cohort Benchmarking',
        impact: 'Instead of "your Pattern Recognition score is 62", members see "62 — 71st percentile for backend engineers targeting mid-level FAANG."',
        description: 'Comparison to similar users in the 6D report. Social comparison to relevant peers is a stronger motivator than abstract ideals.',
        why: 'Context transforms a number into an actionable signal. "62/100" is ambiguous; "71st percentile for your target role" drives specific behavior.',
        researchBasis: 'Festinger (1954) social comparison theory. Bandura (1977) — self-efficacy beliefs are most influenced by comparison to similar peers.',
        technicalNotes: 'Role/experience fields on User from onboarding. Percentile computation in get6DReport. "You vs peers targeting X" on ReportPage.',
    },

    {
        id: 'anxiety-calibration',
        phase: 'LATER',
        theme: 'Learning Science',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Pre-Interview Anxiety Calibration',
        impact: 'D5 (Pressure Performance) accurately distinguishes "performs poorly under pressure" from "performs well despite high anxiety" — a critical difference for coaching.',
        description: '3-question anxiety self-report before each mock interview. AI calibrates evaluation accordingly.',
        why: 'A candidate scoring 9/10 while reporting high anxiety deserves different feedback than one scoring 9/10 calmly.',
        researchBasis: 'Yerkes & Dodson (1908) — inverted-U arousal/performance. Eysenck et al. (2007) Attentional Control Theory.',
        technicalNotes: 'preInterviewAnxiety Int on InterviewSession. Pre-interview form in MockInterviewPage. Composite anxiety score + anxiety-adjusted D5 metric.',
    },

    {
        id: 'process-tracking',
        phase: 'LATER',
        theme: 'AI Intelligence',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Problem-Solving Process Tracking',
        impact: 'AI feedback can comment on HOW you solved the problem — not just WHAT you submitted. Did you clarify requirements? Try brute force before optimizing?',
        description: 'Optional session timer and timestamped thinking-log scratchpad during problem solving. AI review has behavioral signal data.',
        why: 'Deliberate practice research shows process matters more than outcome for learning.',
        researchBasis: 'Ericsson et al. (1993) — deliberate practice. Process-level feedback is the foundation of expert skill development.',
        technicalNotes: 'thinkingLog JSON on Solution (array of {timestamp, note}). SubmitSolutionPage expandable panel. Fed into solutionReviewPrompt.',
    },

    // ── SOMEDAY — validated ideas, no committed timeline ────────────────

    {
        id: 'learning-paths',
        phase: 'SOMEDAY',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Structured Learning Paths',
        impact: 'A user who wants to learn Spring Boot, AI/ML, or Networking gets a structured path — knowledge graph with dependency ordering, forgetting curves per concept, and three practice modes.',
        description: 'Topic → AI-generated concept dependency graph → daily adaptive practice queue combining Explain It, Quiz It, Build It. Seven subject domains with mechanism-depth evaluation.',
        why: 'Interview prep is reactive (practice problems). Learning is proactive (build knowledge). ProbSolver currently only does the former.',
        researchBasis: 'Bloom (1956) taxonomy — deep learning requires recognition → recall → application → explanation. Vygotsky ZPD.',
        technicalNotes: 'LearningPath, LearningPathConcept, ConceptEdge, ConceptMastery models. Five knowledge states. Three practice modes. Daily adaptive queue.',
    },

    {
        id: 'pricing-subscriptions',
        phase: 'SOMEDAY',
        theme: 'Growth & Onboarding',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Pricing & Subscription Model',
        impact: 'ProbSolver becomes a sustainable business. Free tier drives discovery. Pro tier removes limits. Team tier unlocks everything for groups.',
        description: 'Individual Free (10 AI reviews/month) + Individual Pro ($12-15/month) + Team ($8-10/seat/month). Stripe integration.',
        why: 'Without monetization there is no sustainability. The feature set justifies a Pro tier.',
        technicalNotes: 'Subscription + UsageTracking models. Stripe + webhook + /api/v1/billing. Subscription check middleware on AI endpoints.',
    },

    {
        id: 'interview-pipeline-tracker',
        phase: 'SOMEDAY',
        theme: 'Growth & Onboarding',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Real Interview Pipeline Tracker',
        impact: 'Users see the direct connection between their practice and real interview outcomes — the most powerful motivation signal possible.',
        description: 'Track real applications: company, role, stage, date, outcome. AI weekly plan reads upcoming interviews and adjusts recommendations.',
        why: 'The connection between preparation and outcome is what sustains motivation long-term. Currently there is no way to close this loop.',
        technicalNotes: 'InterviewApplication model. /interview-tracker kanban. AI weekly plan prioritizes based on nextInterviewAt + targetCompany.',
    },

    {
        id: 'ai-problem-scheduling',
        phase: 'SOMEDAY',
        theme: 'Content & Problems',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Automated Problem Generation (Auto-Pilot)',
        impact: 'Teams always have fresh, calibrated content without admin manual effort — the prep program runs itself.',
        description: 'Team Admins configure daily/weekly AI problem generation. AI adds N problems automatically based on team performance.',
        why: 'Removes admin burden. Teams stay engaged with fresh content. Mirrors structured interview prep programs.',
        technicalNotes: 'aiScheduleConfig JSON on Team. node-cron daily job → generateProblemsAI. UI toggle in Team Admin settings.',
    },

    {
        id: 'mobile-app',
        phase: 'SOMEDAY',
        theme: 'Growth & Onboarding',
        priority: 'LOW',
        effort: 'XLarge',
        title: 'Mobile App (Review + Quiz)',
        impact: 'Members can do their daily reviews and quizzes during commute, lunch, or any 5-10 minute window — dramatically increasing daily engagement.',
        description: 'React Native app focused on the two highest-frequency, low-friction activities: spaced repetition reviews and AI quizzes. Full platform stays on web.',
        why: 'Reviews and quizzes are the activities most suitable for mobile. They take 5-10 minutes and don\'t require a keyboard.',
        technicalNotes: 'React Native + Expo. Shares component logic with web where possible. Same JWT auth, same API endpoints. Scope: Review Queue + Quiz only.',
    },

    {
        id: 'problem-revisions',
        phase: 'SOMEDAY',
        theme: 'Correctness & Data',
        priority: 'LOW',
        effort: 'Medium',
        title: 'ProblemRevision Table (Full History)',
        impact: 'Admins can restore any old version of a problem statement. Complements the forward versioning we shipped — currently we know WHICH version was solved, but not WHAT each version said.',
        description: 'Per-edit snapshot of the Problem content, mirroring the SolutionAttempt pattern. Optional on LOAD; mandatory on every content edit.',
        why: 'Forward versioning is enough to flag drift; revision history is needed to audit what changed and roll back if an AI-generated edit goes sideways.',
        technicalNotes: 'ProblemRevision model. updateProblem appends a revision on content change. Admin UI to browse + restore.',
    },

    // ── BACKLOG — no committed timeline ─────────────────────────────────

    {
        id: 'shared-problem-definitions',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Shared Problem Definitions Across Teams',
        impact: 'At 50+ teams, duplicate problem storage is eliminated. Team A\'s admin notes on Two Sum benefit Team B.',
        description: 'Refactor Problem into ProblemDefinition (shared) + TeamProblem (team-specific). Embeddings computed once per definition.',
        why: 'Strategic refactor. High effort for current scale. Critical at scale.',
        technicalNotes: 'Migration: dedup → create TeamProblem rows, update FKs. TRIGGER: 50+ teams or measurable embedding storage.',
    },

    {
        id: 'screenshot-attachment-feedback',
        phase: 'BACKLOG',
        theme: 'Admin Experience',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Screenshot Attachment in Feedback Reports',
        impact: 'Members can show exactly what they\'re seeing when reporting a bug — cutting back-and-forth debugging time significantly.',
        description: 'Multi-image upload in FeedbackPage. Compressed before upload.',
        why: 'Bug reports without screenshots are often ambiguous.',
        technicalNotes: 'Storage decision: base64 vs object storage URL. screenshots JSON on FeedbackReport. File picker + compression in FeedbackPage.',
    },

    {
        id: 'redis-caching',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Redis Caching for Expensive Endpoints',
        impact: 'At 500+ active users, leaderboard and 6D report load times drop from 2-3s to under 100ms.',
        description: 'Cache platform analytics, leaderboard, 6D report. Currently not a bottleneck — relevant at scale.',
        why: 'Do this when it becomes measurable, not before.',
        technicalNotes: 'redis npm + REDIS_URL env. server/src/lib/cache.js. TTL: 5min analytics, 1min leaderboard.',
    },

    {
        id: 'typescript-migration',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'LOW',
        effort: 'XLarge',
        title: 'TypeScript Migration',
        impact: 'Entire class of runtime bugs caught at compile time. Onboarding new developers becomes dramatically faster.',
        description: 'Incremental JS → TS migration. Start with server utils, then controllers, then client hooks and stores.',
        why: 'Right move long-term. High effort. No user-facing impact.',
        technicalNotes: 'Rename .js → .ts one file at a time. Target: 100% TS in 3-6 months of incremental work.',
    },

    {
        id: 'bulk-problem-import',
        phase: 'BACKLOG',
        theme: 'Admin Experience',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Bulk Problem Import from Title List',
        impact: 'Coaches can bring years of curated problem sets into ProbSolver in minutes instead of hours.',
        description: '"Paste titles, one per line" → AI generates content for each → admin reviews and approves. Cap at 10 per session.',
        why: 'Serious team admins have existing problem sets. Import removes a significant onboarding barrier.',
        technicalNotes: 'Third tab in AddProblemPage. Reuses generateProblemContent + batchCreateProblems. Cap at 10 titles.',
    },

    {
        id: 'company-interview-pattern-tagging',
        phase: 'BACKLOG',
        theme: 'Content & Problems',
        priority: 'LOW',
        effort: 'Small',
        title: 'Company Interview Pattern Tagging with Stage Context',
        impact: 'AI coaching plans can say "this pattern appears in 80% of Google onsite rounds" instead of generic advice.',
        description: 'Add company+stage+frequency metadata to problem categoryData JSON.',
        why: 'Company-specific pattern knowledge is high-value. Encoding it in problem metadata makes AI coaching dramatically more targeted.',
        technicalNotes: 'categoryData JSON: companyPatterns array. ProblemForm "Company Stage Context" section. Read in solutionReviewPrompt + problemSelectionPrompt.',
    },
]
