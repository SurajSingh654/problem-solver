// ============================================================================
// ProbSolver v3.0 — Response Helpers
// ============================================================================
//
// ENVELOPE CONTRACT:
//
// Success: { success: true, data: {...}, meta?: {...} }
// Error:   { success: false, error: { message, code?, details? } }
//
// Every controller uses these helpers. Every client reads res.data.data
// for the payload. No exceptions.
//
// ============================================================================

/**
 * Send a success response with standardized envelope.
 *
 * @param {Response} res - Express response object
 * @param {Object} data - Response payload (wrapped under "data" key)
 * @param {number} statusCode - HTTP status (default: 200)
 * @param {Object} meta - Optional metadata (pagination, timestamps, etc.)
 */
export function success(res, data = {}, statusCode = 200, meta = undefined) {
  const envelope = {
    success: true,
    data,
  };
  if (meta) {
    envelope.meta = meta;
  }
  return res.status(statusCode).json(envelope);
}

/**
 * Send an error response with standardized envelope.
 *
 * @param {Response} res - Express response object
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status (default: 400)
 * @param {string} code - Optional machine-readable error code
 * @param {Array} details - Optional field-level validation errors
 */
export function error(
  res,
  message,
  statusCode = 400,
  code = undefined,
  details = undefined,
) {
  const errorObj = { message };
  if (code) errorObj.code = code;
  if (details) errorObj.details = details;
  return res.status(statusCode).json({
    success: false,
    error: errorObj,
  });
}
