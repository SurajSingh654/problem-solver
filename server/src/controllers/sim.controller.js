// ============================================================================
// ProbSolver v3.0 — Simulation Controller (Team-Scoped)
// ============================================================================
//
// SCOPING: Fully team-scoped. Sim sessions are created within a team
// context against team problems. The problem must belong to req.teamId.
//
// ============================================================================

import prisma from '../lib/prisma.js'
import { success, error } from '../utils/response.js'

// ============================================================================
// START SIMULATION
// ============================================================================

export async function startSim(req, res) {
  try {
    const teamId = req.teamId
    const userId = req.user.id
    const { problemId } = req.body

    // ── Verify problem belongs to team ─────────────────
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: {
        id: true,
        title: true,
        difficulty: true,
        category: true,
        description: true,
        categoryData: true,
        followUpQuestions: {
          orderBy: { order: 'asc' },
          select: { id: true, question: true, difficulty: true, hint: true },
        },
      },
    })

    if (!problem) {
      return error(res, 'Problem not found in your team.', 404)
    }

    // ── Create session ─────────────────────────────────
    const session = await prisma.simSession.create({
      data: {
        userId,
        teamId, // SCOPING
        problemId,
        startedAt: new Date(),
      },
      select: {
        id: true,
        startedAt: true,
      },
    })

    return success(res, {
      session: {
        id: session.id,
        startedAt: session.startedAt,
        problem,
      },
    }, 201)
  } catch (err) {
    console.error('Start sim error:', err)
    return error(res, 'Failed to start simulation.', 500)
  }
}

// ============================================================================
// COMPLETE SIMULATION
// ============================================================================

export async function completeSim(req, res) {
  try {
    const { sessionId } = req.params
    const userId = req.user.id
    const teamId = req.teamId
    const { score, hintsUsed, timeSpent } = req.body

    // ── Verify session ownership + team ────────────────
    const session = await prisma.simSession.findFirst({
      where: { id: sessionId, userId, teamId },
      select: { id: true, completed: true },
    })

    if (!session) {
      return error(res, 'Session not found.', 404)
    }

    if (session.completed) {
      return error(res, 'Session already completed.', 400)
    }

    const updated = await prisma.simSession.update({
      where: { id: sessionId },
      data: {
        score: score || 0,
        hintsUsed: hintsUsed || 0,
        timeSpent: timeSpent || null,
        completed: true,
        completedAt: new Date(),
      },
    })

    return success(res, { message: 'Simulation completed.', session: updated })
  } catch (err) {
    console.error('Complete sim error:', err)
    return error(res, 'Failed to complete simulation.', 500)
  }
}

// ============================================================================
// ABANDON SIMULATION
// ============================================================================

export async function abandonSim(req, res) {
  try {
    const { sessionId } = req.params
    const userId = req.user.id
    const teamId = req.teamId

    const session = await prisma.simSession.findFirst({
      where: { id: sessionId, userId, teamId },
      select: { id: true, completed: true, abandoned: true },
    })

    if (!session) {
      return error(res, 'Session not found.', 404)
    }

    if (session.completed || session.abandoned) {
      return error(res, 'Session already ended.', 400)
    }

    await prisma.simSession.update({
      where: { id: sessionId },
      data: { abandoned: true },
    })

    return success(res, { message: 'Simulation abandoned.' })
  } catch (err) {
    console.error('Abandon sim error:', err)
    return error(res, 'Failed to abandon simulation.', 500)
  }
}

// ============================================================================
// GET SIM HISTORY (team-scoped)
// ============================================================================

export async function getSimHistory(req, res) {
  try {
    const userId = req.user.id
    const teamId = req.teamId
    const { page = 1, limit = 20 } = req.query

    const where = { userId, teamId } // SCOPING

    const [sessions, total] = await Promise.all([
      prisma.simSession.findMany({
        where,
        include: {
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.simSession.count({ where }),
    ])

    return success(res, {
      sessions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (err) {
    console.error('Sim history error:', err)
    return error(res, 'Failed to fetch simulation history.', 500)
  }
}