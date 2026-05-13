import { defineConfig } from 'vitest/config'

// ============================================================================
// Vitest config — offline tests only
// ============================================================================
//
// Tests must NOT hit OpenAI, Postgres, or any network resource. Stub
// dependencies; assert behavior. The server is ESM-native ("type": "module")
// so no transformer is needed.
//
// Layout:
//   server/test/ai/         — validators, fallbacks, service-level units
//   server/test/fixtures/   — golden inputs/outputs per AI surface
// ============================================================================
export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        environment: 'node',
        globals: false,
        clearMocks: true,
        restoreMocks: true,
    },
})
