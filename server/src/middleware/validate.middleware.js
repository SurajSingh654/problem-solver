// ============================================================================
// ProbSolver v3.0 — Validation Middleware
// ============================================================================

/**
 * Create a validation middleware from a Zod schema.
 * Validates req.body and replaces it with the parsed/transformed data.
 * Error format matches the standard envelope.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Express middleware
 */
export function validate(schema) {
  return (req, res, next) => {
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

    req.body = result.data;
    next();
  };
}
