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

// -- Feedback notification email (optional) ─────────────────────────────────────────
export const FEEDBACK_NOTIFICATION_EMAIL = process.env.FEEDBACK_NOTIFICATION_EMAIL || null