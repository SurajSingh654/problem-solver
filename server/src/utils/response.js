/**
 * STANDARD API RESPONSE HELPERS
 * Every API response uses these helpers for consistency.
 *
 * Success: { success: true,  data: {...},    message: '...' }
 * Error:   { success: false, error: '...',   code: '...' }
 */

export function successResponse(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  })
}

export function createdResponse(res, data, message = 'Created') {
  return successResponse(res, data, message, 201)
}

export function errorResponse(res, message, statusCode = 400, code = null) {
  const body = { success: false, error: message }
  if (code) body.code = code
  return res.status(statusCode).json(body)
}

export function notFoundResponse(res, resource = 'Resource') {
  return errorResponse(res, `${resource} not found`, 404, 'NOT_FOUND')
}

export function unauthorizedResponse(res, message = 'Unauthorized') {
  return errorResponse(res, message, 401, 'UNAUTHORIZED')
}

export function forbiddenResponse(res, message = 'Forbidden') {
  return errorResponse(res, message, 403, 'FORBIDDEN')
}

export function validationErrorResponse(res, errors) {
  return res.status(422).json({
    success: false,
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    errors,
  })
}