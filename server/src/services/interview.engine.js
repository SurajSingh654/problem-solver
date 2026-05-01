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

  const persona = getCompanyPersona(interviewStyle || session?.interviewStyle);
  const styleConfig =
    INTERVIEW_STYLES[interviewStyle] ||
    INTERVIEW_STYLES[
      Object.keys(INTERVIEW_STYLES).find(
        (k) => INTERVIEW_STYLES[k].persona.name === persona.name,
      )
    ] ||
    INTERVIEW_STYLES.ALGORITHM_FOCUSED;

  // Current workspace context
  const workspaceContext =
    workspace &&
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
  const hintLadder = `
THE HINT LADDER — deploy in sequence, never skip levels:
Level 0 (ALWAYS first): SILENCE. Wait 60+ seconds before doing anything. The candidate often unsticks themselves.
Level 1: Echo their own words. "You mentioned [X] — what does that suggest?" Nothing new, just reflect.
Level 2: Complexity probe. "What's the time complexity of that approach?" — forces them to see the problem.
Level 3: Directional nudge. ONE sentence pointing toward the approach family. "Think about lookup efficiency." Never the answer.
Level 4: Data structure hint (only if time is critical). "What data structure gives O(1) lookup?" Still not the solution.
Level 5: ONLY if completely stuck with <5 minutes left: "Consider how a HashMap would help here."

CRITICAL: Only move to the next level if the previous level produced no progress after 60 seconds.
Track which hints you've given using saveInterviewNote so you don't repeat them.`;

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

${stageBehavior[stage] || stageBehavior.MIDDLE}

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
