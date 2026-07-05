// ============================================================================
// curriculumAdmin.controller.js — Team-scoped curriculum authoring (W3.T2)
// ============================================================================
//
// TEAM_ADMIN-gated CRUD endpoints for the team's Topic curriculum plus the
// TopicTemplate → Topic fork entry point.
//
// Contrast with `topicsAdmin.controller.js`:
//   - `topicsAdmin.controller.js` is SUPER_ADMIN-only and operates on the
//     GLOBAL Topic table (curated content authored by the platform team,
//     not team-scoped).
//   - This controller is TEAM_ADMIN-scoped and operates on the TEAM'S
//     Topic table (`req.teamId`). It's the surface reviewers use to
//     customize forked templates into their team's curriculum.
//
// Tenancy invariants (enforced by every route):
//   - Every read filters by `req.teamId` — no cross-team leakage even
//     when the client passes a valid Topic id from another team.
//   - Cross-team access is surfaced as 404 (not 403), so an attacker
//     cannot enumerate topic ids across teams by probing.
//   - `req.user.currentTeamId` is NEVER used directly — `req.teamId` is
//     the authoritative team context set by `requireTeamContext` (which
//     also honors the SUPER_ADMIN override header).
//
// Rate-limiter selection (`apiLimiter`, not `aiLimiter`): none of these
// endpoints call OpenAI — they're pure CRUD + a Prisma $transaction for
// the fork. See W3.T3 for the AI-backed cheatsheet generation, which
// will use `aiLimiter`.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { sanitizeHtml } from "../services/sanitize.service.js";
import {
  forkTopicTemplate,
  ForkDuplicateError,
  ForkTemplateNotFoundError,
} from "../services/curriculum/curriculumFork.service.js";

/**
 * GET /curriculum/admin/topics
 * List the team's topics with concept counts. Ordering: DRAFT first (most
 * likely to need reviewer attention), then most-recently-updated within
 * each status bucket.
 */
export async function listTopics(req, res) {
  try {
    const topics = await prisma.topic.findMany({
      where: { teamId: req.teamId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      include: { _count: { select: { concepts: true } } },
    });
    return success(res, { topics });
  } catch (err) {
    console.error("listTopics:", err);
    return error(res, "Failed to list topics.", 500);
  }
}

/**
 * POST /curriculum/admin/topics
 * Body: { slug, name, description, category, estimatedHoursToMastery? }
 * Creates a blank Topic in DRAFT status. Duplicate slug within the same
 * team is a 409. Zod-based validation lives in W3.T3 (bundled with the
 * concept/lab CRUD refactor); for W3.T2 we do inline field presence
 * checks — the create surface is intentionally minimal.
 */
export async function createTopic(req, res) {
  const { slug, name, description, category, estimatedHoursToMastery } = req.body ?? {};

  if (!slug || !name || !description || !category) {
    return error(
      res,
      "Missing required fields: slug, name, description, category",
      400,
      "MISSING_FIELDS",
    );
  }

  try {
    const topic = await prisma.topic.create({
      data: {
        slug,
        name,
        description,
        category,
        estimatedHoursToMastery: estimatedHoursToMastery ?? null,
        status: "DRAFT",
        teamId: req.teamId,
      },
    });
    return success(res, { topic }, 201);
  } catch (err) {
    if (err?.code === "P2002") {
      return error(
        res,
        `Topic with slug "${slug}" already exists in this team`,
        409,
        "DUPLICATE_SLUG",
        { teamId: req.teamId, slug },
      );
    }
    console.error("createTopic:", err);
    return error(res, "Failed to create topic.", 500);
  }
}

/**
 * PATCH /curriculum/admin/topics/:id
 * Updates topic metadata. Cannot change teamId or slug via this route
 * (slug is part of the (teamId, slug) uniqueness; changing it would
 * require moving all downstream references and is deliberately not
 * exposed). Status transitions live on the publish route (W3.T4).
 *
 * Cross-team access returns 404 — never 403 — to avoid leaking cross-
 * team topic existence via a probing side-channel.
 */
export async function updateTopic(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      category,
      estimatedHoursToMastery,
      cheatsheetHtml,
    } = req.body ?? {};

    // Ownership + existence check in one query. Using findFirst (not
    // findUnique) because we're filtering on (id, teamId), not just id.
    const existing = await prisma.topic.findFirst({
      where: { id, teamId: req.teamId },
      select: { id: true },
    });
    if (!existing) {
      return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category;
    if (estimatedHoursToMastery !== undefined) {
      data.estimatedHoursToMastery = estimatedHoursToMastery;
    }
    if (cheatsheetHtml !== undefined) {
      // Sanitize raw HTML before persist. The reviewer authoring UI (W3.T9)
      // uses a rich editor that emits HTML directly; DOMPurify strips
      // script/on-event handlers/javascript: URIs before it hits the DB.
      data.cheatsheetHtml =
        cheatsheetHtml === null ? null : sanitizeHtml(cheatsheetHtml);
    }

    const topic = await prisma.topic.update({
      where: { id },
      data,
    });
    return success(res, { topic });
  } catch (err) {
    console.error("updateTopic:", err);
    return error(res, "Failed to update topic.", 500);
  }
}

/**
 * POST /curriculum/admin/topics/from-template/:templateSlug
 * Fork a global TopicTemplate into the current team. Delegates to
 * `forkTopicTemplate` (W3.T1) for the deep-clone transaction; this
 * controller is a thin HTTP adapter over the service.
 *
 * Error mapping:
 *   ForkTemplateNotFoundError → 404 TEMPLATE_NOT_FOUND
 *   ForkDuplicateError        → 409 DUPLICATE_SLUG
 */
export async function forkFromTemplate(req, res) {
  try {
    const { templateSlug } = req.params;
    const result = await forkTopicTemplate({
      templateSlug,
      teamId: req.teamId,
      actorUserId: req.user.id,
    });
    // Refetch with the concept count so the client can render the row
    // immediately without a follow-up list roundtrip.
    const topic = await prisma.topic.findUnique({
      where: { id: result.topicId },
      include: { _count: { select: { concepts: true } } },
    });
    return success(
      res,
      { topic, conceptCount: result.conceptCount, labCount: result.labCount },
      201,
    );
  } catch (err) {
    if (err instanceof ForkTemplateNotFoundError) {
      return error(res, err.message, 404, "TEMPLATE_NOT_FOUND", err.meta);
    }
    if (err instanceof ForkDuplicateError) {
      return error(res, err.message, 409, "DUPLICATE_SLUG", err.meta);
    }
    console.error("forkFromTemplate:", err);
    return error(res, "Failed to fork template.", 500);
  }
}

/**
 * GET /curriculum/admin/topics/:id/template-status
 * Returns whether the source template has been updated since this Topic
 * was forked. Drives the "template updated — pull latest?" chip in the
 * reviewer UI (W3.T8). Non-forked topics and topics whose source template
 * was deleted return `hasUpdate=false` — both are steady states, not
 * errors.
 */
export async function getTemplateStatus(req, res) {
  try {
    const { id } = req.params;
    const topic = await prisma.topic.findFirst({
      where: { id, teamId: req.teamId },
      select: {
        forkedFromTemplateId: true,
        forkedAt: true,
      },
    });
    if (!topic) {
      return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
    }
    if (!topic.forkedFromTemplateId || !topic.forkedAt) {
      return success(res, { hasUpdate: false, templateUpdatedAt: null });
    }

    const template = await prisma.topicTemplate.findUnique({
      where: { id: topic.forkedFromTemplateId },
      select: { updatedAt: true },
    });
    if (!template) {
      // Template was deleted post-fork; the Topic detached (FK is SetNull).
      // Nothing to update against — treat as steady state.
      return success(res, { hasUpdate: false, templateUpdatedAt: null });
    }

    const hasUpdate = template.updatedAt.getTime() > topic.forkedAt.getTime();
    return success(res, {
      hasUpdate,
      templateUpdatedAt: template.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("getTemplateStatus:", err);
    return error(res, "Failed to fetch template status.", 500);
  }
}
