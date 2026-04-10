/**
 * AUTH MIDDLEWARE
 * Verifies JWT token on protected routes.
 * Attaches req.user for use in controllers.
 */
import { verifyToken } from '../lib/jwt.js'
import prisma from '../lib/prisma.js'
import { unauthorizedResponse } from '../utils/response.js'

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      return unauthorizedResponse(res, 'No token provided')
    }

    const token   = authHeader.split(' ')[1]
    const decoded = verifyToken(token)

    // Fetch fresh user from DB to get current role
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id:           true,
        username:     true,
        email:        true,
        role:         true,
        avatarColor:  true,
        currentLevel: true,
      },
    })

    if (!user) {
      return unauthorizedResponse(res, 'User not found')
    }

    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}