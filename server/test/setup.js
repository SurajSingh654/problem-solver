// ============================================================================
// Vitest global setup — runs BEFORE any test file's module code
// ============================================================================
//
// Bumps the Prisma connection pool for the test-time DATABASE_URL. Prisma's
// default `connection_limit` = `num_cpus * 2 + 1` (~17 on a typical dev box),
// which is not enough headroom for 20+ curriculum integration tests all
// hitting the same Railway Postgres. Symptoms:
//   • "Test timed out in 5000ms" on trivial `runValidator` unit-style tests
//   • `waitForWsEvent timed out` in signals-and-ws (fire-and-forget queue backs up)
//   • Fork transactions returning 500 under load
//
// The `connection_limit=30&pool_timeout=30` values are conservative — Railway
// Postgres accepts up to ~100 concurrent connections on the plan tier; 30 gives
// us slack while other developers can still work.
//
// This runs before Prisma imports its DATABASE_URL, so mutating process.env
// here does propagate to the client. Setup runs once per worker fork.
// ============================================================================

if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('connection_limit')) {
    const url = new URL(process.env.DATABASE_URL);
    if (!url.searchParams.has('connection_limit')) {
        url.searchParams.set('connection_limit', '30');
    }
    if (!url.searchParams.has('pool_timeout')) {
        url.searchParams.set('pool_timeout', '30');
    }
    process.env.DATABASE_URL = url.toString();
}
