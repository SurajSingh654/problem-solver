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
import {
  runValidator,
  latestVerdictFor,
} from "../services/curriculum/contentReview.service.js";

// ============================================================================
// SUPER_ADMIN override audit log (W3.T5)
// ============================================================================
//
// When a SUPER_ADMIN overrides team context via `?teamId=` / `X-Team-Id`
// to write into a team they aren't part of, we log a CurriculumAdminAuditLog
// row. Regular TEAM_ADMIN writes are NOT logged — they'd flood the log with
// normal operations. `req.superAdminOverride` is set by `requireTeamContext`
// (server/src/middleware/team.middleware.js) and is `true` only when the
// resolved `req.teamId` differs from the SUPER_ADMIN's own currentTeamId.
//
// Log-write failures are non-fatal — the underlying write has already
// succeeded, so a broken audit-log insert must not roll it back or return
// an error to the client. Failure is surfaced via console.warn so ops
// notices in dashboards.
//
// Payload shape: keep it small (ids, slugs, verdicts, changed-field keys).
// NEVER store full request bodies — markdown content can be hundreds of KB
// and CurriculumAdminAuditLog is a hot-write append-only table.
// ============================================================================

/**
 * Write a CurriculumAdminAuditLog row iff this request is a SUPER_ADMIN
 * cross-team override. Called at the END of a successful write path
 * (create/update/publish/review).
 *
 * @param {import('express').Request} req
 * @param {string} action  Canonical action name (e.g. "TOPIC_CREATE").
 * @param {object} payload Small JSON blob for post-hoc auditing.
 */
async function auditIfSuperAdminOverride(req, action, payload) {
  if (!req.superAdminOverride) return;
  try {
    await prisma.curriculumAdminAuditLog.create({
      data: {
        actorUserId: req.user.id,
        actorRole: "SUPER_ADMIN",
        targetTeamId: req.teamId,
        action,
        payload,
      },
    });
  } catch (err) {
    // Non-fatal — the underlying write already succeeded. Surface as a
    // warning so ops sees the failure without failing the user's request.
    console.warn(
      `[curriculumAdmin:audit] Failed to write audit log for action ${action}:`,
      err?.message ?? err,
    );
  }
}

/**
 * GET /curriculum/admin/templates
 * List global TopicTemplates available for forking by TEAM_ADMIN.
 *
 * Only PUBLISHED templates are returned — DRAFT / REVIEWED templates aren't
 * ready for teams to fork. The TemplateBrowserPage on the client is the sole
 * consumer today; kept read-only + list-only (no per-slug detail here) — the
 * fork endpoint already returns the concept/lab counts on success, so a
 * "preview the template" UI can defer to Phase 2 when SUPER_ADMIN gets an
 * inline template-editing surface.
 *
 * The SUPER_ADMIN counterpart lives at `/super-admin/curriculum/templates`
 * (curriculumTemplates.routes.js) and exposes SYNC + all-status listing —
 * this endpoint intentionally does neither.
 */
export async function listTemplates(req, res) {
  try {
    const templates = await prisma.topicTemplate.findMany({
      where: { templateStatus: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        estimatedHoursToMastery: true,
        templateStatus: true,
        updatedAt: true,
        _count: { select: { concepts: true } },
      },
    });
    return success(res, { templates });
  } catch (err) {
    console.error("listTemplates:", err);
    return error(res, "Failed to list templates.", 500);
  }
}

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
    await auditIfSuperAdminOverride(req, "TOPIC_CREATE", {
      topicId: topic.id,
      slug: topic.slug,
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
    await auditIfSuperAdminOverride(req, "TOPIC_UPDATE", {
      topicId: id,
      changedFields: Object.keys(data),
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
    await auditIfSuperAdminOverride(req, "TOPIC_FORK", {
      topicId: topic.id,
      templateSlug: req.params.templateSlug,
      conceptCount: result.conceptCount,
      labCount: result.labCount,
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
 * GET /curriculum/admin/topics/:id
 * Returns a topic + its ordered concepts + each concept's Lab (or null).
 * The authoring UI (W3.T9) uses this single call to seed every tab —
 * metadata, concepts list, curriculum-review cache, publish gate hints.
 *
 * Cross-team access returns 404 (not 403) — same rationale as
 * updateTopic: enumeration probes must not distinguish "exists elsewhere"
 * from "doesn't exist."
 */
export async function getTopicDetail(req, res) {
  try {
    const { id } = req.params;
    const topic = await prisma.topic.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        concepts: {
          orderBy: { order: "asc" },
          include: { lab: true },
        },
      },
    });
    if (!topic) {
      return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
    }
    return success(res, { topic });
  } catch (err) {
    console.error("getTopicDetail:", err);
    return error(res, "Failed to fetch topic.", 500);
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
      await auditIfSuperAdminOverride(req, "CONCEPT_CREATE", {
        conceptId: concept.id,
        topicId,
        slug,
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
    await auditIfSuperAdminOverride(req, "CONCEPT_UPDATE", {
      conceptId: id,
      changedFields: Object.keys(data),
    });
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
      await auditIfSuperAdminOverride(req, "LAB_CREATE", {
        labId: lab.id,
        conceptId,
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
    await auditIfSuperAdminOverride(req, "LAB_UPDATE", {
      labId: id,
      changedFields: Object.keys(data),
    });
    return success(res, { lab });
  } catch (err) {
    console.error("updateLab:", err);
    return error(res, "Failed to update lab.", 500);
  }
}

// ============================================================================
// REVIEW TRIGGERS — Topic + Concept + Lab (W3.T4)
// ============================================================================
//
// Topic + Concept reviews call the curriculum-review / lesson-review AI
// validators (routed through `runValidator`, which handles Zod parse, rule-
// based validate, fallback, and ContentReviewLog write). Lab review is a
// deterministic shape-check — no AI involved and no audit log written
// (deterministic checks don't need one; the DB state is the audit).
//
// Routes at the router layer chain `aiLimiter + aiTeamLimiter` for the two
// AI-backed reviews. The lab review is a pure DB read and rides the parent
// `apiLimiter` only.
// ============================================================================

/**
 * POST /curriculum/admin/topics/:id/review
 * Triggers the curriculum-review AI validator on this Topic + its concepts + labs.
 * Writes ContentReviewLog (via runValidator). Updates the Topic's
 * lastReviewedAt + curriculumReview cache so the authoring UI can render the
 * latest verdict without re-fetching the log row.
 */
export async function reviewTopic(req, res) {
  try {
    const { id } = req.params;

    const topic = await prisma.topic.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        concepts: {
          orderBy: { order: "asc" },
          include: { lab: true },
        },
      },
    });
    if (!topic) {
      return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
    }

    // Assemble validator input per the curriculum-review prompt spec.
    // Primer excerpts are truncated at 2000 chars so prompts stay under
    // the ~8KB rawPrompt-log threshold for topics with many concepts.
    const input = {
      targetId: topic.id,
      topic: {
        name: topic.name,
        category: topic.category,
        estimatedHoursToMastery: topic.estimatedHoursToMastery,
      },
      concepts: topic.concepts.map((c) => ({
        slug: c.slug,
        name: c.name,
        order: c.order,
        primerExcerpt: (c.primerMarkdown ?? "").slice(0, 2000),
        expectedQuestions: c.expectedQuestions ?? [],
      })),
      labs: topic.concepts
        .filter((c) => c.lab)
        .map((c) => ({
          conceptSlug: c.slug,
          taskSummary: (c.lab.taskMarkdown ?? "").slice(0, 500),
          expectedArtifacts: c.lab.expectedArtifacts ?? [],
        })),
    };

    // runValidator never throws (fallback is its explicit failure mode).
    const result = await runValidator("CURRICULUM_REVIEW", input);

    // Cache the verdict onto Topic so the authoring UI can render the
    // latest verdict without re-fetching the log row.
    await prisma.topic.update({
      where: { id: topic.id },
      data: {
        lastReviewedAt: new Date(),
        curriculumReview: result.body,
      },
    });

    await auditIfSuperAdminOverride(req, "TOPIC_REVIEW_RUN", {
      topicId: topic.id,
      verdict: result.verdict,
      logId: result.logId,
    });

    return success(res, {
      verdict: result.verdict,
      body: result.body,
      logId: result.logId,
      usedFallback: result.usedFallback,
    });
  } catch (err) {
    console.error("reviewTopic:", err);
    return error(res, "Failed to run curriculum review.", 500);
  }
}

/**
 * POST /curriculum/admin/concepts/:id/review
 * Triggers the lesson-review AI validator on this Concept + its lab.
 * Writes ContentReviewLog via runValidator.
 */
export async function reviewConcept(req, res) {
  try {
    const { id } = req.params;

    const concept = await prisma.concept.findFirst({
      where: { id, teamId: req.teamId },
      include: { lab: true },
    });
    if (!concept) {
      return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");
    }

    const input = {
      targetId: concept.id,
      concept: {
        name: concept.name,
        primerMarkdown: concept.primerMarkdown ?? "",
        workedExample: concept.workedExample ?? null,
        expectedQuestions: concept.expectedQuestions ?? [],
        canonicalSources: concept.canonicalSources ?? [],
        assessmentCriteria: concept.assessmentCriteria ?? {},
        readinessRubric: concept.readinessRubric ?? null,
      },
      lab: concept.lab
        ? {
            title: concept.lab.title,
            taskMarkdown: concept.lab.taskMarkdown ?? "",
            expectedArtifacts: concept.lab.expectedArtifacts ?? [],
          }
        : null,
    };

    const result = await runValidator("LESSON_REVIEW", input);

    await auditIfSuperAdminOverride(req, "CONCEPT_REVIEW_RUN", {
      conceptId: concept.id,
      verdict: result.verdict,
      logId: result.logId,
    });

    return success(res, {
      verdict: result.verdict,
      body: result.body,
      logId: result.logId,
      usedFallback: result.usedFallback,
    });
  } catch (err) {
    console.error("reviewConcept:", err);
    return error(res, "Failed to run lesson review.", 500);
  }
}

/**
 * POST /curriculum/admin/labs/:id/review
 * Deterministic shape-check on a Lab (no AI). Verifies:
 *   - taskMarkdown ≥ 100 chars (substantive task description).
 *   - referenceSolution is non-empty.
 *   - expectedArtifacts has ≥ 1 entry.
 *
 * Returns a verdict-shaped payload so the authoring UI can render this the
 * same way it renders AI-backed reviews. Does NOT write ContentReviewLog —
 * deterministic checks don't need an audit trail (the Lab row itself is
 * the source of truth for its shape).
 */
export async function reviewLab(req, res) {
  try {
    const { id } = req.params;

    const lab = await prisma.lab.findFirst({
      where: { id, teamId: req.teamId },
    });
    if (!lab) {
      return error(res, "Lab not found", 404, "LAB_NOT_FOUND");
    }

    const issues = [];
    const strengths = [];

    if (!lab.taskMarkdown || lab.taskMarkdown.trim().length < 100) {
      issues.push(
        "taskMarkdown must be at least 100 characters describing the exercise.",
      );
    } else {
      strengths.push("Task description present with sufficient detail.");
    }

    if (!lab.referenceSolution || lab.referenceSolution.trim().length === 0) {
      issues.push("referenceSolution is empty.");
    } else {
      strengths.push("Reference solution present.");
    }

    const artifacts = Array.isArray(lab.expectedArtifacts)
      ? lab.expectedArtifacts
      : [];
    if (artifacts.length === 0) {
      issues.push("expectedArtifacts must contain at least one item.");
    } else {
      strengths.push(`${artifacts.length} expected artifact(s) declared.`);
    }

    const verdict = issues.length === 0 ? "PASS" : "FAIL";

    return success(res, {
      verdict,
      body: { verdict, issues, strengths },
      labShapeCheck: true,
    });
  } catch (err) {
    console.error("reviewLab:", err);
    return error(res, "Failed to run lab shape check.", 500);
  }
}

// ============================================================================
// PUBLISH GATES — Topic + Concept (W3.T4)
// ============================================================================
//
// Publish transitions are gate-enforced:
//   - Topic:   latest curriculum-review verdict = WORTH_LEARNING
//              AND every child Concept.status = PUBLISHED.
//   - Concept: latest lesson-review verdict = READY
//              AND Concept.readinessRubric is non-null.
//
// Failure returns 400 with a `PUBLISH_GATE_BLOCKED` code and a
// `details.gates[]` array — one entry per gate — so the client
// <PublishGateChecklist> can render each row's PASS/FAIL state with the
// specific reason. Shape defined by spec §5.2.
//
// No AI is involved here — publish gates read cached verdicts from
// ContentReviewLog via `latestVerdictFor`. `apiLimiter` at the router level
// is sufficient; no rate-limit chaining needed.
// ============================================================================

/**
 * POST /curriculum/admin/topics/:id/publish
 * Enforces the two Topic publish gates and flips Topic.status → PUBLISHED
 * (sets publishedAt = now()) when both pass. Race between two team-admins
 * publishing the same Topic simultaneously is not explicitly locked; if
 * this becomes a real concern add `SELECT ... FOR UPDATE` in Phase 2.
 */
export async function publishTopic(req, res) {
  try {
    const { id } = req.params;

    const topic = await prisma.topic.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        concepts: { select: { id: true, slug: true, status: true } },
      },
    });
    if (!topic) {
      return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
    }

    const gates = [];

    // Gate 1: latest curriculum-review verdict must be WORTH_LEARNING.
    const reviewLog = await latestVerdictFor("TOPIC", topic.id);
    if (!reviewLog) {
      gates.push({
        id: "curriculum_review_verdict",
        label: "Curriculum review verdict",
        status: "FAIL",
        message: "No curriculum review has been run for this topic yet.",
      });
    } else if (reviewLog.verdict !== "WORTH_LEARNING") {
      gates.push({
        id: "curriculum_review_verdict",
        label: "Curriculum review verdict",
        status: "FAIL",
        message: `Latest verdict is ${reviewLog.verdict}. Required: WORTH_LEARNING.`,
      });
    } else {
      gates.push({
        id: "curriculum_review_verdict",
        label: "Curriculum review verdict",
        status: "PASS",
        message: "WORTH_LEARNING",
      });
    }

    // Gate 2: every child Concept.status must be PUBLISHED.
    const concepts = topic.concepts;
    const unpublished = concepts.filter((c) => c.status !== "PUBLISHED");
    if (concepts.length === 0) {
      gates.push({
        id: "concepts_all_published",
        label: "All concepts PUBLISHED",
        status: "FAIL",
        message: "Topic has no concepts.",
      });
    } else if (unpublished.length > 0) {
      gates.push({
        id: "concepts_all_published",
        label: "All concepts PUBLISHED",
        status: "FAIL",
        message: `${concepts.length - unpublished.length} of ${concepts.length} published; missing: ${unpublished.map((c) => c.slug).join(", ")}`,
      });
    } else {
      gates.push({
        id: "concepts_all_published",
        label: "All concepts PUBLISHED",
        status: "PASS",
        message: `All ${concepts.length} concept(s) published.`,
      });
    }

    const failed = gates.filter((g) => g.status === "FAIL");
    if (failed.length > 0) {
      return error(res, "Publish blocked", 400, "PUBLISH_GATE_BLOCKED", {
        gates,
      });
    }

    const published = await prisma.topic.update({
      where: { id: topic.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    await auditIfSuperAdminOverride(req, "TOPIC_PUBLISH", {
      topicId: topic.id,
    });

    return success(res, { topic: published, gates });
  } catch (err) {
    console.error("publishTopic:", err);
    return error(res, "Failed to publish topic.", 500);
  }
}

/**
 * POST /curriculum/admin/concepts/:id/publish
 * Enforces the two Concept publish gates and flips Concept.status → PUBLISHED
 * (sets publishedAt = now()) when both pass.
 */
export async function publishConcept(req, res) {
  try {
    const { id } = req.params;

    const concept = await prisma.concept.findFirst({
      where: { id, teamId: req.teamId },
      select: { id: true, readinessRubric: true },
    });
    if (!concept) {
      return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");
    }

    const gates = [];

    // Gate 1: latest lesson-review verdict must be READY.
    const reviewLog = await latestVerdictFor("CONCEPT", concept.id);
    if (!reviewLog) {
      gates.push({
        id: "lesson_review_verdict",
        label: "Lesson review verdict",
        status: "FAIL",
        message: "No lesson review has been run for this concept yet.",
      });
    } else if (reviewLog.verdict !== "READY") {
      gates.push({
        id: "lesson_review_verdict",
        label: "Lesson review verdict",
        status: "FAIL",
        message: `Latest verdict is ${reviewLog.verdict}. Required: READY.`,
      });
    } else {
      gates.push({
        id: "lesson_review_verdict",
        label: "Lesson review verdict",
        status: "PASS",
        message: "READY",
      });
    }

    // Gate 2: readinessRubric must be non-null. The rubric feeds Mentor's
    // readiness classifier — publishing without it means the concept ships
    // with no way to score learner readiness.
    if (!concept.readinessRubric) {
      gates.push({
        id: "readiness_rubric_present",
        label: "Readiness rubric present",
        status: "FAIL",
        message: "Concept.readinessRubric is required for publish.",
      });
    } else {
      gates.push({
        id: "readiness_rubric_present",
        label: "Readiness rubric present",
        status: "PASS",
        message: "Rubric defined.",
      });
    }

    const failed = gates.filter((g) => g.status === "FAIL");
    if (failed.length > 0) {
      return error(res, "Publish blocked", 400, "PUBLISH_GATE_BLOCKED", {
        gates,
      });
    }

    const published = await prisma.concept.update({
      where: { id: concept.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    await auditIfSuperAdminOverride(req, "CONCEPT_PUBLISH", {
      conceptId: concept.id,
    });

    return success(res, { concept: published, gates });
  } catch (err) {
    console.error("publishConcept:", err);
    return error(res, "Failed to publish concept.", 500);
  }
}
