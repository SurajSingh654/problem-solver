import prisma from "../lib/prisma.js";
import { successResponse } from "../utils/response.js";

// ── GET /api/recommendations ───────────────────────────
export async function getRecommendations(req, res) {
  const userId = req.user.id;

  // Get user profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      targetCompanies: true,
      currentLevel: true,
    },
  });

  const targetCompanies = JSON.parse(user?.targetCompanies || "[]");

  // Get all user's solved problem IDs
  const userSolutions = await prisma.solution.findMany({
    where: { userId },
    select: {
      problemId: true,
      patternIdentified: true,
      confidenceLevel: true,
    },
  });

  const solvedIds = new Set(userSolutions.map((s) => s.problemId));

  // Get all active unsolved problems
  const allProblems = await prisma.problem.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      difficulty: true,
      category: true,
      tags: true,
      companyTags: true,
      description: true,
      _count: { select: { solutions: true } },
    },
  });

  const unsolvedProblems = allProblems
    .filter((p) => !solvedIds.has(p.id))
    .map((p) => ({
      ...p,
      tags: JSON.parse(p.tags || "[]"),
      companyTags: JSON.parse(p.companyTags || "[]"),
      solutionCount: p._count.solutions,
    }));

  // ── Strategy 1: Company-targeted problems ────────────
  const companyRecommendations =
    targetCompanies.length > 0
      ? unsolvedProblems
          .filter((p) =>
            p.companyTags.some((ct) =>
              targetCompanies.some((tc) =>
                ct.toLowerCase().includes(tc.toLowerCase()),
              ),
            ),
          )
          .slice(0, 5)
          .map((p) => ({
            ...p,
            reason: `Asked by ${p.companyTags
              .filter((ct) =>
                targetCompanies.some((tc) =>
                  ct.toLowerCase().includes(tc.toLowerCase()),
                ),
              )
              .join(", ")}`,
            type: "company",
          }))
      : [];

  // ── Strategy 2: Pattern gap problems ─────────────────
  const solvedPatterns = new Set(
    userSolutions
      .filter((s) => s.patternIdentified)
      .map((s) => s.patternIdentified),
  );

  const patternGapProblems = unsolvedProblems
    .filter((p) => {
      const problemPatterns = p.tags;
      return problemPatterns.some((tag) => !solvedPatterns.has(tag));
    })
    .slice(0, 5)
    .map((p) => {
      const missingPatterns = p.tags.filter((tag) => !solvedPatterns.has(tag));
      return {
        ...p,
        reason: `Covers ${missingPatterns[0]} — a pattern you haven't practiced`,
        type: "pattern_gap",
      };
    });

  // ── Strategy 3: Low confidence review ────────────────
  const lowConfSolutions = userSolutions.filter((s) => s.confidenceLevel <= 2);

  const lowConfProblemIds = new Set(lowConfSolutions.map((s) => s.problemId));
  const lowConfProblems = allProblems
    .filter((p) => lowConfProblemIds.has(p.id))
    .slice(0, 3)
    .map((p) => ({
      ...p,
      tags: JSON.parse(p.tags || "[]"),
      companyTags: JSON.parse(p.companyTags || "[]"),
      solutionCount: p._count.solutions,
      reason: "You rated low confidence — consider re-solving",
      type: "low_confidence",
    }));

  // ── Strategy 4: Vector similarity (if embeddings exist) ──
  let similarProblems = [];
  if (userSolutions.length > 0) {
    try {
      // Find problems similar to the user's most recent solution
      const recentSolution = await prisma.solution.findFirst({
        where: { userId },
        orderBy: { solvedAt: "desc" },
        select: { id: true },
      });

      if (recentSolution) {
        const vectorResults = await prisma.$queryRawUnsafe(
          `
          SELECT p.id, p.title, p.difficulty, p.category, p.tags,
                 p."companyTags",
                 p.embedding <=> (
                   SELECT embedding FROM solutions WHERE id = $1
                 ) AS distance
          FROM problems p
          WHERE p.id NOT IN (
            SELECT "problemId" FROM solutions WHERE "userId" = $2
          )
          AND p."isActive" = true
          AND p.embedding IS NOT NULL
          ORDER BY distance ASC
          LIMIT 5
        `,
          recentSolution.id,
          userId,
        );

        similarProblems = vectorResults.map((p) => ({
          ...p,
          tags: JSON.parse(p.tags || "[]"),
          companyTags: JSON.parse(p.companyTags || "[]"),
          reason: "Similar to problems you've recently solved",
          type: "similar",
          distance: p.distance,
        }));
      }
    } catch (err) {
      console.log("[Recommendations] Vector search failed:", err.message);
    }
  }

  // ── Strategy 5: Category balance ─────────────────────
  const solvedByCategory = {};
  userSolutions.forEach((s) => {
    const problem = allProblems.find((p) => p.id === s.problemId);
    if (problem) {
      const cat = problem.category || "CODING";
      solvedByCategory[cat] = (solvedByCategory[cat] || 0) + 1;
    }
  });

  const allCategories = [
    "CODING",
    "SYSTEM_DESIGN",
    "BEHAVIORAL",
    "CS_FUNDAMENTALS",
    "SQL",
  ];
  const weakCategories = allCategories.filter(
    (cat) => (solvedByCategory[cat] || 0) < 2,
  );

  const categoryGapProblems = unsolvedProblems
    .filter((p) => weakCategories.includes(p.category))
    .slice(0, 3)
    .map((p) => ({
      ...p,
      reason: `You've solved few ${p.category.replace("_", " ").toLowerCase()} problems`,
      type: "category_gap",
    }));

  // ── Combine and deduplicate ──────────────────────────
  const seen = new Set();
  const allRecommendations = [];

  function addUnique(items, priority) {
    items.forEach((item) => {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allRecommendations.push({ ...item, priority });
      }
    });
  }

  addUnique(companyRecommendations, 1);
  addUnique(patternGapProblems, 2);
  addUnique(lowConfProblems, 3);
  addUnique(similarProblems, 4);
  addUnique(categoryGapProblems, 5);

  // Sort by priority then limit
  const final = allRecommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10);

  return successResponse(res, {
    recommendations: final,
    stats: {
      totalUnsolved: unsolvedProblems.length,
      solvedCount: solvedIds.size,
      patternsCount: solvedPatterns.size,
      weakCategories,
      targetCompanies,
    },
  });
}
