// ============================================================================
// ProbSolver v3.0 — Problems Controller (Team-Scoped)
// ============================================================================
//
// SCOPING RULE: Every query includes `teamId: req.teamId`.
// No problem is ever returned without team context.
//
// DESIGN DECISIONS:
//
// 1. List problems: Always filtered by req.teamId. Supports category,
//    difficulty, search, and pagination. Hidden problems excluded
//    for members, visible to TEAM_ADMIN.
//
// 2. Create problem: Only TEAM_ADMIN (or AI system). The teamId is
//    injected from req.teamId — never from the request body.
//    This prevents a user from creating problems in another team.
//
// 3. Solved status: When listing problems, we join with Solution
//    to mark which ones the current user has solved. This avoids
//    N+1 queries — one query returns problems + solved indicators.
//
// 4. Vector search: For similar problems and recommendations,
//    we use pgvector with a WHERE team_id = ? filter. This scopes
//    semantic search to the team's problem set only.
//
// ============================================================================

import prisma from '../lib/prisma.js'
import { success, error } from '../utils/response.js'

// ============================================================================
// LIST PROBLEMS
// ============================================================================

export async function listProblems(req, res) {
  try {
    const teamId = req.teamId
    const userId = req.user.id
    const isAdmin = req.user.globalRole === 'SUPER_ADMIN' || req.user.teamRole === 'TEAM_ADMIN'

    const {
      category,
      difficulty,
      search,
      source,
      isPinned,
      isPublished,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query

    // ── Build WHERE clause ─────────────────────────────
    const where = { teamId }

    // Members only see published, non-hidden problems
    // Admins see everything
    if (!isAdmin) {
      where.isPublished = true
      where.isHidden = false
    } else {
      // Admins can filter by published status
      if (isPublished !== undefined) {
        where.isPublished = isPublished === 'true'
      }
    }

    if (category) where.category = category
    if (difficulty) where.difficulty = difficulty
    if (source) where.source = source
    if (isPinned === 'true') where.isPinned = true

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ]
    }

    // ── Build ORDER BY ─────────────────────────────────
    const orderBy = []
    // Pinned problems always first
    orderBy.push({ isPinned: 'desc' })
    // Then user's sort preference
    const validSortFields = ['createdAt', 'title', 'difficulty', 'category']
    if (validSortFields.includes(sortBy)) {
      orderBy.push({ [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' })
    }

    // ── Query with solved status ───────────────────────
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          difficulty: true,
          category: true,
          categoryData: true,
          tags: true,
          realWorldContext: true,
          source: true,
          isPublished: true,
          isPinned: true,
          isHidden: true,
          createdById: true,
          createdAt: true,
          createdBy: {
            select: { id: true, name: true },
          },
          _count: {
            select: {
              solutions: true,
              followUpQuestions: true,
            },
          },
          // Check if current user has solved this problem
          solutions: {
            where: { userId },
            select: { id: true, confidence: true },
            take: 1,
          },
        },
        orderBy,
        skip,
        take,
      }),
      prisma.problem.count({ where }),
    ])

    // ── Transform: add solved indicator ────────────────
    const enriched = problems.map((p) => {
      const userSolution = p.solutions[0] || null
      return {
        ...p,
        solutions: undefined, // Remove raw solutions array
        isSolved: !!userSolution,
        userConfidence: userSolution?.confidence || null,
        solutionCount: p._count.solutions,
        followUpCount: p._count.followUpQuestions,
      }
    })

    return success(res, {
      problems: enriched,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (err) {
    console.error('List problems error:', err)
    return error(res, 'Failed to fetch problems.', 500)
  }
}

// ============================================================================
// GET SINGLE PROBLEM
// ============================================================================

export async function getProblem(req, res) {
  try {
    const { problemId } = req.params
    const teamId = req.teamId
    const userId = req.user.id

    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId,
        teamId, // SCOPING: only find within this team
      },
      include: {
        followUpQuestions: {
          orderBy: { order: 'asc' },
        },
        createdBy: {
          select: { id: true, name: true },
        },
        _count: {
          select: { solutions: true },
        },
      },
    })

    if (!problem) {
      return error(res, 'Problem not found.', 404)
    }

    // ── Get user's solution if exists ──────────────────
    const userSolution = await prisma.solution.findFirst({
      where: { problemId, userId, teamId },
      select: { id: true, confidence: true, createdAt: true },
    })

    // ── Get team solutions count (for team view) ───────
    const teamSolutions = await prisma.solution.count({
      where: { problemId, teamId },
    })

    return success(res, {
      problem: {
        ...problem,
        isSolved: !!userSolution,
        userSolutionId: userSolution?.id || null,
        teamSolutionCount: teamSolutions,
      },
    })
  } catch (err) {
    console.error('Get problem error:', err)
    return error(res, 'Failed to fetch problem.', 500)
  }
}

// ============================================================================
// CREATE PROBLEM (TEAM_ADMIN)
// ============================================================================

export async function createProblem(req, res) {
  try {
    const teamId = req.teamId // SCOPING: injected by middleware
    const userId = req.user.id

    const {
      title,
      description,
      difficulty,
      category,
      categoryData,
      tags,
      realWorldContext,
      useCases,
      adminNotes,
      source,
      followUpQuestions,
    } = req.body

    const problem = await prisma.problem.create({
      data: {
        title,
        description,
        difficulty: difficulty || 'MEDIUM',
        category: category || 'CODING',
        categoryData: categoryData || null,
        tags: tags || [],
        realWorldContext: realWorldContext || null,
        useCases: useCases || null,
        adminNotes: adminNotes || null,
        source: source || 'MANUAL',
        isPublished: true,
        teamId, // SCOPING: always from middleware
        createdById: userId,
        followUpQuestions: followUpQuestions?.length
          ? {
              create: followUpQuestions.map((fq, index) => ({
                question: fq.question,
                difficulty: fq.difficulty || 'MEDIUM',
                hint: fq.hint || null,
                order: fq.order ?? index,
              })),
            }
          : undefined,
      },
      include: {
        followUpQuestions: { orderBy: { order: 'asc' } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    // ── Generate embedding in background ───────────────
    generateProblemEmbedding(problem.id).catch((err) => {
      console.error('Background embedding failed:', err.message)
    })

    return success(res, {
      message: 'Problem created.',
      problem,
    }, 201)
  } catch (err) {
    console.error('Create problem error:', err)
    return error(res, 'Failed to create problem.', 500)
  }
}

// ============================================================================
// UPDATE PROBLEM (TEAM_ADMIN)
// ============================================================================

export async function updateProblem(req, res) {
  try {
    const { problemId } = req.params
    const teamId = req.teamId

    // ── Verify problem belongs to this team ────────────
    const existing = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true },
    })

    if (!existing) {
      return error(res, 'Problem not found.', 404)
    }

    const {
      title,
      description,
      difficulty,
      category,
      categoryData,
      tags,
      realWorldContext,
      useCases,
      adminNotes,
      isPublished,
      isPinned,
      isHidden,
    } = req.body

    // Build update data — only include fields that were provided
    const data = {}
    if (title !== undefined) data.title = title
    if (description !== undefined) data.description = description
    if (difficulty !== undefined) data.difficulty = difficulty
    if (category !== undefined) data.category = category
    if (categoryData !== undefined) data.categoryData = categoryData
    if (tags !== undefined) data.tags = tags
    if (realWorldContext !== undefined) data.realWorldContext = realWorldContext
    if (useCases !== undefined) data.useCases = useCases
    if (adminNotes !== undefined) data.adminNotes = adminNotes
    if (isPublished !== undefined) data.isPublished = isPublished
    if (isPinned !== undefined) data.isPinned = isPinned
    if (isHidden !== undefined) data.isHidden = isHidden

    const problem = await prisma.problem.update({
      where: { id: problemId },
      data,
      include: {
        followUpQuestions: { orderBy: { order: 'asc' } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Re-generate embedding if content changed
    if (title || description) {
      generateProblemEmbedding(problem.id).catch(() => {})
    }

    return success(res, { message: 'Problem updated.', problem })
  } catch (err) {
    console.error('Update problem error:', err)
    return error(res, 'Failed to update problem.', 500)
  }
}

// ============================================================================
// DELETE PROBLEM (TEAM_ADMIN)
// ============================================================================

export async function deleteProblem(req, res) {
  try {
    const { problemId } = req.params
    const teamId = req.teamId

    const existing = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true },
    })

    if (!existing) {
      return error(res, 'Problem not found.', 404)
    }

    // Hard delete — cascades to solutions, follow-ups, sim sessions
    await prisma.problem.delete({ where: { id: problemId } })

    return success(res, { message: `"${existing.title}" deleted.` })
  } catch (err) {
    console.error('Delete problem error:', err)
    return error(res, 'Failed to delete problem.', 500)
  }
}

// ============================================================================
// TOGGLE PIN / HIDE (TEAM_ADMIN)
// ============================================================================

export async function toggleProblemFlag(req, res) {
  try {
    const { problemId } = req.params
    const { flag } = req.body // 'pin' or 'hide'
    const teamId = req.teamId

    const existing = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, isPinned: true, isHidden: true },
    })

    if (!existing) {
      return error(res, 'Problem not found.', 404)
    }

    const data = {}
    if (flag === 'pin') data.isPinned = !existing.isPinned
    if (flag === 'hide') data.isHidden = !existing.isHidden

    const updated = await prisma.problem.update({
      where: { id: problemId },
      data,
      select: { id: true, isPinned: true, isHidden: true },
    })

    return success(res, { message: 'Updated.', problem: updated })
  } catch (err) {
    console.error('Toggle flag error:', err)
    return error(res, 'Failed to update problem.', 500)
  }
}

// ============================================================================
// BACKGROUND: Generate embedding
// ============================================================================

async function generateProblemEmbedding(problemId) {
  try {
    const { AI_ENABLED } = await import('../config/env.js')
    if (!AI_ENABLED) return

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { title: true, description: true, tags: true, category: true },
    })

    if (!problem) return

    const text = [
      problem.title,
      problem.description || '',
      problem.tags?.join(', ') || '',
      problem.category,
    ].join(' ')

    const { generateEmbedding } = await import('../services/embedding.service.js')
    const embedding = await generateEmbedding(text)

    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`
      await prisma.$executeRawUnsafe(
        `UPDATE problems SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        problemId
      )
    }
  } catch (err) {
    console.error('Problem embedding error:', err.message)
  }
}