/**
 * VALIDATION MIDDLEWARE
 * Validates request body/query/params using Zod schemas.
 * Usage: validate(schema) as route middleware
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({
        body:   req.body,
        query:  req.query,
        params: req.params,
      })
      req.body   = parsed.body   || req.body
      req.query  = parsed.query  || req.query
      req.params = parsed.params || req.params
      next()
    } catch (err) {
      next(err)  // Caught by errorHandler (ZodError)
    }
  }
}