/**
 * INTERVIEW ENGINE — LangChain-powered conversation for AI Mock Interviews
 * Uses: GPT-4o for quality, BufferWindowMemory for context, function calling for platform data
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
        "Look up the full problem details including description, follow-up questions, and admin notes. Use this when you need to reference the problem being discussed.",
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
        "Get the candidate's skill level, target company, solved problems count, and experience level. Use this to calibrate difficulty.",
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
        "Find how other team members solved this or similar problems. Use this to make comparisons or suggest alternative approaches.",
      parameters: {
        type: "object",
        properties: {
          problemId: { type: "string", description: "The problem ID" },
          limit: { type: "number", description: "Max results to return" },
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
        "Save a note about the candidate's performance for the debrief. Call this when you notice something significant — good or bad.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "What aspect: approach, communication, code_quality, time_management, knowledge_depth",
          },
          observation: { type: "string", description: "What you observed" },
          score: {
            type: "number",
            description: "Score 1-10 for this observation",
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
        "Check how much time is left in the interview and which phase the candidate should be in.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// ── Tool Execution ─────────────────────────────────────
async function executeTool(toolName, args, context) {
  console.log(`[Interview] Tool call: ${toolName}(${JSON.stringify(args)})`);

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
      return JSON.stringify({
        ...user,
        targetCompanies: JSON.parse(user.targetCompanies || "[]"),
        solutionCount: user._count.solutions,
        simCount: user._count.simSessions,
        quizCount: user._count.quizAttempts,
      });
    }

    case "searchTeammateSolutions": {
      const solutions = await prisma.solution.findMany({
        where: {
          problemId: args.problemId,
          userId: { not: context.userId },
        },
        include: {
          user: { select: { username: true } },
        },
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

      // Figure out which phase we should be in
      let cumulativeTime = 0;
      let currentPhase = phases[phases.length - 1]?.name || "Unknown";
      for (const phase of phases) {
        cumulativeTime += phase.duration;
        if (elapsed < cumulativeTime) {
          currentPhase = phase.name;
          break;
        }
      }

      return JSON.stringify({
        elapsed,
        remaining,
        totalDuration: session.duration,
        currentPhase,
        percentComplete: Math.round((elapsed / session.duration) * 100),
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ── Build System Prompt ────────────────────────────────
function buildSystemPrompt(session, persona, problem, currentPhase) {
  const problemContext = problem
    ? `\n\nPROBLEM BEING DISCUSSED:
Title: ${problem.title}
Category: ${problem.category}
Difficulty: ${problem.difficulty}
Description: ${problem.description || "No description provided"}
Tags: ${JSON.parse(problem.tags || "[]").join(", ")}
${problem.realWorldContext ? `Real World Context: ${problem.realWorldContext}` : ""}
${problem.followUps?.length ? `Follow-up questions to ask later:\n${problem.followUps.map((f, i) => `${i + 1}. ${f.question}`).join("\n")}` : ""}`
    : "";

  const phaseInstruction = currentPhase
    ? `\n\nCURRENT PHASE: ${currentPhase.name}\nPHASE GOAL: ${currentPhase.description}\nPHASE GUIDANCE: ${currentPhase.aiPrompt}`
    : "";

  return `You are ${persona.name}, a technical interviewer at ${session.company || "a top tech company"}.

PERSONA:
- Name: ${persona.name}
- Style: ${persona.style}
- Focus: ${persona.focus}

YOUR ROLE:
- You are conducting a ${session.category.replace("_", " ").toLowerCase()} interview
- The interview is ${session.duration / 60} minutes long
- Be conversational, natural, and encouraging but thorough
- Ask ONE question or make ONE point at a time — don't overwhelm
- Wait for the candidate to respond before asking the next question
- If the candidate is stuck for a while, offer a gentle hint
- Keep responses concise — 2-4 sentences typically, unless explaining something complex

WORKSPACE AWARENESS:
- You can see the candidate's workspace (code, diagram, notes)
- When they share workspace updates, comment on what you see
- If they're writing code, you can reference specific lines or patterns
- If they're drawing a diagram, reference specific components

RULES:
- Never give the answer directly — guide them to discover it
- Always explain WHY something matters, not just WHAT it is
- Use the saveInterviewNote tool when you notice significant strengths or weaknesses
- Use getTimeRemaining to manage pacing — nudge if they're spending too long on one phase
- Reference the problem details when discussing specifics
- Adapt difficulty based on the candidate's level (use getCandidateProfile if needed)

CONVERSATION STYLE:
- Start messages naturally — don't always start with "Great!" or "Good point"
- Vary your responses — sometimes ask, sometimes comment, sometimes challenge
- Use the candidate's name occasionally
- Show genuine interest in their thought process
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

  // Reverse to get chronological order
  return messages.reverse().map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
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

    // Load conversation history
    const history = await loadConversationHistory(sessionId);

    // Get persona
    const persona = getCompanyPersona(session.company);

    // Get problem details
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

    // Get current phase config
    const phases = JSON.parse(session.phases || "[]");
    const phaseConfig = currentPhase
      ? phases.find((p) => p.name === currentPhase)
      : phases[0];

    // Build system prompt
    const systemPrompt = buildSystemPrompt(
      session,
      persona,
      problem,
      phaseConfig,
    );

    // Build messages array
    const messages = [{ role: "system", content: systemPrompt }, ...history];

    // Add workspace context if provided
    if (workspaceSnapshot) {
      const wsContent = [];
      if (workspaceSnapshot.code)
        wsContent.push(
          `[Candidate's code editor]:\n\`\`\`\n${workspaceSnapshot.code.slice(0, 1500)}\n\`\`\``,
        );
      if (workspaceSnapshot.diagram)
        wsContent.push(
          `[Candidate's diagram]: ${workspaceSnapshot.diagram.slice(0, 500)}`,
        );
      if (workspaceSnapshot.notes)
        wsContent.push(
          `[Candidate's notes]: ${workspaceSnapshot.notes.slice(0, 500)}`,
        );
      if (workspaceSnapshot.thinking)
        wsContent.push(
          `[Candidate's thinking]: ${workspaceSnapshot.thinking.slice(0, 500)}`,
        );

      if (wsContent.length > 0) {
        messages.push({
          role: "system",
          content: `WORKSPACE UPDATE — the candidate's current workspace:\n${wsContent.join("\n\n")}`,
        });
      }
    }

    // Add the user's message
    messages.push({ role: "user", content: userMessage });

    console.log(
      `[Interview] Calling GPT-4o with ${messages.length} messages, ${TOOLS.length} tools`,
    );

    // Call OpenAI with streaming and tools
    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream: true,
      temperature: 0.8,
      max_tokens: 1000,
    });

    let fullResponse = "";
    let toolCalls = [];
    let currentToolCall = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle text content
      if (delta?.content) {
        fullResponse += delta.content;
        sendChunk(delta.content);
      }

      // Handle tool calls
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

      // Check if the stream is done
      if (chunk.choices[0]?.finish_reason === "tool_calls") {
        // Process tool calls
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

          // Store tool call in database
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

        // Continue the conversation with tool results
        const continuationMessages = [
          ...messages,
          {
            role: "assistant",
            content: fullResponse || null,
            tool_calls: toolCalls.filter(Boolean),
          },
          ...toolMessages,
        ];

        // Make a follow-up call with tool results (streaming)
        const followUp = await client.chat.completions.create({
          model: "gpt-4o",
          messages: continuationMessages,
          stream: true,
          temperature: 0.8,
          max_tokens: 800,
        });

        fullResponse = ""; // Reset — the follow-up is the actual response

        for await (const fChunk of followUp) {
          const fDelta = fChunk.choices[0]?.delta;
          if (fDelta?.content) {
            fullResponse += fDelta.content;
            sendChunk(fDelta.content);
          }
        }
      }
    }

    // Store the complete AI response
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

    // Load all messages
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

    // Load session
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        problem: { select: { title: true, difficulty: true, category: true } },
      },
    });

    // Extract interview notes from tool calls
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

    // Build conversation summary
    const conversationSummary = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map(
        (m) =>
          `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content.slice(0, 200)}`,
      )
      .join("\n");

    const systemPrompt = `You are generating a structured interview debrief. Analyze the conversation and notes to produce an honest, constructive evaluation.

ALWAYS respond in this exact JSON format:
{
  "overallScore": <number 1-10>,
  "verdict": "Strong Hire" | "Hire" | "Lean Hire" | "Lean No Hire" | "No Hire",
  "dimensions": {
    "approach": { "score": <1-10>, "feedback": "<string>" },
    "communication": { "score": <1-10>, "feedback": "<string>" },
    "codeQuality": { "score": <1-10>, "feedback": "<string>" },
    "timeManagement": { "score": <1-10>, "feedback": "<string>" },
    "knowledgeDepth": { "score": <1-10>, "feedback": "<string>" }
  },
  "strengths": ["<string>", "<string>"],
  "improvements": ["<string>", "<string>"],
  "keyMoments": [
    { "type": "positive" | "concern", "description": "<string>" }
  ],
  "nextSteps": "<string — specific advice for what to practice next>"
}`;

    const userPrompt = `Generate a debrief for this interview:

Problem: ${session.problem?.title || "General"} (${session.problem?.category || session.category})
Duration: ${session.duration / 60} minutes
Company: ${session.company || "General"}

INTERVIEW NOTES FROM AI:
${notes.map((n) => `[${n.topic}] ${n.observation} (${n.score}/10)`).join("\n") || "No notes recorded"}

CONVERSATION:
${conversationSummary.slice(0, 3000)}

Generate an honest, constructive debrief.`;

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

    // Save debrief to session
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
      `[Interview] Debrief generated for session ${sessionId}: ${debrief.verdict}`,
    );
    return debrief;
  } catch (error) {
    console.error("[Interview] Debrief generation failed:", error.message);
    return null;
  }
}
