// ============================================================================
// ProbSolver v3.0 — Validation Middleware
// ============================================================================
//
// Validates `req.body` against a Zod schema and replaces it with the parsed
// (and transformed) data. Error envelope matches the standard 4xx shape.
//
// Boundary-logging guard
// ──────────────────────
// Zod's default `.strip` mode silently removes unknown keys from the input.
// This is a SILENT data-loss class of bug: a client sends a field, the
// server returns 200, the field never lands in the DB. We hit this once
// (bruteForceMeta on Solution.update) and burned a day on it.
//
// In non-production, we compare the keys present *before* parse to the keys
// kept *after* parse and warn on any drop. The warning is grep-able by
// `[validate:stripped]` and includes route + method + the dropped keys, so
// the next time a schema drifts from a controller's allow-list the failure
// is loud at PR-test time instead of invisible in prod. We don't warn in
// production because the noise:signal is bad once legacy clients are
// calling deprecated payload shapes — the structural fix for prod is
// `.strict()` on schemas where unknown keys must be a hard error.
// ============================================================================

/**
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Express middleware
 */
export function validate(schema) {
  return (req, res, next) => {
    const before =
      req.body && typeof req.body === "object" ? Object.keys(req.body) : [];

    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          message: "Validation failed.",
          code: "VALIDATION_ERROR",
          details,
        },
      });
    }

    if (
      process.env.NODE_ENV !== "production" &&
      result.data &&
      typeof result.data === "object"
    ) {
      const after = new Set(Object.keys(result.data));
      const stripped = before.filter((k) => !after.has(k));
      if (stripped.length > 0) {
        const route = req.originalUrl || req.url;
        console.warn(
          `[validate:stripped] ${req.method} ${route} — keys removed by schema: ` +
            `${stripped.join(", ")}. If these are real fields, add them to the Zod schema.`,
        );
      }
    }

    req.body = result.data;
    next();
  };
}
