// ============================================================================
// curriculumFork.service.js — Deep-clone TopicTemplate → Topic (team-scoped)
// ============================================================================
//
// Fork a global TopicTemplate (with its ConceptTemplate children and
// LabTemplate grandchildren) into a team-scoped Topic / Concept / Lab tree.
// The entire clone happens inside a single `prisma.$transaction` so the
// resulting rows are either all committed or none — partial trees would
// leave a Topic with missing Concepts and no way for the reviewer to recover.
//
// Invariants:
//   Concept.teamId === Topic.teamId
//   Lab.teamId === Concept.teamId === Topic.teamId
//   All new team-scoped rows start at status = DRAFT regardless of the
//   template's templateStatus. Publishing is a separate reviewer-driven step
//   (W3.T4); a fresh fork must never inherit PUBLISHED implicitly.
//
// Duplicate detection: the (teamId, slug) uniqueness lives on the Topic
// table via `@@unique([teamId, slug])`. We *pre-check* with a findUnique for
// a fast/friendly error message, then rely on the DB constraint inside the
// transaction as the authoritative guard against a TOCTOU race (two forks
// firing concurrently). A P2002 on the Topic insert is caught and re-thrown
// as ForkDuplicateError so the controller can map it to HTTP 409 uniformly.
//
// Callers: curriculumAdmin.controller.js (W3.T2) → POST /api/curriculum/topics/fork
// ============================================================================

import prisma from "../../lib/prisma.js";

/**
 * Thrown when the target team already has a Topic with the template's slug.
 * The controller maps this to HTTP 409 Conflict. `meta` carries structured
 * detail (teamId, slug, existingTopicId) for the client to surface.
 */
export class ForkDuplicateError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "ForkDuplicateError";
    this.code = "FORK_DUPLICATE";
    this.meta = meta;
  }
}

/**
 * Thrown when the requested templateSlug does not match any TopicTemplate.
 * The controller maps this to HTTP 404 Not Found.
 */
export class ForkTemplateNotFoundError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "ForkTemplateNotFoundError";
    this.code = "FORK_TEMPLATE_NOT_FOUND";
    this.meta = meta;
  }
}

/**
 * Deep-clone a TopicTemplate into a team-scoped Topic + Concept + Lab tree.
 *
 * @param {object} params
 * @param {string} params.templateSlug - unique slug of the TopicTemplate to fork.
 * @param {string} params.teamId       - target team id (Topic.teamId).
 * @param {string} [params.actorUserId] - user triggering the fork (audit/logging only).
 * @returns {Promise<{ topicId: string, conceptCount: number, labCount: number }>}
 * @throws {ForkTemplateNotFoundError} when templateSlug does not exist.
 * @throws {ForkDuplicateError}        when (teamId, slug) already exists.
 */
// eslint-disable-next-line no-unused-vars
export async function forkTopicTemplate({ templateSlug, teamId, actorUserId } = {}) {
  // ── 1. Load the template tree eagerly ─────────────────────────────────
  // We fetch concepts ordered by `order` so the fork preserves ordering
  // even in the (unlikely) case where the DB returned them out of order.
  const template = await prisma.topicTemplate.findUnique({
    where: { slug: templateSlug },
    include: {
      concepts: {
        orderBy: { order: "asc" },
        include: { lab: true },
      },
    },
  });

  if (!template) {
    throw new ForkTemplateNotFoundError(
      `Topic template with slug "${templateSlug}" not found`,
      { templateSlug },
    );
  }

  // ── 2. Pre-check duplicate ────────────────────────────────────────────
  // Fast, friendly error message when the same team tries to fork twice.
  // NOTE: this is a hint, not a guarantee — the transaction below relies
  // on the DB unique constraint to prevent a TOCTOU race.
  const existing = await prisma.topic.findUnique({
    where: { teamId_slug: { teamId, slug: template.slug } },
    select: { id: true },
  });
  if (existing) {
    throw new ForkDuplicateError(
      `Topic with slug "${template.slug}" already exists in team ${teamId}`,
      { teamId, slug: template.slug, existingTopicId: existing.id },
    );
  }

  // ── 3. Deep-clone inside a single transaction ─────────────────────────
  // Atomicity is the reason for the transaction: a partial tree (Topic
  // created, some Concepts missing) would break the reviewer UI in ways
  // that require manual DB surgery to fix.
  const forkedAt = new Date();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const topic = await tx.topic.create({
        data: {
          slug: template.slug,
          name: template.name,
          description: template.description,
          category: template.category,
          status: "DRAFT",
          teamId,
          cheatsheetHtml: template.cheatsheetHtml ?? null,
          mockInterviewCategory: null,
          estimatedHoursToMastery: template.estimatedHoursToMastery ?? null,
          forkedFromTemplateId: template.id,
          forkedAt,
        },
      });

      let conceptCount = 0;
      let labCount = 0;

      for (const conceptTemplate of template.concepts) {
        const concept = await tx.concept.create({
          data: {
            topicId: topic.id,
            teamId,
            slug: conceptTemplate.slug,
            name: conceptTemplate.name,
            order: conceptTemplate.order,
            status: "DRAFT",
            primerMarkdown: conceptTemplate.primerMarkdown,
            primerHtml: conceptTemplate.primerHtml ?? null,
            workedExample: conceptTemplate.workedExample ?? null,
            canonicalSources: conceptTemplate.canonicalSources,
            expectedQuestions: conceptTemplate.expectedQuestions,
            assessmentCriteria: conceptTemplate.assessmentCriteria,
            readinessRubric: conceptTemplate.readinessRubric ?? null,
            cheatsheetMarkdown: conceptTemplate.cheatsheetMarkdown ?? null,
            richHtmlEnabled: true,
          },
        });
        conceptCount += 1;

        if (conceptTemplate.lab) {
          await tx.lab.create({
            data: {
              conceptId: concept.id,
              teamId,
              title: conceptTemplate.lab.title,
              taskMarkdown: conceptTemplate.lab.taskMarkdown,
              timeboxMinutes: conceptTemplate.lab.timeboxMinutes ?? null,
              language: conceptTemplate.lab.language,
              starterCode: conceptTemplate.lab.starterCode ?? null,
              referenceSolution: conceptTemplate.lab.referenceSolution,
              expectedArtifacts: conceptTemplate.lab.expectedArtifacts,
              status: "DRAFT",
              sortOrder: 0,
            },
          });
          labCount += 1;
        }
      }

      return { topicId: topic.id, conceptCount, labCount };
    });

    return created;
  } catch (err) {
    // P2002 on the Topic insert = concurrent fork won the (teamId, slug)
    // race. Surface the same domain error as the pre-check for a uniform
    // 409 response.
    if (err?.code === "P2002") {
      throw new ForkDuplicateError(
        `Topic with slug "${template.slug}" already exists in team ${teamId}`,
        { teamId, slug: template.slug },
      );
    }
    throw err;
  }
}
