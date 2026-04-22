// ============================================================================
// ProbSolver v3.0 — Recommendations Controller (Team-Scoped)
// ============================================================================
//
// SCOPING: All 5 recommendation strategies are scoped to req.teamId.
// Recommendations pull from the team's problem pool only.
//
// The 5 strategies:
// 1. Company-targeted — problems matching target company tags
// 2. Pattern gaps — categories/patterns user hasn't practiced
// 3. Low confidence — previously solved with low confidence
// 4. Vector similarity — semantically similar to recent work
// 5. Category balance — underrepresented categories
//
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED } from "../config/env.js";

export async function getRecommendations(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId;

    const recommendations = [];

    // ── Get user's existing solutions in this team ─────
    const userSolutions = await prisma.solution.findMany({
      where: { userId, teamId },
      select: {
        problemId: true,
        confidence: true,
        pattern: true,
        problem: { select: { category: true, difficulty: true, tags: true } },
      },
    });

    const solvedIds = new Set(userSolutions.map((s) => s.problemId));

    // ── Get all unsolved problems in this team ─────────
    const allProblems = await prisma.problem.findMany({
      where: {
        teamId, // SCOPING
        isPublished: true,
        isHidden: false,
        id: { notIn: [...solvedIds] },
      },
      select: {
        id: true,
        title: true,
        difficulty: true,
        category: true,
        tags: true,
      },
    });

    // ── Strategy 1: Company-Targeted ───────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { targetCompany: true },
    });

    if (user?.targetCompany) {
      const companyProblems = allProblems
        .filter((p) =>
          p.tags?.some((t) =>
            t.toLowerCase().includes(user.targetCompany.toLowerCase()),
          ),
        )
        .slice(0, 3);

      companyProblems.forEach((p) => {
        recommendations.push({
          ...p,
          strategy: "company-targeted",
          reason: `Tagged for ${user.targetCompany} interview prep.`,
        });
      });
    }

    // ── Strategy 2: Pattern Gaps ───────────────────────
    const practicedPatterns = new Set(
      userSolutions.filter((s) => s.pattern).map((s) => s.pattern),
    );
    const allPatterns = [
      "Two Pointers",
      "Sliding Window",
      "Hash Map",
      "Binary Search",
      "DFS",
      "BFS",
      "Dynamic Programming",
      "Greedy",
      "Stack",
      "Heap",
      "Trie",
      "Union Find",
      "Graph",
      "Backtracking",
      "Divide and Conquer",
      "Bit Manipulation",
    ];
    const missingPatterns = allPatterns.filter(
      (p) => !practicedPatterns.has(p),
    );

    if (missingPatterns.length > 0) {
      const gapProblems = allProblems
        .filter((p) => p.tags?.some((t) => missingPatterns.includes(t)))
        .slice(0, 3);

      gapProblems.forEach((p) => {
        const matchedPattern = p.tags?.find((t) => missingPatterns.includes(t));
        recommendations.push({
          ...p,
          strategy: "pattern-gap",
          reason: `You haven't practiced "${matchedPattern}" yet.`,
        });
      });
    }

    // ── Strategy 3: Low Confidence Re-solve ────────────
    const lowConfidence = userSolutions
      .filter((s) => s.confidence <= 2)
      .slice(0, 3);

    for (const lc of lowConfidence) {
      const problem = await prisma.problem.findFirst({
        where: { id: lc.problemId, teamId },
        select: { id: true, title: true, difficulty: true, category: true },
      });
      if (problem) {
        recommendations.push({
          ...problem,
          strategy: "low-confidence",
          reason: `You rated confidence ${lc.confidence}/5. Worth revisiting.`,
        });
      }
    }

    // ── Strategy 4: Vector Similarity ──────────────────
    if (AI_ENABLED && userSolutions.length > 0) {
      try {
        const { generateEmbedding } =
          await import("../services/embedding.service.js");

        // Use most recent solution's context as query
        const recent = userSolutions[0];
        const queryText = `${recent.pattern || ""} ${recent.problem.category}`;
        const embedding = await generateEmbedding(queryText);

        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          const solvedIdArray = [...solvedIds];

          // TEAM-SCOPED vector search
          const similar = await prisma.$queryRawUnsafe(
            `
  SELECT p.id, p.title, p.difficulty, p.category,
         1 - (p.embedding <=> $1::vector) as similarity
  FROM problems p
  WHERE p."teamId" = $2
    AND p."isPublished" = true
    AND p."isHidden" = false
    AND p.embedding IS NOT NULL
    AND p.id != ALL($3::text[])
  ORDER BY p.embedding <=> $1::vector
  LIMIT 3
`,
            vectorStr,
            teamId,
            solvedIdArray,
          );

          similar.forEach((p) => {
            recommendations.push({
              id: p.id,
              title: p.title,
              difficulty: p.difficulty,
              category: p.category,
              strategy: "vector-similarity",
              reason: `Semantically similar to your recent work (${Math.round(p.similarity * 100)}% match).`,
            });
          });
        }
      } catch (err) {
        console.error("Vector recommendation failed:", err.message);
      }
    }

    // ── Strategy 5: Category Balance ───────────────────
    const categoryCounts = {};
    userSolutions.forEach((s) => {
      const cat = s.problem?.category || "CODING";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const allCategories = [
      "CODING",
      "SYSTEM_DESIGN",
      "BEHAVIORAL",
      "CS_FUNDAMENTALS",
      "HR",
      "SQL",
    ];
    const underrepresented = allCategories
      .filter((c) => (categoryCounts[c] || 0) < 2)
      .sort((a, b) => (categoryCounts[a] || 0) - (categoryCounts[b] || 0));

    for (const cat of underrepresented.slice(0, 2)) {
      const catProblem = allProblems.find((p) => p.category === cat);
      if (catProblem) {
        recommendations.push({
          ...catProblem,
          strategy: "category-balance",
          reason: `You have ${categoryCounts[cat] || 0} solutions in ${cat.replace("_", " ")}. Balance your prep.`,
        });
      }
    }

    // ── Deduplicate by problem ID ──────────────────────
    const seen = new Set();
    const unique = recommendations.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    return success(res, {
      recommendations: unique,
      count: unique.length,
      strategies: {
        companyTargeted: unique.filter((r) => r.strategy === "company-targeted")
          .length,
        patternGap: unique.filter((r) => r.strategy === "pattern-gap").length,
        lowConfidence: unique.filter((r) => r.strategy === "low-confidence")
          .length,
        vectorSimilarity: unique.filter(
          (r) => r.strategy === "vector-similarity",
        ).length,
        categoryBalance: unique.filter((r) => r.strategy === "category-balance")
          .length,
      },
    });
  } catch (err) {
    console.error("Recommendations error:", err);
    return error(res, "Failed to generate recommendations.", 500);
  }
}
