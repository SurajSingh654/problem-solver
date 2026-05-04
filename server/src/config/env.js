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
export const OPENAI_API_KEY = optional('OPENAI_API_KEY', '')
export const AI_ENABLED = !!OPENAI_API_KEY
export const AI_MODEL_PRIMARY = optional('AI_MODEL_PRIMARY', 'gpt-4o')
export const AI_MODEL_FAST = optional('AI_MODEL_FAST', 'gpt-4o-mini')
export const AI_EMBEDDING_MODEL = optional('AI_EMBEDDING_MODEL', 'text-embedding-3-small')
export const AI_DAILY_LIMIT = parseInt(optional('AI_DAILY_LIMIT', '50'), 10)

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

// -- Feedback notification email (optional) ─────────────────────────────────────────
export const FEEDBACK_NOTIFICATION_EMAIL = process.env.FEEDBACK_NOTIFICATION_EMAIL || null