// ============================================================================
// ProbSolver v3.0 — Validation Middleware
// ============================================================================

/**
 * Create a validation middleware from a Zod schema.
 * Validates req.body and replaces it with the parsed/transformed data.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Express middleware
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))

      return res.status(400).json({
        success: false,
        error: 'Validation failed.',
        details: errors,
      })
    }

    // Replace body with parsed/transformed data
    req.body = result.data
    next()
  }
}