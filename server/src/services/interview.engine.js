// ============================================================================
// ProbSolver v3.0 — Interview Engine (Team-Scoped Tools)
// ============================================================================
//
// SCOPING: Every function calling tool receives `toolContext.teamId`
// and uses it in all database queries. The AI interviewer can only
// access data within the user's current team.
//
// TOOLS (6 total):
// 1. getProblemDetails — fetch problem with follow-ups (team-scoped)
// 2. getCandidateProfile — user stats within this team
// 3. searchTeammateSolutions — vector search within team (RAG)
// 4. saveInterviewNote — store observation for debrief
// 5. getTimeRemaining — calculate elapsed/remaining time
// 6. transitionPhase — move to next interview phase
//
// ============================================================================

import prisma from "../lib/prisma.js";
import { AI_MODEL_PRIMARY } from "../config/env.js";

// ── Tool definitions for OpenAI function calling ─────────────
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "getProblemDetails",
      description:
        "Get the full problem details including follow-up questions and admin teaching notes.",
      parameters: {
        type: "object",
        properties: {
          problemId: { type: "string", description: "The problem ID" },
        },
        required: ["problemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCandidateProfile",
      description:
        "Get the candidate's skill profile: solved count, patterns, 6D scores, confidence.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "searchTeammateSolutions",
      description:
        "Search for similar solutions from teammates for this problem. Only available in team mode.",
      parameters: {
        type: "object",
        properties: {
          problemId: { type: "string" },
          query: { type: "string", description: "What to search for" },
        },
        required: ["problemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "saveInterviewNote",
      description: "Save a performance observation for the final debrief.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "The observation to record" },
          category: {
            type: "string",
            enum: ["strength", "weakness", "observation", "key_moment"],
          },
        },
        required: ["note", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTimeRemaining",
      description: "Get the elapsed time, remaining time, and current phase.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "transitionPhase",
      description: "Move to the next interview phase.",
      parameters: {
        type: "object",
        properties: {
          nextPhase: {
            type: "string",
            description: "Name of the phase to transition to",
          },
        },
        required: ["nextPhase"],
      },
    },
  },
];

// ============================================================================
// TOOL IMPLEMENTATIONS (all team-scoped)
// ============================================================================

const toolHandlers = {
  // ── 1. Get problem details (team-scoped) ───────────────
  async getProblemDetails({ problemId }, context) {
    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId || context.problemId,
        teamId: context.teamId, // SCOPING
      },
      select: {
        title: true,
        description: true,
        category: true,
        difficulty: true,
        adminNotes: true,
        tags: true,
        realWorldContext: true,
        categoryData: true,
        followUpQuestions: {
          orderBy: { order: "asc" },
          select: { question: true, difficulty: true, hint: true },
        },
      },
    });

    if (!problem) return { error: "Problem not found." };
    return problem;
  },

  // ── 2. Get candidate profile (team-scoped stats) ───────
  async getCandidateProfile(_, context) {
    const [solutionCount, patterns, avgConfidence, simCount, quizCount] =
      await Promise.all([
        prisma.solution.count({
          where: { userId: context.userId, teamId: context.teamId }, // SCOPING
        }),

        prisma.solution.findMany({
          where: {
            userId: context.userId,
            teamId: context.teamId, // SCOPING
            pattern: { not: null },
          },
          select: { pattern: true },
          distinct: ["pattern"],
        }),

        prisma.solution.aggregate({
          where: { userId: context.userId, teamId: context.teamId }, // SCOPING
          _avg: { confidence: true },
        }),

        prisma.simSession.count({
          where: {
            userId: context.userId,
            teamId: context.teamId,
            completed: true,
          },
        }),

        prisma.quizAttempt.count({
          where: { userId: context.userId, teamId: context.teamId },
        }),
      ]);

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { name: true, targetCompany: true, streak: true },
    });

    return {
      name: user?.name,
      targetCompany: user?.targetCompany,
      solutionCount,
      uniquePatterns: patterns.map((p) => p.pattern),
      avgConfidence: avgConfidence._avg.confidence
        ? Math.round(avgConfidence._avg.confidence * 10) / 10
        : 0,
      completedSimulations: simCount,
      quizzesTaken: quizCount,
      streak: user?.streak || 0,
    };
  },

  // ── 3. Search teammate solutions (team-scoped RAG) ─────
  async searchTeammateSolutions({ problemId, query }, context) {
    // In individual/personal mode, there are no teammates
    if (!context.teamId) {
      return { message: "No teammates available (individual mode)." };
    }

    // Check if this is a personal team
    const team = await prisma.team.findUnique({
      where: { id: context.teamId },
      select: { isPersonal: true },
    });

    if (team?.isPersonal) {
      return { message: "No teammates in personal practice mode." };
    }

    const targetProblemId = problemId || context.problemId;

    // Try vector search first
    try {
      if (query) {
        const { generateEmbedding } = await import("./embedding.service.js");
        const embedding = await generateEmbedding(query);

        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;

          // TEAM-SCOPED vector search — the critical query
          const results = await prisma.$queryRawUnsafe(
            `
  SELECT
    s.approach,
    s."keyInsight" as "key_insight",
    s."timeComplexity" as "time_complexity",
    s."spaceComplexity" as "space_complexity",
    s.pattern,
    s.confidence,
    u.name as author_name
  FROM solutions s
  JOIN users u ON s."userId" = u.id
  WHERE s."teamId" = $1
    AND s."problemId" = $2
    AND s."userId" != $3
    AND s.embedding IS NOT NULL
  ORDER BY s.embedding <=> $4::vector
  LIMIT 3
`,
            context.teamId,
            targetProblemId,
            context.userId,
            vectorStr,
          );

          if (results.length > 0) return { solutions: results };
        }
      }
    } catch (err) {
      console.error("Vector search in interview failed:", err.message);
    }

    // Fallback: regular query
    const solutions = await prisma.solution.findMany({
      where: {
        problemId: targetProblemId,
        teamId: context.teamId, // SCOPING
        userId: { not: context.userId },
      },
      select: {
        approach: true,
        keyInsight: true,
        timeComplexity: true,
        spaceComplexity: true,
        pattern: true,
        confidence: true,
        user: { select: { name: true } },
      },
      take: 3,
      orderBy: { confidence: "desc" },
    });

    if (solutions.length === 0) {
      return { message: "No teammate solutions found for this problem yet." };
    }

    return {
      solutions: solutions.map((s) => ({
        ...s,
        author_name: s.user.name,
        user: undefined,
      })),
    };
  },

  // ── 4. Save interview note ─────────────────────────────
  async saveInterviewNote({ note, category }, context) {
    await prisma.interviewMessage.create({
      data: {
        sessionId: context.sessionId,
        role: "SYSTEM",
        content: `[${category.toUpperCase()}] ${note}`,
        phase: "note",
      },
    });

    return { saved: true };
  },

  // ── 5. Get time remaining ──────────────────────────────
  async getTimeRemaining(_, context) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: context.sessionId },
      select: { startedAt: true, phases: true, category: true },
    });

    if (!session) return { error: "Session not found." };

    const elapsed = Math.round(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000,
    );
    const durationMap = {
      CODING: 45 * 60,
      SYSTEM_DESIGN: 45 * 60,
      BEHAVIORAL: 30 * 60,
      CS_FUNDAMENTALS: 30 * 60,
      HR: 30 * 60,
      SQL: 30 * 60,
    };
    const totalDuration = durationMap[session.category] || 45 * 60;
    const remaining = Math.max(0, totalDuration - elapsed);

    const activePhase = session.phases?.find((p) => p.status === "active");

    return {
      elapsedSeconds: elapsed,
      elapsedMinutes: Math.round(elapsed / 60),
      remainingSeconds: remaining,
      remainingMinutes: Math.round(remaining / 60),
      totalMinutes: Math.round(totalDuration / 60),
      currentPhase: activePhase?.name || "Unknown",
      isOvertime: remaining === 0,
    };
  },

  // ── 6. Transition phase ────────────────────────────────
  async transitionPhase({ nextPhase }, context) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: context.sessionId },
      select: { phases: true },
    });

    if (!session) return { error: "Session not found." };

    const phases = session.phases || [];
    const now = new Date().toISOString();

    const updated = phases.map((p) => {
      if (p.status === "active") {
        return { ...p, status: "completed", completedAt: now };
      }
      if (p.name === nextPhase) {
        return { ...p, status: "active", startedAt: now };
      }
      return p;
    });

    await prisma.interviewSession.update({
      where: { id: context.sessionId },
      data: { phases: updated },
    });

    // Record the transition
    await prisma.interviewMessage.create({
      data: {
        sessionId: context.sessionId,
        role: "SYSTEM",
        content: `Phase transition → ${nextPhase}`,
        phase: nextPhase,
      },
    });

    return { transitioned: true, currentPhase: nextPhase };
  },
};

// ============================================================================
// MAIN MESSAGE HANDLER
// ============================================================================

export async function handleInterviewMessage(ws, message) {
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const { toolContext } = message;

    // ── Load conversation history ────────────────────────
    const history = await prisma.interviewMessage.findMany({
      where: {
        sessionId: toolContext.sessionId,
        role: { in: ["USER", "ASSISTANT"] },
      },
      select: { role: true, content: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // ── Count messages for stage detection ───────────────
    const messageCount = history.filter((m) => m.role === "USER").length;
    const stage =
      messageCount <= 2
        ? "OPENING"
        : messageCount <= 6
          ? "EARLY"
          : messageCount <= 15
            ? "MIDDLE"
            : messageCount <= 25
              ? "LATE"
              : "WRAPPING_UP";

    // ── Load session for system prompt context ───────────
    const session = await prisma.interviewSession.findUnique({
      where: { id: toolContext.sessionId },
      select: {
        category: true,
        difficulty: true,
        interviewStyle: true,
        workspace: true,
        phases: true,
        problem: {
          select: { title: true, description: true, category: true },
        },
      },
    });

    // ── Check if personal mode (for prompt adjustment) ───
    const isPersonal = !toolContext.teamId;
    let teamInfo = "";
    if (!isPersonal) {
      const team = await prisma.team.findUnique({
        where: { id: toolContext.teamId },
        select: { isPersonal: true },
      });
      if (team?.isPersonal) {
        teamInfo =
          "\nNote: The candidate is practicing individually. Do not reference teammates.";
      } else {
        teamInfo =
          "\nThe candidate is part of a team. You may reference teammate solutions if available via the searchTeammateSolutions tool.";
      }
    } else {
      teamInfo =
        "\nNote: The candidate is practicing individually. Do not reference teammates.";
    }

    // ── Build system prompt ──────────────────────────────
    const systemPrompt = buildSystemPrompt({
      session,
      stage,
      teamInfo,
      workspace: session?.workspace,
    });

    // ── Build messages array ─────────────────────────────
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content,
      })),
    ];

    // Add user message if this is a user_message type
    if (message.type === "user_message") {
      messages.push({ role: "user", content: message.content });
    }

    // For system_init, add an instruction to begin
    if (message.type === "system_init") {
      messages.push({
        role: "user",
        content: "[System: The candidate has joined. Begin the interview.]",
      });
    }

    // For end_interview, generate debrief
    if (message.type === "end_interview") {
      await generateDebrief(ws, toolContext);
      return;
    }

    // ── Call GPT-4o with streaming + tools ────────────────
    const stream = await openai.chat.completions.create({
      model: AI_MODEL_PRIMARY,
      messages,
      tools: TOOL_DEFINITIONS,
      temperature: 0.85,
      max_tokens: 600,
      stream: true,
    });

    let fullContent = "";
    let toolCalls = [];
    let currentToolCall = null;

    // ── Stream tokens to client ──────────────────────────
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Text content — stream to client
      if (delta?.content) {
        fullContent += delta.content;
        ws.send(
          JSON.stringify({
            type: "interview:token",
            content: delta.content,
          }),
        );
      }

      // Tool call detection
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = {
                id: tc.id || "",
                function: { name: "", arguments: "" },
              };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name)
              toolCalls[tc.index].function.name = tc.function.name;
            if (tc.function?.arguments)
              toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }

      // Check for finish
      if (chunk.choices[0]?.finish_reason === "tool_calls") {
        // Execute tools and make follow-up call
        await executeToolsAndRespond(ws, messages, toolCalls, toolContext);
        return;
      }
    }

    // ── Store assistant message ───────────────────────────
    if (fullContent) {
      await prisma.interviewMessage.create({
        data: {
          sessionId: toolContext.sessionId,
          role: "ASSISTANT",
          content: fullContent,
        },
      });

      ws.send(JSON.stringify({ type: "interview:done" }));
    }
  } catch (err) {
    console.error("Interview engine error:", err);
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Interview engine encountered an error.",
      }),
    );
  }
}

// ============================================================================
// TOOL EXECUTION + FOLLOW-UP
// ============================================================================

async function executeToolsAndRespond(ws, messages, toolCalls, toolContext) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  // ── Execute each tool ──────────────────────────────────
  const toolResults = [];

  for (const tc of toolCalls) {
    if (!tc?.function?.name) continue;

    const handler = toolHandlers[tc.function.name];
    if (!handler) {
      toolResults.push({
        tool_call_id: tc.id,
        role: "tool",
        content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}` }),
      });
      continue;
    }

    let args = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}");
    } catch {}

    try {
      // CRITICAL: Pass toolContext (with teamId) to every tool
      const result = await handler(args, toolContext);
      toolResults.push({
        tool_call_id: tc.id,
        role: "tool",
        content: JSON.stringify(result),
      });
    } catch (err) {
      console.error(`Tool ${tc.function.name} error:`, err.message);
      toolResults.push({
        tool_call_id: tc.id,
        role: "tool",
        content: JSON.stringify({ error: "Tool execution failed." }),
      });
    }
  }

  // ── Store tool calls + results ─────────────────────────
  await prisma.interviewMessage.create({
    data: {
      sessionId: toolContext.sessionId,
      role: "ASSISTANT",
      content: null,
      toolCalls: toolCalls,
      toolResults: toolResults.map((r) => r.content),
    },
  });

  // ── Follow-up call with tool results ───────────────────
  const followUpMessages = [
    ...messages,
    {
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    },
    ...toolResults,
  ];

  const stream = await openai.chat.completions.create({
    model: AI_MODEL_PRIMARY,
    messages: followUpMessages,
    temperature: 0.85,
    max_tokens: 600,
    stream: true,
  });

  let fullContent = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      fullContent += delta.content;
      ws.send(
        JSON.stringify({
          type: "interview:token",
          content: delta.content,
        }),
      );
    }
  }

  if (fullContent) {
    await prisma.interviewMessage.create({
      data: {
        sessionId: toolContext.sessionId,
        role: "ASSISTANT",
        content: fullContent,
      },
    });
  }

  ws.send(JSON.stringify({ type: "interview:done" }));
}

// ============================================================================
// DEBRIEF GENERATION
// ============================================================================

async function generateDebrief(ws, toolContext) {
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    // ── Load full conversation ───────────────────────────
    const messages = await prisma.interviewMessage.findMany({
      where: { sessionId: toolContext.sessionId },
      select: { role: true, content: true, phase: true },
      orderBy: { createdAt: "asc" },
    });

    const session = await prisma.interviewSession.findUnique({
      where: { id: toolContext.sessionId },
      select: {
        category: true,
        difficulty: true,
        interviewStyle: true,
        startedAt: true,
      },
    });

    const transcript = messages
      .filter((m) => m.content && m.role !== "SYSTEM")
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    const notes = messages
      .filter((m) => m.role === "SYSTEM" && m.phase === "note")
      .map((m) => m.content)
      .join("\n");

    const elapsed = Math.round(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60,
    );

    ws.send(JSON.stringify({ type: "interview:debrief_generating" }));

    const response = await openai.chat.completions.create({
      model: AI_MODEL_PRIMARY,
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are generating a structured interview debrief.
Category: ${session.category}. Difficulty: ${session.difficulty}.
Style: ${session.interviewStyle || "Standard"}.
Duration: ${elapsed} minutes.

Return JSON:
{
  "verdict": "STRONG_HIRE" | "HIRE" | "LEAN_HIRE" | "LEAN_NO_HIRE" | "NO_HIRE",
  "overallScore": 1-10,
  "scores": {
    "approach": 1-10,
    "communication": 1-10,
    "codeQuality": 1-10,
    "timeManagement": 1-10,
    "knowledgeDepth": 1-10
  },
  "strengths": ["specific strength 1", ...],
  "improvements": ["specific improvement 1", ...],
  "keyMoments": ["notable moment from the conversation", ...],
  "summary": "2-3 sentence overall assessment"
}`,
        },
        {
          role: "user",
          content: `Interview transcript:\n${transcript}\n\nInterviewer notes:\n${notes || "None"}`,
        },
      ],
    });

    const debrief = JSON.parse(response.choices[0].message.content);

    // ── Store debrief ────────────────────────────────────
    await prisma.interviewSession.update({
      where: { id: toolContext.sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        debrief,
        scores: debrief.scores,
      },
    });

    ws.send(
      JSON.stringify({
        type: "interview:debrief",
        debrief,
      }),
    );
  } catch (err) {
    console.error("Debrief generation error:", err);
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Failed to generate debrief.",
      }),
    );
  }
}

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt({ session, stage, teamInfo, workspace }) {
  const category = session?.category || "CODING";
  const style = session?.interviewStyle || "Standard";
  const problem = session?.problem;

  return `You are a senior technical interviewer conducting a ${category} interview.
Interview style: ${style}.
Difficulty: ${session?.difficulty || "MEDIUM"}.
Conversation stage: ${stage}.

Problem: ${problem?.title || "General interview"}
${problem?.description ? `Description: ${problem.description}` : ""}
${teamInfo}

RULES:
- You are an EVALUATOR, not a teacher. Never give answers or teach concepts.
- Ask probing follow-up questions to assess depth of understanding.
- If the candidate is stuck, you may give a very slight nudge, but never the solution.
- Adapt your follow-ups based on the candidate's responses.
- Keep responses concise (2-4 sentences). You're an interviewer, not a lecturer.
- Use the tools available to you: check the candidate's profile, look up problem details, search teammate solutions for comparison, save observations, track time.

STAGE BEHAVIOR:
${stage === "OPENING" ? "- Introduce yourself briefly. Ask the candidate to explain their understanding of the problem." : ""}
${stage === "EARLY" ? "- Discuss approach. Ask about time/space complexity. Probe edge cases." : ""}
${stage === "MIDDLE" ? "- Deep dive into implementation. Ask about trade-offs. Challenge assumptions." : ""}
${stage === "LATE" ? "- Discuss testing, optimization, and real-world considerations." : ""}
${stage === "WRAPPING_UP" ? "- Summarize. Ask if the candidate has questions. Wrap up professionally." : ""}

${workspace ? `\nCANDIDATE'S WORKSPACE:\nCode: ${workspace.code || "[empty]"}\nThinking: ${workspace.thinking || "[empty]"}\nDiagram: ${workspace.diagram ? "[diagram present]" : "[empty]"}` : ""}`;
}
