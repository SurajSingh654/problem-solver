import prisma from "../lib/prisma.js";
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from "../utils/response.js";
import { embedProblem } from "../services/embedding.service.js";

// ── Helpers ────────────────────────────────────────────

function parseProblem(p) {
  return {
    ...p,
    tags: JSON.parse(p.tags || "[]"),
    companyTags: JSON.parse(p.companyTags || "[]"),
    useCases: JSON.parse(p.useCases || "[]"),
    relatedProblems: JSON.parse(p.relatedProblems || "[]"),
    aiHints: JSON.parse(p.aiHints || "[]"),
    aiRealWorldSuggestions: JSON.parse(p.aiRealWorldSuggestions || "[]"),
    categoryData: JSON.parse(p.categoryData || "{}"),
  };
}

// ── GET /api/problems ──────────────────────────────────
export async function getProblems(req, res) {
  const {
    difficulty,
    source,
    tag,
    company,
    search,
    pinned,
    category,
    page = "1",
    limit = "50",
  } = req.query;

  // Build where clause
  const where = { isActive: true };

  if (difficulty) where.difficulty = difficulty.toUpperCase();
  if (source) where.source = source.toUpperCase();
  if (category) where.category = category;
  if (pinned) where.isPinned = pinned === "true";

  // For search, tag, and company we do a post-filter
  // since SQLite stores arrays as JSON strings
  let problems = await prisma.problem.findMany({
    where,
    orderBy: [{ isPinned: "desc" }, { addedAt: "desc" }],
    include: {
      addedBy: { select: { username: true, avatarColor: true } },
      followUps: {
        select: {
          id: true,
          question: true,
          difficulty: true,
          hint: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
      _count: { select: { solutions: true } },
    },
  });

  // Parse JSON fields
  problems = problems.map(parseProblem);

  // Post-filter for tag
  if (tag) {
    problems = problems.filter((p) =>
      p.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())),
    );
  }

  // Post-filter for company
  if (company) {
    problems = problems.filter((p) =>
      p.companyTags.some((c) =>
        c.toLowerCase().includes(company.toLowerCase()),
      ),
    );
  }

  // Post-filter for search
  if (search) {
    const q = search.toLowerCase();
    problems = problems.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.companyTags.some((c) => c.toLowerCase().includes(q)),
    );
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const total = problems.length;
  const paginated = problems.slice(
    (pageNum - 1) * limitNum,
    pageNum * limitNum,
  );

  // For each problem, check if the requesting user has solved it
  const userId = req.user.id;
  const userSolutions = await prisma.solution.findMany({
    where: { userId },
    select: { problemId: true },
  });
  const solvedIds = new Set(userSolutions.map((s) => s.problemId));

  const enriched = paginated.map((p) => ({
    ...p,
    isSolvedByMe: req.user.role === "ADMIN" ? false : solvedIds.has(p.id),
    totalSolutions: p._count.solutions,
  }));

  return successResponse(res, {
    problems: enriched,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
}

// ── GET /api/problems/:id ──────────────────────────────
export async function getProblemById(req, res) {
  const { id } = req.params;

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      addedBy: { select: { username: true, avatarColor: true } },
      followUps: { orderBy: { order: "asc" } },
      solutions: {
        include: {
          user: {
            select: { username: true, avatarColor: true, currentLevel: true },
          },
          clarityRatings: {
            include: { fromUser: { select: { username: true } } },
          },
        },
        orderBy: { solvedAt: "desc" },
      },
      _count: { select: { solutions: true } },
    },
  });

  if (!problem) return notFoundResponse(res, "Problem");

  const parsed = parseProblem(problem);

  // Parse solutions
  const solutions = parsed.solutions.map((s) => ({
    ...s,
    followUpAnswers: JSON.parse(s.followUpAnswers || "[]"),
    reviewDates: JSON.parse(s.reviewDates || "[]"),
  }));

  // Check if requesting user has solved it
  const isSolvedByMe = solutions.some((s) => s.userId === req.user.id);

  return successResponse(res, {
    ...parsed,
    solutions,
    isSolvedByMe,
    totalSolutions: parsed._count.solutions,
  });
}

// ── POST /api/problems ─────────────────────────────────
export async function createProblem(req, res) {
  const {
    title,
    source,
    sourceUrl,
    difficulty,
    category,
    description,
    categoryData,
    tags,
    companyTags,
    isPinned,
    isBlindChallenge,
    blindRevealAt,
    realWorldContext,
    useCases,
    adminNotes,
    relatedProblems,
    followUps,
  } = req.body;

  const problem = await prisma.problem.create({
    data: {
      title,
      source,
      sourceUrl,
      difficulty,
      category: category || "CODING",
      description: description || null,
      categoryData: categoryData || "{}",
      tags: JSON.stringify(tags || []),
      companyTags: JSON.stringify(companyTags || []),
      useCases: JSON.stringify(useCases || []),
      relatedProblems: JSON.stringify(relatedProblems || []),
      isPinned: isPinned || false,
      isBlindChallenge: isBlindChallenge || false,
      blindRevealAt: blindRevealAt ? new Date(blindRevealAt) : null,
      realWorldContext: realWorldContext || null,
      adminNotes: adminNotes || null,
      addedById: req.user.id,
      followUps: followUps?.length
        ? {
            create: followUps.map((f, i) => ({
              question: f.question,
              difficulty: f.difficulty,
              hint: f.hint || null,
              order: i,
            })),
          }
        : undefined,
    },
    include: {
      addedBy: { select: { username: true } },
      followUps: true,
    },
  });

  embedProblem(problem.id).catch((err) =>
    console.error("[Embedding] Background embed failed:", err.message),
  );

  return createdResponse(res, parseProblem(problem), "Problem created");
}

// ── PUT /api/problems/:id ──────────────────────────────
export async function updateProblem(req, res) {
  const { id } = req.params;

  const existing = await prisma.problem.findUnique({ where: { id } });
  if (!existing) return notFoundResponse(res, "Problem");

  const {
    title,
    source,
    sourceUrl,
    difficulty,
    category,
    description,
    categoryData,
    tags,
    companyTags,
    isPinned,
    isBlindChallenge,
    blindRevealAt,
    realWorldContext,
    useCases,
    adminNotes,
    relatedProblems,
    isActive,
  } = req.body;

  const updated = await prisma.problem.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(source !== undefined && { source }),
      ...(sourceUrl !== undefined && { sourceUrl }),
      ...(difficulty !== undefined && { difficulty }),
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description }),
      ...(categoryData !== undefined && { categoryData }),
      ...(isPinned !== undefined && { isPinned }),
      ...(isBlindChallenge !== undefined && { isBlindChallenge }),
      ...(isActive !== undefined && { isActive }),
      ...(realWorldContext !== undefined && { realWorldContext }),
      ...(adminNotes !== undefined && { adminNotes }),
      ...(blindRevealAt !== undefined && {
        blindRevealAt: blindRevealAt ? new Date(blindRevealAt) : null,
      }),
      ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      ...(companyTags !== undefined && {
        companyTags: JSON.stringify(companyTags),
      }),
      ...(useCases !== undefined && { useCases: JSON.stringify(useCases) }),
      ...(relatedProblems !== undefined && {
        relatedProblems: JSON.stringify(relatedProblems),
      }),
    },
    include: {
      addedBy: { select: { username: true } },
      followUps: true,
    },
  });
  embedProblem(updated.id).catch((err) =>
    console.error("[Embedding] Background embed failed:", err.message),
  );

  return successResponse(res, parseProblem(updated), "Problem updated");
}

// ── DELETE /api/problems/:id ───────────────────────────
export async function deleteProblem(req, res) {
  const { id } = req.params;

  const existing = await prisma.problem.findUnique({ where: { id } });
  if (!existing) return notFoundResponse(res, "Problem");

  await prisma.problem.delete({ where: { id } });

  return successResponse(res, { id }, "Problem deleted");
}
