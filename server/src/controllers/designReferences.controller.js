// ============================================================================
// Design References — curated worked-example architectures
// ============================================================================
//
// Learner routes (list, get one) are public within an authenticated team
// context — any user viewing a problem they can see can view its
// references. Mutation routes (create, update, delete) require admin
// role; references are pedagogical content, not user-generated.
//
// The client gates visibility based on sessionPhase — learners shouldn't
// see references until they've attempted the problem (Sweller, worked
// examples post-retrieval). That gate lives on the client; the server
// just doesn't care who reads a reference.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ── GET /design-references?problemId=X&designType=Y ─────────────────
// Returns a summary list (no heavy fields) for the given problem.
export async function listReferences(req, res) {
  try {
    const { problemId, designType } = req.query;
    if (!problemId) {
      return error(res, "problemId query parameter is required.", 400);
    }

    const where = { problemId };
    if (designType) where.designType = designType;

    const refs = await prisma.designReference.findMany({
      where,
      orderBy: [{ difficulty: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        problemId: true,
        designType: true,
        difficulty: true,
        variant: true,
        title: true,
        summary: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    });

    return success(res, { references: refs });
  } catch (err) {
    console.error("List references error:", err);
    return error(res, "Failed to load references.", 500);
  }
}

// ── GET /design-references/:id — full payload ───────────────────────
export async function getReference(req, res) {
  try {
    const ref = await prisma.designReference.findUnique({
      where: { id: req.params.id },
      include: {
        problem: { select: { id: true, title: true, category: true, difficulty: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!ref) return error(res, "Reference not found.", 404);
    return success(res, { reference: ref });
  } catch (err) {
    console.error("Get reference error:", err);
    return error(res, "Failed to load reference.", 500);
  }
}

// ── POST /design-references — admin only ────────────────────────────
export async function createReference(req, res) {
  try {
    const {
      problemId,
      designType,
      difficulty,
      variant,
      title,
      summary,
      phases = {},
      diagramData = null,
      componentAnnotations = null,
      dataFlowDescription = null,
      tradeoffs = [],
      sources = [],
    } = req.body || {};

    if (!problemId || !designType || !difficulty || !variant || !title || !summary) {
      return error(
        res,
        "problemId, designType, difficulty, variant, title, summary are required.",
        400,
      );
    }

    // Verify problem exists so we return 400 instead of a confusing FK error.
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true },
    });
    if (!problem) return error(res, "Linked problem not found.", 400);

    const ref = await prisma.designReference.create({
      data: {
        problemId,
        designType,
        difficulty,
        variant,
        title,
        summary,
        phases,
        diagramData,
        componentAnnotations,
        dataFlowDescription,
        tradeoffs,
        sources,
        authorId: req.user.id,
      },
    });
    return success(res, { reference: ref });
  } catch (err) {
    // Unique-constraint violation on (problemId, variant)
    if (err.code === "P2002") {
      return error(
        res,
        `A reference with variant "${req.body?.variant}" already exists for this problem.`,
        409,
        "DUPLICATE_VARIANT",
      );
    }
    console.error("Create reference error:", err);
    return error(res, "Failed to create reference.", 500);
  }
}

// ── PATCH /design-references/:id — admin only ───────────────────────
// Bumps `version` whenever any content field changes so clients can
// detect "this reference was updated since you last saw it".
export async function updateReference(req, res) {
  try {
    const existing = await prisma.designReference.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) return error(res, "Reference not found.", 404);

    const patch = { ...req.body };
    delete patch.id;
    delete patch.createdAt;
    delete patch.authorId; // authorship is immutable from the edit form
    delete patch.version; // server-managed

    const ref = await prisma.designReference.update({
      where: { id: req.params.id },
      data: {
        ...patch,
        version: { increment: 1 },
      },
    });
    return success(res, { reference: ref });
  } catch (err) {
    if (err.code === "P2002") {
      return error(
        res,
        "A reference with that variant already exists for this problem.",
        409,
        "DUPLICATE_VARIANT",
      );
    }
    console.error("Update reference error:", err);
    return error(res, "Failed to update reference.", 500);
  }
}

// ── DELETE /design-references/:id — admin only ──────────────────────
export async function deleteReference(req, res) {
  try {
    await prisma.designReference.delete({ where: { id: req.params.id } });
    return success(res, { ok: true });
  } catch (err) {
    if (err.code === "P2025") return error(res, "Reference not found.", 404);
    console.error("Delete reference error:", err);
    return error(res, "Failed to delete reference.", 500);
  }
}
