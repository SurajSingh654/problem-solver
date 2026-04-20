/**
 * INTERVIEW ENGINE — GPT-4o powered conversation for AI Mock Interviews
 * Uses: streaming, function calling, conversation memory, phase management
 */
import OpenAI from "openai";
import prisma from "../lib/prisma.js";
import { getCompanyPersona } from "./interview.phases.js";

let openai = null;

function getClient() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// ── Tool Definitions ───────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "getProblemDetails",
      description:
        "Look up the full problem details including description and follow-up questions. Use at the start to present the problem.",
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
        "Get the candidate's skill level, experience, and history. ALWAYS call this at the START of the interview to calibrate difficulty.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "The user ID" },
        },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchTeammateSolutions",
      description:
        "Find how other team members solved this problem. Use internally — do NOT reveal teammates' solutions to the candidate.",
      parameters: {
        type: "object",
        properties: {
          problemId: { type: "string", description: "The problem ID" },
          limit: { type: "number", description: "Max results" },
        },
        required: ["problemId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "saveInterviewNote",
      description:
        "Save a performance observation for the debrief. Call this FREQUENTLY — after every significant moment, good or bad. These notes become the debrief.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Category: approach | communication | code_quality | time_management | knowledge_depth | problem_solving | collaboration",
          },
          observation: { type: "string", description: "Specific observation" },
          score: { type: "number", description: "Score 1-10" },
          phase: {
            type: "string",
            description: "Which interview phase this occurred in",
          },
        },
        required: ["topic", "observation", "score"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTimeRemaining",
      description:
        "Check time remaining and current phase. Call this EVERY 3-4 messages to manage pacing. If time is running low, transition to the next phase.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transitionPhase",
      description:
        "Move to the next interview phase. Call this when: (1) the current phase's time is up, (2) the candidate has covered the topic sufficiently, or (3) the candidate is stuck and it's time to move on.",
      parameters: {
        type: "object",
        properties: {
          nextPhase: {
            type: "string",
            description: "Name of the phase to transition to",
          },
          reason: { type: "string", description: "Why transitioning" },
        },
        required: ["nextPhase", "reason"],
      },
    },
  },
];

// ── Tool Execution ─────────────────────────────────────
async function executeTool(toolName, args, context) {
  console.log(
    `[Interview] Tool: ${toolName}(${JSON.stringify(args).slice(0, 100)})`,
  );

  switch (toolName) {
    case "getProblemDetails": {
      const problem = await prisma.problem.findUnique({
        where: { id: args.problemId },
        select: {
          title: true,
          difficulty: true,
          category: true,
          description: true,
          tags: true,
          realWorldContext: true,
          adminNotes: true,
          followUps: {
            orderBy: { order: "asc" },
            select: { question: true, difficulty: true, hint: true },
          },
        },
      });
      if (!problem) return JSON.stringify({ error: "Problem not found" });
      return JSON.stringify({
        ...problem,
        tags: JSON.parse(problem.tags || "[]"),
      });
    }

    case "getCandidateProfile": {
      const user = await prisma.user.findUnique({
        where: { id: args.userId },
        select: {
          username: true,
          currentLevel: true,
          targetCompanies: true,
          streak: true,
          longestStreak: true,
          _count: {
            select: { solutions: true, simSessions: true, quizAttempts: true },
          },
        },
      });
      if (!user) return JSON.stringify({ error: "User not found" });

      // Also get their 6D scores if available
      const solutions = await prisma.solution.findMany({
        where: { userId: args.userId },
        select: { confidenceLevel: true, patternIdentified: true },
      });

      const avgConfidence = solutions.length
        ? (
            solutions.reduce((sum, s) => sum + s.confidenceLevel, 0) /
            solutions.length
          ).toFixed(1)
        : 0;

      const patterns = [
        ...new Set(
          solutions
            .filter((s) => s.patternIdentified)
            .map((s) => s.patternIdentified),
        ),
      ];

      return JSON.stringify({
        username: user.username,
        level: user.currentLevel,
        targetCompanies: JSON.parse(user.targetCompanies || "[]"),
        solutionCount: user._count.solutions,
        simCount: user._count.simSessions,
        quizCount: user._count.quizAttempts,
        avgConfidence,
        patternsKnown: patterns,
        streak: user.streak,
      });
    }

    case "searchTeammateSolutions": {
      const solutions = await prisma.solution.findMany({
        where: {
          problemId: args.problemId,
          userId: { not: context.userId },
        },
        include: { user: { select: { username: true } } },
        take: args.limit || 3,
        orderBy: { confidenceLevel: "desc" },
      });
      return JSON.stringify(
        solutions.map((s) => ({
          username: s.user.username,
          pattern: s.patternIdentified,
          approach: s.optimizedApproach?.slice(0, 200),
          time: s.optimizedTime,
          space: s.optimizedSpace,
          confidence: s.confidenceLevel,
        })),
      );
    }

    case "saveInterviewNote": {
      await prisma.interviewMessage.create({
        data: {
          sessionId: context.sessionId,
          role: "tool",
          content: `Note: [${args.topic}] ${args.observation} (Score: ${args.score}/10)`,
          toolName: "saveInterviewNote",
          toolArgs: JSON.stringify(args),
          phase: args.phase || null,
        },
      });
      return JSON.stringify({ saved: true });
    }

    case "getTimeRemaining": {
      const session = await prisma.interviewSession.findUnique({
        where: { id: context.sessionId },
        select: { startedAt: true, duration: true, phases: true },
      });
      if (!session) return JSON.stringify({ error: "Session not found" });

      const elapsed = Math.round(
        (Date.now() - new Date(session.startedAt).getTime()) / 1000,
      );
      const remaining = Math.max(0, session.duration - elapsed);
      const phases = JSON.parse(session.phases || "[]");

      let cumulativeTime = 0;
      let currentPhase = phases[phases.length - 1]?.name || "Unknown";
      let currentPhaseTimeLeft = 0;
      for (const phase of phases) {
        cumulativeTime += phase.duration;
        if (elapsed < cumulativeTime) {
          currentPhase = phase.name;
          currentPhaseTimeLeft = cumulativeTime - elapsed;
          break;
        }
      }

      const nextPhaseIdx = phases.findIndex((p) => p.name === currentPhase) + 1;
      const nextPhase =
        nextPhaseIdx < phases.length ? phases[nextPhaseIdx]?.name : "End";

      return JSON.stringify({
        elapsed,
        remaining,
        totalDuration: session.duration,
        currentPhase,
        currentPhaseTimeLeft,
        nextPhase,
        percentComplete: Math.round((elapsed / session.duration) * 100),
        shouldTransition: currentPhaseTimeLeft <= 30,
      });
    }

    case "transitionPhase": {
      await prisma.interviewMessage.create({
        data: {
          sessionId: context.sessionId,
          role: "system",
          content: `Phase transition: → ${args.nextPhase} (${args.reason})`,
          phase: args.nextPhase,
        },
      });
      return JSON.stringify({ transitioned: true, newPhase: args.nextPhase });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ── Build System Prompt ────────────────────────────────
function buildSystemPrompt(
  session,
  persona,
  problem,
  currentPhase,
  messageCount,
) {
  const problemContext = problem
    ? `\n\nPROBLEM FOR THIS INTERVIEW:
Title: ${problem.title}
Category: ${problem.category}
Difficulty: ${problem.difficulty}
${problem.description ? `Description: ${problem.description}` : ""}
Tags: ${JSON.parse(problem.tags || "[]").join(", ")}
${problem.realWorldContext ? `Context: ${problem.realWorldContext}` : ""}
${problem.followUps?.length ? `\nFollow-up questions (use these to probe deeper during the interview):\n${problem.followUps.map((f, i) => `  ${i + 1}. [${f.difficulty}] ${f.question}`).join("\n")}` : ""}

IMPORTANT: You know this problem's answer. But you must NEVER reveal it. Your job is to evaluate if the CANDIDATE can solve it.`
    : `\n\nNO SPECIFIC PROBLEM ASSIGNED — generate an appropriate ${session.category.replace("_", " ")} question for this interview.`;

  const phaseInstruction = currentPhase
    ? `\n\nCURRENT PHASE: ${currentPhase.name} (${Math.round(currentPhase.duration / 60)} min allocated)
PHASE OBJECTIVE: ${currentPhase.description}
PHASE GUIDANCE: ${currentPhase.aiPrompt}`
    : "";

  const conversationStage =
    messageCount <= 2
      ? "OPENING"
      : messageCount <= 6
        ? "EARLY"
        : messageCount <= 15
          ? "MIDDLE"
          : messageCount <= 25
            ? "LATE"
            : "WRAPPING_UP";

  return `You are ${persona.name}, conducting a real technical interview.

SESSION INFO:
- Interview Style: ${session.company || "General"}
- Category: ${session.category.replace("_", " ")}
- Duration: ${session.duration / 60} minutes
- Conversation Stage: ${conversationStage} (message #${messageCount + 1})
- Session ID: ${session.id}
- Candidate User ID: ${session.userId}
- Timestamp: ${new Date().toISOString()}

PERSONA:
- Name: ${persona.name}
- Style: ${persona.style}
- Focus: ${persona.focus}

${persona.behaviorRules || ""}

═══════════════════════════════════════════════════
CORE INTERVIEWER RULES (override everything else)
═══════════════════════════════════════════════════

YOU ARE AN EVALUATOR, NOT A TEACHER.

What you MUST do:
- EVALUATE the candidate's knowledge through questions
- PROBE depth with follow-ups: "Why?" "What if?" "Trade-offs?"
- OBSERVE and record using saveInterviewNote (call this OFTEN)
- MANAGE TIME using getTimeRemaining (call every 3-4 messages)
- TRANSITION phases when time is up using transitionPhase
- At OPENING: call getCandidateProfile to calibrate difficulty
- At OPENING: call getProblemDetails if a problem is assigned
- Keep responses to 1-3 sentences. This is the candidate's time to talk, not yours.

What you MUST NEVER do:
- NEVER explain concepts, solutions, or approaches
- NEVER say "Let me explain..." or "Here's how this works..."
- NEVER give the answer when they're stuck
- NEVER teach during the interview
- NEVER correct their mistakes directly — ask questions that expose the mistake
- NEVER fill silence — let them think
- NEVER be overly encouraging — save praise for genuinely impressive moments

When they're stuck:
1. Wait. Say "Take your time" and STOP. Let them think.
2. If stuck > 30 seconds: ask a SIMPLER version (don't explain)
3. If still stuck: ONE directional nudge — "What data structure helps with X?" (not "Use a hash map")
4. If still stuck after the nudge: "Let's move on to [next topic]" — save the note for debrief
5. NEVER spend more than 2 minutes helping someone who is stuck

When they say "I don't know":
- "Okay. Let's try a different angle — [ask about something related they might know]"
- If they don't know the fundamentals: note it, move to next topic within 30 seconds
- NEVER explain what they don't know

CONVERSATION FLOW for stage ${conversationStage}:
${
  conversationStage === "OPENING"
    ? `
- This is the START. Introduce yourself briefly (1 sentence).
- IMMEDIATELY call getCandidateProfile to understand their level.
- If a problem is assigned, present it clearly and concisely.
- If no problem, generate an appropriate question for the category.
- Ask them to start: "Take a moment to think, then walk me through your approach."`
    : conversationStage === "EARLY"
      ? `
- The candidate should be discussing their approach.
- Ask clarifying questions: "What's the time complexity?" "Why that choice?"
- Don't accept vague answers. Push for specifics.
- Call saveInterviewNote for any significant observations.`
      : conversationStage === "MIDDLE"
        ? `
- Deep in the problem. They should be implementing or designing.
- Ask about their workspace: reference their code or diagram if available.
- Probe edge cases: "What happens if..." "What about when..."
- Check time with getTimeRemaining. Transition phases if needed.
- Use follow-up questions from the problem to probe deeper.`
        : conversationStage === "LATE"
          ? `
- Running low on time. Focus on what matters most.
- If they haven't tested: "Walk me through a test case."
- If they haven't discussed trade-offs: "What are the limitations?"
- Call getTimeRemaining to check — start wrapping up if < 5 min left.
- Make sure you have enough notes for a good debrief.`
          : `- Interview is almost over. 
- Ask: "Anything you'd want to improve about your solution?"
- Give them a chance for final questions.
- Call saveInterviewNote with final overall impressions.
- Do NOT introduce new topics.`
}
${problemContext}
${phaseInstruction}`;
}

// ── Load Conversation History ──────────────────────────
async function loadConversationHistory(sessionId, limit = 20) {
  const messages = await prisma.interviewMessage.findMany({
    where: {
      sessionId,
      role: { in: ["user", "assistant"] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });
  return messages.reverse().map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
}

// ── Count messages for conversation stage tracking ─────
async function getMessageCount(sessionId) {
  return await prisma.interviewMessage.count({
    where: {
      sessionId,
      role: { in: ["user", "assistant"] },
    },
  });
}

// ── Main Chat Handler ──────────────────────────────────
export async function handleInterviewChat({
  sessionId,
  userId,
  userMessage,
  workspaceSnapshot,
  currentPhase,
  session,
  sendChunk,
  sendComplete,
  sendError,
}) {
  try {
    const client = getClient();

    const history = await loadConversationHistory(sessionId);
    const messageCount = await getMessageCount(sessionId);
    const persona = getCompanyPersona(session.company);

    let problem = null;
    if (session.problemId) {
      problem = await prisma.problem.findUnique({
        where: { id: session.problemId },
        select: {
          title: true,
          difficulty: true,
          category: true,
          description: true,
          tags: true,
          realWorldContext: true,
          followUps: {
            orderBy: { order: "asc" },
            select: { question: true, difficulty: true },
          },
        },
      });
    }

    const phases = JSON.parse(session.phases || "[]");
    const phaseConfig = currentPhase
      ? phases.find((p) => p.name === currentPhase)
      : phases[0];

    const systemPrompt = buildSystemPrompt(
      session,
      persona,
      problem,
      phaseConfig,
      messageCount,
    );

    const messages = [{ role: "system", content: systemPrompt }, ...history];

    if (workspaceSnapshot) {
      const wsContent = [];
      if (workspaceSnapshot.code)
        wsContent.push(
          `[Code]:\n\`\`\`\n${workspaceSnapshot.code.slice(0, 1500)}\n\`\`\``,
        );
      if (workspaceSnapshot.diagram)
        wsContent.push(`[Diagram]: ${workspaceSnapshot.diagram.slice(0, 500)}`);
      if (workspaceSnapshot.notes)
        wsContent.push(`[Notes]: ${workspaceSnapshot.notes.slice(0, 500)}`);
      if (workspaceSnapshot.thinking)
        wsContent.push(
          `[Thinking]: ${workspaceSnapshot.thinking.slice(0, 500)}`,
        );

      if (wsContent.length > 0) {
        messages.push({
          role: "system",
          content: `WORKSPACE SNAPSHOT:\n${wsContent.join("\n\n")}`,
        });
      }
    }

    messages.push({ role: "user", content: userMessage });

    console.log(
      `[Interview] GPT-4o call: ${messages.length} msgs, stage: ${messageCount <= 2 ? "OPENING" : messageCount <= 6 ? "EARLY" : messageCount <= 15 ? "MIDDLE" : "LATE"}`,
    );

    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream: true,
      temperature: 0.85,
      max_tokens: 600,
    });

    let fullResponse = "";
    let toolCalls = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullResponse += delta.content;
        sendChunk(delta.content);
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = {
                id: tc.id || "",
                type: "function",
                function: { name: "", arguments: "" },
              };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name)
              toolCalls[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments)
              toolCalls[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }

      if (chunk.choices[0]?.finish_reason === "tool_calls") {
        const toolMessages = [];

        for (const tc of toolCalls) {
          if (!tc?.function?.name) continue;

          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {}

          const result = await executeTool(tc.function.name, args, {
            sessionId,
            userId,
            problemId: session.problemId,
          });

          toolMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });

          await prisma.interviewMessage.create({
            data: {
              sessionId,
              role: "tool",
              content: `Tool: ${tc.function.name}`,
              toolName: tc.function.name,
              toolArgs: tc.function.arguments,
              toolResult: result,
              phase: currentPhase,
            },
          });
        }

        const continuationMessages = [
          ...messages,
          {
            role: "assistant",
            content: fullResponse || null,
            tool_calls: toolCalls.filter(Boolean),
          },
          ...toolMessages,
        ];

        const followUp = await client.chat.completions.create({
          model: "gpt-4o",
          messages: continuationMessages,
          stream: true,
          temperature: 0.85,
          max_tokens: 500,
        });

        fullResponse = "";

        for await (const fChunk of followUp) {
          const fDelta = fChunk.choices[0]?.delta;
          if (fDelta?.content) {
            fullResponse += fDelta.content;
            sendChunk(fDelta.content);
          }
        }
      }
    }

    if (fullResponse) {
      await prisma.interviewMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: fullResponse,
          phase: currentPhase,
        },
      });
    }

    sendComplete(fullResponse);
  } catch (error) {
    console.error("[Interview] Chat error:", error.message);
    sendError(error.message);
  }
}

// ── Generate Debrief ───────────────────────────────────
export async function generateDebrief(sessionId) {
  try {
    const client = getClient();

    const messages = await prisma.interviewMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
        toolName: true,
        toolArgs: true,
        phase: true,
      },
    });

    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        problem: { select: { title: true, difficulty: true, category: true } },
      },
    });

    const persona = getCompanyPersona(session.company);

    const notes = messages
      .filter((m) => m.toolName === "saveInterviewNote")
      .map((m) => {
        try {
          return JSON.parse(m.toolArgs);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const conversationSummary = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map(
        (m) =>
          `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content.slice(0, 200)}`,
      )
      .join("\n");

    const systemPrompt = `You are generating a structured interview debrief for a ${session.company || "General"} style interview.

INTERVIEW STYLE: ${persona.style}
EVALUATION FOCUS: ${persona.focus}

The debrief should reflect what THIS type of interviewer would care about. For example:
- Algorithm-focused: evaluate problem-solving speed and optimization ability
- Values-driven: evaluate alignment with principles and specificity of examples
- Startup: evaluate pragmatism and breadth of knowledge
- High-pressure: evaluate speed and accuracy under pressure

Be HONEST. Don't inflate scores. A score of 5 means average — not good.
A "Hire" verdict means you'd actually recommend hiring this person at a real company.

ALWAYS respond in this exact JSON format:
{
  "overallScore": <number 1-10>,
  "verdict": "Strong Hire" | "Hire" | "Lean Hire" | "Lean No Hire" | "No Hire",
  "dimensions": {
    "approach": { "score": <1-10>, "feedback": "<specific feedback referencing the conversation>" },
    "communication": { "score": <1-10>, "feedback": "<specific feedback>" },
    "codeQuality": { "score": <1-10>, "feedback": "<specific feedback>" },
    "timeManagement": { "score": <1-10>, "feedback": "<specific feedback>" },
    "knowledgeDepth": { "score": <1-10>, "feedback": "<specific feedback>" }
  },
  "strengths": ["<specific strength from the interview>", "<another>"],
  "improvements": ["<specific area to improve>", "<another>"],
  "keyMoments": [
    { "type": "positive" | "concern", "description": "<specific moment from the conversation>" }
  ],
  "nextSteps": "<specific, actionable advice for what to practice next>"
}`;

    const userPrompt = `Generate a debrief for this interview:

Problem: ${session.problem?.title || "Open-ended"} (${session.problem?.category || session.category})
Difficulty: ${session.problem?.difficulty || "N/A"}
Duration: ${session.duration / 60} minutes
Style: ${session.company || "General"} (${persona.style})

INTERVIEWER NOTES (saved during the interview):
${notes.length > 0 ? notes.map((n) => `[${n.topic}] ${n.observation} (${n.score}/10) ${n.phase ? `[Phase: ${n.phase}]` : ""}`).join("\n") : "No notes were saved — evaluate based on conversation alone"}

FULL CONVERSATION:
${conversationSummary.slice(0, 4000)}

Generate an honest, specific debrief. Reference actual moments from the conversation. Don't be generic.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500,
    });

    const debrief = JSON.parse(response.choices[0]?.message?.content || "{}");

    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        debrief: JSON.stringify(debrief),
        overallScore: debrief.overallScore,
        approachScore: debrief.dimensions?.approach?.score,
        communicationScore: debrief.dimensions?.communication?.score,
        codeQualityScore: debrief.dimensions?.codeQuality?.score,
        timeMgmtScore: debrief.dimensions?.timeManagement?.score,
      },
    });

    console.log(
      `[Interview] Debrief: ${debrief.verdict} (${debrief.overallScore}/10)`,
    );
    return debrief;
  } catch (error) {
    console.error("[Interview] Debrief failed:", error.message);
    return null;
  }
}
