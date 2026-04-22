// ============================================================================
// ProbSolver v3.0 — Slow Query Logger
// ============================================================================

const SLOW_QUERY_THRESHOLD_MS = 500;

export function setupQueryLogging(prisma) {
  if (process.env.NODE_ENV === "production") return;

  prisma.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const duration = Date.now() - start;

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(
        `🐌 SLOW QUERY (${duration}ms): ${params.model}.${params.action}`,
        params.args?.where
          ? `WHERE: ${JSON.stringify(params.args.where).substring(0, 100)}`
          : "",
      );
    }

    return result;
  });
}
