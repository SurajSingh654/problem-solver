// ============================================================================
// Design References — curated worked-example architectures
// ============================================================================
//
// Tenancy invariant (Sprint 3.1 / H1 fix): every CRUD method filters by
// `problem.teamId === req.teamId`. References inherit their tenant from
// the linked Problem — there is no direct teamId column on DesignReference.
// The Prisma nested filter `where: { problem: { teamId } }` compiles to an
// INNER JOIN. findUnique → findFirst on :id paths because findUnique requires
// a unique constraint in the WHERE; nested filters are not unique.
//
// Three defensive layers:
//   1. Route middleware (requireTeamContext) — see designReferences.routes.js
//   2. Controller-level req.teamId guard at the top of each method — catches
//      the case where Prisma would silently drop `teamId: undefined` from
//      the WHERE clause (a future middleware regression)
//   3. Prisma nested filter on every read/write
//
// Cross-team blocks emit [security:designref-cross-team] for ops visibility.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// Defense in depth: callers that reach the controller without req.teamId set
// (e.g. a future middleware regression) would otherwise see Prisma silently
// drop `teamId: undefined` from the WHERE clause and re-introduce the H1
// leak. Reject explicitly. Returns true on guard-block (caller returns), or
// false (request proceeds).
function rejectIfNoTeamContext(req, res) {
  if (!req.teamId) {
    error(res, "Team context required.", 403, "NO_TEAM_CONTEXT");
    return true;
  }
  return false;
}

// ── GET /design-references?problemId=X&designType=Y ─────────────────
export async function listReferences(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const { problemId, designType } = req.query;
    if (!problemId) {
      return error(res, "problemId query parameter is required.", 400);
    }

    const where = {
      problemId,
      problem: { teamId: req.teamId },
    };
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
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const ref = await prisma.designReference.findFirst({
      where: {
        id: req.params.id,
        problem: { teamId: req.teamId },
      },
      include: {
        problem: { select: { id: true, title: true, category: true, difficulty: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!ref) {
      console.warn(
        `[security:designref-cross-team] op=get user=${req.user?.id} teamId=${req.teamId} refId=${req.params.id}`,
      );
      return error(res, "Reference not found.", 404);
    }
    return success(res, { reference: ref });
  } catch (err) {
    console.error("Get reference error:", err);
    return error(res, "Failed to load reference.", 500);
  }
}

// ── POST /design-references — admin only ────────────────────────────
export async function createReference(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
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

    // Verify problem exists IN THE USER'S TEAM. Cross-team or missing → same
    // 400 response (doesn't leak which team owns the problem).
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId: req.teamId },
      select: { id: true },
    });
    if (!problem) {
      console.warn(
        `[security:designref-cross-team] op=create user=${req.user?.id} teamId=${req.teamId} problemId=${problemId}`,
      );
      return error(res, "Linked problem not found.", 400);
    }

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
export async function updateReference(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const existing = await prisma.designReference.findFirst({
      where: {
        id: req.params.id,
        problem: { teamId: req.teamId },
      },
      select: { id: true },
    });
    if (!existing) {
      console.warn(
        `[security:designref-cross-team] op=update user=${req.user?.id} teamId=${req.teamId} refId=${req.params.id}`,
      );
      return error(res, "Reference not found.", 404);
    }

    // SECURITY: allowlist patchable fields. A denylist (delete patch.id; etc.)
    // would not block `problemId` from being patched — an attacker who is a
    // TEAM_ADMIN of team A could PATCH a reference to re-parent it to a
    // problem in team B (same exploit class as H1, via the write path).
    // The precheck above already verified the row is in the user's team;
    // disallowing problemId mutation here ensures it stays there.
    const PATCHABLE_FIELDS = [
      "designType",
      "difficulty",
      "variant",
      "title",
      "summary",
      "phases",
      "diagramData",
      "componentAnnotations",
      "dataFlowDescription",
      "tradeoffs",
      "sources",
    ];
    const patch = Object.fromEntries(
      PATCHABLE_FIELDS
        .filter((k) => Object.prototype.hasOwnProperty.call(req.body || {}, k))
        .map((k) => [k, req.body[k]]),
    );

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
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    // Precheck tenant before delete. delete-then-check would mutate the
    // cross-team row before we can refuse.
    const existing = await prisma.designReference.findFirst({
      where: {
        id: req.params.id,
        problem: { teamId: req.teamId },
      },
      select: { id: true },
    });
    if (!existing) {
      console.warn(
        `[security:designref-cross-team] op=delete user=${req.user?.id} teamId=${req.teamId} refId=${req.params.id}`,
      );
      return error(res, "Reference not found.", 404);
    }

    await prisma.designReference.delete({ where: { id: req.params.id } });
    return success(res, { ok: true });
  } catch (err) {
    if (err.code === "P2025") return error(res, "Reference not found.", 404);
    console.error("Delete reference error:", err);
    return error(res, "Failed to delete reference.", 500);
  }
}
