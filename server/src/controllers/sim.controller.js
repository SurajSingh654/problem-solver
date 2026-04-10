import prisma from "../lib/prisma.js";
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  forbiddenResponse,
} from "../utils/response.js";

// ── POST /api/sim/start ────────────────────────────────
// Creates a new sim session and returns it with problem data
export async function startSession(req, res) {
  const { problemId, timeLimitSecs = 2700 } = req.body;
  const userId = req.user.id;

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      followUps: { orderBy: { order: "asc" } },
    },
  });
  if (!problem) return notFoundResponse(res, "Problem");

  const session = await prisma.simSession.create({
    data: {
      userId,
      problemId,
      timeLimitSecs,
    },
    include: {
      user: { select: { username: true, avatarColor: true } },
    },
  });

  return createdResponse(
    res,
    {
      session,
      problem: {
        ...problem,
        tags: JSON.parse(problem.tags || "[]"),
        companyTags: JSON.parse(problem.companyTags || "[]"),
        useCases: JSON.parse(problem.useCases || "[]"),
        aiHints: JSON.parse(problem.aiHints || "[]"),
        followUps: problem.followUps,
      },
    },
    "Simulation started",
  );
}

// ── PATCH /api/sim/:id/hint ────────────────────────────
// Record that a hint was used and at what time
export async function useHint(req, res) {
  const { id } = req.params;
  const { hintUsedAtSecs } = req.body;
  const userId = req.user.id;

  const session = await prisma.simSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Session");
  if (session.userId !== userId)
    return forbiddenResponse(res, "Not your session");

  const updated = await prisma.simSession.update({
    where: { id },
    data: {
      hintUsed: true,
      hintUsedAtSecs: hintUsedAtSecs || null,
    },
  });
  return successResponse(res, updated, "Hint recorded");
}

// ── PATCH /api/sim/:id/complete ────────────────────────
// Mark session complete and save post-sim assessment
export async function completeSession(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const {
    timeUsedSecs,
    approachScore,
    communicationScore,
    overallScore,
    whatWentWell,
    whatToImprove,
  } = req.body;

  const session = await prisma.simSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Session");
  if (session.userId !== userId)
    return forbiddenResponse(res, "Not your session");

  const updated = await prisma.simSession.update({
    where: { id },
    data: {
      completed: true,
      timeUsedSecs: timeUsedSecs || null,
      approachScore: approachScore || null,
      communicationScore: communicationScore || null,
      overallScore: overallScore || null,
      whatWentWell: whatWentWell || null,
      whatToImprove: whatToImprove || null,
    },
  });
  return successResponse(res, updated, "Session completed");
}

// ── PATCH /api/sim/:id/abandon ─────────────────────────
// Abandon a session without completing assessment
export async function abandonSession(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { timeUsedSecs } = req.body;

  const session = await prisma.simSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Session");
  if (session.userId !== userId)
    return forbiddenResponse(res, "Not your session");

  const updated = await prisma.simSession.update({
    where: { id },
    data: {
      completed: false,
      timeUsedSecs: timeUsedSecs || null,
    },
  });
  return successResponse(res, updated, "Session abandoned");
}

// ── GET /api/sim/my ────────────────────────────────────
// All sim sessions for the current user
export async function getMySessions(req, res) {
  const userId = req.user.id;

  const sessions = await prisma.simSession.findMany({
    where: { userId },
    orderBy: { simulatedAt: "desc" },
  });

  // Enrich with problem titles
  const problemIds = [...new Set(sessions.map((s) => s.problemId))];
  const problems = await prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, title: true, difficulty: true, source: true },
  });
  const problemMap = Object.fromEntries(problems.map((p) => [p.id, p]));

  return successResponse(
    res,
    sessions.map((s) => ({
      ...s,
      problem: problemMap[s.problemId] || null,
    })),
  );
}

// ── GET /api/sim/:id ───────────────────────────────────
// Single session by id
export async function getSession(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const session = await prisma.simSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Session");
  if (session.userId !== userId)
    return forbiddenResponse(res, "Not your session");

  const problem = await prisma.problem.findUnique({
    where: { id: session.problemId },
    select: {
      id: true,
      title: true,
      difficulty: true,
      source: true,
      sourceUrl: true,
    },
  });

  return successResponse(res, { ...session, problem });
}
