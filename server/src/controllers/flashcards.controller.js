// ============================================================================
// ProbSolver — Flashcards Controller (P5)
// ============================================================================
//
// Personal SM-2 flashcards. Cards may be created manually or accepted
// from AI drafts (P6). All cards are user-scoped — same pattern as
// notes.controller.js: `authenticate` only, every query filters by
// req.user.id, no requireTeamContext.
//
// SM-2 state mirrors Solution. Algorithm + initial state come from
// utils/sm2.js so behaviour matches the existing Review Queue flow.
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
  calculateSM2,
  confidenceToQuality,
  initialSM2State,
} from "../utils/sm2.js";

const FRONT_MAX = 500;
const BACK_MAX = 2000;

function trimStr(raw, max) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, max);
}

// Tag normalization mirrors notes.controller.js — same canonical rule.
const TAG_REGEX = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$|^[a-z0-9]$/;
function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const slug = t
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug || slug.length < 2 || slug.length > 30) continue;
    if (!TAG_REGEX.test(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= 20) break;
  }
  return out;
}

function dtoCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    noteId: card.noteId,
    front: card.front,
    back: card.back,
    tags: card.tags || [],
    sm2EasinessFactor: card.sm2EasinessFactor,
    sm2Interval: card.sm2Interval,
    sm2Repetitions: card.sm2Repetitions,
    lapseCount: card.lapseCount,
    nextReviewDate: card.nextReviewDate,
    reviewCount: card.reviewCount,
    lastReviewedAt: card.lastReviewedAt,
    aiGenerated: card.aiGenerated,
    archivedAt: card.archivedAt,
    note: card.note
      ? { id: card.note.id, title: card.note.title }
      : undefined,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

// ── Verify the user owns the note (when noteId is supplied) ──
async function ownsNote(userId, noteId) {
  if (!noteId) return true;
  const n = await prisma.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
  return !!n;
}

// ============================================================================
// CREATE — single card or bulk (AI accept)
// ============================================================================
//
// Body shape:
//   { front, back, tags?, noteId?, aiGenerated? }       — single card
//   { cards: [{front, back, tags?, ...}], noteId? }     — bulk
//
// Bulk path applies the same `noteId` to every card if set on the
// envelope. AI-draft acceptance (P6) uses bulk with aiGenerated=true.
// ============================================================================
export async function createFlashcards(req, res) {
  try {
    const userId = req.user.id;
    const isBulk = Array.isArray(req.body?.cards);
    const envelopeNoteId =
      typeof req.body?.noteId === "string" ? req.body.noteId : null;

    if (envelopeNoteId && !(await ownsNote(userId, envelopeNoteId))) {
      return error(res, "Note not found", 404);
    }

    const sm2Init = initialSM2State();

    if (!isBulk) {
      const front = trimStr(req.body?.front, FRONT_MAX);
      const back = trimStr(req.body?.back, BACK_MAX);
      if (!front) return error(res, "Front is required", 400);
      if (!back) return error(res, "Back is required", 400);

      const noteId = envelopeNoteId || (typeof req.body?.noteId === "string" ? req.body.noteId : null);
      if (noteId && !(await ownsNote(userId, noteId))) {
        return error(res, "Note not found", 404);
      }

      const card = await prisma.flashcard.create({
        data: {
          userId,
          noteId,
          front,
          back,
          tags: normalizeTags(req.body?.tags),
          aiGenerated: req.body?.aiGenerated === true,
          ...sm2Init,
        },
      });
      return success(res, { flashcard: dtoCard(card) }, 201);
    }

    // Bulk path — accept up to 20 cards, drop invalids silently per item.
    const inputs = req.body.cards.slice(0, 20);
    const data = [];
    for (const raw of inputs) {
      const front = trimStr(raw?.front, FRONT_MAX);
      const back = trimStr(raw?.back, BACK_MAX);
      if (!front || !back) continue;
      data.push({
        userId,
        noteId: envelopeNoteId,
        front,
        back,
        tags: normalizeTags(raw?.tags),
        aiGenerated: raw?.aiGenerated === true,
        ...sm2Init,
      });
    }
    if (data.length === 0) {
      return error(res, "No valid cards to create", 400);
    }
    await prisma.flashcard.createMany({ data });
    // createMany doesn't return rows; refetch the just-created set.
    const cards = await prisma.flashcard.findMany({
      where: { userId, noteId: envelopeNoteId },
      orderBy: { createdAt: "desc" },
      take: data.length,
    });
    return success(
      res,
      { flashcards: cards.map(dtoCard), count: data.length },
      201,
    );
  } catch (err) {
    console.error("createFlashcards:", err);
    return error(res, "Failed to create flashcards", 500);
  }
}

// ============================================================================
// LIST
// ============================================================================
export async function listFlashcards(req, res) {
  try {
    const userId = req.user.id;
    const archived = req.query.archived === "true";
    const noteId =
      typeof req.query.noteId === "string" ? req.query.noteId : null;
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
    const limit = Math.min(
      200,
      Math.max(1, parseInt(req.query.limit ?? "50", 10) || 50),
    );

    const where = {
      userId,
      archivedAt: archived ? { not: null } : null,
      ...(noteId ? { noteId } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };
    const cards = await prisma.flashcard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { note: { select: { id: true, title: true } } },
    });
    return success(res, { flashcards: cards.map(dtoCard) });
  } catch (err) {
    console.error("listFlashcards:", err);
    return error(res, "Failed to list flashcards", 500);
  }
}

// ============================================================================
// REVIEW QUEUE — due cards + retention sort
// ============================================================================
export async function getFlashcardQueue(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    // Due window matches the solutions queue: due now OR within 14 days.
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 14);

    const cards = await prisma.flashcard.findMany({
      where: {
        userId,
        archivedAt: null,
        nextReviewDate: { lte: horizon },
      },
      orderBy: { nextReviewDate: "asc" },
      take: 200,
      include: { note: { select: { id: true, title: true } } },
    });
    const due = cards.filter((c) => c.nextReviewDate <= now);
    const upcoming = cards.filter((c) => c.nextReviewDate > now);

    return success(res, {
      due: due.map(dtoCard),
      upcoming: upcoming.map(dtoCard),
      counts: { due: due.length, upcoming: upcoming.length },
    });
  } catch (err) {
    console.error("getFlashcardQueue:", err);
    return error(res, "Failed to load queue", 500);
  }
}

// ============================================================================
// UPDATE
// ============================================================================
export async function updateFlashcard(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.flashcard.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return error(res, "Flashcard not found", 404);

    const data = {};
    if (typeof req.body?.front === "string") {
      const v = trimStr(req.body.front, FRONT_MAX);
      if (!v) return error(res, "Front cannot be empty", 400);
      data.front = v;
    }
    if (typeof req.body?.back === "string") {
      const v = trimStr(req.body.back, BACK_MAX);
      if (!v) return error(res, "Back cannot be empty", 400);
      data.back = v;
    }
    if (Array.isArray(req.body?.tags)) data.tags = normalizeTags(req.body.tags);

    const card = await prisma.flashcard.update({
      where: { id: existing.id },
      data,
      include: { note: { select: { id: true, title: true } } },
    });
    return success(res, { flashcard: dtoCard(card) });
  } catch (err) {
    console.error("updateFlashcard:", err);
    return error(res, "Failed to update flashcard", 500);
  }
}

// ============================================================================
// ARCHIVE (soft delete)
// ============================================================================
export async function archiveFlashcard(req, res) {
  try {
    const userId = req.user.id;
    const r = await prisma.flashcard.updateMany({
      where: { id: req.params.id, userId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (r.count === 0) return error(res, "Flashcard not found", 404);
    return success(res, { archived: true });
  } catch (err) {
    console.error("archiveFlashcard:", err);
    return error(res, "Failed to archive", 500);
  }
}

// ============================================================================
// REVIEW — apply SM-2 update from a 1-5 confidence rating
// ============================================================================
export async function reviewFlashcard(req, res) {
  try {
    const userId = req.user.id;
    const confidence = Number(req.body?.confidence);
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      return error(res, "confidence must be an integer 1-5", 400);
    }

    const card = await prisma.flashcard.findFirst({
      where: { id: req.params.id, userId, archivedAt: null },
    });
    if (!card) return error(res, "Flashcard not found", 404);

    const quality = confidenceToQuality(confidence);
    const next = calculateSM2(
      quality,
      card.sm2EasinessFactor,
      card.sm2Interval,
      card.sm2Repetitions,
    );

    const reviewDates = Array.isArray(card.reviewDates)
      ? [...card.reviewDates]
      : [];
    reviewDates.push({
      at: new Date().toISOString(),
      confidence,
      quality,
      newInterval: next.interval,
    });
    if (reviewDates.length > 200) reviewDates.splice(0, reviewDates.length - 200);

    const lapseDelta = quality < 3 ? 1 : 0;

    const updated = await prisma.flashcard.update({
      where: { id: card.id },
      data: {
        sm2EasinessFactor: next.easinessFactor,
        sm2Interval: next.interval,
        sm2Repetitions: next.repetitions,
        nextReviewDate: next.nextReviewDate,
        reviewCount: { increment: 1 },
        lastReviewedAt: new Date(),
        reviewDates,
        lapseCount: { increment: lapseDelta },
      },
      include: { note: { select: { id: true, title: true } } },
    });

    return success(res, { flashcard: dtoCard(updated) });
  } catch (err) {
    console.error("reviewFlashcard:", err);
    return error(res, "Failed to record review", 500);
  }
}

// ============================================================================
// STATS — quick counts for dashboard tile
// ============================================================================
export async function getFlashcardStats(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const [total, due, lapsed] = await Promise.all([
      prisma.flashcard.count({ where: { userId, archivedAt: null } }),
      prisma.flashcard.count({
        where: { userId, archivedAt: null, nextReviewDate: { lte: now } },
      }),
      prisma.flashcard.count({
        where: { userId, archivedAt: null, lapseCount: { gte: 3 } },
      }),
    ]);
    return success(res, { total, due, lapsed });
  } catch (err) {
    console.error("getFlashcardStats:", err);
    return error(res, "Failed to load stats", 500);
  }
}
