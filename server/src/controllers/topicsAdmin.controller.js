// ============================================================================
// Topic Mastery Tracks — Admin Controller (v1.1)
// ============================================================================
//
// SuperAdmin-only endpoints for authoring + publishing curated content.
// Sees ALL rows regardless of status (DRAFT / REVIEWED / PUBLISHED). The
// user-facing controller (topics.controller.js) filters to PUBLISHED only —
// this one is the authoring back-end.
//
// Status transitions:
//   DRAFT → REVIEWED → PUBLISHED  (forward path; sets reviewedAt + publishedAt)
//   PUBLISHED → DRAFT             (unpublish — emergency rollback)
//   REVIEWED → DRAFT              (revert if review found issues)
//
// The reviewedAt / publishedAt fields are stamps, not just status mirrors —
// they survive across status flips so we can audit when content first
// crossed each gate.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ── Helpers ──────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(["DRAFT", "REVIEWED", "PUBLISHED"]);

function applyStatusStamps(currentStatus, nextStatus, current) {
  // Returns the timestamp updates based on the transition. Idempotent:
  // re-publishing doesn't change the original publishedAt.
  const out = { status: nextStatus };
  const now = new Date();
  if (nextStatus === "REVIEWED" && !current.reviewedAt) {
    out.reviewedAt = now;
  }
  if (nextStatus === "PUBLISHED") {
    if (!current.reviewedAt) out.reviewedAt = now;
    if (!current.publishedAt) out.publishedAt = now;
  }
  // Going backwards (PUBLISHED → DRAFT) leaves the historical stamps
  // intact — we want to know it WAS published, even if it isn't now.
  return out;
}

function trim(s, max) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return max && t.length > max ? t.slice(0, max) : t;
}

// ── Topics ───────────────────────────────────────────────────────────

export async function listTopicsAdmin(_req, res) {
  try {
    const topics = await prisma.topic.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { concepts: true, enrollments: true } },
      },
    });

    // For each topic, fetch the per-status concept counts. One query per
    // topic — fine at the topic count we expect (single digits).
    const enriched = await Promise.all(
      topics.map(async (t) => {
        const grouped = await prisma.concept.groupBy({
          by: ["status"],
          where: { topicId: t.id },
          _count: true,
        });
        const byStatus = { DRAFT: 0, REVIEWED: 0, PUBLISHED: 0 };
        for (const row of grouped) byStatus[row.status] = row._count;
        return {
          ...t,
          conceptCount: t._count.concepts,
          enrollmentCount: t._count.enrollments,
          conceptStatusBreakdown: byStatus,
        };
      }),
    );

    return success(res, { topics: enriched });
  } catch (err) {
    console.error("listTopicsAdmin:", err);
    return error(res, "Failed to list topics.", 500);
  }
}

export async function getTopicAdmin(req, res) {
  try {
    const { slug } = req.params;
    // Topic.slug is no longer globally unique — the curriculum Phase-1
    // backfill made it @@unique([teamId, slug]). This SUPER_ADMIN-only
    // Learning Content surface predates that change. Use findFirst to
    // grab any Topic with the requested slug (Learning Content ignores
    // team, showing curated tracks by slug).
    const topic = await prisma.topic.findFirst({
      where: { slug },
      include: {
        concepts: {
          orderBy: { order: "asc" },
          include: {
            prerequisites: { select: { id: true, prereqId: true } },
          },
        },
      },
    });
    if (!topic) return error(res, "Topic not found.", 404);
    return success(res, { topic });
  } catch (err) {
    console.error("getTopicAdmin:", err);
    return error(res, "Failed to fetch topic.", 500);
  }
}

export async function updateTopicAdmin(req, res) {
  try {
    const { slug } = req.params;
    const body = req.body ?? {};

    // See getTopicAdmin for why findFirst not findUnique.
    const topic = await prisma.topic.findFirst({ where: { slug } });
    if (!topic) return error(res, "Topic not found.", 404);

    const data = {};
    if (body.name !== undefined) {
      const name = trim(body.name, 200);
      if (!name) return error(res, "name cannot be empty.", 400);
      data.name = name;
    }
    if (body.description !== undefined) {
      const desc = trim(body.description, 2000);
      if (!desc) return error(res, "description cannot be empty.", 400);
      data.description = desc;
    }
    if (body.mockInterviewCategory !== undefined) {
      data.mockInterviewCategory = body.mockInterviewCategory || null;
    }
    if (body.estimatedHoursToMastery !== undefined) {
      const n = Number(body.estimatedHoursToMastery);
      if (body.estimatedHoursToMastery === null) {
        data.estimatedHoursToMastery = null;
      } else if (!Number.isInteger(n) || n < 1 || n > 1000) {
        return error(res, "estimatedHoursToMastery must be 1-1000 or null.", 400);
      } else {
        data.estimatedHoursToMastery = n;
      }
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        return error(res, `status must be one of: ${[...VALID_STATUSES].join(", ")}`, 400);
      }
      Object.assign(data, applyStatusStamps(topic.status, body.status, topic));
    }

    const updated = await prisma.topic.update({
      where: { id: topic.id },
      data,
    });
    return success(res, { topic: updated });
  } catch (err) {
    console.error("updateTopicAdmin:", err);
    return error(res, "Failed to update topic.", 500);
  }
}

// ── Concepts ─────────────────────────────────────────────────────────

export async function createConceptAdmin(req, res) {
  try {
    const { slug: topicSlug } = req.params;
    const body = req.body ?? {};

    // See getTopicAdmin for why findFirst not findUnique.
    const topic = await prisma.topic.findFirst({
      where: { slug: topicSlug },
      select: { id: true },
    });
    if (!topic) return error(res, "Topic not found.", 404);

    const name = trim(body.name, 200);
    const conceptSlug = trim(body.slug, 100);
    if (!name) return error(res, "name is required.", 400);
    if (!conceptSlug) return error(res, "slug is required.", 400);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(conceptSlug)) {
      return error(res, "slug must be kebab-case (a-z, 0-9, -).", 400);
    }

    // Default order = max(order) + 1 within this topic.
    const last = await prisma.concept.findFirst({
      where: { topicId: topic.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = body.order != null ? Number(body.order) : (last?.order ?? 0) + 1;

    const created = await prisma.concept.create({
      data: {
        topicId: topic.id,
        slug: conceptSlug,
        name,
        order,
        status: "DRAFT",
        primerMarkdown: trim(body.primerMarkdown, 50_000) || "[Empty draft]",
        workedExample: trim(body.workedExample, 50_000) || null,
        canonicalSources: Array.isArray(body.canonicalSources) ? body.canonicalSources : [],
        expectedQuestions: Array.isArray(body.expectedQuestions) ? body.expectedQuestions : [],
        assessmentCriteria: body.assessmentCriteria && typeof body.assessmentCriteria === "object"
          ? body.assessmentCriteria
          : { quizThreshold: 0.8, practiceMin: 1, teachingExpected: false },
      },
    });
    return success(res, { concept: created }, 201);
  } catch (err) {
    if (err?.code === "P2002") {
      return error(res, "A concept with that slug already exists in this topic.", 409);
    }
    console.error("createConceptAdmin:", err);
    return error(res, "Failed to create concept.", 500);
  }
}

export async function updateConceptAdmin(req, res) {
  try {
    const { id } = req.params;
    const body = req.body ?? {};

    const concept = await prisma.concept.findUnique({ where: { id } });
    if (!concept) return error(res, "Concept not found.", 404);

    const data = {};
    if (body.name !== undefined) {
      const name = trim(body.name, 200);
      if (!name) return error(res, "name cannot be empty.", 400);
      data.name = name;
    }
    if (body.order !== undefined) {
      const n = Number(body.order);
      if (!Number.isInteger(n) || n < 0) return error(res, "order must be a non-negative integer.", 400);
      data.order = n;
    }
    if (body.primerMarkdown !== undefined) {
      const t = trim(body.primerMarkdown, 50_000);
      if (!t) return error(res, "primerMarkdown cannot be empty.", 400);
      data.primerMarkdown = t;
    }
    if (body.workedExample !== undefined) {
      data.workedExample = body.workedExample === null ? null : trim(body.workedExample, 50_000);
    }
    if (body.canonicalSources !== undefined) {
      if (!Array.isArray(body.canonicalSources)) {
        return error(res, "canonicalSources must be an array.", 400);
      }
      data.canonicalSources = body.canonicalSources;
    }
    if (body.expectedQuestions !== undefined) {
      if (!Array.isArray(body.expectedQuestions)) {
        return error(res, "expectedQuestions must be an array.", 400);
      }
      data.expectedQuestions = body.expectedQuestions;
    }
    if (body.assessmentCriteria !== undefined) {
      if (body.assessmentCriteria === null || typeof body.assessmentCriteria !== "object") {
        return error(res, "assessmentCriteria must be an object.", 400);
      }
      data.assessmentCriteria = body.assessmentCriteria;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        return error(res, `status must be one of: ${[...VALID_STATUSES].join(", ")}`, 400);
      }
      Object.assign(data, applyStatusStamps(concept.status, body.status, concept));
    }

    const updated = await prisma.concept.update({
      where: { id },
      data,
      include: { prerequisites: { select: { id: true, prereqId: true } } },
    });
    return success(res, { concept: updated });
  } catch (err) {
    console.error("updateConceptAdmin:", err);
    return error(res, "Failed to update concept.", 500);
  }
}

export async function deleteConceptAdmin(req, res) {
  try {
    const { id } = req.params;
    const concept = await prisma.concept.findUnique({
      where: { id },
      select: { id: true, status: true, _count: { select: { masteries: true } } },
    });
    if (!concept) return error(res, "Concept not found.", 404);

    // Refuse to delete a PUBLISHED concept that users have engaged with.
    // Unpublish first, then delete — forces an explicit two-step decision.
    if (concept.status === "PUBLISHED" && concept._count.masteries > 0) {
      return error(
        res,
        "Cannot delete a PUBLISHED concept with mastery records. Set status to DRAFT first.",
        409,
      );
    }

    await prisma.concept.delete({ where: { id } });
    return success(res, { deleted: true });
  } catch (err) {
    console.error("deleteConceptAdmin:", err);
    return error(res, "Failed to delete concept.", 500);
  }
}

// ── Concept dependencies ─────────────────────────────────────────────

export async function addPrereqAdmin(req, res) {
  try {
    const { id } = req.params;             // the concept that GAINS the prereq
    const { prereqId } = req.body ?? {};   // the concept it depends on

    if (!prereqId) return error(res, "prereqId is required.", 400);
    if (prereqId === id) {
      return error(res, "A concept cannot be its own prerequisite.", 400);
    }

    const [concept, prereq] = await Promise.all([
      prisma.concept.findUnique({ where: { id }, select: { id: true, topicId: true } }),
      prisma.concept.findUnique({ where: { id: prereqId }, select: { id: true, topicId: true } }),
    ]);
    if (!concept || !prereq) return error(res, "Concept(s) not found.", 404);
    if (concept.topicId !== prereq.topicId) {
      return error(res, "Prereq must belong to the same topic.", 400);
    }

    // Cycle check: walk prereq's transitive ancestors; if `id` appears,
    // adding this edge creates a cycle.
    const visited = new Set();
    async function hasPath(fromId) {
      if (visited.has(fromId)) return false;
      visited.add(fromId);
      if (fromId === id) return true;
      const edges = await prisma.conceptDependency.findMany({
        where: { conceptId: fromId },
        select: { prereqId: true },
      });
      for (const e of edges) {
        if (await hasPath(e.prereqId)) return true;
      }
      return false;
    }
    if (await hasPath(prereqId)) {
      return error(res, "Adding this prereq would create a cycle.", 400);
    }

    const dep = await prisma.conceptDependency.create({
      data: { conceptId: id, prereqId },
    });
    return success(res, { dependency: dep }, 201);
  } catch (err) {
    if (err?.code === "P2002") {
      return error(res, "Prereq edge already exists.", 409);
    }
    console.error("addPrereqAdmin:", err);
    return error(res, "Failed to add prereq.", 500);
  }
}

export async function removePrereqAdmin(req, res) {
  try {
    const { depId } = req.params;
    const dep = await prisma.conceptDependency.findUnique({ where: { id: depId } });
    if (!dep) return error(res, "Dependency not found.", 404);
    await prisma.conceptDependency.delete({ where: { id: depId } });
    return success(res, { deleted: true });
  } catch (err) {
    console.error("removePrereqAdmin:", err);
    return error(res, "Failed to remove prereq.", 500);
  }
}
