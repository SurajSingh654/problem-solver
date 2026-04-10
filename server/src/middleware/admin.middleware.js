/**
 * ADMIN MIDDLEWARE
 * Must be used AFTER requireAuth.
 * Rejects non-admin users with 403.
 */
import { forbiddenResponse } from '../utils/response.js'

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return forbiddenResponse(res, 'Admin access required')
  }
  next()
}