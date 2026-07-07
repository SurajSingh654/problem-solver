import { defineConfig } from 'vitest/config'

// ============================================================================
// Vitest config — UNIT tests only (fast, parallel, no Postgres)
// ============================================================================
//
// Runs everything OUTSIDE test/integration. These are:
//   test/ai/         — validators, fallbacks, service-level units
//   test/config/     — env-check unit tests
//   test/controllers/ — controller-level units (mocked deps)
//   test/mcp/        — MCP-tool tests
//   test/middleware/ — middleware unit tests
//   test/schemas/    — Zod schema tests
//   test/services/   — service-layer unit tests
//   test/utils/      — util-fn unit tests
//
// These tests do NOT hit real Postgres or make network calls, so they run
// safely in parallel with no rate-limit concerns. No `setupFiles` needed —
// no DATABASE_URL to bump.
//
// See vitest.config.js for the integration-tests-only config that runs
// serially against the real Postgres.
// ============================================================================
export default defineConfig({
    test: {
        include: [
            'test/ai/**/*.test.js',
            'test/config/**/*.test.js',
            'test/controllers/**/*.test.js',
            'test/mcp/**/*.test.js',
            'test/middleware/**/*.test.js',
            'test/schemas/**/*.test.js',
            'test/services/**/*.test.js',
            'test/utils/**/*.test.js',
        ],
        environment: 'node',
        globals: false,
        clearMocks: true,
        restoreMocks: true,
    },
})
