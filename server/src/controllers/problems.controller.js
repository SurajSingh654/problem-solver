// ============================================================================
// ProbSolver v3.0 — Problems Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ============================================================================
// LIST PROBLEMS
// ============================================================================
export async function listProblems(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const isAdmin =
      req.user.globalRole === "SUPER_ADMIN" ||
      req.user.teamRole === "TEAM_ADMIN";

    const {
      category,
      difficulty,
      search,
      source,
      isPinned,
      isPublished,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // ── Build WHERE clause ─────────────────────────────
    const where = { teamId };

    if (!isAdmin) {
      where.isPublished = true;
      where.isHidden = false;
    } else {
      if (isPublished !== undefined) {
        where.isPublished = isPublished === "true";
      }
    }

    if (category) where.category = category;
    if (difficulty) where.difficulty = difficulty;
    if (source) where.source = source;
    if (isPinned === "true") where.isPinned = true;

    // v3.0 FIX: Guard against empty search string
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { tags: { has: search.trim() } },
      ];
    }

    // ── Build ORDER BY ─────────────────────────────────
    const orderBy = [];
    orderBy.push({ isPinned: "desc" });
    const validSortFields = ["createdAt", "title", "difficulty", "category"];
    if (validSortFields.includes(sortBy)) {
      orderBy.push({ [sortBy]: sortOrder === "asc" ? "asc" : "desc" });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [problems, total] = await Promise.all([
      prisma.problem.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          difficulty: true,
          category: true,
          categoryData: true,
          tags: true,
          realWorldContext: true,
          source: true,
          isPublished: true,
          isPinned: true,
          isHidden: true,
          createdById: true,
          createdAt: true,
          createdBy: {
            select: { id: true, name: true },
          },
          _count: {
            select: {
              solutions: true,
              followUpQuestions: true,
            },
          },
          solutions: {
            where: { userId },
            select: { id: true, confidence: true },
            take: 1,
          },
        },
        orderBy,
        skip,
        take,
      }),
      prisma.problem.count({ where }),
    ]);

    const enriched = problems.map((p) => {
      const userSolution = p.solutions[0] || null;
      return {
        ...p,
        solutions: undefined,
        isSolved: !!userSolution,
        userConfidence: userSolution?.confidence || null,
        solutionCount: p._count.solutions,
        followUpCount: p._count.followUpQuestions,
      };
    });

    return success(res, {
      problems: enriched,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("List problems error:", err);
    return error(res, "Failed to fetch problems.", 500);
  }
}

// ============================================================================
// GET SINGLE PROBLEM
// ============================================================================
export async function getProblem(req, res) {
  try {
    const { problemId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const problem = await prisma.problem.findFirst({
      where: {
        id: problemId,
        teamId,
      },
      include: {
        followUpQuestions: {
          orderBy: { order: "asc" },
        },
        createdBy: {
          select: { id: true, name: true },
        },
        _count: {
          select: { solutions: true },
        },
      },
    });

    if (!problem) {
      return error(res, "Problem not found.", 404);
    }

    const userSolution = await prisma.solution.findFirst({
      where: { problemId, userId, teamId },
      select: { id: true, confidence: true, createdAt: true },
    });

    const teamSolutions = await prisma.solution.count({
      where: { problemId, teamId },
    });

    return success(res, {
      problem: {
        ...problem,
        isSolved: !!userSolution,
        userSolutionId: userSolution?.id || null,
        teamSolutionCount: teamSolutions,
      },
    });
  } catch (err) {
    console.error("Get problem error:", err);
    return error(res, "Failed to fetch problem.", 500);
  }
}

// ============================================================================
// CREATE PROBLEM (TEAM_ADMIN)
// v3.0 FIX: Normalize v2 fields sent by ProblemForm.jsx
// ============================================================================
export async function createProblem(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    const {
      title,
      description,
      difficulty,
      category,
      categoryData,
      tags,
      realWorldContext,
      useCases,
      adminNotes,
      source,
      followUpQuestions,
      // v2 fields that ProblemForm.jsx may send — accept but normalize
      followUps,
      companyTags,
      sourceUrl,
      isBlindChallenge,
    } = req.body;

    // v3.0 FIX: v2 sends followUps, v3 expects followUpQuestions
    const normalizedFollowUps = followUpQuestions || followUps || [];

    // AFTER (correct — only MANUAL and AI_GENERATED are valid ProblemSource enum values)
    const normalizedSource =
      source === "AI_GENERATED" ? "AI_GENERATED" : "MANUAL";

    // v3.0 FIX: v2 sends useCases as array, v3 expects string
    const normalizedUseCases = Array.isArray(useCases)
      ? useCases.join("\n")
      : useCases || null;

    // v3.0 FIX: merge companyTags into tags if present
    const normalizedTags = [
      ...(Array.isArray(tags) ? tags : []),
      ...(Array.isArray(companyTags) ? companyTags : []),
    ];

    const problem = await prisma.problem.create({
      data: {
        title,
        description: description || null,
        difficulty: difficulty || "MEDIUM",
        category: category || "CODING",
        categoryData: categoryData || null,
        tags: normalizedTags,
        realWorldContext: realWorldContext || null,
        useCases: normalizedUseCases,
        adminNotes: adminNotes || null,
        source: normalizedSource,
        isPublished: true,
        teamId,
        createdById: userId,
        followUpQuestions:
          normalizedFollowUps.length > 0
            ? {
                create: normalizedFollowUps.map((fq, index) => ({
                  question: fq.question,
                  difficulty: fq.difficulty || "MEDIUM",
                  hint: fq.hint || null,
                  order: fq.order ?? index,
                })),
              }
            : undefined,
      },
      include: {
        followUpQuestions: { orderBy: { order: "asc" } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    generateProblemEmbedding(problem.id).catch((err) => {
      console.error("Background embedding failed:", err.message);
    });

    return success(
      res,
      {
        message: "Problem created.",
        problem,
      },
      201,
    );
  } catch (err) {
    console.error("Create problem error:", err);
    return error(res, "Failed to create problem.", 500);
  }
}

// ============================================================================
// UPDATE PROBLEM (TEAM_ADMIN)
// ============================================================================
export async function updateProblem(req, res) {
  try {
    const { problemId } = req.params;
    const teamId = req.teamId;

    const existing = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true },
    });

    if (!existing) {
      return error(res, "Problem not found.", 404);
    }

    const {
      title,
      description,
      difficulty,
      category,
      categoryData,
      tags,
      realWorldContext,
      useCases,
      adminNotes,
      isPublished,
      isPinned,
      isHidden,
    } = req.body;

    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (difficulty !== undefined) data.difficulty = difficulty;
    if (category !== undefined) data.category = category;
    if (categoryData !== undefined) data.categoryData = categoryData;
    if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
    if (realWorldContext !== undefined)
      data.realWorldContext = realWorldContext;
    if (useCases !== undefined)
      data.useCases = Array.isArray(useCases) ? useCases.join("\n") : useCases;
    if (adminNotes !== undefined) data.adminNotes = adminNotes;
    if (isPublished !== undefined) data.isPublished = isPublished;
    if (isPinned !== undefined) data.isPinned = isPinned;
    if (isHidden !== undefined) data.isHidden = isHidden;

    const problem = await prisma.problem.update({
      where: { id: problemId },
      data,
      include: {
        followUpQuestions: { orderBy: { order: "asc" } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (title || description) {
      generateProblemEmbedding(problem.id).catch(() => {});
    }

    return success(res, { message: "Problem updated.", problem });
  } catch (err) {
    console.error("Update problem error:", err);
    return error(res, "Failed to update problem.", 500);
  }
}

// ============================================================================
// DELETE PROBLEM (TEAM_ADMIN)
// ============================================================================
export async function deleteProblem(req, res) {
  try {
    const { problemId } = req.params;
    const teamId = req.teamId;

    const existing = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true },
    });

    if (!existing) {
      return error(res, "Problem not found.", 404);
    }

    await prisma.problem.delete({ where: { id: problemId } });

    return success(res, { message: `"${existing.title}" deleted.` });
  } catch (err) {
    console.error("Delete problem error:", err);
    return error(res, "Failed to delete problem.", 500);
  }
}

// ============================================================================
// TOGGLE PIN / HIDE (TEAM_ADMIN)
// ============================================================================
export async function toggleProblemFlag(req, res) {
  try {
    const { problemId } = req.params;
    const { flag } = req.body;
    const teamId = req.teamId;

    const existing = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, isPinned: true, isHidden: true },
    });

    if (!existing) {
      return error(res, "Problem not found.", 404);
    }

    const data = {};
    if (flag === "pin") data.isPinned = !existing.isPinned;
    if (flag === "hide") data.isHidden = !existing.isHidden;

    const updated = await prisma.problem.update({
      where: { id: problemId },
      data,
      select: { id: true, isPinned: true, isHidden: true },
    });

    return success(res, { message: "Updated.", problem: updated });
  } catch (err) {
    console.error("Toggle flag error:", err);
    return error(res, "Failed to update problem.", 500);
  }
}

// ============================================================================
// BACKGROUND: Generate embedding
// ============================================================================
async function generateProblemEmbedding(problemId) {
  try {
    const { AI_ENABLED } = await import("../config/env.js");
    if (!AI_ENABLED) return;

    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { title: true, description: true, tags: true, category: true },
    });

    if (!problem) return;

    const text = [
      problem.title,
      problem.description || "",
      problem.tags?.join(", ") || "",
      problem.category,
    ].join(" ");

    const { generateEmbedding } =
      await import("../services/embedding.service.js");
    const embedding = await generateEmbedding(text);

    if (embedding) {
      const vectorStr = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE problems SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        problemId,
      );
    }
  } catch (err) {
    console.error("Problem embedding error:", err.message);
  }
}
