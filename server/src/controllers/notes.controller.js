// ============================================================================
// ProbSolver — Notes Controller (P0: CRUD only)
// ============================================================================
//
// Personal notes — user-scoped, no teamId, no requireTeamContext.
// Every query MUST filter by `req.user.id`. There is no admin override
// for personal notes.
//
// P0 ships: create, list, getOne, patch, archive, restore, pin/unpin.
// Entity linking (P1), tags filter (P2), embedding-based related (P3),
// AI surfaces (P4), and AI flashcard generation (P6) ship behind the
// same FEATURE_NOTES_ENABLED flag in their own commits.
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ── Validation helpers ───────────────────────────────────────
const TITLE_MAX = 200;
const CONTENT_MAX = 50_000; // ~10K words
const VALID_ENTITY_TYPES = new Set([
  "PROBLEM",
  "INTERVIEW_SESSION",
  "DESIGN_SESSION",
  "TEACHING_SESSION",
]);

function trimTitle(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, TITLE_MAX);
}

function clampContent(raw) {
  if (typeof raw !== "string") return "";
  return raw.length > CONTENT_MAX ? raw.slice(0, CONTENT_MAX) : raw;
}

// Get the team IDs the user is a member of — used to gate team-scoped
// entity linking (Problem, TeachingSession). We don't rely on
// requireTeamContext, so the JWT-stamped `currentTeamId` isn't enough
// when the user wants to link a note to an entity in a different team
// they belong to.
async function userTeamIds(userId) {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

// Validate ownership and resolve a snapshot title for a linked entity.
// Returns { title } if valid, or throws-shaped { error: "..." } if not.
async function resolveEntitySnapshot({ type, id, userId }) {
  if (!VALID_ENTITY_TYPES.has(type)) return { error: "Invalid entity type" };
  if (typeof id !== "string" || !id) return { error: "Invalid entity id" };

  switch (type) {
    case "PROBLEM": {
      const teamIds = await userTeamIds(userId);
      const p = await prisma.problem.findFirst({
        where: { id, teamId: { in: teamIds } },
        select: { title: true },
      });
      if (!p) return { error: "Problem not found or not accessible" };
      return { title: p.title };
    }
    case "INTERVIEW_SESSION": {
      const s = await prisma.interviewSession.findFirst({
        where: { id, userId },
        include: { problem: { select: { title: true } } },
      });
      if (!s) return { error: "Interview session not found" };
      return {
        title:
          s.problem?.title ||
          `Mock Interview · ${new Date(s.createdAt).toLocaleDateString()}`,
      };
    }
    case "DESIGN_SESSION": {
      const s = await prisma.designSession.findFirst({
        where: { id, userId },
        select: { title: true },
      });
      if (!s) return { error: "Design session not found" };
      return { title: s.title };
    }
    case "TEACHING_SESSION": {
      const teamIds = await userTeamIds(userId);
      const s = await prisma.teachingSession.findFirst({
        where: { id, teamId: { in: teamIds } },
        select: { title: true },
      });
      if (!s) return { error: "Teaching session not found or not accessible" };
      return { title: s.title };
    }
    default:
      return { error: "Invalid entity type" };
  }
}

// Public DTO — strips embedding (binary) and never leaks other-user data.
function dtoNote(note) {
  if (!note) return null;
  return {
    id: note.id,
    title: note.title,
    contentMarkdown: note.contentMarkdown,
    tags: note.tags || [],
    linkedEntityType: note.linkedEntityType,
    linkedEntityId: note.linkedEntityId,
    linkedEntityTitle: note.linkedEntityTitle,
    summary: note.summary,
    summaryGeneratedAt: note.summaryGeneratedAt,
    suggestedTags: note.suggestedTags || [],
    pinned: note.pinned,
    archivedAt: note.archivedAt,
    flashcardCount: note._count?.flashcards ?? undefined,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

// ============================================================================
// CREATE
// ============================================================================
export async function createNote(req, res) {
  try {
    const userId = req.user.id;
    const title = trimTitle(req.body?.title);
    const contentMarkdown = clampContent(req.body?.contentMarkdown);

    if (!title) return error(res, "Title is required", 400);

    // Optional entity link — validate ownership + snapshot title.
    let linkedEntityType = null;
    let linkedEntityId = null;
    let linkedEntityTitle = null;
    if (req.body?.linkedEntityType && req.body?.linkedEntityId) {
      const snap = await resolveEntitySnapshot({
        type: req.body.linkedEntityType,
        id: req.body.linkedEntityId,
        userId,
      });
      if (snap.error) return error(res, snap.error, 400);
      linkedEntityType = req.body.linkedEntityType;
      linkedEntityId = req.body.linkedEntityId;
      linkedEntityTitle = snap.title;
    }

    const note = await prisma.note.create({
      data: {
        userId,
        title,
        contentMarkdown,
        tags: [],
        suggestedTags: [],
        linkedEntityType,
        linkedEntityId,
        linkedEntityTitle,
      },
    });

    return success(res, { note: dtoNote(note) }, 201);
  } catch (err) {
    console.error("createNote:", err);
    return error(res, "Failed to create note", 500);
  }
}

// ============================================================================
// LIST
// ============================================================================
//
// Query params:
//   archived  "true" | "false" (default false)
//   pinned    "true" — limit to pinned only
//   q         substring search on title (case-insensitive)
//   limit     1-100, default 50
//   cursor    last-seen note id for keyset pagination
// ============================================================================
export async function listNotes(req, res) {
  try {
    const userId = req.user.id;
    const archived = req.query.archived === "true";
    const onlyPinned = req.query.pinned === "true";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit ?? "50", 10) || 50),
    );
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

    const entityType =
      typeof req.query.entityType === "string" &&
      VALID_ENTITY_TYPES.has(req.query.entityType)
        ? req.query.entityType
        : null;
    const entityId =
      typeof req.query.entityId === "string" ? req.query.entityId : null;

    const where = {
      userId,
      archivedAt: archived ? { not: null } : null,
      ...(onlyPinned ? { pinned: true } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      ...(entityType ? { linkedEntityType: entityType } : {}),
      ...(entityId ? { linkedEntityId: entityId } : {}),
    };

    const notes = await prisma.note.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { _count: { select: { flashcards: true } } },
    });

    const hasMore = notes.length > limit;
    const page = hasMore ? notes.slice(0, limit) : notes;

    return success(res, {
      notes: page.map(dtoNote),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error("listNotes:", err);
    return error(res, "Failed to list notes", 500);
  }
}

// ============================================================================
// GET ONE
// ============================================================================
export async function getNote(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      include: { _count: { select: { flashcards: true } } },
    });
    if (!note) return error(res, "Note not found", 404);
    return success(res, { note: dtoNote(note) });
  } catch (err) {
    console.error("getNote:", err);
    return error(res, "Failed to load note", 500);
  }
}

// ============================================================================
// UPDATE
// ============================================================================
export async function updateNote(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return error(res, "Note not found", 404);

    const data = {};
    if (typeof req.body?.title === "string") {
      const title = trimTitle(req.body.title);
      if (!title) return error(res, "Title cannot be empty", 400);
      data.title = title;
    }
    if (typeof req.body?.contentMarkdown === "string") {
      data.contentMarkdown = clampContent(req.body.contentMarkdown);
    }
    // Allow `null` to detach an existing link.
    if ("linkedEntityType" in (req.body || {})) {
      const t = req.body.linkedEntityType;
      const id = req.body.linkedEntityId;
      if (t === null || t === undefined || t === "") {
        data.linkedEntityType = null;
        data.linkedEntityId = null;
        data.linkedEntityTitle = null;
      } else {
        const snap = await resolveEntitySnapshot({ type: t, id, userId });
        if (snap.error) return error(res, snap.error, 400);
        data.linkedEntityType = t;
        data.linkedEntityId = id;
        data.linkedEntityTitle = snap.title;
      }
    }

    const note = await prisma.note.update({
      where: { id: existing.id },
      data,
      include: { _count: { select: { flashcards: true } } },
    });
    return success(res, { note: dtoNote(note) });
  } catch (err) {
    console.error("updateNote:", err);
    return error(res, "Failed to update note", 500);
  }
}

// ============================================================================
// ARCHIVE (soft delete) / RESTORE
// ============================================================================
export async function archiveNote(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.updateMany({
      where: { id: req.params.id, userId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (note.count === 0) return error(res, "Note not found", 404);
    return success(res, { archived: true });
  } catch (err) {
    console.error("archiveNote:", err);
    return error(res, "Failed to archive note", 500);
  }
}

export async function restoreNote(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.updateMany({
      where: { id: req.params.id, userId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    if (note.count === 0) return error(res, "Note not found", 404);
    return success(res, { archived: false });
  } catch (err) {
    console.error("restoreNote:", err);
    return error(res, "Failed to restore note", 500);
  }
}

// ============================================================================
// PIN / UNPIN
// ============================================================================
// ============================================================================
// LIST BY ENTITY — used by AttachedNotesPanel on Problem/Session detail pages
// ============================================================================
export async function listNotesByEntity(req, res) {
  try {
    const userId = req.user.id;
    const { type, id } = req.params;
    if (!VALID_ENTITY_TYPES.has(type)) {
      return error(res, "Invalid entity type", 400);
    }
    const notes = await prisma.note.findMany({
      where: {
        userId,
        archivedAt: null,
        linkedEntityType: type,
        linkedEntityId: id,
      },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      include: { _count: { select: { flashcards: true } } },
    });
    return success(res, { notes: notes.map(dtoNote) });
  } catch (err) {
    console.error("listNotesByEntity:", err);
    return error(res, "Failed to load notes", 500);
  }
}

// ============================================================================
// LINK SEARCH — typeahead for the EntityLinkPicker
// ============================================================================
//
// Query: ?type=PROBLEM|INTERVIEW_SESSION|DESIGN_SESSION|TEACHING_SESSION&q=...
// Returns { results: [{ id, title, subtitle? }] } scoped to entities the
// user can access. Limited to 20 hits — picker is for narrowing, not browsing.
// ============================================================================
export async function searchLinkableEntities(req, res) {
  try {
    const userId = req.user.id;
    const type = req.query.type;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!VALID_ENTITY_TYPES.has(type)) {
      return error(res, "Invalid entity type", 400);
    }
    const titleContains = q
      ? { contains: q, mode: "insensitive" }
      : undefined;
    const teamIds = await userTeamIds(userId);

    let results = [];
    if (type === "PROBLEM") {
      const rows = await prisma.problem.findMany({
        where: {
          teamId: { in: teamIds },
          ...(titleContains ? { title: titleContains } : {}),
        },
        select: { id: true, title: true, difficulty: true, category: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
      results = rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `${r.category} · ${r.difficulty}`,
      }));
    } else if (type === "INTERVIEW_SESSION") {
      const rows = await prisma.interviewSession.findMany({
        where: {
          userId,
          ...(titleContains
            ? { problem: { title: titleContains } }
            : {}),
        },
        select: {
          id: true,
          createdAt: true,
          status: true,
          problem: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      results = rows.map((r) => ({
        id: r.id,
        title:
          r.problem?.title ||
          `Mock Interview · ${new Date(r.createdAt).toLocaleDateString()}`,
        subtitle: `${r.status}`,
      }));
    } else if (type === "DESIGN_SESSION") {
      const rows = await prisma.designSession.findMany({
        where: {
          userId,
          ...(titleContains ? { title: titleContains } : {}),
        },
        select: {
          id: true,
          title: true,
          designType: true,
          difficulty: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      results = rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `${r.designType} · ${r.difficulty}`,
      }));
    } else if (type === "TEACHING_SESSION") {
      const rows = await prisma.teachingSession.findMany({
        where: {
          teamId: { in: teamIds },
          ...(titleContains ? { title: titleContains } : {}),
        },
        select: {
          id: true,
          title: true,
          topic: true,
          status: true,
        },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      });
      results = rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: `${r.topic} · ${r.status}`,
      }));
    }
    return success(res, { results });
  } catch (err) {
    console.error("searchLinkableEntities:", err);
    return error(res, "Failed to search", 500);
  }
}

export async function togglePin(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, pinned: true },
    });
    if (!existing) return error(res, "Note not found", 404);

    const note = await prisma.note.update({
      where: { id: existing.id },
      data: { pinned: !existing.pinned },
      include: { _count: { select: { flashcards: true } } },
    });
    return success(res, { note: dtoNote(note) });
  } catch (err) {
    console.error("togglePin:", err);
    return error(res, "Failed to update pin state", 500);
  }
}
