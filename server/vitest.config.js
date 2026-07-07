import { defineConfig } from 'vitest/config'

// ============================================================================
// Vitest config
// ============================================================================
//
// The server is ESM-native ("type": "module") so no transformer is needed.
//
// Layout:
//   server/test/ai/           — validators, fallbacks, service-level units
//   server/test/services/     — service-layer unit tests
//   server/test/controllers/  — controller-layer unit tests (mocked deps)
//   server/test/integration/  — real Postgres round-trips + Express handlers
//   server/test/fixtures/     — golden inputs/outputs per AI surface
//   server/test/mcp/          — MCP-tool tests
//   server/test/utils/        — util-fn unit tests
//   server/test/schemas/      — Zod schema tests
//   server/test/middleware/   — middleware unit tests
//
// ── Concurrency cap ────────────────────────────────────────────────────────
// The 20+ curriculum integration tests all hit the same Railway Postgres.
// Prisma's default connection_limit is `num_cpus * 2 + 1` — on a typical dev
// machine that's ~17. Vitest's default is one worker per file (up to CPU count),
// so peak concurrent connections = (files × queries-per-test × workers) which
// easily exceeds the pool. Symptoms: waitForWsEvent timeouts, "Test timed out
// in 5000ms" on trivial queries, intermittent 500s on fork transactions.
//
// Capping at 4 parallel files keeps peak Postgres load bounded while
// preserving most of the parallel speed-up. Sequential single-file runs
// (e.g., `vitest run <one-file>`) are unaffected.
// ============================================================================
export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        environment: 'node',
        globals: false,
        clearMocks: true,
        restoreMocks: true,
        // Run test/setup.js once per worker to bump Prisma's connection pool.
        setupFiles: ['./test/setup.js'],
        // Serialize test-file execution. The 20+ curriculum integration tests
        // all hit the same Railway Postgres and even with a bumped connection
        // pool, concurrent files race for pool slots + occasionally time out
        // on trivial queries. Wall-time cost: ~+40s on ~2min. Deterministic
        // passes are worth it.
        fileParallelism: false,
        // All integration tests hit the same Railway Postgres. Even at low
        // maxForks, concurrent tests race for the same connection pool and
        // occasionally time out on trivial queries. `singleFork: true` runs
        // every test file in one fork, effectively serialized — trades some
        // wall-time for deterministic passes. Wall time impact: ~+30s on
        // the ~2min full suite.
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
})
