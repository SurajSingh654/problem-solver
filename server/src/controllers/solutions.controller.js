// ============================================================================
// ProbSolver v3.0 — Solutions Controller (Team-Scoped)
// ============================================================================
//
// SCOPING: Every solution belongs to a team. When a team member
// submits a solution, it's tagged with req.teamId. When listing
// solutions (for a problem or for a user), we always filter by team.
//
// RAG CONTEXT: The AI review fetches similar solutions from the SAME
// team only — this is the multi-tenant RAG isolation.
//
// ============================================================================

import prisma from '../lib/prisma.js'
import { success, error } from '../utils/response.js'

// ============================================================================
// SUBMIT SOLUTION
// ============================================================================

export async function submitSolution(req, res) {
  try {
    const teamId = req.teamId
    const userId = req.user.id
    const { problemId } = req.params

    // ── Verify problem belongs to this team ────────────
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true },
    })

    if (!problem) {
      return error(res, 'Problem not found in your team.', 404)
    }

    // ── Check for existing solution ────────────────────
    const existing = await prisma.solution.findUnique({
      where: {
        userId_problemId_teamId: { userId, problemId, teamId },
      },
      select: { id: true },
    })

    if (existing) {
      return error(res, 'You have already submitted a solution. Use the update endpoint.', 409)
    }

    const {
      approach,
      code,
      language,
      bruteForce,
      optimizedApproach,
      timeComplexity,
      spaceComplexity,
      keyInsight,
      feynmanExplanation,
      realWorldConnection,
      confidence,
      pattern,
      patternIdentificationTime,
    } = req.body

    // ── Calculate spaced repetition dates ──────────────
    const now = new Date()
    const reviewDays = [1, 3, 7, 14, 30]
    const reviewDates = reviewDays.map((d) => {
      const date = new Date(now)
      date.setDate(date.getDate() + d)
      return date.toISOString()
    })

    const solution = await prisma.solution.create({
      data: {
        problemId,
        userId,
        teamId, // SCOPING: always from middleware
        approach,
        code,
        language,
        bruteForce,
        optimizedApproach,
        timeComplexity,
        spaceComplexity,
        keyInsight,
        feynmanExplanation,
        realWorldConnection,
        confidence: confidence || 3,
        pattern,
        patternIdentificationTime,
        reviewDates: reviewDates,
        nextReviewDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // +1 day
      },
      include: {
        problem: { select: { id: true, title: true, category: true } },
        user: { select: { id: true, name: true } },
      },
    })

    // ── Update user streak ─────────────────────────────
    updateStreak(userId).catch(() => {})

    // ── Generate embedding in background ───────────────
    generateSolutionEmbedding(solution.id).catch(() => {})

    return success(res, { message: 'Solution submitted.', solution }, 201)
  } catch (err) {
    console.error('Submit solution error:', err)
    return error(res, 'Failed to submit solution.', 500)
  }
}

// ============================================================================
// GET SOLUTIONS FOR A PROBLEM (team-scoped)
// ============================================================================

export async function getProblemSolutions(req, res) {
  try {
    const { problemId } = req.params
    const teamId = req.teamId
    const userId = req.user.id

    // ── Verify problem belongs to team ─────────────────
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true },
    })

    if (!problem) {
      return error(res, 'Problem not found.', 404)
    }

    // ── Fetch all team solutions for this problem ──────
    const solutions = await prisma.solution.findMany({
      where: {
        problemId,
        teamId, // SCOPING: only this team's solutions
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        clarityRatings: {
          select: { rating: true, raterId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // ── Enrich with clarity rating info ────────────────
    const enriched = solutions.map((s) => {
      const ratings = s.clarityRatings || []
      const avgClarity = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        : null
      const userRating = ratings.find((r) => r.raterId === userId)

      return {
        ...s,
        clarityRatings: undefined,
        avgClarityRating: avgClarity ? Math.round(avgClarity * 10) / 10 : null,
        totalRatings: ratings.length,
        userClarityRating: userRating?.rating || null,
        isOwn: s.userId === userId,
      }
    })

    return success(res, {
      problem: { id: problem.id, title: problem.title },
      solutions: enriched,
      count: enriched.length,
    })
  } catch (err) {
    console.error('Get problem solutions error:', err)
    return error(res, 'Failed to fetch solutions.', 500)
  }
}

// ============================================================================
// GET USER'S SOLUTIONS (within team)
// ============================================================================

export async function getUserSolutions(req, res) {
  try {
    const teamId = req.teamId
    const targetUserId = req.params.userId || req.user.id
    const { page = 1, limit = 20 } = req.query

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const [solutions, total] = await Promise.all([
      prisma.solution.findMany({
        where: {
          userId: targetUserId,
          teamId, // SCOPING
        },
        include: {
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.solution.count({
        where: { userId: targetUserId, teamId },
      }),
    ])

    return success(res, {
      solutions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (err) {
    console.error('Get user solutions error:', err)
    return error(res, 'Failed to fetch solutions.', 500)
  }
}

// ============================================================================
// UPDATE SOLUTION
// ============================================================================

export async function updateSolution(req, res) {
  try {
    const { solutionId } = req.params
    const teamId = req.teamId
    const userId = req.user.id

    // ── Verify ownership AND team scope ────────────────
    const existing = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: { id: true },
    })

    if (!existing) {
      return error(res, 'Solution not found.', 404)
    }

    const data = {}
    const fields = [
      'approach', 'code', 'language', 'bruteForce', 'optimizedApproach',
      'timeComplexity', 'spaceComplexity', 'keyInsight', 'feynmanExplanation',
      'realWorldConnection', 'confidence', 'pattern', 'patternIdentificationTime',
    ]

    fields.forEach((field) => {
      if (req.body[field] !== undefined) data[field] = req.body[field]
    })

    const solution = await prisma.solution.update({
      where: { id: solutionId },
      data,
      include: {
        problem: { select: { id: true, title: true } },
      },
    })

    // Re-generate embedding if content changed
    if (data.approach || data.code || data.keyInsight) {
      generateSolutionEmbedding(solution.id).catch(() => {})
    }

    return success(res, { message: 'Solution updated.', solution })
  } catch (err) {
    console.error('Update solution error:', err)
    return error(res, 'Failed to update solution.', 500)
  }
}

// ============================================================================
// RATE SOLUTION CLARITY (team members rate each other)
// ============================================================================

export async function rateSolutionClarity(req, res) {
  try {
    const { solutionId } = req.params
    const { rating } = req.body
    const teamId = req.teamId
    const raterId = req.user.id

    // ── Verify solution is in this team ────────────────
    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, teamId },
      select: { id: true, userId: true },
    })

    if (!solution) {
      return error(res, 'Solution not found.', 404)
    }

    // Can't rate own solution
    if (solution.userId === raterId) {
      return error(res, 'You cannot rate your own solution.', 400)
    }

    // Upsert rating
    const clarityRating = await prisma.clarityRating.upsert({
      where: {
        raterId_solutionId: { raterId, solutionId },
      },
      create: {
        solutionId,
        raterId,
        teamId,
        rating,
      },
      update: {
        rating,
      },
    })

    return success(res, { message: 'Rating saved.', rating: clarityRating })
  } catch (err) {
    console.error('Rate clarity error:', err)
    return error(res, 'Failed to save rating.', 500)
  }
}

// ============================================================================
// REVIEW QUEUE (spaced repetition — team-scoped)
// ============================================================================

export async function getReviewQueue(req, res) {
  try {
    const teamId = req.teamId
    const userId = req.user.id

    const now = new Date()

    const dueReviews = await prisma.solution.findMany({
      where: {
        userId,
        teamId, // SCOPING
        nextReviewDate: { lte: now },
      },
      include: {
        problem: {
          select: { id: true, title: true, difficulty: true, category: true },
        },
      },
      orderBy: { nextReviewDate: 'asc' },
    })

    const upcoming = await prisma.solution.findMany({
      where: {
        userId,
        teamId,
        nextReviewDate: { gt: now },
      },
      select: {
        id: true,
        nextReviewDate: true,
        problem: {
          select: { id: true, title: true, difficulty: true },
        },
      },
      orderBy: { nextReviewDate: 'asc' },
      take: 10,
    })

    return success(res, {
      due: dueReviews,
      dueCount: dueReviews.length,
      upcoming,
    })
  } catch (err) {
    console.error('Review queue error:', err)
    return error(res, 'Failed to fetch review queue.', 500)
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function updateStreak(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSolvedAt: true, streak: true },
  })

  if (!user) return

  const now = new Date()
  const lastSolved = user.lastSolvedAt
  let newStreak = user.streak

  if (!lastSolved) {
    newStreak = 1
  } else {
    const diffHours = (now - lastSolved) / (1000 * 60 * 60)
    if (diffHours < 48) {
      newStreak = user.streak + 1
    } else {
      newStreak = 1 // Streak broken
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { streak: newStreak, lastSolvedAt: now },
  })
}

async function generateSolutionEmbedding(solutionId) {
  try {
    const { AI_ENABLED } = await import('../config/env.js')
    if (!AI_ENABLED) return

    const solution = await prisma.solution.findUnique({
      where: { id: solutionId },
      select: {
        approach: true,
        code: true,
        keyInsight: true,
        pattern: true,
        problem: { select: { title: true } },
      },
    })

    if (!solution) return

    const text = [
      solution.problem?.title || '',
      solution.approach || '',
      solution.keyInsight || '',
      solution.pattern || '',
      solution.code ? solution.code.substring(0, 500) : '',
    ].join(' ')

    const { generateEmbedding } = await import('../services/embedding.service.js')
    const embedding = await generateEmbedding(text)

    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE solutions SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        solutionId
      )
    }
  } catch (err) {
    console.error('Solution embedding error:', err.message)
  }
}