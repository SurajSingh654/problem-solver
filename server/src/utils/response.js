// ============================================================================
// ProbSolver v3.0 — Response Helpers
// ============================================================================

/**
 * Send a success response.
 *
 * @param {Response} res - Express response object
 * @param {Object} data - Response payload
 * @param {number} statusCode - HTTP status (default: 200)
 */
export function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    ...data,
  })
}

/**
 * Send an error response.
 *
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status (default: 400)
 * @param {string} code - Optional error code for frontend handling
 */
export function error(res, message, statusCode = 400, code = undefined) {
  const payload = {
    success: false,
    error: message,
  }

  if (code) {
    payload.code = code
  }

  return res.status(statusCode).json(payload)
}