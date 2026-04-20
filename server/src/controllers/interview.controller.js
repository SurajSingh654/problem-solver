/**
 * INTERVIEW CONTROLLER — REST endpoints for session management
 * WebSocket handles real-time chat. REST handles CRUD.
 */
import prisma from "../lib/prisma.js";
import {
  getPhaseConfig,
  getCompanyPersona,
} from "../services/interview.phases.js";
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from "../utils/response.js";

import { generateDebrief } from "../services/interview.engine.js";

// ── POST /api/interview/start ──────────────────────────
export async function startInterviewSession(req, res) {
  const userId = req.user.id;
  const { problemId, company, duration, category } = req.body;

  // Validate problem if provided
  let problem = null;
  if (problemId) {
    problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, title: true, category: true, difficulty: true },
    });
    if (!problem) return notFoundResponse(res, "Problem");
  }

  const effectiveCategory = category || problem?.category || "CODING";
  const effectiveDuration = duration || 2700;

  // Get phase config
  const phaseConfig = getPhaseConfig(effectiveCategory, effectiveDuration);

  // Get company persona
  const persona = getCompanyPersona(company);

  // Create session
  const session = await prisma.interviewSession.create({
    data: {
      userId,
      problemId: problemId || null,
      company: company || null,
      category: effectiveCategory,
      duration: effectiveDuration,
      phases: JSON.stringify(phaseConfig.phases),
      status: "ACTIVE",
    },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          category: true,
          description: true,
          tags: true,
          companyTags: true,
        },
      },
    },
  });

  // Create initial system message
  await prisma.interviewMessage.create({
    data: {
      sessionId: session.id,
      role: "system",
      content: `Interview session started. Category: ${effectiveCategory}. Duration: ${effectiveDuration}s. Company: ${company || "General"}.`,
      phase: phaseConfig.phases[0]?.name || "Start",
    },
  });

  return createdResponse(
    res,
    {
      session: {
        ...session,
        phases: phaseConfig.phases,
        problem: session.problem
          ? {
              ...session.problem,
              tags: JSON.parse(session.problem.tags || "[]"),
              companyTags: JSON.parse(session.problem.companyTags || "[]"),
            }
          : null,
      },
      persona,
      phaseConfig,
    },
    "Interview session created",
  );
}

// ── GET /api/interview/:id ─────────────────────────────
export async function getInterviewSession(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const session = await prisma.interviewSession.findUnique({
    where: { id },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          category: true,
          description: true,
          tags: true,
          companyTags: true,
          realWorldContext: true,
          followUps: {
            orderBy: { order: "asc" },
            select: { question: true, difficulty: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!session) return notFoundResponse(res, "Interview session");
  if (session.userId !== userId)
    return errorResponse(res, "Not your session", 403);

  return successResponse(res, {
    ...session,
    phases: JSON.parse(session.phases || "[]"),
    workspace: JSON.parse(session.workspace || "{}"),
    debrief: session.debrief ? JSON.parse(session.debrief) : null,
    problem: session.problem
      ? {
          ...session.problem,
          tags: JSON.parse(session.problem.tags || "[]"),
          companyTags: JSON.parse(session.problem.companyTags || "[]"),
        }
      : null,
  });
}

// ── GET /api/interview/my-sessions ─────────────────────
export async function getMySessions(req, res) {
  const userId = req.user.id;

  const sessions = await prisma.interviewSession.findMany({
    where: { userId },
    include: {
      problem: {
        select: { id: true, title: true, difficulty: true, category: true },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  return successResponse(
    res,
    sessions.map((s) => ({
      ...s,
      phases: JSON.parse(s.phases || "[]"),
      debrief: s.debrief ? JSON.parse(s.debrief) : null,
      problem: s.problem
        ? {
            ...s.problem,
            tags:
              typeof s.problem.tags === "string"
                ? JSON.parse(s.problem.tags || "[]")
                : s.problem.tags,
          }
        : null,
      messageCount: s._count.messages,
    })),
  );
}

// ── PATCH /api/interview/:id/end ───────────────────────
export async function endInterviewSession(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const session = await prisma.interviewSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Interview session");
  if (session.userId !== userId)
    return errorResponse(res, "Not your session", 403);

  const updated = await prisma.interviewSession.update({
    where: { id },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });

  return successResponse(res, updated, "Interview ended");
}

// ── PATCH /api/interview/:id/abandon ───────────────────
export async function abandonInterviewSession(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const session = await prisma.interviewSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Interview session");
  if (session.userId !== userId)
    return errorResponse(res, "Not your session", 403);

  const updated = await prisma.interviewSession.update({
    where: { id },
    data: {
      status: "ABANDONED",
      endedAt: new Date(),
    },
  });

  return successResponse(res, updated, "Interview abandoned");
}

// ── POST /api/interview-v2/:id/debrief ─────────────────
export async function generateInterviewDebrief(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const session = await prisma.interviewSession.findUnique({ where: { id } });
  if (!session) return notFoundResponse(res, "Interview session");
  if (session.userId !== userId)
    return errorResponse(res, "Not your session", 403);

  if (session.debrief) {
    return successResponse(
      res,
      JSON.parse(session.debrief),
      "Debrief already exists",
    );
  }

  const debrief = await generateDebrief(id);
  if (!debrief) {
    return errorResponse(res, "Failed to generate debrief", 500);
  }

  return successResponse(res, debrief, "Debrief generated");
}
