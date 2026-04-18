import prisma from '../lib/prisma.js'
import { successResponse } from '../utils/response.js'
import { isAIEnabled } from '../services/ai.service.js'

// ── GET /api/stats/showcase ────────────────────────────
export async function getShowcaseStats(req, res) {
  const totalUsers     = await prisma.user.count()
  const totalProblems  = await prisma.problem.count({ where: { isActive: true } })
  const totalSolutions = await prisma.solution.count()
  const totalQuizzes   = await prisma.quizAttempt.count()
  const totalSims      = await prisma.simSession.count()
  const totalReviews   = await prisma.clarityRating.count()

  // Category breakdown
  const problemsByCategory = {}
  const problems = await prisma.problem.findMany({
    where: { isActive: true },
    select: { category: true },
  })
  problems.forEach(p => {
    const cat = p.category || 'CODING'
    problemsByCategory[cat] = (problemsByCategory[cat] || 0) + 1
  })

  // Difficulty breakdown
  const problemsByDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 }
  const diffProblems = await prisma.problem.findMany({
    where: { isActive: true },
    select: { difficulty: true },
  })
  diffProblems.forEach(p => {
    problemsByDifficulty[p.difficulty] = (problemsByDifficulty[p.difficulty] || 0) + 1
  })

  // Solutions with AI feedback
  const aiReviewCount = await prisma.solution.count({
    where: { aiFeedback: { not: null } },
  })

  // Solutions with embeddings
  const embeddingCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM solutions WHERE embedding IS NOT NULL
  `)

  // Problems with embeddings
  const problemEmbeddingCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as count FROM problems WHERE embedding IS NOT NULL
  `)

  // Average confidence across all solutions
  const avgConf = await prisma.solution.aggregate({
    _avg: { confidenceLevel: true },
  })

  // Completed sims
  const completedSims = await prisma.simSession.count({
    where: { completed: true },
  })

  return successResponse(res, {
    // Core numbers
    totalUsers,
    totalProblems,
    totalSolutions,
    totalQuizzes,
    totalSims,
    totalReviews,
    completedSims,

    // Breakdowns
    problemsByCategory,
    problemsByDifficulty,

    // AI stats
    aiEnabled       : isAIEnabled(),
    aiReviewCount,
    embeddingCount  : Number(embeddingCount[0]?.count || 0),
    problemEmbeddings: Number(problemEmbeddingCount[0]?.count || 0),

    // Quality metrics
    avgConfidence   : Math.round((avgConf._avg.confidenceLevel || 0) * 10) / 10,

    // Tech info
    nodeVersion     : process.version,
    uptime          : Math.round(process.uptime()),
  })
}