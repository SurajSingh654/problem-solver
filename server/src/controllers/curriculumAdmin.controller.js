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
import { sanitizeHtml, sanitizeMarkdownToHtml } from "../services/sanitize.service.js";
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

// ============================================================================
// CONCEPT — create + update (W3.T3)
// ============================================================================
//
// A Concept always lives under a Topic. The Topic is the ownership root that
// carries `teamId`; Concept.teamId is a denormalized copy the schema keeps in
// sync (see schema.prisma:2552-2555). This controller enforces the invariant
// on WRITE — every create resolves the parent Topic's teamId (scoped to
// req.teamId, so cross-team probes fall out as 404) and copies it onto the
// row rather than trusting a client-supplied teamId. There is no route that
// exposes teamId as patchable.
//
// Cross-team access returns 404 (not 403) to avoid leaking existence via a
// probing side-channel — same rationale as updateTopic.
// ============================================================================

/**
 * POST /curriculum/admin/concepts
 * Body: {
 *   topicId, slug, name, order, primerMarkdown,
 *   workedExample?, canonicalSources?, expectedQuestions?,
 *   assessmentCriteria?, readinessRubric?, cheatsheetMarkdown?
 * }
 *
 * Status is forced to DRAFT — publish transitions live on W3.T4's review
 * route. primerHtml is compiled from primerMarkdown via the sanitizing
 * markdown pipeline so we never persist unsanitized HTML.
 *
 * 404 TOPIC_NOT_FOUND if the parent Topic is in another team.
 * 409 DUPLICATE_SLUG on `(topicId, slug)` collision (schema.prisma:2606).
 */
export async function createConcept(req, res) {
  try {
    const {
      topicId,
      slug,
      name,
      order,
      primerMarkdown,
      workedExample,
      canonicalSources,
      expectedQuestions,
      assessmentCriteria,
      readinessRubric,
      cheatsheetMarkdown,
    } = req.body ?? {};

    if (
      !topicId ||
      !slug ||
      !name ||
      order === undefined ||
      primerMarkdown === undefined
    ) {
      return error(
        res,
        "Missing required fields: topicId, slug, name, order, primerMarkdown",
        400,
        "MISSING_FIELDS",
      );
    }

    // Ownership check — the parent Topic must exist AND belong to this
    // team. Filtering on (id, teamId) collapses "not found" and "cross-
    // team" into the same 404 response, so an attacker cannot enumerate
    // topic ids across teams by probing.
    const parentTopic = await prisma.topic.findFirst({
      where: { id: topicId, teamId: req.teamId },
      select: { id: true, teamId: true },
    });
    if (!parentTopic) {
      return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
    }

    const primerHtml = primerMarkdown
      ? sanitizeMarkdownToHtml(primerMarkdown)
      : null;

    try {
      const concept = await prisma.concept.create({
        data: {
          topicId,
          teamId: parentTopic.teamId, // Invariant: Concept.teamId === Topic.teamId
          slug,
          name,
          order,
          status: "DRAFT",
          primerMarkdown,
          primerHtml,
          workedExample: workedExample ?? null,
          canonicalSources: canonicalSources ?? [],
          expectedQuestions: expectedQuestions ?? [],
          assessmentCriteria: assessmentCriteria ?? {},
          readinessRubric: readinessRubric ?? null,
          cheatsheetMarkdown: cheatsheetMarkdown ?? null,
        },
      });
      return success(res, { concept }, 201);
    } catch (err) {
      if (err?.code === "P2002") {
        return error(
          res,
          `Concept with slug "${slug}" already exists in this topic`,
          409,
          "DUPLICATE_SLUG",
          { topicId, slug },
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("createConcept:", err);
    return error(res, "Failed to create concept.", 500);
  }
}

/**
 * PATCH /curriculum/admin/concepts/:id
 * Updatable fields: name, order, primerMarkdown, workedExample, canonicalSources,
 *                   expectedQuestions, assessmentCriteria, readinessRubric,
 *                   cheatsheetMarkdown, richHtmlEnabled.
 *
 * If primerMarkdown changes, primerHtml is recompiled through the sanitizing
 * pipeline. status, teamId, topicId, slug are NOT patchable via this route
 * — status transitions live on W3.T4's review route; teamId is immutable
 * (it's the tenancy root); topicId and slug together form the uniqueness
 * key, and changing either would break the URL contract for downstream
 * references (masteries, dependencies, teaching sessions).
 */
export async function updateConcept(req, res) {
  try {
    const { id } = req.params;

    // Ownership + existence in one query. Cross-team returns 404, not 403.
    const existing = await prisma.concept.findFirst({
      where: { id, teamId: req.teamId },
      select: { id: true },
    });
    if (!existing) {
      return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");
    }

    const {
      name,
      order,
      primerMarkdown,
      workedExample,
      canonicalSources,
      expectedQuestions,
      assessmentCriteria,
      readinessRubric,
      cheatsheetMarkdown,
      richHtmlEnabled,
    } = req.body ?? {};

    const data = {};
    if (name !== undefined) data.name = name;
    if (order !== undefined) data.order = order;
    if (primerMarkdown !== undefined) {
      data.primerMarkdown = primerMarkdown;
      // Recompile HTML on every markdown change — the two fields must
      // never drift. Empty markdown → empty HTML (not null, so the client
      // renders an empty state deterministically).
      data.primerHtml = primerMarkdown
        ? sanitizeMarkdownToHtml(primerMarkdown)
        : null;
    }
    if (workedExample !== undefined) data.workedExample = workedExample;
    if (canonicalSources !== undefined) data.canonicalSources = canonicalSources;
    if (expectedQuestions !== undefined) data.expectedQuestions = expectedQuestions;
    if (assessmentCriteria !== undefined) data.assessmentCriteria = assessmentCriteria;
    if (readinessRubric !== undefined) data.readinessRubric = readinessRubric;
    if (cheatsheetMarkdown !== undefined) data.cheatsheetMarkdown = cheatsheetMarkdown;
    if (richHtmlEnabled !== undefined) data.richHtmlEnabled = richHtmlEnabled;

    const concept = await prisma.concept.update({ where: { id }, data });
    return success(res, { concept });
  } catch (err) {
    console.error("updateConcept:", err);
    return error(res, "Failed to update concept.", 500);
  }
}

// ============================================================================
// LAB — create + update (W3.T3)
// ============================================================================
//
// A Lab is 1:1 with a Concept (schema.prisma:2711 — `conceptId String @unique`).
// The Lab.teamId column is denormalized from Concept.teamId at write time.
// The 1:1 constraint bubbles up as P2002 on `conceptId` and surfaces to the
// client as 409 DUPLICATE_LAB — reviewers who fork a template that already
// has a Lab and then try to attach another get a clear signal instead of a
// vague database error. HTTP-level sanitization for Lab is not required
// (taskMarkdown/starterCode/referenceSolution are rendered code-fenced on
// the client; there is no primerHtml equivalent to compile).
// ============================================================================

/**
 * POST /curriculum/admin/labs
 * Body: {
 *   conceptId, title, taskMarkdown, timeboxMinutes?,
 *   language, starterCode?, referenceSolution, expectedArtifacts?
 * }
 *
 * 404 CONCEPT_NOT_FOUND if the parent Concept is in another team.
 * 409 DUPLICATE_LAB if the concept already has a lab (P2002 on conceptId).
 */
export async function createLab(req, res) {
  try {
    const {
      conceptId,
      title,
      taskMarkdown,
      timeboxMinutes,
      language,
      starterCode,
      referenceSolution,
      expectedArtifacts,
    } = req.body ?? {};

    if (
      !conceptId ||
      !title ||
      !taskMarkdown ||
      !language ||
      !referenceSolution
    ) {
      return error(
        res,
        "Missing required fields: conceptId, title, taskMarkdown, language, referenceSolution",
        400,
        "MISSING_FIELDS",
      );
    }

    // Ownership check — parent Concept must exist AND belong to this team.
    const parentConcept = await prisma.concept.findFirst({
      where: { id: conceptId, teamId: req.teamId },
      select: { id: true, teamId: true },
    });
    if (!parentConcept) {
      return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");
    }

    try {
      const lab = await prisma.lab.create({
        data: {
          conceptId,
          teamId: parentConcept.teamId, // Invariant: Lab.teamId === Concept.teamId
          title,
          taskMarkdown,
          timeboxMinutes: timeboxMinutes ?? null,
          language,
          starterCode: starterCode ?? null,
          referenceSolution,
          expectedArtifacts: expectedArtifacts ?? [],
          status: "DRAFT",
          sortOrder: 0,
        },
      });
      return success(res, { lab }, 201);
    } catch (err) {
      if (err?.code === "P2002") {
        return error(
          res,
          "Concept already has a lab (Lab is 1:1 with Concept)",
          409,
          "DUPLICATE_LAB",
          { conceptId },
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("createLab:", err);
    return error(res, "Failed to create lab.", 500);
  }
}

/**
 * PATCH /curriculum/admin/labs/:id
 * Updatable fields: title, taskMarkdown, timeboxMinutes, language,
 *                   starterCode, referenceSolution, expectedArtifacts, sortOrder.
 *
 * status, teamId, conceptId are NOT patchable — status transitions live on
 * the review route (W3.T4); teamId/conceptId are immutable structural keys
 * (changing them would break the 1:1 with Concept and the tenancy invariant).
 */
export async function updateLab(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.lab.findFirst({
      where: { id, teamId: req.teamId },
      select: { id: true },
    });
    if (!existing) {
      return error(res, "Lab not found", 404, "LAB_NOT_FOUND");
    }

    const {
      title,
      taskMarkdown,
      timeboxMinutes,
      language,
      starterCode,
      referenceSolution,
      expectedArtifacts,
      sortOrder,
    } = req.body ?? {};

    const data = {};
    if (title !== undefined) data.title = title;
    if (taskMarkdown !== undefined) data.taskMarkdown = taskMarkdown;
    if (timeboxMinutes !== undefined) data.timeboxMinutes = timeboxMinutes;
    if (language !== undefined) data.language = language;
    if (starterCode !== undefined) data.starterCode = starterCode;
    if (referenceSolution !== undefined) data.referenceSolution = referenceSolution;
    if (expectedArtifacts !== undefined) data.expectedArtifacts = expectedArtifacts;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const lab = await prisma.lab.update({ where: { id }, data });
    return success(res, { lab });
  } catch (err) {
    console.error("updateLab:", err);
    return error(res, "Failed to update lab.", 500);
  }
}
