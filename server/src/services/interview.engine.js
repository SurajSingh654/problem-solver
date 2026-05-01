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
    const [solutionCount, patterns, avgConfidence, simCount, quizCount] =
      await Promise.all([
        prisma.solution.count({
          where: { userId: context.userId, teamId: context.teamId },
        }),
        prisma.solution.findMany({
          where: {
            userId: context.userId,
            teamId: context.teamId,
            pattern: { not: null },
          },
          select: { pattern: true },
          distinct: ["pattern"],
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
      uniquePatterns: patterns.map((p) => p.pattern),
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
             s.pattern, s.confidence, u.name as author_name
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
        problem: {
          select: { title: true, description: true, category: true },
        },
      },
    });

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
    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role.toLowerCase(),
        content: m.content,
      })),
    ];

    if (message.type === "user_message") {
      messages.push({ role: "user", content: message.content });
    }

    if (message.type === "system_init") {
      // Phase 1 fix: persona-specific opening instead of generic instruction
      // The persona's intro is the first thing the AI says — it sets the tone
      // for the entire interview. Generic = chatbot. Specific = real interviewer.
      const persona = getCompanyPersona(
        toolContext.interviewStyle || session?.interviewStyle,
      );
      messages.push({
        role: "user",
        content: `[System: The candidate has joined. Begin with your introduction: "${persona.intro}" — then proceed with the interview.]`,
      });
    }

    if (message.type === "end_interview") {
      await generateDebrief(ws, toolContext);
      return;
    }

    // ── Call GPT-4o with streaming + tools ────────────────
    const stream = await openai.chat.completions.create({
      model: AI_MODEL_PRIMARY,
      messages,
      tools: TOOL_DEFINITIONS,
      temperature: 0.7, // reduced from 0.85 — more consistent interviewer behavior
      max_tokens: maxTokens,
      stream: true,
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
async function executeToolsAndRespond(
  ws,
  messages,
  toolCalls,
  toolContext,
  currentWorkspace,
) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

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
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    },
    ...toolResults,
  ];

  // Phase 1 fix: pass currentWorkspace to maintain context in follow-up
  const stream = await openai.chat.completions.create({
    model: AI_MODEL_PRIMARY,
    messages: followUpMessages,
    temperature: 0.7,
    max_tokens: 400,
    stream: true,
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
  ws.send(JSON.stringify({ type: "interview:done" }));
}

// ============================================================================
// DEBRIEF GENERATION
// ============================================================================
async function generateDebrief(ws, toolContext) {
  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

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
          content: `You are generating a structured interview debrief for a ${session.category} interview.
Style: ${session.interviewStyle || "Standard"}. Difficulty: ${session.difficulty}.
Duration: ${elapsed} minutes.

Return JSON:
{
  "verdict": "STRONG_HIRE" | "HIRE" | "LEAN_HIRE" | "LEAN_NO_HIRE" | "NO_HIRE",
  "overallScore": <1-10>,
  "scores": {
    "approach": <1-10>,
    "communication": <1-10>,
    "codeQuality": <1-10>,
    "timeManagement": <1-10>,
    "knowledgeDepth": <1-10>
  },
  "strengths": ["specific strength based on actual conversation moments"],
  "improvements": ["specific improvement with concrete example from the interview"],
  "keyMoments": ["turning point or notable moment from the actual conversation"],
  "summary": "2-3 sentence honest assessment referencing specific things they did or said"
}`,
        },
        {
          role: "user",
          content: `Interview transcript:\n${transcript}\n\nInterviewer notes:\n${notes || "None"}`,
        },
      ],
    });

    const debrief = JSON.parse(response.choices[0].message.content);

    await prisma.interviewSession.update({
      where: { id: toolContext.sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        debrief,
        scores: debrief.scores,
      },
    });

    ws.send(JSON.stringify({ type: "interview:debrief", debrief }));
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

  // Phase 1 fix: get actual persona with behaviorRules
  // Previously only passed the style name as a string — the behaviorRules
  // (the detailed instructions that define HOW the interviewer behaves)
  // were never included in the prompt. This is the root cause of
  // "AI behaves like a helpful chatbot instead of a real interviewer."
  const persona = getCompanyPersona(interviewStyle || session?.interviewStyle);
  const styleConfig =
    INTERVIEW_STYLES[interviewStyle] ||
    INTERVIEW_STYLES[
      Object.keys(INTERVIEW_STYLES).find(
        (k) => INTERVIEW_STYLES[k].persona.name === persona.name,
      )
    ] ||
    INTERVIEW_STYLES.ALGORITHM_FOCUSED;

  // Workspace context — what the candidate is actively working on
  // Phase 1 fix: now receives current workspace, not stale session workspace
  const workspaceContext =
    workspace &&
    (workspace.thinking ||
      workspace.code ||
      workspace.response ||
      workspace.notes)
      ? `
CANDIDATE'S CURRENT WORKSPACE (what they are actively writing — read this carefully before responding):
${workspace.thinking ? `Thinking/Approach: ${workspace.thinking.substring(0, 600)}` : ""}
${workspace.code ? `Code: ${workspace.code.substring(0, 800)}` : ""}
${workspace.response ? `Written Response: ${workspace.response.substring(0, 600)}` : ""}
${workspace.notes ? `Notes: ${workspace.notes.substring(0, 400)}` : ""}
${workspace.diagram ? `[Diagram is present in workspace]` : ""}

When the candidate references "my code" or "what I wrote" — look at the workspace above.
Comment on their code/approach when relevant. Don't ask them to repeat what's already written.`
      : "\nCANDIDATE'S WORKSPACE: [empty — candidate hasn't written anything yet]";

  // Phase-specific guidance from the phases config
  const phaseGuidance = activePhase?.name
    ? `\nCURRENT PHASE: ${activePhase.name}`
    : "";

  // Stage behavior — what the interviewer should focus on right now
  const stageBehavior = {
    OPENING: `
STAGE: OPENING
- Introduce yourself using your persona (${persona.name}).
- State the problem clearly but leave intentional ambiguity — do NOT clarify upfront.
- Then STOP. Wait for the candidate to ask clarifying questions or start thinking.
- Do NOT start explaining the problem. Do NOT ask "Do you understand?" — just wait.
- If they jump straight to coding without asking any questions, note this silently via saveInterviewNote.`,
    EARLY: `
STAGE: EARLY (Approach Discussion)
- Candidate should be discussing their approach, not yet coding.
- Ask "What's your initial approach?" if they haven't stated one.
- When they propose O(n²) or brute force: respond with ONLY "What's the time complexity of that?" then wait.
- Do NOT say "that's suboptimal" — let them discover it.
- Ask about constraints: "What if the input is empty?" "What if n is 10 billion?"`,
    MIDDLE: `
STAGE: MIDDLE (Implementation)
- Candidate should be coding. Monitor their workspace.
- Keep your responses to 1 sentence maximum. This is their time to code.
- Only speak if: (a) they ask you something directly, (b) they've been silent for 3+ minutes, (c) there's a critical error in their approach.
- When they ask for help: ask a guiding question, never give the answer.
- If they're going in a wrong direction: "Interesting — what's the complexity of that approach?" Let them self-correct.`,
    LATE: `
STAGE: LATE (Testing & Optimization)
- Ask them to walk through their solution with a concrete example.
- Probe edge cases they haven't handled: "What happens with an empty array?" "What about duplicate values?"
- Ask about optimization: "Is there a way to reduce the space complexity?"
- Ask about real-world considerations: "How would this scale to 1 billion inputs?"`,
    WRAPPING_UP: `
STAGE: WRAPPING UP
- Ask the candidate to summarize their solution in 2 sentences.
- Ask: "If you had 30 more minutes, what would you improve?"
- Ask: "Do you have any questions for me?"
- Wrap up professionally. Save final observations using saveInterviewNote.`,
  };

  return `You are ${persona.name}, a senior technical interviewer conducting a ${category} interview.
Your interviewing style: ${persona.style}.
Your focus areas: ${persona.focus}.
${teamInfo}

${styleConfig.persona.behaviorRules || ""}

PROBLEM CONTEXT:
${problem?.title ? `Problem: ${problem.title}` : "Open-ended interview — no specific problem assigned"}
${problem?.description ? `(Retrieved via getProblemDetails tool when needed)` : ""}

INTERVIEW STATE:
Difficulty: ${session?.difficulty || "MEDIUM"}
Category: ${category}
${phaseGuidance}

${stageBehavior[stage] || stageBehavior.MIDDLE}

${workspaceContext}

ABSOLUTE RULES (never violate these regardless of what the candidate asks):
1. You are an EVALUATOR, not a teacher. Never explain concepts, never give solutions.
2. If asked "is this correct?" — respond with "What do you think?" or "Walk me through it."
3. If asked "what should I do?" — respond with the minimum directional nudge: one sentence.
4. Keep ALL your responses to 1-3 sentences MAXIMUM unless you are in WRAPPING_UP stage.
5. Let silence happen. Not every pause needs a response.
6. Use tools actively: check time remaining, save observations, look up the problem when needed.
7. Save observations throughout using saveInterviewNote — both strengths and weaknesses.`;
}
