// ============================================================================
// ProbSolver v3.0 — Interview Controller (Team-Aware)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED } from "../config/env.js";

// ============================================================================
// START INTERVIEW SESSION
// ============================================================================
export async function startInterview(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId || null;
    const {
      problemId,
      category,
      difficulty,
      interviewStyle,
      interviewMode,
      duration,
    } = req.body;

    let problem = null;
    if (problemId) {
      problem = await prisma.problem.findFirst({
        where: { id: problemId, teamId },
        select: { id: true, title: true, category: true, difficulty: true },
      });
      if (!problem) return error(res, "Problem not found in your team.", 404);
    }

    const session = await prisma.interviewSession.create({
      data: {
        userId,
        teamId,
        problemId: problem?.id || null,
        category: problem?.category || category || "CODING",
        difficulty: problem?.difficulty || difficulty || "MEDIUM",
        interviewStyle: interviewStyle || null,
        status: "IN_PROGRESS",
        phases: getDefaultPhases(problem?.category || category || "CODING"),
        workspace: {
          thinking: "",
          code: "",
          diagram: "",
          response: "",
          scratchpad: "",
          // Phase 4: audio mode metadata
          interviewMode: interviewMode || "text",
          voiceTranscripts: [], // running log of voice turns
        },
      },
      select: {
        id: true,
        category: true,
        difficulty: true,
        interviewStyle: true,
        status: true,
        phases: true,
        workspace: true,
        startedAt: true,
      },
    });

    return success(
      res,
      {
        session: {
          ...session,
          problem: problem || null,
          // Return interviewMode so client knows what mode was requested
          interviewMode: interviewMode || "text",
        },
      },
      201,
    );
  } catch (err) {
    console.error("Start interview error:", err);
    return error(res, "Failed to start interview.", 500);
  }
}

// ============================================================================
// TRANSCRIBE AUDIO — Phase 4
// ============================================================================
// Receives audio blob from client, calls OpenAI transcription,
// returns transcript text. Client then sends transcript via WebSocket
// as interview:voice_transcript. Keeps audio processing separate
// from conversation flow — clean separation of concerns.
//
// Using gpt-4o-transcribe (streaming Whisper successor) for best
// accuracy on technical vocabulary (algorithm names, data structures, etc.)
// ============================================================================
export async function transcribeAudio(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    // Audio comes as multipart form data
    // Client sends: audio blob (webm/opus format from MediaRecorder)
    if (!req.file) {
      return error(res, "Audio file required.", 400);
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    // Use gpt-4o-transcribe for best technical vocabulary accuracy
    // Falls back to whisper-1 which is more stable
    const transcription = await openai.audio.transcriptions.create({
      file: new File([req.file.buffer], "audio.webm", {
        type: req.file.mimetype,
      }),
      model: "whisper-1", // stable, proven, handles technical terms well
      language: "en", // explicit English for faster processing
      prompt:
        "Technical interview. May contain algorithm names, data structures, complexity notation like O(n), O(log n), programming terms.",
      // The prompt primes Whisper for technical vocabulary accuracy
    });

    return success(res, {
      transcript: transcription.text,
      duration: req.file.size, // approximate — client can use for pacing
    });
  } catch (err) {
    console.error("Transcribe error:", err);
    return error(res, "Failed to transcribe audio.", 500);
  }
}

// ============================================================================
// GET INTERVIEW SESSION
// ============================================================================
export async function getInterview(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        problem: {
          select: { id: true, title: true, category: true, difficulty: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            phase: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) return error(res, "Interview session not found.", 404);
    return success(res, { session });
  } catch (err) {
    console.error("Get interview error:", err);
    return error(res, "Failed to fetch interview.", 500);
  }
}

// ============================================================================
// END INTERVIEW
// ============================================================================
export async function endInterview(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId, status: "IN_PROGRESS" },
      select: { id: true, teamId: true },
    });
    if (!session) return error(res, "Active session not found.", 404);
    const updated = await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return success(res, { message: "Interview ended.", session: updated });
  } catch (err) {
    console.error("End interview error:", err);
    return error(res, "Failed to end interview.", 500);
  }
}

// ============================================================================
// INTERVIEW HISTORY
// ============================================================================
export async function getInterviewHistory(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId || null;
    const { page = 1, limit = 20 } = req.query;
    const where = { userId };
    if (teamId) where.teamId = teamId;
    const [sessions, total] = await Promise.all([
      prisma.interviewSession.findMany({
        where,
        select: {
          id: true,
          category: true,
          difficulty: true,
          interviewStyle: true,
          status: true,
          scores: true,
          debrief: true,
          startedAt: true,
          completedAt: true,
          problem: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.interviewSession.count({ where }),
    ]);
    return success(res, {
      sessions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Interview history error:", err);
    return error(res, "Failed to fetch interview history.", 500);
  }
}

// ============================================================================
// GET DEBRIEF
// ============================================================================
export async function getDebrief(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const session = await prisma.interviewSession.findFirst({
      where: { id: sessionId, userId, status: "COMPLETED" },
      select: {
        id: true,
        category: true,
        difficulty: true,
        interviewStyle: true,
        scores: true,
        debrief: true,
        startedAt: true,
        completedAt: true,
        problem: { select: { id: true, title: true } },
      },
    });
    if (!session) return error(res, "Completed session not found.", 404);
    if (!session.debrief) return error(res, "Debrief not yet generated.", 404);
    return success(res, {
      debrief: session.debrief,
      scores: session.scores,
      session,
    });
  } catch (err) {
    console.error("Get debrief error:", err);
    return error(res, "Failed to fetch debrief.", 500);
  }
}

// ============================================================================
// HELPERS
// ============================================================================
function getDefaultPhases(category) {
  const phaseMap = {
    CODING: [
      "Requirements",
      "Approach",
      "Implementation",
      "Testing",
      "Optimization",
    ],
    SYSTEM_DESIGN: [
      "Requirements",
      "High-Level Design",
      "Deep Dive",
      "Scaling",
      "Trade-offs",
    ],
    LOW_LEVEL_DESIGN: [
      "Requirements",
      "Entity Identification",
      "Class Design",
      "Design Patterns",
      "Extensibility",
    ],
    BEHAVIORAL: [
      "Introduction",
      "STAR Story",
      "Follow-up",
      "Questions",
      "Wrap-up",
    ],
    CS_FUNDAMENTALS: [
      "Concept Check",
      "Application",
      "Deep Dive",
      "Trade-offs",
      "Summary",
    ],
    HR: ["Introduction", "Motivation", "Culture Fit", "Scenario", "Questions"],
    SQL: [
      "Requirements",
      "Schema",
      "Query Writing",
      "Optimization",
      "Edge Cases",
    ],
  };
  const phases = phaseMap[category] || phaseMap.CODING;
  return phases.map((name, i) => ({
    name,
    order: i,
    status: i === 0 ? "active" : "pending",
    startedAt: i === 0 ? new Date().toISOString() : null,
  }));
}
