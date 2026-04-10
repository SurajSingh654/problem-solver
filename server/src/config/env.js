/**
 * ENV CONFIG — Validates environment variables on startup.
 * The app crashes immediately with a clear message if
 * required variables are missing.
 */
import 'dotenv/config'

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`)
    console.error(`   Add it to your server/.env file`)
    process.exit(1)
  }
  return value
}

function optional(name, defaultValue = '') {
  return process.env[name] || defaultValue
}

export const env = {
  PORT:           parseInt(optional('PORT', '5000')),
  NODE_ENV:       optional('NODE_ENV', 'development'),
  IS_DEV:         optional('NODE_ENV', 'development') === 'development',
  IS_PROD:        optional('NODE_ENV', 'development') === 'production',

  DATABASE_URL:   required('DATABASE_URL'),
  JWT_SECRET:     required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),
  ADMIN_PASSWORD: required('ADMIN_PASSWORD'),
  CLIENT_URL:     optional('CLIENT_URL', 'http://localhost:5173'),

  // AI integration — Phase 2
  AI_ENABLED:          optional('AI_ENABLED', 'false') === 'true',
  OPENAI_API_KEY:      optional('OPENAI_API_KEY', ''),
  OPENAI_MODEL:        optional('OPENAI_MODEL', 'gpt-4o-mini'),
  AI_RATE_LIMIT:       parseInt(optional('AI_RATE_LIMIT_PER_DAY', '20')),
}