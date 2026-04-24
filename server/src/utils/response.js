// ============================================================================
// ProbSolver v3.0 — Response Helpers
// ============================================================================
//
// ENVELOPE CONTRACT:
//
// Success: { success: true, data: {...}, meta?: {...} }
// Error:   { success: false, error: { message, code?, requestId?, details? } }
//
// Error responses automatically include the request ID from req.requestId.
// This enables end-to-end tracing: client error toast → server logs.
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
 * Automatically includes requestId from the request object.
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
  const requestId = res.req?.requestId;

  const errorObj = { message };
  if (code) errorObj.code = code;
  if (requestId) errorObj.requestId = requestId;
  if (details) errorObj.details = details;

  // Log server errors with context
  if (statusCode >= 500) {
    console.error(`[${requestId || "no-id"}] ${statusCode} ${message}`, {
      url: res.req?.originalUrl,
      method: res.req?.method,
      userId: res.req?.user?.id,
    });
  }

  return res.status(statusCode).json({
    success: false,
    error: errorObj,
  });
}
