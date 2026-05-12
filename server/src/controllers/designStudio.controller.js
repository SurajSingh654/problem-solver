// ============================================================================
// ProbSolver v3.0 — Design Studio Controller
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. createSession: Any authenticated user can start a design session.
//    Works in both team and individual mode. problemId is optional —
//    users can start freeform sessions without selecting a team problem.
//
// 2. savePhase: Incremental auto-save. Frontend calls this on blur/debounce.
//    Merges new phase content into existing phases JSON — never overwrites
//    other phases. This enables resume-ability without data loss.
//
// 3. AI coaching: Three modes (validate/guide/teach) with distinct prompting
//    strategies. AI sees the full session context (all phases + diagram
//    annotations + data flow) so its responses are specific to THIS design.
//    Interactions are logged in aiInteractions JSON for learning journey tracking.
//
// 4. Scenario generation: AI reads the entire design and generates 5-8
//    tailored scenarios. These are NOT generic templates — they're derived
//    from the specific components, scale numbers, and trade-offs the user declared.
//
// 5. Final evaluation: Uses GPT-4o (not mini) for comprehensive 10-dimension
//    assessment. Only callable when status is VALIDATING or COMPLETED.
//    Stored permanently in the evaluation JSON field.
//
// 6. Ownership: All mutations verify req.user.id === session.userId.
//    Users can only access their own sessions. No team-level sharing of
//    design sessions (unlike Solutions which are team-visible).
//
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { aiComplete } from "../services/ai.service.js";
import { initialSM2State } from "../utils/sm2.js";
import {
  designStudioCoachingPrompt,
  designStudioScenarioPrompt,
  designStudioScenarioEvalPrompt,
  designStudioFinalEvalPrompt,
} from "../services/designStudio.prompts.js";

// ── Bridge helpers for Design Studio → Solution record ────────────────
//
// When a DS session completes with a final evaluation and is linked to a
// Problem, we auto-upsert a Solution record so the standard Review Queue,
// SM-2 spaced repetition, and team-level stats pipelines keep working for
// SD/LLD problems. Without this bridge, migrating SD/LLD practice from the
// single-shot SubmitSolutionPage to Design Studio would lose those features.

// Map DS overallScore (0-10 float) into the 1-5 confidence scale that
// drives initial SM-2 state. High DS score implies strong recall.
function scoreToConfidence(overallScore) {
  if (typeof overallScore !== "number") return 3;
  if (overallScore >= 8.5) return 5;
  if (overallScore >= 7) return 4;
  if (overallScore >= 5) return 3;
  if (overallScore >= 3) return 2;
  return 1;
}

// Bucket totalTimeSpent (seconds) into the enum that Solution.timeTaken uses.
function secondsToTimeBucket(totalSeconds) {
  const minutes = Math.round((totalSeconds || 0) / 60);
  if (minutes < 15) return "UNDER_15";
  if (minutes < 30) return "MINS_15_30";
  if (minutes < 60) return "MINS_30_60";
  if (minutes < 120) return "HOURS_1_2";
  return "OVER_2_HOURS";
}

// Infer solveMethod from AI coach usage. DS coaches the user mid-task so
// any AI interactions count as "HINTS" in the Submit Solution taxonomy.
function inferSolveMethod(aiInteractions) {
  if (!Array.isArray(aiInteractions) || aiInteractions.length === 0) {
    return "COLD";
  }
  return "HINTS";
}

// Extract the dominant design pattern from the LLD designPatterns phase
// content. Looks for well-known pattern names; returns the first match or
// null. Used to populate Solution.patterns[] for pattern-baseline tracking.
const LLD_PATTERNS = [
  "Singleton",
  "Factory",
  "Abstract Factory",
  "Builder",
  "Prototype",
  "Adapter",
  "Decorator",
  "Facade",
  "Proxy",
  "Composite",
  "Bridge",
  "Flyweight",
  "Observer",
  "Strategy",
  "Command",
  "State",
  "Iterator",
  "Template Method",
  "Visitor",
  "Chain of Responsibility",
  "Mediator",
  "Memento",
];
function extractDominantPattern(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();
  for (const p of LLD_PATTERNS) {
    if (lower.includes(p.toLowerCase())) return p;
  }
  return null;
}

// Build the Solution payload from a DS session + its final evaluation.
// Field mapping is intentionally conservative — we put structured phase
// content into categorySpecificData (the canonical home) and populate the
// legacy approach/keyInsight/feynmanExplanation fields for backward-compat
// with code paths that still read those.
function buildSolutionPayloadFromSession(session, evaluation) {
  const phases = session.phases || {};
  const isSD = session.designType === "SYSTEM_DESIGN";
  const overallScore =
    typeof evaluation?.overallScore === "number"
      ? evaluation.overallScore
      : null;
  const confidence = scoreToConfidence(overallScore);
  const timeTaken = secondsToTimeBucket(session.totalTimeSpent);
  const solveMethod = inferSolveMethod(session.aiInteractions);

  const base = {
    confidence,
    aiFeedback: {
      ...(evaluation || {}),
      // Meta field so downstream consumers can tell this review came from
      // a Design Studio session (different rubric from solution.review).
      source: "design_studio",
      designSessionId: session.id,
      solveMethod,
      timeTaken,
    },
  };

  if (isSD) {
    return {
      ...base,
      approach: phases.requirements || null,
      bruteForce: phases.capacityEstimation || null,
      optimizedApproach: phases.architecture || null,
      keyInsight: phases.tradeoffs || null,
      feynmanExplanation:
        session.dataFlowDescription || phases.deepDive || null,
      realWorldConnection: phases.apiDesign || null,
      patterns: [], // SD has no single "pattern" axis
      categorySpecificData: {
        functionalRequirements: phases.requirements || "",
        nonFunctionalRequirements: phases.requirements || "",
        capacityEstimation: phases.capacityEstimation || "",
        apiDesign: phases.apiDesign || "",
        schemaDesign: phases.dataModel || "",
        architecture: phases.architecture || "",
        architectureNotes: phases.deepDive || "",
        tradeoffReasoning: phases.tradeoffs || "",
        failureModes: phases.deepDive || phases.tradeoffs || "",
        dataFlowDescription: session.dataFlowDescription || "",
        diagramData: session.diagramData || null,
        componentAnnotations: session.componentAnnotations || [],
      },
    };
  }

  // LLD
  const dominant = extractDominantPattern(phases.designPatterns);
  return {
    ...base,
    approach: phases.requirements || null,
    bruteForce: phases.entities || null,
    optimizedApproach: phases.classHierarchy || null,
    keyInsight: phases.designPatterns || null,
    feynmanExplanation: phases.solidAnalysis || null,
    realWorldConnection: null,
    code: phases.methodSignatures || null,
    patterns: dominant ? [dominant] : [],
    categorySpecificData: {
      entities: phases.entities || "",
      classHierarchy: phases.classHierarchy || "",
      designPattern: phases.designPatterns || "",
      solidAnalysis: phases.solidAnalysis || "",
      extensibilityAnalysis: "",
      implementationCode: phases.methodSignatures || "",
      dataFlowDescription: session.dataFlowDescription || "",
      diagramData: session.diagramData || null,
      componentAnnotations: session.componentAnnotations || [],
    },
  };
}

// Upsert a Solution for a completed DS session. Safe to call multiple times:
// a second eval on the same session updates the existing Solution rather
// than creating a duplicate (unique constraint: userId+problemId+teamId).
// Errors are logged but not rethrown — the DS eval response is the primary
// user-visible result; a bridge failure shouldn't fail that path.
async function bridgeDesignSessionToSolution(session, evaluation) {
  if (!session?.problemId || !session?.teamId) return; // freeform or no-team session

  try {
    const payload = buildSolutionPayloadFromSession(session, evaluation);
    const existing = await prisma.solution.findUnique({
      where: {
        userId_problemId_teamId: {
          userId: session.userId,
          problemId: session.problemId,
          teamId: session.teamId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      // Preserve SM-2 history on a re-evaluation; only refresh content + AI feedback.
      await prisma.solution.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      // Canonical SM-2 initial state (EF=2.5, first review in 1 day).
      // payload.confidence is stored on the Solution row but does not
      // seed EF — the first real review is what moves the scheduler.
      const sm2 = initialSM2State();
      await prisma.solution.create({
        data: {
          ...payload,
          userId: session.userId,
          problemId: session.problemId,
          teamId: session.teamId,
          sm2EasinessFactor: sm2.easinessFactor,
          sm2Interval: sm2.interval,
          sm2Repetitions: sm2.repetitions,
          nextReviewDate: sm2.nextReviewDate,
          reviewCount: 0,
        },
      });
    }
  } catch (err) {
    console.error("Design Studio → Solution bridge failed:", err);
  }
}

// ============================================================================
// CREATE SESSION
// ============================================================================
export async function createSession(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId || null;
    const { designType, title, difficulty, problemId } = req.body;

    // If problemId provided, verify it exists and user has access
    if (problemId) {
      const problem = await prisma.problem.findFirst({
        where: {
          id: problemId,
          ...(teamId ? { teamId } : {}),
        },
        select: { id: true, title: true, category: true },
      });
      if (!problem) {
        return error(res, "Problem not found or not accessible.", 404);
      }
    }

    const session = await prisma.designSession.create({
      data: {
        userId,
        teamId,
        problemId: problemId || null,
        designType,
        difficulty,
        title,
        status: "IN_PROGRESS",
        currentPhase: 0,
        phases: {},
        aiInteractions: [],
        totalTimeSpent: 0,
        phaseTimings: {},
      },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            difficulty: true,
            category: true,
          },
        },
      },
    });

    return success(res, { session }, 201);
  } catch (err) {
    console.error("Create design session error:", err);
    return error(res, "Failed to create design session.", 500);
  }
}

// ============================================================================
// LIST SESSIONS
// ============================================================================
export async function listSessions(req, res) {
  try {
    const userId = req.user.id;
    const { designType, status, problemId, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (designType) where.designType = designType;
    if (status) where.status = status;
    if (problemId) where.problemId = problemId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [sessions, total] = await Promise.all([
      prisma.designSession.findMany({
        where,
        select: {
          id: true,
          designType: true,
          difficulty: true,
          title: true,
          status: true,
          currentPhase: true,
          totalTimeSpent: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          problem: {
            select: { id: true, title: true, category: true },
          },
          // Include evaluation summary (just the overall score, not full object)
          evaluation: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.designSession.count({ where }),
    ]);

    // Slim down evaluation to just overallScore for list view
    const slimSessions = sessions.map((s) => ({
      ...s,
      evaluationScore: s.evaluation?.overallScore || null,
      evaluation: undefined,
    }));

    return success(res, {
      sessions: slimSessions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("List design sessions error:", err);
    return error(res, "Failed to fetch design sessions.", 500);
  }
}

// ============================================================================
// GET SESSION (full data)
// ============================================================================
export async function getSession(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            difficulty: true,
            category: true,
            tags: true,
            adminNotes: true,
          },
        },
      },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    return success(res, { session });
  } catch (err) {
    console.error("Get design session error:", err);
    return error(res, "Failed to fetch design session.", 500);
  }
}

// ============================================================================
// DELETE SESSION
// ============================================================================
export async function deleteSession(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    await prisma.designSession.delete({ where: { id: sessionId } });

    return success(res, { message: "Session deleted." });
  } catch (err) {
    console.error("Delete design session error:", err);
    return error(res, "Failed to delete design session.", 500);
  }
}

// ============================================================================
// SAVE PHASE CONTENT (incremental auto-save)
// ============================================================================
export async function savePhase(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { phaseId, content } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, phases: true, currentPhase: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    // Merge new phase content into existing phases JSON
    const existingPhases = session.phases || {};
    const updatedPhases = { ...existingPhases, [phaseId]: content };

    await prisma.designSession.update({
      where: { id: sessionId },
      data: { phases: updatedPhases },
    });

    return success(res, { message: "Phase saved.", phaseId });
  } catch (err) {
    console.error("Save phase error:", err);
    return error(res, "Failed to save phase.", 500);
  }
}

// ============================================================================
// SAVE DIAGRAM DATA (Excalidraw state + annotations)
// ============================================================================
export async function saveDiagram(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { diagramData, componentAnnotations, dataFlowDescription } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    await prisma.designSession.update({
      where: { id: sessionId },
      data: {
        diagramData: diagramData || null,
        componentAnnotations: componentAnnotations || [],
        dataFlowDescription: dataFlowDescription || "",
      },
    });

    return success(res, { message: "Diagram saved." });
  } catch (err) {
    console.error("Save diagram error:", err);
    return error(res, "Failed to save diagram.", 500);
  }
}

// ============================================================================
// UPDATE TIMING
// ============================================================================
export async function updateTiming(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { totalTimeSpent, phaseTimings, currentPhase } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    const data = { totalTimeSpent };
    if (phaseTimings) data.phaseTimings = phaseTimings;
    if (typeof currentPhase === "number") data.currentPhase = currentPhase;

    await prisma.designSession.update({
      where: { id: sessionId },
      data,
    });

    return success(res, { message: "Timing updated." });
  } catch (err) {
    console.error("Update timing error:", err);
    return error(res, "Failed to update timing.", 500);
  }
}

// ============================================================================
// UPDATE STATUS
// ============================================================================
export async function updateStatus(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { status } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    const data = { status };
    if (status === "COMPLETED") data.completedAt = new Date();

    await prisma.designSession.update({
      where: { id: sessionId },
      data,
    });

    return success(res, { message: "Status updated.", status });
  } catch (err) {
    console.error("Update status error:", err);
    return error(res, "Failed to update status.", 500);
  }
}

// ============================================================================
// AI COACHING (validate / guide / teach)
// ============================================================================
export async function askAICoach(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { mode, phaseId, userQuery } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            adminNotes: true,
          },
        },
      },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    // Build context for AI
    const phases = session.phases || {};
    const currentPhaseContent = phases[phaseId] || "";
    const annotations = session.componentAnnotations || [];
    const dataFlow = session.dataFlowDescription || "";

    // Get previous AI interactions for this phase to avoid repetition
    const previousInteractions = (session.aiInteractions || [])
      .filter((i) => i.phase === phaseId)
      .slice(-3); // Last 3 interactions for context

    const { system, user } = designStudioCoachingPrompt({
      mode,
      phaseId,
      userQuery,
      designType: session.designType,
      title: session.title,
      difficulty: session.difficulty,
      problemDescription: session.problem?.description || "",
      adminNotes: session.problem?.adminNotes || "",
      currentPhaseContent,
      allPhases: phases,
      componentAnnotations: annotations,
      dataFlowDescription: dataFlow,
      previousInteractions,
    });

    const aiResponse = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 800,
      jsonMode: true,
    });

    // Log the interaction
    const interaction = {
      phase: phaseId,
      mode,
      userQuery: userQuery || null,
      aiResponse: aiResponse.response || "",
      guidingQuestions: aiResponse.guidingQuestions || [],
      conceptExplanation: aiResponse.conceptExplanation || null,
      timestamp: new Date().toISOString(),
    };

    const updatedInteractions = [
      ...(session.aiInteractions || []),
      interaction,
    ];

    await prisma.designSession.update({
      where: { id: sessionId },
      data: { aiInteractions: updatedInteractions },
    });

    return success(res, { coaching: aiResponse });
  } catch (err) {
    if (err.code === "RATE_LIMITED" || err.code === "OPENAI_RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    console.error("AI coaching error:", err);
    return error(res, "Failed to get AI coaching.", 500);
  }
}

// ============================================================================
// GENERATE SCENARIOS
// ============================================================================
export async function generateScenarios(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      include: {
        problem: {
          select: { id: true, title: true, description: true },
        },
      },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    const phases = session.phases || {};
    const annotations = session.componentAnnotations || [];
    const dataFlow = session.dataFlowDescription || "";

    // Verify user has enough design content for meaningful scenarios
    const filledPhases = Object.values(phases).filter(
      (v) => v && v.trim().length > 30,
    ).length;
    if (filledPhases < 3) {
      return error(
        res,
        "Complete at least 3 design phases before generating scenarios.",
        400,
        "INSUFFICIENT_DESIGN",
      );
    }

    const { system, user } = designStudioScenarioPrompt({
      designType: session.designType,
      title: session.title,
      difficulty: session.difficulty,
      problemDescription: session.problem?.description || "",
      phases,
      componentAnnotations: annotations,
      dataFlowDescription: dataFlow,
    });

    const aiResponse = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      model: "gpt-4o-mini",
      temperature: 0.8,
      maxTokens: 2500,
      jsonMode: true,
    });

    // Structure scenarios with IDs and pending status
    const scenarios = (aiResponse.scenarios || []).map((s, i) => ({
      id: `scenario-${Date.now()}-${i}`,
      scenario: s.scenario || s.description || "",
      category: s.category || "general",
      difficulty: s.difficulty || "medium",
      userResponse: null,
      aiVerdict: null,
      status: "pending",
    }));

    // Update session status to VALIDATING and store scenarios
    await prisma.designSession.update({
      where: { id: sessionId },
      data: {
        scenarios,
        status: "VALIDATING",
      },
    });

    return success(res, { scenarios });
  } catch (err) {
    if (err.code === "RATE_LIMITED" || err.code === "OPENAI_RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    console.error("Generate scenarios error:", err);
    return error(res, "Failed to generate scenarios.", 500);
  }
}

// ============================================================================
// SUBMIT SCENARIO RESPONSE
// ============================================================================
export async function submitScenarioResponse(req, res) {
  try {
    const { sessionId, scenarioId } = req.params;
    const userId = req.user.id;
    const { response } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, scenarios: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    const scenarios = session.scenarios || [];
    const scenarioIdx = scenarios.findIndex((s) => s.id === scenarioId);
    if (scenarioIdx === -1) return error(res, "Scenario not found.", 404);

    // Update scenario with user response
    scenarios[scenarioIdx].userResponse = response;
    scenarios[scenarioIdx].status = "answered";

    await prisma.designSession.update({
      where: { id: sessionId },
      data: { scenarios },
    });

    return success(res, { message: "Response saved.", scenarioId });
  } catch (err) {
    console.error("Submit scenario response error:", err);
    return error(res, "Failed to save scenario response.", 500);
  }
}

// ============================================================================
// EVALUATE SCENARIO (AI judges if design handles it)
// ============================================================================
export async function evaluateScenario(req, res) {
  try {
    const { sessionId, scenarioId } = req.params;
    const userId = req.user.id;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        scenarios: true,
        phases: true,
        componentAnnotations: true,
        dataFlowDescription: true,
        designType: true,
        title: true,
      },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    const scenarios = session.scenarios || [];
    const scenarioIdx = scenarios.findIndex((s) => s.id === scenarioId);
    if (scenarioIdx === -1) return error(res, "Scenario not found.", 404);

    const scenario = scenarios[scenarioIdx];
    if (!scenario.userResponse) {
      return error(res, "Submit a response before requesting evaluation.", 400);
    }

    const { system, user } = designStudioScenarioEvalPrompt({
      designType: session.designType,
      title: session.title,
      scenario: scenario.scenario,
      userResponse: scenario.userResponse,
      phases: session.phases || {},
      componentAnnotations: session.componentAnnotations || [],
      dataFlowDescription: session.dataFlowDescription || "",
    });

    const aiResponse = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      model: "gpt-4o-mini",
      temperature: 0.5,
      maxTokens: 1000,
      jsonMode: true,
    });

    // Update scenario with verdict
    scenarios[scenarioIdx].aiVerdict = {
      verdict: aiResponse.verdict || "PARTIAL",
      explanation: aiResponse.explanation || "",
      missedPoints: aiResponse.missedPoints || [],
      suggestions: aiResponse.suggestions || [],
    };
    scenarios[scenarioIdx].status = "evaluated";

    await prisma.designSession.update({
      where: { id: sessionId },
      data: { scenarios },
    });

    return success(res, { evaluation: scenarios[scenarioIdx].aiVerdict });
  } catch (err) {
    if (err.code === "RATE_LIMITED" || err.code === "OPENAI_RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    console.error("Evaluate scenario error:", err);
    return error(res, "Failed to evaluate scenario.", 500);
  }
}

// ============================================================================
// SAVE FLOW SIMULATION
// ============================================================================
export async function saveFlowSimulation(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { flowName, hops } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, flowSimulation: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    // Calculate total latency and identify bottleneck
    const totalLatency = hops.reduce((sum, h) => sum + (h.latencyMs || 0), 0);
    const bottleneck = hops.reduce(
      (max, h) => (h.latencyMs > max.latencyMs ? h : max),
      hops[0],
    );

    const newFlow = {
      id: `flow-${Date.now()}`,
      flowName,
      hops,
      totalLatency,
      bottleneck: bottleneck
        ? `${bottleneck.from} → ${bottleneck.to} (${bottleneck.latencyMs}ms)`
        : null,
    };

    const existingFlows = session.flowSimulation || [];
    const updatedFlows = [...existingFlows, newFlow];

    await prisma.designSession.update({
      where: { id: sessionId },
      data: { flowSimulation: updatedFlows },
    });

    return success(res, { flow: newFlow });
  } catch (err) {
    console.error("Save flow simulation error:", err);
    return error(res, "Failed to save flow simulation.", 500);
  }
}

// ============================================================================
// DELETE FLOW SIMULATION
// ============================================================================
export async function deleteFlowSimulation(req, res) {
  try {
    const { sessionId, flowId } = req.params;
    const userId = req.user.id;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, flowSimulation: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    const existing = session.flowSimulation || [];
    const updated = existing.filter((f) => f.id !== flowId);
    if (updated.length === existing.length) {
      return error(res, "Flow not found.", 404);
    }

    await prisma.designSession.update({
      where: { id: sessionId },
      data: { flowSimulation: updated },
    });

    return success(res, { message: "Flow deleted.", flowId });
  } catch (err) {
    console.error("Delete flow simulation error:", err);
    return error(res, "Failed to delete flow.", 500);
  }
}

// ============================================================================
// SAVE SCALE ANALYSIS
// ============================================================================
export async function saveScaleAnalysis(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { current, tenX, hundredX, failureAtScale } = req.body;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    await prisma.designSession.update({
      where: { id: sessionId },
      data: {
        scaleAnalysis: { current, tenX, hundredX, failureAtScale },
      },
    });

    return success(res, { message: "Scale analysis saved." });
  } catch (err) {
    console.error("Save scale analysis error:", err);
    return error(res, "Failed to save scale analysis.", 500);
  }
}

// ============================================================================
// REQUEST FINAL EVALUATION (GPT-4o comprehensive assessment)
// ============================================================================
export async function requestFinalEvaluation(req, res) {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await prisma.designSession.findUnique({
      where: { id: sessionId },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            difficulty: true,
          },
        },
      },
    });

    if (!session) return error(res, "Session not found.", 404);
    if (session.userId !== userId) return error(res, "Not authorized.", 403);

    // Require at least VALIDATING status
    if (session.status === "IN_PROGRESS") {
      return error(
        res,
        "Complete the design phases and generate scenarios before requesting evaluation.",
        400,
        "NOT_READY_FOR_EVALUATION",
      );
    }

    const { system, user } = designStudioFinalEvalPrompt({
      designType: session.designType,
      title: session.title,
      difficulty: session.difficulty,
      problemDescription: session.problem?.description || "",
      phases: session.phases || {},
      componentAnnotations: session.componentAnnotations || [],
      dataFlowDescription: session.dataFlowDescription || "",
      scenarios: session.scenarios || [],
      flowSimulation: session.flowSimulation || [],
      scaleAnalysis: session.scaleAnalysis || {},
      totalTimeSpent: session.totalTimeSpent,
      phaseTimings: session.phaseTimings || {},
    });

    const aiResponse = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      model: "gpt-4o",
      temperature: 0.5,
      maxTokens: 4000,
      jsonMode: true,
    });

    // Store evaluation and mark session complete
    await prisma.designSession.update({
      where: { id: sessionId },
      data: {
        evaluation: aiResponse,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Bridge: if this session is linked to a Problem, upsert a Solution
    // record so Review Queue, SM-2 spaced repetition, and team stats keep
    // working for SD/LLD practice. Non-blocking — bridge failures are
    // logged but don't affect the eval response.
    await bridgeDesignSessionToSolution(session, aiResponse);

    return success(res, { evaluation: aiResponse });
  } catch (err) {
    if (err.code === "RATE_LIMITED" || err.code === "OPENAI_RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    console.error("Final evaluation error:", err);
    return error(res, "Failed to generate evaluation.", 500);
  }
}
