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

function trimTitle(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, TITLE_MAX);
}

function clampContent(raw) {
  if (typeof raw !== "string") return "";
  return raw.length > CONTENT_MAX ? raw.slice(0, CONTENT_MAX) : raw;
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

    const note = await prisma.note.create({
      data: {
        userId,
        title,
        contentMarkdown,
        tags: [],
        suggestedTags: [],
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

    const where = {
      userId,
      archivedAt: archived ? { not: null } : null,
      ...(onlyPinned ? { pinned: true } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
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
