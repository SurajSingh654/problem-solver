// ============================================================================
// ProbSolver v3.0 — AI Controller (Team-Scoped RAG)
// ============================================================================
//
// SCOPING: The critical change here is RAG isolation. Every vector
// similarity search includes WHERE team_id = ? to ensure solutions
// from other teams are never retrieved as context.
//
// This is "pool-based multi-tenant RAG" — same table, filtered queries.
//
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_PRIMARY, AI_MODEL_FAST } from "../config/env.js";

// ============================================================================
// AI SOLUTION REVIEW (RAG-Enhanced, Team-Scoped)
// ============================================================================

export async function reviewSolution(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    // ── Fetch solution with problem context ────────────
    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId }, // SCOPING
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            difficulty: true,
            adminNotes: true,
            tags: true,
          },
        },
      },
    });

    if (!solution) {
      return error(res, "Solution not found.", 404);
    }

    // ── RAG: Find similar teammate solutions (TEAM-SCOPED) ─
    let teammateSolutions = [];
    try {
      const solutionText = [
        solution.approach || "",
        solution.keyInsight || "",
        solution.code ? solution.code.substring(0, 300) : "",
      ].join(" ");

      const { generateEmbedding } =
        await import("../services/embedding.service.js");
      const queryEmbedding = await generateEmbedding(solutionText);

      if (queryEmbedding) {
        const vectorStr = `[${queryEmbedding.join(",")}]`;

        // TEAM-SCOPED VECTOR SEARCH — the critical multi-tenant RAG query
        teammateSolutions = await prisma.$queryRawUnsafe(
          `
  SELECT
    s.id,
    s.approach,
    s."keyInsight" as "key_insight",
    s."timeComplexity" as "time_complexity",
    s."spaceComplexity" as "space_complexity",
    s.confidence,
    s.pattern,
    u.name as author_name,
    1 - (s.embedding <=> $1::vector) as similarity
  FROM solutions s
  JOIN users u ON s."userId" = u.id
  WHERE s."teamId" = $2
    AND s."problemId" = $3
    AND s."userId" != $4
    AND s.embedding IS NOT NULL
  ORDER BY s.embedding <=> $1::vector
  LIMIT 3
`,
          vectorStr,
          teamId,
          solution.problemId,
          userId,
        );
      }
    } catch (err) {
      console.error("RAG search failed (continuing without):", err.message);
    }

    // ── Build prompt with RAG context ──────────────────
    let ragContext = "";
    if (teammateSolutions.length > 0) {
      ragContext = "\n\n--- TEAMMATE SOLUTIONS (for comparison) ---\n";
      teammateSolutions.forEach((ts, i) => {
        ragContext += `\nTeammate ${i + 1} (${ts.author_name}):\n`;
        ragContext += `  Approach: ${ts.approach || "Not provided"}\n`;
        ragContext += `  Key Insight: ${ts.key_insight || "Not provided"}\n`;
        ragContext += `  Complexity: ${ts.time_complexity || "?"} time, ${ts.space_complexity || "?"} space\n`;
        ragContext += `  Pattern: ${ts.pattern || "Not identified"}\n`;
        ragContext += `  Confidence: ${ts.confidence}/5\n`;
      });
    }

    let adminContext = "";
    if (solution.problem.adminNotes) {
      adminContext = `\n\n--- ADMIN TEACHING NOTES ---\n${solution.problem.adminNotes}`;
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `You are a senior engineering interview coach reviewing a candidate's solution.
Category: ${solution.problem.category}. Difficulty: ${solution.problem.difficulty}.

If teammate solutions are provided, compare the candidate's approach and offer specific comparative feedback — reference teammates by name.
If admin teaching notes are provided, check if the candidate's approach aligns.

Return JSON:
{
  "overallScore": 1-10,
  "strengths": ["specific strength 1", ...],
  "gaps": ["specific gap 1", ...],
  "improvement": "One specific, actionable improvement suggestion",
  "interviewTip": "One specific tip for explaining this in an interview",
  "complexityCheck": { "timeCorrect": bool, "spaceCorrect": bool, "suggestion": "..." }
}`,
        },
        {
          role: "user",
          content: `Problem: ${solution.problem.title}
Description: ${solution.problem.description || "N/A"}

--- CANDIDATE'S SOLUTION ---
Approach: ${solution.approach || "Not provided"}
Code: ${solution.code ? solution.code.substring(0, 1000) : "Not provided"}
Time Complexity: ${solution.timeComplexity || "Not provided"}
Space Complexity: ${solution.spaceComplexity || "Not provided"}
Key Insight: ${solution.keyInsight || "Not provided"}
Feynman Explanation: ${solution.feynmanExplanation || "Not provided"}
Pattern: ${solution.pattern || "Not identified"}
Confidence: ${solution.confidence}/5
${ragContext}${adminContext}`,
        },
      ],
    });

    let feedback;
    try {
      feedback = JSON.parse(response.choices[0].message.content);
    } catch {
      return error(res, "Failed to parse AI feedback.", 500);
    }

    // ── Store feedback on solution ─────────────────────
    await prisma.solution.update({
      where: { id: solutionId },
      data: { aiFeedback: feedback },
    });

    return success(res, {
      feedback,
      ragContext: {
        teammateCount: teammateSolutions.length,
        hasAdminNotes: !!solution.problem.adminNotes,
      },
    });
  } catch (err) {
    console.error("AI review error:", err);
    return error(res, "Failed to generate AI review.", 500);
  }
}

// ============================================================================
// AI PROGRESSIVE HINTS (Team-Scoped)
// ============================================================================

export async function getHint(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { problemId } = req.params;
    const { level } = req.body; // 1, 2, or 3
    const teamId = req.teamId;

    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId }, // SCOPING
      select: {
        title: true,
        description: true,
        category: true,
        adminNotes: true,
        tags: true,
      },
    });

    if (!problem) {
      return error(res, "Problem not found.", 404);
    }

    const hintLevel = Math.min(Math.max(parseInt(level) || 1, 1), 3);

    const levelInstructions = {
      1: "Give a vague directional nudge. Do NOT name the pattern or approach. Just point them in the right direction.",
      2: 'Name the general approach category (e.g., "Consider a sliding window approach") but do NOT give specific implementation details.',
      3: "Name the specific technique and give a brief outline of the first step. Still do NOT give the full solution.",
    };

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.7,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are an interview coach giving a Level ${hintLevel}/3 hint.
${levelInstructions[hintLevel]}
Keep it to 1-2 sentences maximum.`,
        },
        {
          role: "user",
          content: `Problem: ${problem.title}\nDescription: ${problem.description || "N/A"}\nCategory: ${problem.category}\nTags: ${problem.tags?.join(", ") || "none"}`,
        },
      ],
    });

    return success(res, {
      hint: {
        level: hintLevel,
        text: response.choices[0].message.content.trim(),
      },
    });
  } catch (err) {
    console.error("Hint error:", err);
    return error(res, "Failed to generate hint.", 500);
  }
}

// ============================================================================
// AI WEEKLY COACHING PLAN (Team-Context-Aware)
// ============================================================================

export async function getWeeklyPlan(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const userId = req.user.id;
    const teamId = req.teamId;

    // ── Gather user data scoped to team ────────────────
    const [
      user,
      solutionCount,
      recentSolutions,
      quizzes,
      interviews,
      reviewsDue,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { targetCompany: true, interviewDate: true, streak: true },
      }),
      prisma.solution.count({ where: { userId, teamId } }),
      prisma.solution.findMany({
        where: { userId, teamId },
        select: {
          pattern: true,
          confidence: true,
          problem: { select: { category: true, difficulty: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.quizAttempt.findMany({
        where: { userId, teamId, completedAt: { not: null } },
        select: { subject: true, score: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.interviewSession.count({
        where: { userId, teamId, status: "COMPLETED" },
      }),
      prisma.solution.count({
        where: { userId, teamId, nextReviewDate: { lte: new Date() } },
      }),
    ]);

    // ── Build context for AI ───────────────────────────
    const categories = {};
    const patterns = new Set();
    let totalConf = 0;
    recentSolutions.forEach((s) => {
      const cat = s.problem?.category || "CODING";
      categories[cat] = (categories[cat] || 0) + 1;
      if (s.pattern) patterns.add(s.pattern);
      totalConf += s.confidence;
    });

    const avgQuizScore =
      quizzes.length > 0
        ? Math.round(
            quizzes.reduce((s, q) => s + (q.score || 0), 0) / quizzes.length,
          )
        : null;

    const daysUntilInterview = user?.interviewDate
      ? Math.ceil(
          (new Date(user.interviewDate) - new Date()) / (1000 * 60 * 60 * 24),
        )
      : null;

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.7,
      response_format: { type: "json_object" },
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `You are a personal interview coach creating a specific 7-day study plan.
Based on the candidate's data, create daily tasks that address their weak areas.
Be SPECIFIC — name exact problem types, categories, and actions.

Return JSON:
{
  "weeklyGoal": "One sentence goal for the week",
  "days": [
    { "day": "Monday", "focus": "category", "tasks": ["specific task 1", ...], "timeEstimate": "30 min" },
    ...
  ],
  "keyInsight": "One insight about their preparation gaps"
}`,
        },
        {
          role: "user",
          content: `Stats:
- Solutions: ${solutionCount}, Avg confidence: ${recentSolutions.length > 0 ? (totalConf / recentSolutions.length).toFixed(1) : "N/A"}
- Categories: ${JSON.stringify(categories)}
- Patterns practiced: ${[...patterns].join(", ") || "none"}
- Quizzes: ${quizzes.length}, Avg score: ${avgQuizScore ?? "N/A"}%
- Mock interviews: ${interviews}
- Reviews due: ${reviewsDue}
- Target: ${user?.targetCompany || "Not set"}
- Days until interview: ${daysUntilInterview ?? "Not set"}
- Streak: ${user?.streak || 0} days`,
        },
      ],
    });

    const plan = JSON.parse(response.choices[0].message.content);

    return success(res, { plan });
  } catch (err) {
    console.error("Weekly plan error:", err);
    return error(res, "Failed to generate coaching plan.", 500);
  }
}

// ============================================================================
// AI PROBLEM CONTENT GENERATOR (TEAM_ADMIN tool)
// ============================================================================

export async function generateProblemContent(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { title, category, difficulty } = req.body;

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.8,
      response_format: { type: "json_object" },
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You are an expert interview problem designer. Generate complete problem content.

Return JSON:
{
  "description": "Full problem description with examples",
  "realWorldContext": "Real-world application of this problem",
  "useCases": "3-5 use cases as a string",
  "adminNotes": "Teaching notes: expected approach, edge cases, key insight, common mistakes",
  "tags": ["tag1", "tag2", ...],
  "followUpQuestions": [
    { "question": "...", "difficulty": "EASY", "hint": "..." },
    { "question": "...", "difficulty": "MEDIUM", "hint": "..." },
    { "question": "...", "difficulty": "HARD", "hint": "..." }
  ]
}`,
        },
        {
          role: "user",
          content: `Generate content for: "${title}"\nCategory: ${category || "CODING"}\nDifficulty: ${difficulty || "MEDIUM"}`,
        },
      ],
    });

    const content = JSON.parse(response.choices[0].message.content);

    return success(res, { content });
  } catch (err) {
    console.error("Generate content error:", err);
    return error(res, "Failed to generate problem content.", 500);
  }
}

// ============================================================================
// SIMILAR PROBLEMS SEARCH (Team-Scoped Vector Search)
// ============================================================================

export async function findSimilarProblems(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { query } = req.body;
    const teamId = req.teamId;

    const { generateEmbedding } =
      await import("../services/embedding.service.js");
    const embedding = await generateEmbedding(query);

    if (!embedding) {
      return error(res, "Failed to generate search embedding.", 500);
    }

    const vectorStr = `[${embedding.join(",")}]`;

    // TEAM-SCOPED vector similarity search
    const similar = await prisma.$queryRawUnsafe(
      `
  SELECT
    p.id,
    p.title,
    p.difficulty,
    p.category,
    p.tags,
    1 - (p.embedding <=> $1::vector) as similarity
  FROM problems p
  WHERE p."teamId" = $2
    AND p."isPublished" = true
    AND p."isHidden" = false
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> $1::vector
  LIMIT 5
`,
      vectorStr,
      teamId,
    );

    return success(res, { problems: similar });
  } catch (err) {
    console.error("Similar problems error:", err);
    return error(res, "Failed to search similar problems.", 500);
  }
}

// ============================================================================
// AI PROBLEM GENERATION (Multi-Stage Pipeline — for Team Admin)
// ============================================================================
//
// ARCHITECTURE:
// Stage 1 — Intelligence: Gather team performance data from DB
// Stage 2 — Selection: AI decides WHAT problems to generate (fast, cheap)
// Stage 3 — Content: Generate rich content per problem IN PARALLEL
//
// Benefits over single-call approach:
// - Never hits token limits (each call is focused)
// - Better quality (each prompt has one job)
// - Faster (parallel content generation)
// - More resilient (partial failures return partial results)
//
// ============================================================================
export async function generateProblemsAI(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const teamId = req.teamId;
    const userId = req.user.id;
    const { category, count, difficulty, targetCompany, focusAreas } = req.body;

    if (!category) {
      return error(res, "Category is required.", 400);
    }

    const problemCount = Math.min(Math.max(parseInt(count) || 1, 1), 5);
    const difficultyPref = difficulty || "auto";

    // ── STAGE 1: Intelligence Gathering ────────────────
    // Understand the team deeply before generating anything.
    // All DB queries run in parallel for speed.
    let teamContext = "";
    let existingProblems = "";
    let difficultyInstruction = "";

    try {
      const [existing, totalMembers, solutionStats, patternGaps] =
        await Promise.all([
          // What problems already exist (avoid duplicates)
          prisma.problem.findMany({
            where: { teamId, category, isPublished: true },
            select: { title: true, difficulty: true },
            take: 50,
          }),
          // Team size
          prisma.user.count({ where: { currentTeamId: teamId } }),
          // Performance by difficulty in this category
          prisma.$queryRaw`
            SELECT
              p.difficulty,
              COUNT(DISTINCT s."userId")::int as solvers,
              ROUND(AVG(s.confidence), 1)::float as avg_confidence,
              COUNT(s.id)::int as total_solutions
            FROM solutions s
            JOIN problems p ON s."problemId" = p.id
            WHERE s."teamId" = ${teamId}
              AND p.category = ${category}::"ProblemCategory"
            GROUP BY p.difficulty
          `,
          // What patterns/topics have been practiced vs missing
          prisma.solution.findMany({
            where: { teamId, userId },
            select: { pattern: true, confidence: true },
            orderBy: { createdAt: "desc" },
            take: 30,
          }),
        ]);

      // Build existing problems list
      if (existing.length > 0) {
        existingProblems = existing
          .map((p) => `- ${p.title} (${p.difficulty})`)
          .join("\n");
      }

      // Build rich team context
      if (solutionStats.length > 0) {
        teamContext = `Team size: ${totalMembers} members\n`;
        teamContext += `Experience in ${category}:\n`;
        solutionStats.forEach((s) => {
          const confidence =
            s.avg_confidence >= 4
              ? "Strong"
              : s.avg_confidence >= 3
                ? "Developing"
                : "Struggling";
          teamContext += `  ${s.difficulty}: ${s.solvers} members have solved, avg confidence ${s.avg_confidence}/5 (${confidence})\n`;
        });

        // Identify patterns they've practiced
        const practicedPatterns = [
          ...new Set(patternGaps.filter((s) => s.pattern).map((s) => s.pattern)),
        ];
        if (practicedPatterns.length > 0) {
          teamContext += `Patterns already practiced: ${practicedPatterns.join(", ")}\n`;
        }

        // Identify weak areas (low confidence solutions)
        const weakSolutions = patternGaps.filter((s) => s.confidence <= 2);
        if (weakSolutions.length > 0) {
          const weakPatterns = [
            ...new Set(
              weakSolutions.filter((s) => s.pattern).map((s) => s.pattern),
            ),
          ];
          if (weakPatterns.length > 0) {
            teamContext += `Weak areas needing reinforcement: ${weakPatterns.join(", ")}\n`;
          }
        }
      } else {
        teamContext = `Team size: ${totalMembers} members. Fresh start in ${category} — no solutions submitted yet. Begin with accessible fundamentals.`;
      }

      // Build difficulty instruction
      if (difficultyPref === "auto") {
        // Determine best difficulty based on team performance
        const hasEasy = solutionStats.find((s) => s.difficulty === "EASY");
        const hasMedium = solutionStats.find((s) => s.difficulty === "MEDIUM");

        if (!hasEasy || hasEasy.avg_confidence < 3) {
          difficultyInstruction = `Team needs foundational work. Generate ${Math.ceil(problemCount * 0.6)} EASY and ${Math.floor(problemCount * 0.4)} MEDIUM problems.`;
        } else if (!hasMedium || hasMedium.avg_confidence < 3) {
          difficultyInstruction = `Team has basic skills. Generate ${Math.ceil(problemCount * 0.3)} EASY, ${Math.ceil(problemCount * 0.5)} MEDIUM, and ${Math.floor(problemCount * 0.2)} HARD problems.`;
        } else {
          difficultyInstruction = `Team is progressing well. Generate ${Math.ceil(problemCount * 0.2)} EASY, ${Math.ceil(problemCount * 0.4)} MEDIUM, and ${Math.floor(problemCount * 0.4)} HARD problems.`;
        }
      } else if (difficultyPref.startsWith("custom:")) {
        const parts = difficultyPref.replace("custom:", "").split(",");
        const easy = parseInt(parts[0]) || 0;
        const medium = parseInt(parts[1]) || 0;
        const hard = parseInt(parts[2]) || 0;
        difficultyInstruction = `Generate exactly: ${easy} EASY, ${medium} MEDIUM, ${hard} HARD problems.`;
      } else {
        difficultyInstruction = `All ${problemCount} problems should be ${difficultyPref} difficulty.`;
      }
    } catch (err) {
      console.error("Stage 1 intelligence gathering failed:", err.message);
      teamContext = "Context unavailable — generate balanced problems.";
      difficultyInstruction =
        difficultyPref === "auto"
          ? "Mix of EASY, MEDIUM, and HARD."
          : `${difficultyPref} difficulty.`;
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    // ── STAGE 2: Problem Selection ──────────────────────
    // Fast AI call to decide WHAT to generate.
    // Small output = cheap + fast + reliable.
    const { problemSelectionPrompt, problemContentGenerationPrompt } =
      await import("../services/ai.prompts.js");

    const selectionPromptData = {
      category,
      count: problemCount,
      difficulty: difficultyPref,
      difficultyInstruction,
      teamContext,
      existingProblems,
      targetCompany,
      focusAreas,
    };

    const { system: selSystem, user: selUser } =
      problemSelectionPrompt(selectionPromptData);

    let selections = [];
    let learningPath = "";

    try {
      const selectionResponse = await openai.chat.completions.create({
        model: AI_MODEL_FAST,
        temperature: 0.7,
        response_format: { type: "json_object" },
        max_tokens: 1200, // Small — just titles + platforms + URLs
        messages: [
          { role: "system", content: selSystem },
          { role: "user", content: selUser },
        ],
      });

      const selectionResult = JSON.parse(
        selectionResponse.choices[0].message.content,
      );
      selections = selectionResult.selections || [];
      learningPath = selectionResult.learningPath || "";
    } catch (err) {
      console.error("Stage 2 selection failed:", err.message);
      // Fall back to legacy single-call approach
      const { problemGenerationPrompt } = await import(
        "../services/ai.prompts.js"
      );
      const { system, user } = problemGenerationPrompt({
        category,
        count: problemCount,
        difficulty: difficultyPref,
        targetCompany,
        focusAreas,
        teamContext,
        existingProblems,
      });

      const maxTokens = Math.min(problemCount * 1800, 8000);
      const fallbackResponse = await openai.chat.completions.create({
        model: AI_MODEL_FAST,
        temperature: 0.8,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });

      const fallbackResult = JSON.parse(
        fallbackResponse.choices[0].message.content,
      );

      if (!fallbackResult.problems?.length) {
        return error(res, "AI failed to generate problems.", 500);
      }

      return success(res, {
        problems: fallbackResult.problems,
        reasoning: fallbackResult.reasoning,
        count: fallbackResult.problems.length,
        category,
        difficulty: difficultyPref,
        pipeline: "legacy",
      });
    }

    if (selections.length === 0) {
      return error(res, "AI failed to select problems.", 500);
    }

    // ── STAGE 3: Content Generation (PARALLEL) ──────────
    // Generate rich educational content for each problem simultaneously.
    // Each call is focused on ONE problem — no token competition.
    // If a call fails, that problem is skipped (partial success is better than total failure).
    const contentPromises = selections.map(async (selection) => {
      try {
        const { system: contentSystem, user: contentUser } =
          problemContentGenerationPrompt({
            title: selection.title,
            category,
            difficulty: selection.difficulty,
            platform: selection.platform,
            url: selection.url,
            pattern: selection.pattern,
            targetCompany,
          });

        const contentResponse = await openai.chat.completions.create({
          model: AI_MODEL_FAST,
          temperature: 0.75,
          response_format: { type: "json_object" },
          max_tokens: 2000, // Rich content for ONE problem
          messages: [
            { role: "system", content: contentSystem },
            { role: "user", content: contentUser },
          ],
        });

        const content = JSON.parse(contentResponse.choices[0].message.content);

        // Merge selection metadata with generated content
        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          sourceUrl: selection.url,
          description: content.description || "",
          realWorldContext: content.realWorldContext || "",
          useCases: content.useCases || "",
          adminNotes: content.adminNotes || "",
          tags: content.tags || [],
          companyTags: content.companyTags || [],
          followUpQuestions: content.followUpQuestions || [],
          whySelected: selection.whySelected,
        };
      } catch (err) {
        console.error(
          `Stage 3 content generation failed for "${selection.title}":`,
          err.message,
        );
        // Return partial problem with basic info — better than nothing
        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          sourceUrl: selection.url,
          description: `Problem: ${selection.title}\nSee ${selection.url} for full description.`,
          realWorldContext: "",
          useCases: "",
          adminNotes: `Pattern: ${selection.pattern}. ${selection.whySelected}`,
          tags: [selection.pattern],
          companyTags: [],
          followUpQuestions: [],
          whySelected: selection.whySelected,
          contentGenerationFailed: true,
        };
      }
    });

    // Wait for all parallel content generations
    const problems = await Promise.all(contentPromises);

    const successCount = problems.filter((p) => !p.contentGenerationFailed).length;
    const reasoning = learningPath
      ? `${learningPath} (${successCount}/${problems.length} problems fully generated)`
      : `Generated ${successCount}/${problems.length} problems for ${category}`;

    return success(res, {
      problems,
      reasoning,
      count: problems.length,
      category,
      difficulty: difficultyPref,
      pipeline: "multi-stage",
      stages: {
        intelligenceGathered: !!teamContext,
        problemsSelected: selections.length,
        contentGenerated: successCount,
      },
    });
  } catch (err) {
    console.error("AI problem generation error:", err);
    return error(res, "Failed to generate problems.", 500);
  }
}
