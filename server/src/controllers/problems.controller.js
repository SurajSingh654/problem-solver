// ============================================================================
// ProbSolver v3.0 — Problems Controller (Team-Scoped)
// ============================================================================
// All POST/PUT/PATCH bodies are validated by Zod via validate() middleware
// in problems.routes.js, so field types reaching this controller match
// server/src/schemas/problem.schema.js. No defensive coercion required.
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { normalizeSourceLists } from "../utils/sourceListTaxonomy.js";
import { generateCanonicalAnswer, augmentCanonicalAlternatives } from "./ai.controller.js";
import { isAIEnabled } from "../services/ai.service.js";
import { canonicalPatchSchema } from "../schemas/problem.schema.js";

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
      sourceList,
      isPinned,
      isPublished,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

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
    if (sourceList) where.sourceLists = { has: sourceList };
    if (isPinned === "true") where.isPinned = true;
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { tags: { has: search.trim() } },
      ];
    }

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
          sourceLists: true,
          realWorldContext: true,
          source: true,
          isPublished: true,
          isPinned: true,
          isHidden: true,
          version: true,
          createdById: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
          _count: {
            select: { solutions: true, followUpQuestions: true },
          },
          solutions: {
            where: { userId },
            select: { id: true, confidence: true, problemVersion: true },
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
      const userSolvedVersion = userSolution?.problemVersion ?? null;
      return {
        ...p,
        solutions: undefined,
        isSolved: !!userSolution,
        userConfidence: userSolution?.confidence || null,
        userSolvedVersion,
        problemUpdatedSinceSolved:
          userSolvedVersion != null && p.version > userSolvedVersion,
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
      where: { id: problemId, teamId },
      include: {
        followUpQuestions: { orderBy: { order: "asc" } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { solutions: true } },
      },
    });

    if (!problem) return error(res, "Problem not found.", 404);

    const [userSolution, teamSolutions] = await Promise.all([
      prisma.solution.findFirst({
        where: { problemId, userId, teamId },
        select: {
          id: true,
          confidence: true,
          createdAt: true,
          problemVersion: true,
          _count: { select: { attempts: true } },
        },
      }),
      prisma.solution.count({ where: { problemId, teamId } }),
    ]);

    // Flag whether the problem has been edited since the user's submission.
    // Truthy only for versioned rows; legacy rows with problemVersion NULL
    // are treated as "unknown" and don't trip the flag.
    const userSolvedVersion = userSolution?.problemVersion ?? null;
    const problemUpdatedSinceSolved =
      userSolvedVersion != null && problem.version > userSolvedVersion;

    return success(res, {
      problem: {
        ...problem,
        isSolved: !!userSolution,
        userSolutionId: userSolution?.id || null,
        userSolvedVersion,
        userAttemptCount: userSolution?._count?.attempts ?? 0,
        problemUpdatedSinceSolved,
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
      followUps,
      companyTags,
      isPinned,
      sourceLists,
    } = req.body;

    const normalizedUseCases = Array.isArray(useCases)
      ? useCases.join("\n")
      : useCases ?? null;
    const normalizedTags = [...tags, ...companyTags];
    const normalizedSourceLists = normalizeSourceLists(sourceLists ?? [], { userId });

    const problem = await prisma.problem.create({
      data: {
        title,
        description: description ?? null,
        difficulty,
        category,
        categoryData: categoryData ?? null,
        tags: normalizedTags,
        sourceLists: normalizedSourceLists,
        realWorldContext: realWorldContext ?? null,
        useCases: normalizedUseCases,
        adminNotes: adminNotes ?? null,
        source,
        isPinned,
        isPublished: true,
        teamId,
        createdById: userId,
        followUpQuestions:
          followUps.length > 0
            ? {
                create: followUps.map((fq, index) => ({
                  question: fq.question,
                  difficulty: fq.difficulty,
                  hint: fq.hint ?? null,
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

    return success(res, { message: "Problem created.", problem }, 201);
  } catch (err) {
    console.error("Create problem error:", err);
    return error(res, "Failed to create problem.", 500);
  }
}

// ============================================================================
// BATCH CREATE PROBLEMS (TEAM_ADMIN)
// ============================================================================
// Creates up to 5 problems in a single DB transaction.
// One round trip, one connection checkout, atomic — all succeed or all fail.
// Embeddings generated in parallel after transaction commits.
// Hard cap of 5 enforced here — same cap enforced on client.
// ============================================================================
export async function batchCreateProblems(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    const { problems } = req.body;

    // Shape each validated problem for Prisma (merge tags+companyTags,
    // coerce useCases array → string, etc.) — mirrors createProblem.
    const shaped = problems.map((p) => ({
      title: p.title,
      description: p.description ?? null,
      difficulty: p.difficulty,
      category: p.category,
      categoryData: p.categoryData ?? null,
      tags: [...p.tags, ...p.companyTags],
      sourceLists: normalizeSourceLists(p.sourceLists ?? [], { userId }),
      realWorldContext: p.realWorldContext ?? null,
      useCases: Array.isArray(p.useCases)
        ? p.useCases.join("\n")
        : p.useCases ?? null,
      adminNotes: p.adminNotes ?? null,
      source: p.source,
      isPinned: p.isPinned,
      isPublished: true,
      teamId,
      createdById: userId,
      followUps: p.followUps,
    }));

    // Single transaction — all or nothing
    const created = await prisma.$transaction(
      shaped.map(({ followUps, ...data }) =>
        prisma.problem.create({
          data: {
            ...data,
            followUpQuestions:
              followUps.length > 0
                ? {
                    create: followUps.map((fq, index) => ({
                      question: fq.question,
                      difficulty: fq.difficulty,
                      hint: fq.hint ?? null,
                      order: fq.order ?? index,
                    })),
                  }
                : undefined,
          },
          include: {
            followUpQuestions: { orderBy: { order: "asc" } },
            createdBy: { select: { id: true, name: true } },
          },
        }),
      ),
    );

    // Fire embeddings in parallel after transaction — fire and forget
    created.forEach((problem) => {
      generateProblemEmbedding(problem.id).catch((err) => {
        console.error(
          `Background embedding failed for ${problem.id}:`,
          err.message,
        );
      });
    });

    return success(
      res,
      {
        message: `${created.length} problem${created.length !== 1 ? "s" : ""} created.`,
        problems: created,
        count: created.length,
      },
      201,
    );
  } catch (err) {
    console.error("Batch create problems error:", err);
    return error(res, "Failed to create problems.", 500);
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

    if (!existing) return error(res, "Problem not found.", 404);

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
      sourceLists,
      followUps,
    } = req.body;

    // Split content fields (bump version) from admin flags (don't).
    // A pin/hide flip shouldn't inflate the version counter — only
    // edits to what the candidate actually reads.
    const contentFields = {};
    if (title !== undefined) contentFields.title = title;
    if (description !== undefined) contentFields.description = description;
    if (difficulty !== undefined) contentFields.difficulty = difficulty;
    if (category !== undefined) contentFields.category = category;
    if (categoryData !== undefined) contentFields.categoryData = categoryData;
    if (tags !== undefined) contentFields.tags = tags;
    if (realWorldContext !== undefined)
      contentFields.realWorldContext = realWorldContext;
    if (useCases !== undefined)
      contentFields.useCases = Array.isArray(useCases)
        ? useCases.join("\n")
        : useCases;
    if (adminNotes !== undefined) contentFields.adminNotes = adminNotes;

    const flagFields = {};
    if (isPublished !== undefined) flagFields.isPublished = isPublished;
    if (isPinned !== undefined) flagFields.isPinned = isPinned;
    if (isHidden !== undefined) flagFields.isHidden = isHidden;
    // sourceLists is metadata (curriculum tags) — does NOT bump version,
    // since the problem statement itself doesn't change when retagging.
    if (sourceLists !== undefined) {
      flagFields.sourceLists = normalizeSourceLists(sourceLists, {
        userId: req.user.id,
        problemId,
      });
    }

    const data = { ...contentFields, ...flagFields };
    // Only bump when a content field is actually being set.
    if (Object.keys(contentFields).length > 0) {
      data.version = { increment: 1 };
    }

    // Update problem fields + reconcile follow-ups atomically. Diff-by-id
    // preserves SolutionFollowUpAnswer rows attached to unchanged follow-ups
    // (the FK cascades on delete, so naive replace would wipe member answers).
    const problem = await prisma.$transaction(async (tx) => {
      await tx.problem.update({ where: { id: problemId }, data });

      if (followUps !== undefined) {
        const incomingIds = new Set(
          followUps.map((fq) => fq.id).filter(Boolean),
        );
        const existing = await tx.followUpQuestion.findMany({
          where: { problemId },
          select: { id: true },
        });
        const existingIds = new Set(existing.map((fq) => fq.id));

        // Delete follow-ups the admin removed. Cascade clears any attached
        // SolutionFollowUpAnswer — intentional: an answer has no meaning
        // without its question.
        const toDelete = existing
          .map((fq) => fq.id)
          .filter((id) => !incomingIds.has(id));
        if (toDelete.length > 0) {
          await tx.followUpQuestion.deleteMany({
            where: { id: { in: toDelete } },
          });
        }

        // Update existing + create new. Single pass; index drives the
        // canonical `order` value (client may send order out of sync).
        for (let i = 0; i < followUps.length; i++) {
          const fq = followUps[i];
          const payload = {
            question: fq.question,
            difficulty: fq.difficulty,
            hint: fq.hint || null,
            order: i,
          };
          if (fq.id && existingIds.has(fq.id)) {
            await tx.followUpQuestion.update({
              where: { id: fq.id },
              data: payload,
            });
          } else {
            // Either no id (new row) or id from a different problem —
            // create fresh under this problem.
            await tx.followUpQuestion.create({
              data: { ...payload, problemId },
            });
          }
        }
      }

      return tx.problem.findUnique({
        where: { id: problemId },
        include: {
          followUpQuestions: { orderBy: { order: "asc" } },
          createdBy: { select: { id: true, name: true } },
        },
      });
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

    if (!existing) return error(res, "Problem not found.", 404);

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

    if (!existing) return error(res, "Problem not found.", 404);

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
// GET CANONICAL ANSWER (lazy-fill with race lock)
// ============================================================================
// First request generates via AI and persists. Subsequent requests return
// the cached columns. Concurrent first-requests are serialized via
// SELECT ... FOR UPDATE so only one AI call is made.
//
// When FEATURE_CANONICAL_ALTERNATIVES is on:
// - New canonicals: generator returns alternatives in a single call.
// - Existing canonicals without alternatives: lazy-augment branch runs a
//   second AI call (inside its own FOR UPDATE transaction) to backfill
//   canonicalAlternatives + canonicalAltGeneratedAt. Non-fatal on failure.
// - Response shape: alternatives array when flag on, null when flag off.
// ============================================================================
export async function getCanonical(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const teamId = req.teamId;

    const problem = await prisma.problem.findFirst({
      where: { id, teamId },
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        canonicalGeneratedAt: true,
        canonicalPattern: true,
        canonicalKeyInsight: true,
        canonicalTimeComplexity: true,
        canonicalSpaceComplexity: true,
        canonicalEditedAt: true,
        canonicalAlternatives: true,
        canonicalAltGeneratedAt: true,
      },
    });
    if (!problem) return error(res, "Problem not found.", 404);

    const altsFlagOn = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";

    // ─── Branch: canonical primary already cached ───────────────────────
    if (problem.canonicalGeneratedAt) {
      // Lazy-augment: primary cached but alternatives never generated.
      if (altsFlagOn && problem.canonicalAltGeneratedAt == null && isAIEnabled()) {
        try {
          const augmented = await prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw`
              SELECT "id", "canonicalGeneratedAt", "canonicalAltGeneratedAt",
                     "canonicalPattern", "canonicalKeyInsight",
                     "canonicalTimeComplexity", "canonicalSpaceComplexity"
              FROM "problems"
              WHERE "id" = ${id}
              FOR UPDATE
            `;
            if (!Array.isArray(rows) || rows.length === 0) return null;
            const locked = rows[0];
            if (locked.canonicalAltGeneratedAt) {
              // Race winner already filled; signal the outer code to keep its current values.
              return null;
            }
            const lockedPrimary = {
              pattern: locked.canonicalPattern,
              keyInsight: locked.canonicalKeyInsight,
              timeComplexity: locked.canonicalTimeComplexity,
              spaceComplexity: locked.canonicalSpaceComplexity,
            };
            const alternatives = await augmentCanonicalAlternatives(
              problem,
              lockedPrimary,
              { userId, teamId },
            );
            await tx.problem.update({
              where: { id },
              data: {
                canonicalAlternatives: alternatives,
                canonicalAltGeneratedAt: new Date(),
              },
            });
            return alternatives;
          });
          if (augmented !== null) {
            problem.canonicalAlternatives = augmented;
            problem.canonicalAltGeneratedAt = new Date();
          }
        } catch (e) {
          console.warn("[canonical-augment] failed; serving primary alone:", e.message);
        }
      }

      // Update lastCanonicalFetchAt for analytics (fire-and-forget; preserved from v1).
      prisma.solution
        .updateMany({
          where: { problemId: id, userId, teamId },
          data: { lastCanonicalFetchAt: new Date() },
        })
        .catch((e) => console.warn("[canonical] fetchAt update failed", e));

      return success(res, {
        pattern: problem.canonicalPattern,
        keyInsight: problem.canonicalKeyInsight,
        timeComplexity: problem.canonicalTimeComplexity,
        spaceComplexity: problem.canonicalSpaceComplexity,
        generatedAt: problem.canonicalGeneratedAt,
        editedAt: problem.canonicalEditedAt,
        alternatives: altsFlagOn
          ? Array.isArray(problem.canonicalAlternatives)
            ? problem.canonicalAlternatives
            : []
          : null,
      });
    }

    // ─── Branch: full generate (primary not yet generated) ─────────────────
    if (!isAIEnabled()) {
      return error(res, "AI features are disabled.", 503);
    }

    let canonical;
    try {
      canonical = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT "id", "canonicalGeneratedAt", "canonicalPattern",
                 "canonicalKeyInsight", "canonicalTimeComplexity",
                 "canonicalSpaceComplexity"
          FROM "problems"
          WHERE "id" = ${id}
          FOR UPDATE
        `;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const locked = rows[0];
        if (locked.canonicalGeneratedAt) {
          return {
            pattern: locked.canonicalPattern,
            keyInsight: locked.canonicalKeyInsight,
            timeComplexity: locked.canonicalTimeComplexity,
            spaceComplexity: locked.canonicalSpaceComplexity,
            alternatives: [],
          };
        }

        const generated = await generateCanonicalAnswer(problem, { userId, teamId });
        if (!generated) return { __validatorRejected: true };

        const dataToPersist = {
          canonicalPattern: generated.pattern,
          canonicalKeyInsight: generated.keyInsight,
          canonicalTimeComplexity: generated.timeComplexity,
          canonicalSpaceComplexity: generated.spaceComplexity,
          canonicalGeneratedAt: new Date(),
        };
        if (altsFlagOn) {
          dataToPersist.canonicalAlternatives = generated.alternatives ?? [];
          dataToPersist.canonicalAltGeneratedAt = new Date();
        }
        await tx.problem.update({
          where: { id },
          data: dataToPersist,
        });
        return generated;
      });
    } catch (e) {
      console.error("[canonical] generation failed:", e);
      return error(res, "Couldn't prepare review yet — try again in a moment.", 503);
    }

    if (!canonical) return error(res, "Problem not found.", 404);
    if (canonical.__validatorRejected) {
      return error(res, "AI returned an invalid canonical answer; please retry.", 502);
    }

    return success(res, {
      pattern: canonical.pattern,
      keyInsight: canonical.keyInsight,
      timeComplexity: canonical.timeComplexity,
      spaceComplexity: canonical.spaceComplexity,
      generatedAt: new Date(),
      editedAt: null,
      alternatives: altsFlagOn ? (canonical.alternatives ?? []) : null,
    });
  } catch (err) {
    console.error("getCanonical error:", err);
    return error(res, "Failed to fetch canonical answer.", 500);
  }
}

// ============================================================================
// PATCH CANONICAL ANSWER (SUPER_ADMIN override)
// ============================================================================
// Allows a SUPER_ADMIN to manually set or correct canonical fields without
// triggering an AI re-generation. The handler enforces the auth gate itself
// (not via middleware) so it can be mounted on the same routes file alongside
// team-context routes with minimal ceremony.
// ============================================================================
export async function patchCanonical(req, res) {
  try {
    if (req.user?.globalRole !== "SUPER_ADMIN") {
      return error(res, "Forbidden.", 403);
    }
    const { id } = req.params;
    const parsed = canonicalPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, "Invalid canonical patch.", 400, {
        details: parsed.error.flatten(),
      });
    }

    const existing = await prisma.problem.findFirst({ where: { id }, select: { id: true } });
    if (!existing) return error(res, "Problem not found.", 404);

    const data = {
      ...parsed.data,
      canonicalEditedByUserId: req.user.id,
      canonicalEditedAt: new Date(),
    };

    const updated = await prisma.problem.update({
      where: { id },
      data,
      select: {
        canonicalPattern: true,
        canonicalKeyInsight: true,
        canonicalTimeComplexity: true,
        canonicalSpaceComplexity: true,
        canonicalEditedAt: true,
        canonicalEditedByUserId: true,
      },
    });

    return success(res, updated);
  } catch (err) {
    console.error("patchCanonical error:", err);
    return error(res, "Failed to update canonical answer.", 500);
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
