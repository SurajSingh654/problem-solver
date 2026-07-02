/**
 * ENV CONFIG — Validates environment variables on startup.
 * The app crashes immediately with a clear message if
 * required variables are missing.
 */
import 'dotenv/config'


// ============================================================================
// ProbSolver v3.0 — Environment Configuration
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Single source of truth: Every env var is read here and exported
//    as a named constant. No other file reads process.env directly.
//    This makes it trivial to find what env vars the app needs,
//    and catches missing vars at startup rather than at runtime.
//
// 2. Validation at import time: If a required var is missing, the
//    process exits immediately with a clear error. Better to crash
//    on deploy than to serve requests that fail unpredictably.
//
// 3. Defaults only for non-sensitive values: PORT, NODE_ENV, and
//    feature flags have defaults. Secrets (JWT_SECRET, DATABASE_URL,
//    API keys) never have defaults — they must be set explicitly.
//
// 4. New vars for v3.0: SUPER_ADMIN_EMAIL/PASSWORD for seeding,
//    TEAM_MAX_MEMBERS default, AI rate limit per user.
//
// ============================================================================

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`\n❌ Missing required environment variable: ${name}\n`)
    process.exit(1)
  }
  return value
}

function optional(name, defaultValue) {
  return process.env[name] || defaultValue
}

// ── Server ───────────────────────────────────────────────────
export const PORT = parseInt(optional('PORT', '5000'), 10)
export const NODE_ENV = optional('NODE_ENV', 'development')
export const IS_PRODUCTION = NODE_ENV === 'production'
export const CLIENT_URL = optional('CLIENT_URL', 'http://localhost:5000')

// ── Database ─────────────────────────────────────────────────
export const DATABASE_URL = required('DATABASE_URL')

// ── Auth ─────────────────────────────────────────────────────
export const JWT_SECRET = required('JWT_SECRET')
export const JWT_EXPIRY = optional('JWT_EXPIRY', '7d')
export const JWT_REFRESH_EXPIRY = optional('JWT_REFRESH_EXPIRY', '30d')
export const BCRYPT_ROUNDS = parseInt(optional('BCRYPT_ROUNDS', '12'), 10)

// ── Email (Resend) ───────────────────────────────────────────
export const RESEND_API_KEY = optional('RESEND_API_KEY', '')
export const EMAIL_FROM = optional('EMAIL_FROM', 'ProbSolver <noreply@probsolver.com>')
export const EMAIL_ENABLED = !!RESEND_API_KEY

// ── OpenAI ───────────────────────────────────────────────────
// Model knobs are the single source of truth. Callers should import these
// constants instead of reading process.env directly. Three tiers:
//   AI_MODEL_FAST    — bulk surfaces (review, generation, coaching)
//   AI_MODEL_PRIMARY — default for any caller that doesn't pin a tier
//   AI_MODEL_PREMIUM — high-stakes outputs (readiness verdict, admin analysis)
// Legacy raw OPENAI_MODEL / OPENAI_MODEL_PREMIUM are accepted as fallbacks
// for one cycle so prod env files don't have to change in lock-step.
export const OPENAI_API_KEY = optional('OPENAI_API_KEY', '')
export const AI_ENABLED = !!OPENAI_API_KEY
export const AI_MODEL_FAST = optional('AI_MODEL_FAST', process.env.OPENAI_MODEL || 'gpt-4o-mini')
export const AI_MODEL_PRIMARY = optional('AI_MODEL_PRIMARY', 'gpt-4o')
export const AI_MODEL_PREMIUM = optional('AI_MODEL_PREMIUM', process.env.OPENAI_MODEL_PREMIUM || AI_MODEL_PRIMARY)
export const AI_EMBEDDING_MODEL = optional('AI_EMBEDDING_MODEL', 'text-embedding-3-small')
// Daily per-user AI request cap. AI_DAILY_LIMIT is the canonical name;
// AI_RATE_LIMIT_PER_DAY is the legacy name still read for backward compat.
//
// Default raised from 50 → 500: the auto-pipeline (review + note + flashcards
// + autotag) consumes ~4 calls per submission; combined with mock interview
// turns and quiz attempts a power-user can hit 50 in an afternoon. 500 is
// still cheap on gpt-4o-mini (~$0.50 / day at the cap) and gives room.
// Lower this in prod env vars if cost becomes a real signal.
export const AI_DAILY_LIMIT = parseInt(
  optional('AI_DAILY_LIMIT', process.env.AI_RATE_LIMIT_PER_DAY || '500'),
  10,
)
// Per-call hard ceiling on max_tokens. Existing legitimate callers ask for up
// to 8000 (batch problem generation); a misconfigured caller asking for 100k
// would silently inflate cost. The clamp inside aiComplete/aiStream enforces
// this regardless of caller intent.
export const AI_MAX_TOKENS_HARD_CAP = parseInt(
  optional('AI_MAX_TOKENS_HARD_CAP', '8000'),
  10,
)
// Per-HTTP-call timeout for the OpenAI SDK. Default is the SDK's 600s, which
// holds a Node worker for 10 minutes on a stuck request — at any modest
// concurrency one OAI degradation freezes the server. 30s covers all known
// completion latencies (verdict P95 ~12s) with headroom.
export const AI_REQUEST_TIMEOUT_MS = parseInt(
  optional('AI_REQUEST_TIMEOUT_MS', '30000'),
  10,
)

// ── Platform defaults ────────────────────────────────────────
export const TEAM_MAX_MEMBERS_DEFAULT = parseInt(optional('TEAM_MAX_MEMBERS_DEFAULT', '20'), 10)
export const JOIN_CODE_LENGTH = parseInt(optional('JOIN_CODE_LENGTH', '8'), 10)
export const INVITATION_EXPIRY_HOURS = parseInt(optional('INVITATION_EXPIRY_HOURS', '72'), 10)
export const VERIFICATION_CODE_EXPIRY_MINUTES = parseInt(optional('VERIFICATION_CODE_EXPIRY_MINUTES', '15'), 10)

// ── Super Admin seed ─────────────────────────────────────────
export const SUPER_ADMIN_EMAIL = optional('SUPER_ADMIN_EMAIL', 'admin@probsolver.com')
export const SUPER_ADMIN_PASSWORD = optional('SUPER_ADMIN_PASSWORD', '')

// ── Feature flags ────────────────────────────────────────────
export const ENABLE_COMPETITIONS = optional('ENABLE_COMPETITIONS', 'false') === 'true'
export const ENABLE_AI_PROBLEMS = optional('ENABLE_AI_PROBLEMS', 'true') === 'true'
// Team Teaching Sessions — peer-to-peer knowledge sharing. Default off
// while the feature is rolled out across phases P0–P5; flipped on in P6.
// In Client mirror: VITE_FEATURE_TEACHING_SESSIONS in client/.env.
export const FEATURE_TEACHING_SESSIONS = optional('FEATURE_TEACHING_SESSIONS', 'false') === 'true'
// Personal Notes + SM-2 Flashcards. Default off through P0–P6; flipped in P7.
// In Client mirror: VITE_FEATURE_NOTES_ENABLED in client/.env. The client
// Dockerfile must declare a matching ARG/ENV pair so the var reaches
// `vite build` — runtime Railway env vars do not auto-flow into ARGs.
export const FEATURE_NOTES_ENABLED = optional('FEATURE_NOTES_ENABLED', 'false') === 'true'
// Coding Pattern Mastery v2 — replaces the legacy "Pattern Recognition"
// formula (free pts for self-tagging) with a 5-state per-pattern mastery
// scheme + saturating-breadth scoring + dual tier gates (score AND
// per-mastery counts). When OFF, D1 falls through to the legacy formula
// and tier classification ignores masteryRequirements. Client mirror:
// VITE_FEATURE_PATTERN_MASTERY_V2.
export const FEATURE_PATTERN_MASTERY_V2 = optional('FEATURE_PATTERN_MASTERY_V2', 'false') === 'true'
// Solution Depth v2 — replaces the legacy "Solution Depth" formula
// (length-threshold theatre + free pts for self-confidence) with a
// 5-state per-solution machine: NONE → DOCUMENTED → EXPLAINED →
// DEFENDED → OWNED. Reads research-backed signals D2 currently ignores:
// solveMethod, follow-up answer scores, ReviewAttempt.recallText. Adds
// depth tier mastery gates (solutionsAtDefendedOrAbove, solutionsAtOwned).
// Independent rollout from D1's flag — flip separately. Client mirror:
// VITE_FEATURE_SOLUTION_DEPTH_V2 (must also be in client/Dockerfile ARG).
export const FEATURE_SOLUTION_DEPTH_V2 = optional('FEATURE_SOLUTION_DEPTH_V2', 'false') === 'true'
// Communication v2 — replaces the legacy if-else cascade (peer / AI-text /
// approach-length proxy) with source-tier ceiling scoring: written-only
// caps at 55, live mock signal lifts to 80, peer ratings unlock 100.
// Fixes the score-outside-CI bug (legacy CI used raw values; score used
// post-cap value — they disagreed). New CI is asymmetric: half-width from
// raw distribution, recentered at capped score, clamped at ceiling on
// upper side. Adds tier gates that require ≥1 mock with comm scores for
// Tier 2, ≥3 for FAANG. Independent rollout from D1/D2 — flip separately.
// Client mirror: VITE_FEATURE_COMMUNICATION_V2 (also in client/Dockerfile ARG).
export const FEATURE_COMMUNICATION_V2 = optional('FEATURE_COMMUNICATION_V2', 'false') === 'true'
// Optimization v2 — replaces the legacy length-threshold scoring (free pts
// for typing 20+ chars in bruteForce/optimizedApproach) with a per-solution
// 5-state machine: NONE → DOCUMENTED → OPTIMIZED → TRADE_OFF → OWNED.
// Reads research-backed signals D4 historically ignores: solveMethod
// (SAW_APPROACH caps at NONE), AI complexityCheck.{timeCorrect, spaceCorrect,
// optimizationNote}, bruteForceMeta.timeComplexity (with big-O normalizer
// for "O(n²)" vs "O(n^2)" equivalence), and ReviewAttempt-based retention
// for OWNED. Drops the legacy (avgAiCodeCorrectness/10)^0.6 multiplier
// (correctness now gates OPTIMIZED state transitions instead of multiplying
// the aggregate). Adds tier gates: tier2=4 TRADE_OFF + 2 OWNED, faang=10
// TRADE_OFF + 5 OWNED. Independent rollout from D1/D2/D3 — flip separately.
// Client mirror: VITE_FEATURE_OPTIMIZATION_V2 (also in client/Dockerfile ARG).
export const FEATURE_OPTIMIZATION_V2 = optional('FEATURE_OPTIMIZATION_V2', 'false') === 'true'
// Pressure Performance v2 — replaces the legacy quiz-dominant blend (0.4
// mock / 0.6 quiz, with quizzes alone capped at 75) with a source-tier
// ceiling architecture mirroring D3: quiz-proxy caps at 40, ≥1 mock with
// scores lifts to 80, ≥3 mocks (Anderson-Shackleton 1990 rater stability)
// unlocks 100. Mock signal weighted 0.7 vs quiz 0.3 (inverse of legacy).
// Critically, quizzes are subject-filtered via mapQuizSubjectToDimensions
// (Photography / Hindi / Physics excluded — only interview-relevant
// subjects count) and difficulty-weighted (HARD/MEDIUM/EASY 1.3/1.0/0.8).
// Fixes the score-outside-CI bug (legacy CI used raw quiz scores while
// score was capped/blended). Asymmetric CI clamp preserves variance.
// Independent rollout from D1/D2/D3/D4 — flip separately. Client mirror:
// VITE_FEATURE_PRESSURE_PERFORMANCE_V2 (also in client/Dockerfile ARG).
export const FEATURE_PRESSURE_PERFORMANCE_V2 = optional('FEATURE_PRESSURE_PERFORMANCE_V2', 'false') === 'true'
// Knowledge Retention v2 — STRICTLY ADDITIVE. The legacy D6 score formula
// (FSRS retrievability, Karpicke-Roediger 2008 cited in schema) is
// preserved verbatim — it's already research-backed. v2 adds:
//   - Tier mastery gates (tier3=5 attempts, tier2=10 + score≥60,
//     faang=25 + score≥75 + leech-rate≤0.20)
//   - Leech detection via lapseCount ≥ 8 (Anki convention from schema)
//   - Rule 13: high-confidence retention strengths hard-rejected when n<10
//     (Lange, Wang, Dunlosky 2013 small-sample reliability)
//   - retentionLeechRate uses INVERSE comparison (≤ rather than ≥) in
//     classifyReadiness — special-case for max-thresholds.
// Independent rollout from D1-D5 — flip separately. Client mirror:
// VITE_FEATURE_RETENTION_V2 (also in client/Dockerfile ARG).
export const FEATURE_RETENTION_V2 = optional('FEATURE_RETENTION_V2', 'false') === 'true'

// Teaching Contributions v2 — replaces the gameable v1 formula
// (30% volume × 50% avg-rating × 20% peer-learned-rate) with a
// source-tier ceiling architecture mirroring D3/D5:
//   - draft-only (ceiling 30): hosted, 0 peer ratings
//   - peer-validated (ceiling 70): ≥3 peer ratings
//   - stable-peer-cohort (ceiling 100): ≥5 ratings AND ≥3 sessions
//     (Topping 1996 peer-rating reliability + Anderson-Shackleton 1990)
// New sub-components:
//   - 0.55 avg_rating + 0.25 peer_learned_rate + 0.10 topic_coverage
//     + 0.10 saturating-volume (capped 10% so volume can't dominate)
// Tier gates:
//   - junior/tier3: opt-in (no gate beyond activation)
//   - tier2: 3 sessions + 5 ratings + score≥60
//   - faang: 5 sessions + 10 ratings + score≥75 + flag-rate≤0.10
// Verdict Rule 14: teaching strengths with peerRatingCount<3 → reject;
// <5 → must hedge (small-sample peer rating, Topping 1996).
// Independent rollout. Client mirror: VITE_FEATURE_TEACHING_CONTRIBUTIONS_V2
// (also in client/Dockerfile ARG).
export const FEATURE_TEACHING_CONTRIBUTIONS_V2 = optional('FEATURE_TEACHING_CONTRIBUTIONS_V2', 'false') === 'true'

// Design Aptitude (D8) — NEW dimension covering System Design + Low-Level
// Design practice via DesignSession data. Schema is fully built and AI
// evaluates each session across 10 dims (per designType) with PASS/PARTIAL/
// FAIL scenario validation; today none of that signal feeds the readiness
// report. Opt-in like D7 — only counts when user has hosted ≥1 completed
// design session, so coding-only users see byte-identical 7D reports.
//
// Source-tier ceilings (mirror D3/D5/D7):
//   - draft-only (30): completed session, no AI scenarios attempted
//   - scenario-tested (70): ≥3 evaluated scenarios across all sessions
//   - interviewer-paired (100): ≥1 INTERVIEW-mode session with a paired
//     completed InterviewSession debrief
//
// Sub-component blend:
//   0.50 × overallScore (the existing AI-rated 10-dim weighted score)
//   0.20 × scenarioResilience (PASS=100, PARTIAL=50, FAIL=0; avg)
//   0.15 × dimensionBreadth (low std-dev = uniform mastery; high = lopsided)
//   0.10 × phaseCompleteness (fraction of phases with ≥50 chars)
//   0.05 × interviewerSignal (INTERVIEW-mode debrief, if any)
//
// Tier gates: tier2 = 2 sessions + 5 scenarios + score≥60; FAANG = 5
// sessions + 15 scenarios + score≥75 + ≥1 interviewer-paired session.
//
// Verdict Rule 15: design strengths with sessionCount<3 must hedge
// (Schoenfeld 1985 — design competency needs repeated practice across
// problem types; small-n design score is not predictive).
//
// Independent rollout. Client mirror: VITE_FEATURE_DESIGN_APTITUDE
// (also in client/Dockerfile ARG).
export const FEATURE_DESIGN_APTITUDE = optional('FEATURE_DESIGN_APTITUDE', 'false') === 'true'

// Behavioral Performance (D9) — NEW dimension covering interview process
// signals, calibration, and HR/behavioral round content. Distinct from D5
// Pressure Performance (which measures technical output quality under
// time pressure) — D9 measures HOW the candidate conducts themselves
// (clarifying questions, narration, calibration, culture-style coverage,
// HR-round STAR content). Same source data (mocks) but different signals.
//
// Source-tier ceilings (mirror D3/D5/D7/D8):
//   - draft-only (30): no completed mocks; only HR text answers
//   - mock-validated (70): ≥3 mocks with debrief
//   - diversified (100): ≥5 mocks across ≥3 distinct interview styles
//
// Sub-component blend:
//   0.40 × verdict_score (STRONG_HIRE=100 .. NO_HIRE=20 avg)
//   0.25 × process_signals (clarifying questions + narration + edge cases
//                          + complexity + hint-management composite)
//   0.15 × calibration (|preSessionConfidence – verdict_band|;
//                       Kruger-Dunning 1999 self-assessment accuracy)
//   0.10 × hr_practice (HR Problem solutions, capped at 5)
//   0.10 × style_diversity (distinct interview styles, capped at 4)
//
// Tier gates: tier2 = 3 mocks + score≥60; FAANG = 5 mocks + ≥3 styles +
// score≥75 + calibrationDelta ≤ 1.5 (max-threshold key — third in the
// MAX_THRESHOLD_KEYS Set after retentionLeechRate + teachingFlagRate).
//
// Verdict Rule 16: behavioral strengths with mockCount<2 must hedge
// (Lievens & De Soete 2012 "Simulations" — single mock interview is a
// poor predictor; replication across rater contexts improves validity).
//
// Opt-in like D7/D8 — activates with ≥1 mock OR ≥3 HR solutions. Coding-
// only users see byte-identical reports without D9.
//
// Independent rollout. Client mirror: VITE_FEATURE_BEHAVIORAL_PERFORMANCE
// (also in client/Dockerfile ARG).
export const FEATURE_BEHAVIORAL_PERFORMANCE = optional('FEATURE_BEHAVIORAL_PERFORMANCE', 'false') === 'true'

// Verification & Meta-cognition (D10) — NEW BASELINE dimension (not
// opt-in). The strategic-memo's anchor recommendation: the durable
// LLM-era skill that AI tools cannot easily replace. Measures edge-case
// discovery quality, calibrated confidence, AI-output review skill,
// verification practices.
//
// Construct-validity decision: D2 / D4 / D9 already use these signals
// scattered as multipliers / state-transition gates / process signals.
// D10 extracts them as a first-class skill score so the user can see
// "your self-assessment is calibrated" or "you're systematically wrong
// about complexity" as a coherent meta-skill, not buried in other dims.
//
// Sub-component blend:
//   0.30 × calibration_accuracy  (Kruger-Dunning |conf/5 - codeCorrect/10|)
//   0.25 × complexity_verification (% solutions with timeCorrect && spaceCorrect)
//   0.20 × pattern_accuracy      (% AI reviews without wrongPattern flag)
//   0.15 × probe_defense         (% follow-up evaluations scoring ≥7)
//   0.10 × edge_case_independence (% mocks with foundEdgeCasesIndependently)
//
// Source tiers:
//   - proxy-only (40): ≥5 AI reviews, no follow-ups, no mocks
//   - multi-signal (75): ≥10 AI reviews + complexity verification data
//   - strong-signal (100): ≥10 AI reviews + ≥3 follow-up evaluations
//
// Tier gates: tier2 = score≥55 + ≥10 reviews; FAANG = score≥70 + ≥20
// reviews + ≥3 follow-ups + edge-case data.
//
// Verdict Rule 17: verification strengths with calibrationN<5 must hedge
// (Lange-Wang-Dunlosky 2013 small-sample calibration reliability —
// mirror of Rule 13's retention small-n logic).
//
// BASELINE (not opt-in): activates automatically once user has ≥5 AI-
// reviewed coding solutions. Same activation profile as D1-D6.
//
// Independent rollout. Client mirror: VITE_FEATURE_VERIFICATION_METACOGNITION
// (also in client/Dockerfile ARG).
export const FEATURE_VERIFICATION_METACOGNITION = optional('FEATURE_VERIFICATION_METACOGNITION', 'false') === 'true'

// MCP (Model Context Protocol) read-only server. Default OFF.
//
// When enabled, mounts a Streamable HTTP MCP endpoint at /mcp that lets
// MCP-compatible clients (Claude Code, Cursor, ChatGPT, VS Code, Continue)
// query the user's readiness data. Read-only by design — no submit_*,
// no mutations. See docs/AGENT_TOOLING_REFERENCE.md for the full design.
//
// Threat model: 15-threat audit covered in the same doc + the
// mcp-server-readonly roadmap entry. Defenses include:
//   - Bearer-token auth with separate mcp:read scope (not the web JWT)
//   - jti-based revocation list (RevokedMcpToken table)
//   - Origin header allowlist (DNS rebinding defense)
//   - HTTPS-only + HSTS (TLS downgrade defense)
//   - Per-user 60req/min + per-IP 600req/min rate limits
//   - 100KB max request body, 500KB max response, 10s per-tool timeout
//   - XML-tag wrap + HTML escape for all user content (prompt injection)
//   - req.teamId filter on every Prisma query (multi-tenancy)
//   - Pinned @modelcontextprotocol/sdk version (supply chain)
//
// Rollout: false default → super-admin canary → general availability.
export const FEATURE_MCP_ENABLED = optional('FEATURE_MCP_ENABLED', 'false') === 'true'

// MCP token expiry (in seconds). Default 24h. Caps the blast radius of a
// stolen token; users can regenerate from the settings page. Combined with
// always-on revocation, this is the primary defense against leaked tokens.
// Range: 3600 (1h) to 2592000 (30d).
export const MCP_TOKEN_EXPIRY_SECONDS = (() => {
  const raw = Number(optional('MCP_TOKEN_EXPIRY_SECONDS', '86400'))
  if (!Number.isFinite(raw) || raw < 3600 || raw > 2592000) {
    console.warn(`[env] MCP_TOKEN_EXPIRY_SECONDS out of range; using 86400 (24h)`)
    return 86400
  }
  return raw
})()

// MCP origin allowlist (comma-separated). Browser-launched clients send
// Origin headers; we reject anything not on this list to defend against
// DNS rebinding (per modelcontextprotocol.io/transports#security-warning).
// Desktop clients (Claude Code, Cursor) often send no Origin header at all,
// in which case bearer-token auth alone gates access.
//
// Default list reflects the public MCP-client ecosystem as of 2026-05.
// Add custom origins (your own integrations) by setting the env var.
export const MCP_ALLOWED_ORIGINS = (
  optional(
    'MCP_ALLOWED_ORIGINS',
    'https://claude.ai,https://claude.com,https://chatgpt.com,https://cursor.sh',
  ) || ''
).split(',').map((o) => o.trim()).filter(Boolean)

// Per-user AI rate-limit persistence backend.
//
// When "true" (case-insensitive), per-user AI daily rate-limit reads/writes
// go to Postgres (AiUsageDailyCounter table) instead of the in-process Map.
// Unblocks multi-replica deployments — a flipped flag is a safe rollout step
// once the code ships; default is "false" (zero behavior change on merge).
//
// Server-only flag — no client mirror needed (backend telemetry, not UI).
export const FEATURE_PERSIST_RATE_LIMITER =
  optional('FEATURE_PERSIST_RATE_LIMITER', 'false')

// Express-level rate-limit persistence backend.
//
// When "true" (case-insensitive), the 4 express-rate-limit limiters persist
// per-IP counters to Postgres via PrismaRateLimitStore (RateLimitCounter table)
// instead of the in-process MemoryStore. Unblocks multi-replica deploys — a
// flipped flag is a safe rollout step once the code ships; default is "false"
// (zero behavior change on merge).
//
// Server-only flag — no client mirror needed (backend infra, not UI).
export const FEATURE_PERSIST_MIDDLEWARE_LIMITER =
  optional('FEATURE_PERSIST_MIDDLEWARE_LIMITER', 'false')

// -- Feedback notification email (optional) ─────────────────────────────────────────
export const FEEDBACK_NOTIFICATION_EMAIL = process.env.FEEDBACK_NOTIFICATION_EMAIL || null