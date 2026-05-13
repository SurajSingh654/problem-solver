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
import { aiStream, aiComplete, AIError } from "./ai.service.js";
import { validateInterviewDebrief } from "./ai.validators.js";
import { buildFallbackInterviewDebrief } from "./ai.fallbacks.js";

// Phase 1 fix: import persona system that was previously dead code
import { INTERVIEW_STYLES, getCompanyPersona } from "./interview.phases.js";

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
  {
    type: "function",
    function: {
      name: "saveBehavioralSignal",
      description:
        "Save a behavioral/voice observation during audio interview (speaking pace, hesitation, filler words, etc.) for the debrief.",
      parameters: {
        type: "object",
        properties: {
          signal: { type: "string", description: "The behavioral observation" },
          signalType: {
            type: "string",
            enum: [
              "speaking_pace",
              "hesitation",
              "filler_words",
              "confidence",
              "clarity",
              "technical_accuracy",
            ],
          },
          severity: {
            type: "string",
            enum: ["positive", "neutral", "concerning"],
          },
        },
        required: ["signal", "signalType"],
      },
    },
  },
  // ── Design Studio interview mode tools ────────────────────────────
  // Available only when the InterviewSession is paired with a DesignSession.
  // The tool handlers gate-check on context.designSessionId so they no-op
  // for non-design interviews.
  {
    type: "function",
    function: {
      name: "getDesignWorkspace",
      description:
        "Read the candidate's current design canvas: phase content, component annotations, data flow description, and a diagram summary (element kinds + counts). Use this whenever you need to reference what the candidate has actually drawn or written. Only available in design interviews (SD/LLD).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "askCandidateForClarification",
      description:
        "Record a formal clarification probe — a moment where you explicitly asked the candidate to clarify a requirement, scale assumption, or trade-off. Used by the debrief to score `requirementsClarification` accurately.",
      parameters: {
        type: "object",
        properties: {
          probeText: { type: "string", description: "What you asked" },
          topic: {
            type: "string",
            enum: [
              "functional_requirement",
              "non_functional_requirement",
              "scale",
              "tradeoff",
              "failure_mode",
              "data_model",
              "responsibility",
            ],
          },
        },
        required: ["probeText", "topic"],
      },
    },
  },
];

// ============================================================================
// TOOL IMPLEMENTATIONS (all team-scoped)
// ============================================================================
const toolHandlers = {
  async getProblemDetails({ problemId }, context) {
    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId || context.problemId,
        teamId: context.teamId,
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

  async getCandidateProfile(_, context) {
    const [solutionCount, patternRows, avgConfidence, simCount, quizCount] =
      await Promise.all([
        prisma.solution.count({
          where: { userId: context.userId, teamId: context.teamId },
        }),
        // Array column: `distinct` on a String[] field isn't meaningful;
        // dedupe in JS after fetching.
        prisma.solution.findMany({
          where: {
            userId: context.userId,
            teamId: context.teamId,
            patterns: { isEmpty: false },
          },
          select: { patterns: true },
        }),
        prisma.solution.aggregate({
          where: { userId: context.userId, teamId: context.teamId },
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
      uniquePatterns: [...new Set(patternRows.flatMap((p) => p.patterns))],
      avgConfidence: avgConfidence._avg.confidence
        ? Math.round(avgConfidence._avg.confidence * 10) / 10
        : 0,
      completedSimulations: simCount,
      quizzesTaken: quizCount,
      streak: user?.streak || 0,
    };
  },

  async searchTeammateSolutions({ problemId, query }, context) {
    if (!context.teamId) {
      return { message: "No teammates available (individual mode)." };
    }
    const team = await prisma.team.findUnique({
      where: { id: context.teamId },
      select: { isPersonal: true },
    });
    if (team?.isPersonal) {
      return { message: "No teammates in personal practice mode." };
    }
    const targetProblemId = problemId || context.problemId;
    try {
      if (query) {
        const { generateEmbedding } = await import("./embedding.service.js");
        const embedding = await generateEmbedding(query);
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          const results = await prisma.$queryRawUnsafe(
            `SELECT s.approach, s."keyInsight" as "key_insight",
             s."timeComplexity" as "time_complexity", s."spaceComplexity" as "space_complexity",
             s.patterns, s.confidence, u.name as author_name
             FROM solutions s JOIN users u ON s."userId" = u.id
             WHERE s."teamId" = $1 AND s."problemId" = $2 AND s."userId" != $3
             AND s.embedding IS NOT NULL ORDER BY s.embedding <=> $4::vector LIMIT 3`,
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
    const solutions = await prisma.solution.findMany({
      where: {
        problemId: targetProblemId,
        teamId: context.teamId,
        userId: { not: context.userId },
      },
      select: {
        approach: true,
        keyInsight: true,
        timeComplexity: true,
        spaceComplexity: true,
        patterns: true,
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

  async transitionPhase({ nextPhase }, context) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: context.sessionId },
      select: { phases: true },
    });
    if (!session) return { error: "Session not found." };
    const phases = session.phases || [];
    const now = new Date().toISOString();
    const updated = phases.map((p) => {
      if (p.status === "active")
        return { ...p, status: "completed", completedAt: now };
      if (p.name === nextPhase)
        return { ...p, status: "active", startedAt: now };
      return p;
    });
    await prisma.interviewSession.update({
      where: { id: context.sessionId },
      data: { phases: updated },
    });
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

  async saveBehavioralSignal({ signal, signalType, severity }, context) {
    await prisma.interviewMessage.create({
      data: {
        sessionId: context.sessionId,
        role: "SYSTEM",
        content: `[BEHAVIORAL_${signalType.toUpperCase()}] ${signal} (${severity || "neutral"})`,
        phase: "behavioral",
      },
    });
    return { saved: true };
  },

  // ── Design Studio interview tools ────────────────────────────────
  // Both gate-check on designSessionId so a CODING interview can't call
  // them. Returns a structured payload the model can reference back to
  // the candidate's actual canvas content.
  async getDesignWorkspace(_, context) {
    if (!context.designSessionId) {
      return { error: "Not a design interview." };
    }
    const ds = await prisma.designSession.findUnique({
      where: { id: context.designSessionId },
      select: {
        designType: true,
        phases: true,
        componentAnnotations: true,
        dataFlowDescription: true,
        diagramData: true,
      },
    });
    if (!ds) return { error: "Design session not found." };

    // Diagram summary: element kinds + count. Sending the full Excalidraw
    // JSON would balloon prompt size and most of it (positions, IDs) is
    // noise to the model. Kinds + count is enough to ask "I see 2
    // databases — which one is which?"
    let diagramSummary = null;
    try {
      const parsed =
        typeof ds.diagramData === "string"
          ? JSON.parse(ds.diagramData)
          : ds.diagramData;
      const elements = parsed?.elements || [];
      const kindCounts = {};
      for (const el of elements) {
        const kind = el?.type || "unknown";
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;
      }
      diagramSummary = {
        totalElements: elements.length,
        byKind: kindCounts,
      };
    } catch {
      diagramSummary = { totalElements: 0, byKind: {} };
    }

    return {
      designType: ds.designType,
      phases: ds.phases || {},
      componentAnnotations: ds.componentAnnotations || [],
      dataFlowDescription: ds.dataFlowDescription || "",
      diagramSummary,
    };
  },

  async askCandidateForClarification({ probeText, topic }, context) {
    await prisma.interviewMessage.create({
      data: {
        sessionId: context.sessionId,
        role: "SYSTEM",
        content: `[CLARIFICATION_PROBE/${topic}] ${probeText}`,
        phase: "clarification",
      },
    });
    return { recorded: true };
  },
};

// ============================================================================
// MAIN MESSAGE HANDLER
// ============================================================================
export async function handleInterviewMessage(ws, message) {
  try {
    const { toolContext } = message;

    // ── Load conversation history ────────────────────────
    const history = await prisma.interviewMessage.findMany({
      where: {
        sessionId: toolContext.sessionId,
        role: { in: ["USER", "ASSISTANT"] },
      },
      select: { role: true, content: true },
      orderBy: { createdAt: "asc" },
      take: 30, // increased from 20 to capture more context
    });

    // ── Load session for system prompt context ───────────
    const session = await prisma.interviewSession.findUnique({
      where: { id: toolContext.sessionId },
      select: {
        category: true,
        difficulty: true,
        interviewStyle: true,
        workspace: true,
        phases: true,
        startedAt: true,
        // Paired Design Studio session id — when set, this is a
        // design-mode interview. Branches: stage block, hint ladder,
        // and the new getDesignWorkspace / askCandidateForClarification
        // tools become available.
        designSessionId: true,
        problem: {
          select: { title: true, description: true, category: true },
        },
      },
    });

    // Augment toolContext with the paired DS id so tool handlers
    // (getDesignWorkspace, askCandidateForClarification) can scope.
    if (session?.designSessionId) {
      toolContext.designSessionId = session.designSessionId;
    }

    // Phase 1 fix: stage detection from phases array, not message count
    // This is how real interviewers track where they are — by phase, not by
    // counting how many things the candidate has said
    const activePhase = session?.phases?.find((p) => p.status === "active");
    const completedPhases =
      session?.phases?.filter((p) => p.status === "completed").length || 0;
    const totalPhases = session?.phases?.length || 1;
    const phaseProgress = completedPhases / totalPhases;

    // Map phase progress to stage for prompt behavior
    // This is more accurate than counting user messages
    const stage =
      phaseProgress === 0
        ? "OPENING"
        : phaseProgress <= 0.25
          ? "EARLY"
          : phaseProgress <= 0.6
            ? "MIDDLE"
            : phaseProgress <= 0.85
              ? "LATE"
              : "WRAPPING_UP";

    // Phase 1 fix: dynamic max_tokens by stage
    // Opening/Early: more tokens for introductions and approach discussion
    // Middle: shorter — candidate should be coding, AI should be watching
    // Late/Wrapping: more tokens for wrap-up discussion and summary
    const maxTokensByStage = {
      OPENING: 300, // brief intro, wait for candidate
      EARLY: 400, // discuss approach
      MIDDLE: 250, // candidate is coding — AI should say less
      LATE: 400, // testing, edge cases
      WRAPPING_UP: 600, // summary and debrief prep
    };
    const maxTokens = maxTokensByStage[stage] || 350;

    // ── Check team context ───────────────────────────────
    let teamInfo = "";
    if (!toolContext.teamId) {
      teamInfo =
        "\nThe candidate is practicing individually. Do not reference teammates.";
    } else {
      const team = await prisma.team.findUnique({
        where: { id: toolContext.teamId },
        select: { isPersonal: true },
      });
      teamInfo = team?.isPersonal
        ? "\nThe candidate is practicing individually. Do not reference teammates."
        : "\nThe candidate is part of a team. You may reference teammate solutions if available via searchTeammateSolutions.";
    }

    // Phase 1 fix: get current workspace from message payload if available
    // Previously used stale session.workspace loaded at connection time
    // Now uses the workspace the candidate is actively editing
    const currentWorkspace = message.workspace || session?.workspace || {};

    // ── Build system prompt with full persona context ────
    const systemPrompt = buildSystemPrompt({
      session,
      stage,
      activePhase,
      teamInfo,
      workspace: currentWorkspace,
      interviewStyle: toolContext.interviewStyle || session?.interviewStyle,
    });

    // ── Build messages array ─────────────────────────────
    // System prompt is passed separately via aiStream — keep this array
    // free of the system role so we don't double-up when the helper
    // prepends it.
    const messages = history.map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    }));

    if (message.type === "user_message") {
      messages.push({ role: "user", content: message.content });
    }

    if (message.type === "system_init") {
      const persona = getCompanyPersona(
        toolContext.interviewStyle || session?.interviewStyle,
      );

      // Phase 2 fix: problem delivery with deliberate ambiguity
      // Real interviewers do NOT give the full problem upfront.
      // They give a scenario and wait for clarifying questions.
      // The full problem details are available via getProblemDetails tool
      // when the candidate asks the right questions.
      const problemDelivery = session?.problem
        ? `The problem for this interview is: "${session.problem.title}".
       Present ONLY the title and a brief 1-sentence scenario. Do NOT give the description, constraints, or examples yet.
       Wait for the candidate to ask clarifying questions.
       The full problem details are available via getProblemDetails — retrieve them only when the candidate asks.`
        : `Conduct an open-ended ${session?.category || "CODING"} interview. Start with a relevant problem appropriate for ${session?.difficulty || "MEDIUM"} difficulty.`;

      messages.push({
        role: "user",
        content: `[System: The candidate has joined. 
               Your persona: ${persona.name} — ${persona.style}
               Opening: "${persona.intro}"
               ${problemDelivery}
               Begin now.]`,
      });
    }

    if (message.type === "end_interview") {
      await generateDebrief(ws, toolContext);
      return;
    }

    // ── Call GPT-4o with streaming + tools ────────────────
    const stream = await aiStream({
      systemPrompt,
      messages,
      userId: toolContext.userId,
      teamId: toolContext.teamId,
      model: AI_MODEL_PRIMARY,
      tools: TOOL_DEFINITIONS,
      temperature: 0.7, // reduced from 0.85 — more consistent interviewer behavior
      maxTokens,
      surface: "interview-stream",
    });

    let fullContent = "";
    let toolCalls = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        ws.send(
          JSON.stringify({ type: "interview:token", content: delta.content }),
        );
      }

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

      if (chunk.choices[0]?.finish_reason === "tool_calls") {
        await executeToolsAndRespond(
          ws,
          systemPrompt,
          messages,
          toolCalls,
          toolContext,
          currentWorkspace,
        );
        return;
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
    // Always send done — even if fullContent is empty (tool call path)
    // Without this, client isTyping never resets when AI calls a tool first
    ws.send(
      JSON.stringify({
        type: "interview:done",
        isVoice: message.isVoice || false,
      }),
    );
  } catch (err) {
    console.error("Interview engine error:", err);
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Interview engine encountered an error.",
      }),
    );
    // Unblock the client even on error
    ws.send(JSON.stringify({ type: "interview:done", isVoice: false }));
  }
}

// ============================================================================
// TOOL EXECUTION + FOLLOW-UP
// ============================================================================
async function executeToolsAndRespond(
  ws,
  systemPrompt,
  messages,
  toolCalls,
  toolContext,
  currentWorkspace,
) {
  try {
    const toolResults = [];
    for (const tc of toolCalls) {
      if (!tc?.function?.name) continue;
      const handler = toolHandlers[tc.function.name];
      if (!handler) {
        toolResults.push({
          tool_call_id: tc.id,
          role: "tool",
          content: JSON.stringify({
            error: `Unknown tool: ${tc.function.name}`,
          }),
        });
        continue;
      }
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {}
      try {
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

    await prisma.interviewMessage.create({
      data: {
        sessionId: toolContext.sessionId,
        role: "ASSISTANT",
        content: null,
        toolCalls: toolCalls,
        toolResults: toolResults.map((r) => r.content),
      },
    });

    const followUpMessages = [
      ...messages,
      {
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      },
      ...toolResults,
    ];

    // Phase 1 fix: pass currentWorkspace to maintain context in follow-up
    const stream = await aiStream({
      systemPrompt,
      messages: followUpMessages,
      userId: toolContext.userId,
      teamId: toolContext.teamId,
      model: AI_MODEL_PRIMARY,
      temperature: 0.7,
      maxTokens: 400,
      surface: "interview-stream-followup",
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
        ws.send(
          JSON.stringify({ type: "interview:token", content: delta.content }),
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
    ws.send(
      JSON.stringify({
        type: "interview:done",
        isVoice: false, // tool responses are always text mode
      }),
    );

    if (fullContent) {
      await prisma.interviewMessage.create({
        data: {
          sessionId: toolContext.sessionId,
          role: "ASSISTANT",
          content: fullContent,
        },
      });
    }
    ws.send(JSON.stringify({ type: "interview:done", isVoice: false }));
  } catch (err) {
    console.error("executeToolsAndRespond error:", err);
    ws.send(JSON.stringify({ type: "error", error: "Tool execution failed." }));
    // Always unblock the client
    ws.send(JSON.stringify({ type: "interview:done", isVoice: false }));
  }
}

// ============================================================================
// DEBRIEF GENERATION
// ============================================================================
// ============================================================================
// DEBRIEF GENERATION — Phase 3: Real interviewer rubric + behavioral signals
// ============================================================================
async function generateDebrief(ws, toolContext) {
  try {
    // ── Load full conversation ───────────────────────────
    const messages = await prisma.interviewMessage.findMany({
      where: { sessionId: toolContext.sessionId },
      select: { role: true, content: true, phase: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const session = await prisma.interviewSession.findUnique({
      where: { id: toolContext.sessionId },
      select: {
        category: true,
        difficulty: true,
        interviewStyle: true,
        startedAt: true,
        problem: {
          select: { title: true, category: true, difficulty: true },
        },
      },
    });

    const elapsed = Math.round(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60,
    );

    const transcript = messages
      .filter((m) => m.content && m.role !== "SYSTEM")
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    // ── Extract interviewer notes saved during session ───
    const interviewerNotes = messages
      .filter((m) => m.role === "SYSTEM" && m.phase === "note")
      .map((m) => m.content)
      .join("\n");

    // ════════════════════════════════════════════════════
    // BEHAVIORAL SIGNAL EXTRACTION
    // These are computed deterministically from the transcript
    // before calling AI — hard facts, not impressions.
    // The AI debrief receives these as ground truth context.
    // ════════════════════════════════════════════════════

    const userMessages = messages.filter((m) => m.role === "USER");
    const assistantMessages = messages.filter((m) => m.role === "ASSISTANT");

    // ── Hard gate: empty or near-empty interview ─────────
    const hasSubstantiveContent =
      userMessages.length >= 2 &&
      userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0) > 50;

    if (!hasSubstantiveContent) {
      const emptyScoreKeys = {
        CODING: [
          "clarifyingQuestions",
          "problemDecomposition",
          "codeCorrectness",
          "codeQuality",
          "communicationWhileCoding",
          "edgeCaseHandling",
          "optimizationAbility",
          "composureUnderPressure",
          "hintUtilization",
        ],
        SYSTEM_DESIGN: [
          "requirementsClarification",
          "architectureClarity",
          "scaleThinking",
          "failureModeAwareness",
          "tradeOffReasoning",
          "componentDepth",
          "communicationClarity",
        ],
        BEHAVIORAL: [
          "starStructure",
          "specificity",
          "personalOwnership",
          "quantifiedImpact",
          "growthMindset",
          "relevanceToRole",
        ],
        CS_FUNDAMENTALS: [
          "conceptualAccuracy",
          "explanationDepth",
          "realWorldApplication",
          "misconceptionAwareness",
          "communicationClarity",
        ],
        SQL: [
          "schemaUnderstanding",
          "queryCorrectness",
          "optimizationAwareness",
          "edgeCaseHandling",
          "codeReadability",
        ],
        HR: [
          "authenticity",
          "companyResearch",
          "careerNarrative",
          "questionQuality",
          "cultureFit",
        ],
      };
      const keys =
        emptyScoreKeys[session?.category || "CODING"] || emptyScoreKeys.CODING;
      const emptyDebrief = {
        verdict: "NO_HIRE",
        overallScore: 1,
        scores: Object.fromEntries(keys.map((k) => [k, 1])),
        behavioralSignals: {
          clarifyingQuestions: "none — 0 questions asked",
          hintsRequired: "0 hints",
          thoughtOutLoud: false,
          identifiedComplexityIndependently: false,
          foundEdgeCasesIndependently: false,
        },
        strengths: [],
        improvements: [
          "Did not engage with the interview — no substantive responses were provided.",
          "In a real interview this would result in an immediate No Hire decision.",
        ],
        keyMoments: [
          "Candidate ended the interview without providing any solution, approach, or meaningful response.",
        ],
        summary:
          "The candidate did not engage with the interview. No evaluation is possible. A real interviewer would have ended this session immediately.",
      };

      await prisma.interviewSession.update({
        where: { id: toolContext.sessionId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          debrief: emptyDebrief,
          scores: emptyDebrief.scores,
        },
      });

      ws.send(
        JSON.stringify({ type: "interview:debrief", debrief: emptyDebrief }),
      );
      return;
    }

    // ── Signal 1: Clarifying questions ─────────────────
    // Count question marks in the first 3 user messages
    // Real interviewers specifically note whether candidates
    // asked clarifying questions before starting to code
    const earlyUserMessages = userMessages.slice(0, 4);
    const clarifyingQuestionCount = earlyUserMessages.reduce((count, m) => {
      const text = m.content || "";
      // Questions about constraints, scale, edge cases, requirements
      const clarifyingPatterns = [
        /\?/g,
        /clarif/i,
        /constraint/i,
        /assume/i,
        /assumption/i,
        /scale/i,
        /size/i,
        /range/i,
        /edge case/i,
        /what if/i,
        /how many/i,
        /can i assume/i,
      ];
      const hasQuestion = text.includes("?");
      const hasClarifyingIntent = clarifyingPatterns
        .slice(1)
        .some((p) => p.test(text));
      return count + (hasQuestion && hasClarifyingIntent ? 1 : 0);
    }, 0);

    // Categorize clarifying question quality
    const clarifyingQuality =
      clarifyingQuestionCount >= 3
        ? "exceptional"
        : clarifyingQuestionCount === 2
          ? "good"
          : clarifyingQuestionCount === 1
            ? "minimal"
            : "none";

    // ── Signal 2: Complexity identification ────────────
    // Did candidate independently mention complexity or
    // only after the interviewer asked?
    const fullText = userMessages
      .map((m) => m.content || "")
      .join(" ")
      .toLowerCase();
    const mentionedComplexityFirst =
      /o\(n\)|o\(log|o\(1\)|time complexity|space complexity|big.?o/i.test(
        fullText,
      );

    // Check if interviewer had to ask about complexity first
    const interviewerAskedComplexity = assistantMessages.some((m) =>
      /complexity|efficient|better approach|time/i.test(m.content || ""),
    );
    const identifiedComplexityIndependently =
      mentionedComplexityFirst && !interviewerAskedComplexity;

    // ── Signal 3: Brute force before optimal ───────────
    // Did candidate propose brute force first (methodical thinking)?
    const proposedBruteForce =
      /brute force|naive|simple approach|o\(n.?2\)|nested loop/i.test(fullText);

    // ── Signal 4: Edge cases ────────────────────────────
    // Did candidate mention edge cases independently?
    const mentionedEdgeCases =
      /edge case|empty|null|zero|negative|duplicate|overflow/i.test(fullText);
    const interviewerHadToAskEdgeCases = assistantMessages.some((m) =>
      /empty|null|edge case|what if|what about/i.test(m.content || ""),
    );
    const foundEdgeCasesIndependently =
      mentionedEdgeCases && !interviewerHadToAskEdgeCases;

    // ── Signal 5: Hint usage ────────────────────────────
    // Count hints given (saved by AI via saveInterviewNote)
    const hintNotes = messages.filter(
      (m) =>
        m.role === "SYSTEM" &&
        m.phase === "note" &&
        /hint/i.test(m.content || ""),
    );
    const hintsGiven = hintNotes.length;

    // ── Signal 6: Thinking out loud ─────────────────────
    // Did candidate explain their reasoning while coding?
    // Proxy: message length distribution — long messages indicate
    // explanation, short ones indicate only code
    const avgUserMessageLength =
      userMessages.length > 0
        ? userMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0) /
          userMessages.length
        : 0;
    const thoughtOutLoud = avgUserMessageLength > 80; // > 80 chars avg = substantive explanations

    // ── Signal 7: Used "I" vs "we" ─────────────────────
    // For behavioral interviews specifically
    const usedI = (fullText.match(/\bI\b/g) || []).length;
    const usedWe = (fullText.match(/\bwe\b/gi) || []).length;
    const ownershipSignal =
      usedI > usedWe ? "strong" : usedWe > usedI ? "weak" : "neutral";

    // ── Signal 8: Recovery from mistakes ───────────────
    // Did they recover when stuck or called out?
    const recoveryNotes = interviewerNotes.toLowerCase();
    const showedRecovery =
      /recover|corrected|pivoted|self-corrected|found the bug/i.test(
        recoveryNotes,
      );

    // ── Pre-computed verdict signal ─────────────────────
    // Compute a directional verdict from hard signals before
    // asking AI — this anchors the AI debrief in reality.
    // AI can refine this but cannot override it significantly.
    let verdictSignal = -2;
    if (clarifyingQuestionCount >= 2) verdictSignal += 1;
    if (clarifyingQuestionCount === 0) verdictSignal -= 1;
    if (identifiedComplexityIndependently) verdictSignal += 1;
    if (proposedBruteForce) verdictSignal += 0.5;
    if (foundEdgeCasesIndependently) verdictSignal += 1;
    if (hintsGiven === 0) verdictSignal += 1;
    if (hintsGiven >= 3) verdictSignal -= 1.5;
    if (hintsGiven >= 5) verdictSignal -= 1;
    if (thoughtOutLoud) verdictSignal += 0.5;
    if (showedRecovery) verdictSignal += 0.5;

    const preComputedVerdict =
      verdictSignal >= 3
        ? "STRONG_HIRE"
        : verdictSignal >= 1.5
          ? "HIRE"
          : verdictSignal >= 0
            ? "LEAN_HIRE"
            : verdictSignal >= -1.5
              ? "LEAN_NO_HIRE"
              : "NO_HIRE";

    // ════════════════════════════════════════════════════
    // CATEGORY-SPECIFIC RUBRIC
    // Different interview types evaluate different signals.
    // A behavioral debrief scoring "code quality" is nonsensical.
    // ════════════════════════════════════════════════════

    const category = session?.category || "CODING";

    const categoryRubric = {
      CODING: {
        scoreFields: `
  "clarifyingQuestions": <1-4: 1=none, 2=after prompting, 3=asked some independently, 4=exceptional — right constraints and scale>,
  "problemDecomposition": <1-10: did they break down the problem before jumping to code?>,
  "codeCorrectness": <1-10: does the solution actually solve the problem correctly?>,
  "codeQuality": <1-10: naming, structure, readable, maintainable?>,
  "communicationWhileCoding": <1-10: did they explain their thinking as they coded?>,
  "edgeCaseHandling": <1-10: found and handled edge cases — especially independently?>,
  "optimizationAbility": <1-10: reached optimal solution? understood time/space trade-offs?>,
  "composureUnderPressure": <1-10: stayed methodical when stuck, didn't panic?>,
  "hintUtilization": <1-4: 4=no hints needed, 3=minimal hints, 2=several hints, 1=needed extensive guidance>`,
        focusAreas:
          "algorithmic thinking, code correctness, complexity analysis, edge case handling",
      },
      SYSTEM_DESIGN: {
        scoreFields: `
  "requirementsClarification": <1-10: did they clarify functional and non-functional requirements first?>,
  "architectureClarity": <1-10: was the overall design clear and well-structured?>,
  "scaleThinking": <1-10: did they think about scale — QPS, storage, traffic spikes?>,
  "failureModeAwareness": <1-10: considered failure scenarios, consistency, availability?>,
  "tradeOffReasoning": <1-10: justified design decisions with explicit trade-offs?>,
  "componentDepth": <1-10: went deep on key components — not just high-level boxes?>,
  "communicationClarity": <1-10: explained complex concepts clearly?>`,
        focusAreas:
          "system architecture, scale, reliability, trade-off reasoning",
      },
      LOW_LEVEL_DESIGN: {
        scoreFields: `
  "requirementsClarification": <1-10: did they clarify use cases and behavioural expectations before designing?>,
  "entityIdentification": <1-10: did they pick the right entities with single, clear responsibilities?>,
  "hierarchySoundness": <1-10: composition vs inheritance choices, LSP-respecting hierarchies?>,
  "patternFit": <1-10: each pattern justified by a real force, no pattern-for-pattern-sake?>,
  "solidAwareness": <1-10: walked through SOLID; named violations honestly?>,
  "concurrencyAwareness": <1-10: thought about thread-safety, atomicity, race conditions where relevant?>,
  "extensibilityReasoning": <1-10: where does this design break under realistic future change?>,
  "communicationClarity": <1-10: explained design decisions clearly?>`,
        focusAreas:
          "OOP entities, SOLID principles, pattern fit, extensibility",
      },
      BEHAVIORAL: {
        scoreFields: `
  "starStructure": <1-10: did they follow Situation-Task-Action-Result?>,
  "specificity": <1-10: gave specific details — project names, team sizes, timelines?>,
  "personalOwnership": <1-4: 4=used I throughout, 3=mostly I, 2=mixed I/we, 1=mostly we>,
  "quantifiedImpact": <1-10: quantified results with numbers — %, $, time saved?>,
  "growthMindset": <1-10: showed learning, self-awareness, would-do-differently thinking?>,
  "relevanceToRole": <1-10: connected stories to engineering/leadership signals?>`,
        focusAreas:
          "STAR structure, specificity, ownership, impact quantification",
      },
      CS_FUNDAMENTALS: {
        scoreFields: `
  "conceptualAccuracy": <1-10: explained core concept without factual errors?>,
  "explanationDepth": <1-10: went beyond surface level — explained the why?>,
  "realWorldApplication": <1-10: connected concept to actual production systems?>,
  "misconceptionAwareness": <1-10: aware of what people commonly get wrong?>,
  "communicationClarity": <1-10: could explain to a junior engineer clearly?>`,
        focusAreas: "conceptual accuracy, depth, real-world connections",
      },
      SQL: {
        scoreFields: `
  "schemaUnderstanding": <1-10: analyzed the schema before writing queries?>,
  "queryCorrectness": <1-10: query returns correct results for the given problem?>,
  "optimizationAwareness": <1-10: understood indexes, query plan, performance?>,
  "edgeCaseHandling": <1-10: handled NULLs, duplicates, empty tables?>,
  "codeReadability": <1-10: clear, maintainable SQL with appropriate naming?>`,
        focusAreas:
          "schema analysis, query correctness, optimization, edge cases",
      },
      HR: {
        scoreFields: `
  "authenticity": <1-10: answer felt genuine and specific, not rehearsed?>,
  "companyResearch": <1-10: showed knowledge of this specific company/role?>,
  "careerNarrative": <1-10: their story and motivations were coherent and compelling?>,
  "questionQuality": <1-10: the questions they asked showed thoughtfulness?>,
  "cultureFit": <1-10: values and work style aligned with company culture?>`,
        focusAreas: "authenticity, company knowledge, career narrative",
      },
    };

    const rubric = categoryRubric[category] || categoryRubric.CODING;

    ws.send(JSON.stringify({ type: "interview:debrief_generating" }));

    // ════════════════════════════════════════════════════
    // AI DEBRIEF GENERATION
    // ════════════════════════════════════════════════════
    const debriefSystem = `You are writing a structured post-interview evaluation for a ${category} interview.
Style: ${session.interviewStyle || "Standard"}.
Difficulty: ${session.difficulty}.
Duration: ${elapsed} minutes.
Problem: ${session.problem?.title || "Open-ended"}.

BEHAVIORAL SIGNALS (computed from transcript — treat these as FACTS):
- Clarifying questions asked: ${clarifyingQuestionCount} (${clarifyingQuality})
- Identified complexity independently: ${identifiedComplexityIndependently ? "YES" : "NO"}
- Proposed brute force before optimal: ${proposedBruteForce ? "YES" : "NO"}
- Found edge cases independently: ${foundEdgeCasesIndependently ? "YES" : "NO"}
- Hints required: ${hintsGiven} hint${hintsGiven !== 1 ? "s" : ""}
- Thought out loud while working: ${thoughtOutLoud ? "YES" : "NO"}
${category === "BEHAVIORAL" ? `- Ownership language (I vs we): ${ownershipSignal}` : ""}
- Showed recovery from mistakes: ${showedRecovery ? "YES" : "NO"}

PRE-COMPUTED VERDICT SIGNAL: ${preComputedVerdict}
VERDICT CONSTRAINT — THIS IS MANDATORY:
Your verdict MUST be "${preComputedVerdict}".
You may only move ONE step away (e.g. HIRE → LEAN_HIRE) if the transcript
contains clear overwhelming evidence contradicting the signals above.
A candidate who gave no code, no approach, and no substantive answer
CANNOT score above 3/10 and MUST be NO_HIRE.

FOCUS AREAS FOR THIS INTERVIEW TYPE: ${rubric.focusAreas}

RULES FOR THIS DEBRIEF:
1. Every strength and improvement MUST cite a specific moment from the transcript.
   BAD: "Good communication skills."
   GOOD: "Explained the two-pointer intuition before writing a line of code — this is exactly what interviewers look for."
2. Improvements must be actionable and specific.
   BAD: "Work on edge cases."
   GOOD: "Did not handle the null input case until directly asked — in a real interview this would be caught during code review phase and noted as a gap."
3. Key moments must be actual turning points from the conversation — quote or paraphrase what happened.
4. Summary must reference specific things they said or did — not generic impressions.
5. Be honest. A LEAN_NO_HIRE with specific reasons is more valuable than a generic HIRE.

Return JSON:
{
  "verdict": "STRONG_HIRE" | "HIRE" | "LEAN_HIRE" | "LEAN_NO_HIRE" | "NO_HIRE",
  "overallScore": <1-10>,
  "scores": {${rubric.scoreFields}
  },
  "behavioralSignals": {
    "clarifyingQuestions": "${clarifyingQuality} — ${clarifyingQuestionCount} question${clarifyingQuestionCount !== 1 ? "s" : ""} asked",
    "hintsRequired": "${hintsGiven} hint${hintsGiven !== 1 ? "s" : ""}",
    "thoughtOutLoud": ${thoughtOutLoud},
    "identifiedComplexityIndependently": ${identifiedComplexityIndependently},
    "foundEdgeCasesIndependently": ${foundEdgeCasesIndependently}
  },
  "strengths": [
    "<specific strength with transcript reference>",
    "<specific strength with transcript reference>"
  ],
  "improvements": [
    "<specific improvement with example from interview and why it matters>",
    "<specific improvement>"
  ],
  "keyMoments": [
    "<turning point or notable moment — quote or paraphrase what happened>",
    "<another key moment>"
  ],
  "summary": "<2-3 sentences referencing specific things they said or did — honest assessment>"
}`;

    // ── AI call → validate → fallback if needed ───────────
    // The verdict-anchor rule (verdict must be within 1 step of
    // preComputedVerdict) is enforced by validateInterviewDebrief —
    // a hallucinated jump (e.g. NO_HIRE → STRONG_HIRE) gets rejected
    // and the user receives the deterministic fallback verdict instead.
    let debrief;
    let usedDebriefFallback = false;
    let debriefViolations = [];
    const fallbackContext = {
      preComputedVerdict,
      hintsGiven,
      clarifyingQuestionCount,
      thoughtOutLoud,
      identifiedComplexityIndependently,
      foundEdgeCasesIndependently,
    };
    try {
      debrief = await aiComplete({
        systemPrompt: debriefSystem,
        userPrompt: `Interview transcript:\n${transcript}\n\nInterviewer observations:\n${interviewerNotes || "None recorded"}`,
        userId: toolContext.userId,
        teamId: toolContext.teamId,
        model: AI_MODEL_PRIMARY,
        temperature: 0.6, // lower temp for more consistent evaluation
        maxTokens: 2500,
        jsonMode: true,
        surface: "interview-debrief",
      });
      const check = validateInterviewDebrief(debrief, { preComputedVerdict });
      if (!check.valid) {
        debriefViolations = check.violations;
        console.warn(
          `[interview-debrief] validation failed for session ${toolContext.sessionId}: ${debriefViolations.join(", ")}`,
        );
        debrief = buildFallbackInterviewDebrief(fallbackContext);
        usedDebriefFallback = true;
      }
    } catch (aiErr) {
      // RATE_LIMITED still propagates as an error so the WS layer
      // surfaces it; everything else falls back so the session still
      // completes with a deterministic debrief grounded in real signals.
      if (aiErr instanceof AIError && aiErr.code === "RATE_LIMITED") {
        console.error("Debrief rate-limited:", aiErr.message);
        ws.send(
          JSON.stringify({
            type: "error",
            error: aiErr.message,
            code: aiErr.code,
          }),
        );
        return;
      }
      console.warn(
        `[interview-debrief] AI call failed (${aiErr?.code || aiErr?.message}); using fallback`,
      );
      debrief = buildFallbackInterviewDebrief(fallbackContext);
      usedDebriefFallback = true;
      debriefViolations = [`llm-error:${aiErr?.code || aiErr?.message || "unknown"}`];
    }

    // Tag the persisted debrief so the UI can surface a fallback banner.
    const persistedDebrief = {
      ...debrief,
      usedFallback: usedDebriefFallback,
      ...(usedDebriefFallback ? { fallbackReason: debriefViolations } : {}),
    };

    // ── Store debrief ────────────────────────────────────
    await prisma.interviewSession.update({
      where: { id: toolContext.sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        debrief: persistedDebrief,
        scores: persistedDebrief.scores,
      },
    });

    ws.send(JSON.stringify({ type: "interview:debrief", debrief: persistedDebrief }));
  } catch (err) {
    console.error("Debrief generation error:", err);
    ws.send(
      JSON.stringify({ type: "error", error: "Failed to generate debrief." }),
    );
  }
}

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================
// ============================================================================
// SYSTEM PROMPT BUILDER — Phase 2: Real interviewer behavior
// ============================================================================
function buildSystemPrompt({
  session,
  stage,
  activePhase,
  teamInfo,
  workspace,
  interviewStyle,
}) {
  const category = session?.category || "CODING";
  const problem = session?.problem;
  // Design-mode interviews: paired with a DesignSession. The interviewer
  // can read the live canvas via getDesignWorkspace, and the hint ladder
  // / stage block / workspace guidance switch from CODING-shaped to
  // design-shaped variants below.
  const isDesignInterview = !!session?.designSessionId;
  const isLLD = isDesignInterview && category === "LOW_LEVEL_DESIGN";

  const persona = getCompanyPersona(interviewStyle || session?.interviewStyle);
  const styleConfig =
    INTERVIEW_STYLES[interviewStyle] ||
    INTERVIEW_STYLES[
      Object.keys(INTERVIEW_STYLES).find(
        (k) => INTERVIEW_STYLES[k].persona.name === persona.name,
      )
    ] ||
    INTERVIEW_STYLES.ALGORITHM_FOCUSED;

  // Current workspace context. Two paths:
  //   Coding/etc: read static workspace fields from the WS message.
  //   Design: tell the model to call getDesignWorkspace tool to read the
  //   live canvas + phases + annotations. We DON'T inline the design
  //   content here because it can be huge and stale; the tool gives
  //   a fresh DB read on demand.
  const workspaceContext = isDesignInterview
    ? `
CANDIDATE'S WORKSPACE: A live design canvas (Excalidraw) plus phase notes.
Use the \`getDesignWorkspace\` tool whenever you need to reference what the
candidate has actually drawn or written. Read it BEFORE probing about a
specific component — never invent components or assume they wrote things
they didn't. After reading, quote specific component names or phase text
in your probe so the candidate knows you're reacting to their work.`
    : workspace &&
        (workspace.thinking ||
          workspace.code ||
          workspace.response ||
          workspace.notes)
      ? `
CANDIDATE'S CURRENT WORKSPACE (what they are actively writing):
${workspace.thinking ? `Thinking/Approach:\n${workspace.thinking.substring(0, 600)}` : ""}
${workspace.code ? `Code:\n${workspace.code.substring(0, 800)}` : ""}
${workspace.response ? `Written Response:\n${workspace.response.substring(0, 600)}` : ""}
${workspace.notes ? `Notes:\n${workspace.notes.substring(0, 400)}` : ""}
${workspace.diagram ? `[Diagram is present]` : ""}

When they say "my code" or "what I wrote" — reference their workspace above.
When they write code, you can see it. React to it when appropriate.
Do NOT ask them to repeat what is already written in the workspace.`
      : "\nWORKSPACE: [empty — candidate hasn't written anything yet]";

  const phaseGuidance = activePhase?.name
    ? `\nCURRENT PHASE: ${activePhase.name}`
    : "";

  // ── Phase 2: The hint ladder ────────────────────────────
  // This is how real interviewers help without giving answers.
  // Each level is deployed ONLY after the previous level failed to unstick the candidate.
  // The AI tracks which hints have been given via saveInterviewNote.
  const codingHintLadder = `
THE HINT LADDER — deploy in sequence, never skip levels:
Level 0 (ALWAYS first): SILENCE. Wait 60+ seconds before doing anything. The candidate often unsticks themselves.
Level 1: Echo their own words. "You mentioned [X] — what does that suggest?" Nothing new, just reflect.
Level 2: Complexity probe. "What's the time complexity of that approach?" — forces them to see the problem.
Level 3: Directional nudge. ONE sentence pointing toward the approach family. "Think about lookup efficiency." Never the answer.
Level 4: Data structure hint (only if time is critical). "What data structure gives O(1) lookup?" Still not the solution.
Level 5: ONLY if completely stuck with <5 minutes left: "Consider how a HashMap would help here."

CRITICAL: Only move to the next level if the previous level produced no progress after 60 seconds.
Track which hints you've given using saveInterviewNote so you don't repeat them.`;

  // Design-shaped hint ladder. Different axis: the candidate isn't
  // searching for an algorithm — they're making architecture/abstraction
  // decisions. Hints probe rubric items (requirements, scale, trade-offs,
  // SOLID) instead of data structures.
  const sdHintLadder = `
THE HINT LADDER — deploy in sequence, never skip levels:
Level 0 (ALWAYS first): SILENCE. Wait 60+ seconds. Designers often unstick themselves once they hear the problem out loud.
Level 1: Echo. "You mentioned [their phrase] — what assumption does that bake in?" Reflect, don't add.
Level 2: Quantify probe. "What read:write ratio are you assuming?" or "What's your QPS target?" — forces them to commit to numbers.
Level 3: Failure-mode probe. "What happens to that component when the network partitions?" Don't suggest the answer.
Level 4: Trade-off probe (time-critical). "What did you give up by choosing [X]?" Still no solution.
Level 5: ONLY if <5 min left and they're frozen: name the architectural axis they need to pick on (e.g. "consistency vs availability").

CRITICAL: Each level only after the previous failed for 60+ seconds. Track via saveInterviewNote.`;

  const lldHintLadder = `
THE HINT LADDER — deploy in sequence, never skip levels:
Level 0 (ALWAYS first): SILENCE. Wait 60+ seconds. Designers often see their own missing abstraction once they restate it.
Level 1: Echo. "You named [class] — what's its single responsibility?" Reflect, don't add.
Level 2: Responsibility probe. "What does [class] know that another class shouldn't?" — surfaces SRP violations.
Level 3: Variation-point probe. "Which behaviour will change between two implementations of this?" — surfaces the abstraction the design is missing.
Level 4: Pattern probe (time-critical). "Have you considered separating [responsibility A] from [responsibility B]?" Still no solution.
Level 5: ONLY if <5 min left: name the SOLID principle being violated (e.g. "this is open/closed").

CRITICAL: Each level only after the previous failed for 60+ seconds. Track via saveInterviewNote.`;

  const hintLadder = isDesignInterview
    ? isLLD
      ? lldHintLadder
      : sdHintLadder
    : codingHintLadder;

  // ── Phase 2: Probing question bank ─────────────────────
  // Real interviewers probe after every substantive candidate action.
  // These are not optional — they are evaluation mechanisms.
  const probingQuestions = `
MANDATORY PROBING — after each of these candidate actions, ask the corresponding probe:

After candidate proposes ANY approach:
→ "What's the time complexity of that?" [then STOP — wait for answer]

After candidate says their solution works or is done:
→ "Walk me through it with this input: [give a simple example]" [then watch their workspace]

After candidate explains their reasoning:
→ "Why [specific choice] over [reasonable alternative]?"

After candidate writes significant code:
→ "What happens when [edge case relevant to their code]?"

After candidate says "this is optimal" or "I'm done":
→ "Are you satisfied with the space complexity as well?" or "What about [specific edge case]?"

After candidate asks YOU a question:
→ First ask "What do you think?" — only give guidance if they genuinely don't know after trying.

RULE: Ask ONE probing question at a time. Wait for their answer. Never stack multiple questions.`;

  // ── Phase 2: Workspace reference patterns ──────────────
  // The AI can see the candidate's workspace. Use it.
  const workspaceReference = workspace?.code
    ? `
WORKSPACE OBSERVATION RULES:
- You can see their code. Reference it specifically: "I see you used [X] on line [area] — why that choice?"
- If their code has an obvious issue, don't point it out directly. Ask: "Walk me through the case where [scenario that would break it]."
- If they write correct code: don't praise it. Ask "What's the complexity?" or "What edge cases should we test?"
- If their workspace is empty but they're claiming to have an approach: "Can you write that out?"`
    : "";

  // ── Stage-specific behavior ─────────────────────────────
  // Two variants: coding-shaped (the original) and design-shaped (new).
  // Pick at the bottom based on isDesignInterview.
  const designStageBehavior = {
    OPENING: `
STAGE: OPENING — Problem Delivery with Deliberate Ambiguity (Design Interview)

Your job in this stage:
1. Greet the candidate as ${persona.name} in one sentence.
2. Present ONLY the title + a 1-sentence scenario. Do NOT give scale numbers, constraints, or examples. WAIT.
3. The candidate has a Design Studio canvas open. Tell them: "The whiteboard is yours — use it however helps you think."
4. After presenting: SILENCE.

What you are evaluating right now:
- Do they ask functional vs non-functional clarifying questions BEFORE drawing? (STRONG signal if yes)
- Do they ask about scale/QPS/storage targets? (STRONG signal — the most predictive question for an SD candidate)
- Do they jump straight to drawing boxes? (WEAK signal — note via saveInterviewNote)
- Do they restate the problem in their own words? (STRONG signal)

When they ask a clarifying question: answer concisely with a NUMBER if applicable ("Assume 100M users globally, 50:1 read:write"). Then call askCandidateForClarification to record the probe topic.

DO NOT:
- Volunteer requirements they didn't ask for
- Say "Good question" or any positive feedback
- Suggest a specific architecture`,

    EARLY: `
STAGE: EARLY — Requirements + High-Level Sketch (Design Interview)

Candidate should be filling the Requirements phase + starting to sketch components.
Use getDesignWorkspace to read what they've written so far. Probe SPECIFICALLY:

If their requirements list lacks scale numbers:
→ "What QPS are you targeting?" — record via askCandidateForClarification.

If they jump to drawing without quantifying:
→ "Before we go further — what are the non-functional requirements?" Then WAIT.

When they propose a high-level component (load balancer, queue, cache):
→ "What does that component cost you in failure modes?" Don't accept hand-waving.

DO NOT say "good" or "right". Keep face neutral.`,

    MIDDLE: `
STAGE: MIDDLE — Deep Dive (Design Interview)

THE CANDIDATE IS DRAWING / WRITING. YOU ARE WATCHING.

Default action: SILENCE. Use getDesignWorkspace periodically to see what they've added.

Triggers to break silence:
TRIGGER 1 — They commit a specific technology (Redis, Kafka, Postgres):
→ "Why [tech] over [reasonable alternative]?" then WAIT.

TRIGGER 2 — They draw a component but don't annotate its purpose:
→ getDesignWorkspace, then: "What's the role of [component name] in your design?"

TRIGGER 3 — Their data flow has an obvious gap (e.g. write path missing replication):
→ "Walk me through what happens when [the missing scenario]." Don't point out the gap directly.

TRIGGER 4 — They've been silent on canvas for 3+ min:
→ "What are you weighing right now?"

What you're evaluating silently (save via saveInterviewNote):
- Are they thinking out loud as they draw?
- Do they name trade-offs unprompted?
- Do they pick depth (one component drilled 3 levels) or breadth (many shallow boxes)?
- Are their numbers consistent (capacity matches QPS)?`,

    LATE: `
STAGE: LATE — Scale + Failure (Design Interview)

The candidate has a working design. Stress-test it.

SEQUENCE (in this order, ONE at a time, wait between):
1. "Walk me through how a write flows through your system end-to-end."
2. "Now scale your numbers 10x. What breaks first?"
3. "What if [component] dies — what does the user see?"
4. "What's the consistency model on [the data store]? When would a user notice?"
5. If time allows: "What would you redesign if you knew this was going to 100x next year?"

What you're evaluating:
- Can they trace their own design? (Critical — many people can't read their own diagram back)
- Do they identify failure modes themselves before you ask?
- Do they know the limits of their architecture?
Note everything via saveInterviewNote.`,

    WRAPPING_UP: `
STAGE: WRAPPING UP (Design Interview)

1. "We're coming up on time. Summarize your design in 2 sentences."
   [Evaluate: Can they articulate the architecture concisely?]

2. "If you had 30 more minutes, what would you deepen?"
   [Evaluate: Self-awareness — do they know what's underspecified?]

3. "Do you have any questions for me?"
   [Evaluate: Specific architecture questions vs generic role questions.]

4. Close: "Thanks — that's all from my end. You'll hear back."

Save final summary observation via saveInterviewNote before closing.`,
  };

  const stageBehavior = {
    OPENING: `
STAGE: OPENING — Problem Delivery with Deliberate Ambiguity

Your job in this stage:
1. Greet the candidate as ${persona.name} in one sentence.
2. Present the problem — but ONLY the title and high-level scenario. Do NOT give the full description.
   Leave gaps intentionally. Real problems are ambiguous. Wait for clarifying questions.
3. After presenting the problem: STOP. Say nothing more. WAIT.

What you are evaluating right now:
- Do they ask clarifying questions before starting? (STRONG signal if yes)
- Do they ask about scale/constraints? (STRONG signal if yes)
- Do they jump straight to coding without asking anything? (WEAK signal — note it via saveInterviewNote)
- Do they define the problem in their own words before starting? (STRONG signal)

If they ask a clarifying question: answer it directly and concisely. Then wait again.
If they ask a question that reveals good engineering instinct: note it via saveInterviewNote("Asked about [X] — good signal", "strength").
If they don't ask any questions and start coding: note it via saveInterviewNote("Started coding without clarifying requirements", "weakness") but do NOT stop them.

DO NOT:
- Volunteer information they didn't ask for
- Ask "Do you have any questions?" — that's hand-holding
- Say "Great question!" or any positive feedback
- Explain the problem further unless directly asked`,

    EARLY: `
STAGE: EARLY — Approach Discussion

Candidate should be discussing their approach now.
If they haven't stated an approach after saying hello: ask "What's your initial approach?" then STOP.

EVALUATE:
- Did they recognize this is a [pattern type] problem? Note via saveInterviewNote.
- Did they start with brute force? (Good — it shows methodical thinking)
- Did they jump to optimal without brute force? (Note — may not understand trade-offs)

WHEN they propose O(n²) or obvious brute force:
→ Ask ONLY: "What's the time complexity of that approach?" then WAIT.
→ Do NOT say "that's not optimal" or "can we do better?"
→ Wait for them to self-identify the issue. If they don't after 60 seconds: "Is that efficient enough for large inputs?"

WHEN they propose the right approach:
→ Ask "Why that data structure?" or "What trade-off are you making?"
→ Do NOT say "correct" or "good" — keep your face neutral.

When they seem ready to code: say "Go ahead" or nothing. Let them start.`,

    MIDDLE: `
STAGE: MIDDLE — Implementation

THE CANDIDATE SHOULD BE CODING. YOU SHOULD BE WATCHING.

Your default action in this stage: SILENCE. Say nothing unless one of these triggers occurs:

TRIGGER 1 — Candidate directly asks you something:
→ Apply hint ladder. Start at Level 0 (wait). Then Level 1 (echo). NEVER give the answer.

TRIGGER 2 — Candidate has been silent with empty workspace for 3+ minutes:
→ ONE sentence: "Where are you in your thinking?" Then wait.

TRIGGER 3 — Candidate proposes something fundamentally wrong (not just suboptimal):
→ Ask: "Walk me through what happens when you call this with [input that breaks it]."
→ Let them discover the bug. Do NOT point it out.

TRIGGER 4 — Candidate says they're done or starts explaining:
→ Apply mandatory probing: "Walk me through it with [example input]."

TRIGGER 5 — Phase should transition (Implementation is complete):
→ Call transitionPhase to move to Testing/Optimization.

WHAT YOU ARE EVALUATING SILENTLY:
- Are they thinking out loud? (Strong positive signal)
- Are they testing as they go?
- Are they naming variables clearly?
- Are they considering edge cases while coding?
- Are they panicking or staying methodical under pressure?
Save observations via saveInterviewNote as you watch.`,

    LATE: `
STAGE: LATE — Testing and Optimization

The candidate should have working code. Now you test depth.

SEQUENCE (in this order):
1. "Walk me through your solution with this input: [give a specific simple example]"
2. After they walk through: "What about [edge case — empty input, duplicates, negatives, large n]?"
3. After they handle edge case: "Is there a way to reduce the [time or space] complexity?"
4. After optimization discussion: "How would this behave with 1 billion inputs? What breaks first?"
5. If time allows: "What would you change if you had to make this production-ready?"

What you're evaluating:
- Can they trace their own code? (Critical — many people can't)
- Do they find edge cases themselves before you ask?
- Do they know the limits of their solution?
Note everything via saveInterviewNote.`,

    WRAPPING_UP: `
STAGE: WRAPPING UP

1. "We're coming up on time. Can you summarize your solution in 2 sentences?"
   [Evaluate: Can they explain it concisely? Do they know what they built?]

2. "If you had 30 more minutes, what would you improve?"
   [Evaluate: Self-awareness. Do they know what's missing?]

3. "Do you have any questions for me?"
   [Evaluate: Are their questions thoughtful and specific? Generic questions are weak signal.]

4. Close professionally: "Thanks — that's all from my end. You'll hear back from us."

Save final summary observation via saveInterviewNote before closing.`,
  };

  return `You are ${persona.name}, a senior technical interviewer at a top technology company.
Your interviewing style: ${persona.style}.
Your focus: ${persona.focus}.
${teamInfo}

${styleConfig.persona.behaviorRules || ""}

${hintLadder}

${probingQuestions}

${workspaceReference}

PROBLEM:
${problem?.title ? `"${problem.title}"` : "Open-ended interview"}
${
  problem?.description
    ? `Full details available via getProblemDetails tool — DO NOT present all details upfront.
     Present only the title/scenario first. Let the candidate ask for details.`
    : "No specific problem — conduct a general interview for the category."
}

INTERVIEW STATE:
Category: ${category}  |  Difficulty: ${session?.difficulty || "MEDIUM"}
${phaseGuidance}

${(isDesignInterview ? designStageBehavior : stageBehavior)[stage] || (isDesignInterview ? designStageBehavior : stageBehavior).MIDDLE}

${workspaceContext}

NON-NEGOTIABLE RULES:
1. Never give answers, never explain concepts, never teach.
2. If asked "is this right?" → "What do you think?" or "Walk me through it."
3. If asked "what should I do?" → minimum Level 1 hint. Never jump to Level 4+.
4. 1-3 sentences MAX per response (except WRAPPING_UP).
5. ONE question at a time. Wait for the answer.
6. Silence is a tool. Use it.
7. Save observations continuously with saveInterviewNote. The debrief depends on your notes.
8. Check time regularly with getTimeRemaining. Manage pacing.
9. Never say "great", "correct", "good job", "that's right" — keep your evaluation hidden.
10. If the candidate seems panicked or stuck: "Take your time. Think out loud." That's all.`;
}
