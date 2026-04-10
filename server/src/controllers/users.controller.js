import prisma from '../lib/prisma.js'
import { successResponse, notFoundResponse } from '../utils/response.js'

function sanitizeUser(u) {
  const { passwordHash, ...safe } = u
  return {
    ...safe,
    targetCompanies: JSON.parse(safe.targetCompanies || '[]'),
    preferences    : JSON.parse(safe.preferences     || '{}'),
  }
}

// ── GET /api/users ─────────────────────────────────────
export async function getUsers(req, res) {
  const users = await prisma.user.findMany({
    select: {
      id          : true,
      username    : true,
      avatarColor : true,
      role        : true,
      streak      : true,
      longestStreak: true,
      joinedAt    : true,
      currentLevel: true,
      targetCompanies: true,
      _count: {
        select: { solutions: true, simSessions: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  })

  return successResponse(res, users.map(u => ({
    ...u,
    targetCompanies: JSON.parse(u.targetCompanies || '[]'),
    solutionCount  : u._count.solutions,
    simCount       : u._count.simSessions,
  })))
}


// ── GET /api/users/:username ───────────────────────────
export async function getUserByUsername(req, res) {
  const { username } = req.params

  const user = await prisma.user.findUnique({
    where  : { username },
    include: {
      solutions: {
        include: {
          problem: {
            select: {
              id: true, title: true,
              difficulty: true, tags: true,
            },
          },
        },
        orderBy: { solvedAt: 'desc' },
      },
      _count: {
        select: { solutions: true, simSessions: true },
      },
    },
  })

  if (!user) return notFoundResponse(res, 'User')

  const sanitized = sanitizeUser(user)
  return successResponse(res, {
    ...sanitized,
    solutions: sanitized.solutions?.map(s => ({
      ...s,
      followUpAnswers: JSON.parse(s.followUpAnswers || '[]'),
      reviewDates    : JSON.parse(s.reviewDates     || '[]'),
      problem        : {
        ...s.problem,
        tags: JSON.parse(s.problem.tags || '[]'),
      },
    })),
    solutionCount: user._count.solutions,
    simCount     : user._count.simSessions,
  })
}