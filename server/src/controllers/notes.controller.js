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
import { scheduleNoteEmbedding } from "../services/notes.embedding.js";
import {
  findSimilarNotes,
  findProblemsByNoteEmbedding,
} from "../services/embedding.service.js";
import { aiComplete, AIError } from "../services/ai.service.js";
import {
  noteSummaryPrompt,
  noteAutoTagPrompt,
  noteRelatedPrompt,
  noteFlashcardsPrompt,
  NOTE_SUMMARY_FEWSHOT,
  NOTE_AUTOTAG_FEWSHOT,
  NOTE_RELATED_FEWSHOT,
  NOTE_FLASHCARDS_FEWSHOT,
} from "../services/ai.prompts.js";
import {
  validateNoteSummary,
  validateNoteAutoTag,
  validateNoteRelated,
  validateNoteFlashcards,
} from "../services/ai.validators.js";
import {
  buildFallbackNoteSummary,
  buildFallbackNoteAutoTag,
  buildFallbackNoteRelated,
  buildFallbackNoteFlashcards,
} from "../services/ai.fallbacks.js";
import {
  prepareNoteContentForAi,
  assessNoteContentQuality,
} from "../utils/notesCompression.js";

// ── Validation helpers ───────────────────────────────────────
const TITLE_MAX = 200;
const CONTENT_MAX = 50_000; // ~10K words
const VALID_ENTITY_TYPES = new Set([
  "PROBLEM",
  "INTERVIEW_SESSION",
  "DESIGN_SESSION",
  "TEACHING_SESSION",
  "CUSTOM",
]);

function trimTitle(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, TITLE_MAX);
}

function clampContent(raw) {
  if (typeof raw !== "string") return "";
  return raw.length > CONTENT_MAX ? raw.slice(0, CONTENT_MAX) : raw;
}

// Tag normalization: lowercase, kebab-case, 2–30 chars, deduped, max 20.
// Mirrors the validator constraints in P4's auto-tag AI surface so manual
// + AI tags share one normalization rule.
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
//
// `customTitle` is only used for CUSTOM links — the user provides both
// the title and (optionally) a URL stored as the id. Other types
// resolve their title from the linked row.
async function resolveEntitySnapshot({ type, id, userId, customTitle }) {
  if (!VALID_ENTITY_TYPES.has(type)) return { error: "Invalid entity type" };
  if (typeof id !== "string" || !id) return { error: "Invalid entity id" };

  switch (type) {
    case "CUSTOM": {
      // No ownership check — user-controlled free text. The id slot
      // typically holds an external URL but can be any opaque string;
      // title is what the user typed.
      const title =
        typeof customTitle === "string" ? customTitle.trim().slice(0, 200) : "";
      if (!title) return { error: "Custom link needs a title" };
      return { title };
    }
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
        customTitle: req.body?.linkedEntityTitle,
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
        tags: normalizeTags(req.body?.tags),
        suggestedTags: [],
        linkedEntityType,
        linkedEntityId,
        linkedEntityTitle,
      },
    });

    scheduleNoteEmbedding(note.id);
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
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";

    const where = {
      userId,
      archivedAt: archived ? { not: null } : null,
      ...(onlyPinned ? { pinned: true } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      ...(entityType ? { linkedEntityType: entityType } : {}),
      ...(entityId ? { linkedEntityId: entityId } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
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
    if (Array.isArray(req.body?.tags)) {
      data.tags = normalizeTags(req.body.tags);
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
        const snap = await resolveEntitySnapshot({
          type: t,
          id,
          userId,
          customTitle: req.body?.linkedEntityTitle,
        });
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

    // Re-embed only if substantive content changed. Tag/link edits alone
    // don't need a re-embed (cheap optimization to avoid burning calls
    // on every pin/archive cycle).
    if (
      typeof data.title === "string" ||
      typeof data.contentMarkdown === "string"
    ) {
      scheduleNoteEmbedding(note.id);
    }

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
    // Auto-unpin on archive — a pinned-and-archived note is incoherent
    // (pinned means "keep at top of active list" and archived hides it
    // from active). User can re-pin after restoring if they want.
    const note = await prisma.note.updateMany({
      where: { id: req.params.id, userId, archivedAt: null },
      data: { archivedAt: new Date(), pinned: false },
    });
    if (note.count === 0) return error(res, "Note not found", 404);
    return success(res, { archived: true });
  } catch (err) {
    console.error("archiveNote:", err);
    return error(res, "Failed to archive note", 500);
  }
}

// ============================================================================
// HARD DELETE (permanent — no recovery)
// ============================================================================
//
// Distinct from archive (soft delete via archivedAt). Removes the row
// entirely along with any flashcards that referenced it (cascade to
// SET NULL on Flashcard.noteId — cards survive but lose their parent
// link; if the user wants the cards gone too, they archive them
// individually).
// ============================================================================
export async function deleteNotePermanent(req, res) {
  try {
    const userId = req.user.id;
    // updateMany-style guard: try to find first to ensure ownership,
    // then delete by id.
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return error(res, "Note not found", 404);
    await prisma.note.delete({ where: { id: existing.id } });
    return success(res, { deleted: true });
  } catch (err) {
    console.error("deleteNotePermanent:", err);
    return error(res, "Failed to delete note", 500);
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
// RELATED — embedding-driven similarity (no LLM in P3)
// ============================================================================
//
// Returns top similar Notes (own scope) + top similar Problems (across
// the user's accessible teams). Distance is included so the client can
// show a confidence indicator. P4 will layer LLM ranking on top of these
// raw candidates.
// ============================================================================
function similarityScore(d) {
  const num = Number(d);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(1, (2 - num) / 2));
}

export async function getRelatedForNote(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, title: true, summary: true },
    });
    if (!note) return error(res, "Note not found", 404);

    const teamIds = await userTeamIds(userId);
    const [rawNotes, rawProblems] = await Promise.all([
      findSimilarNotes(note.id, userId, 10),
      findProblemsByNoteEmbedding(note.id, teamIds, 10),
    ]);

    // Build the candidate set the LLM ranks. Only top-10 each; no body
    // text — titles + tags keep the prompt cheap and reduce hallucination
    // surface.
    const candidates = {
      notes: rawNotes.map((n) => ({ id: n.id, title: n.title })),
      problems: rawProblems.map((p) => ({ id: p.id, title: p.title })),
    };

    // Try LLM ranking. On any failure, return the embedding-only result
    // with a graceful "raw similarity" rationale.
    let llmRanked = null;
    try {
      const summary =
        note.summary && typeof note.summary === "object"
          ? `${note.summary.tldr || ""}\n${(note.summary.keyTakeaways || []).join(". ")}`
          : "";
      const { system, user } = noteRelatedPrompt({
        noteTitle: note.title,
        noteSummary: summary,
        candidates,
      });
      const parsed = await aiComplete({
        systemPrompt: system,
        userPrompt: user,
        userId,
        surface: "note:related",
        fewShotMessages: NOTE_RELATED_FEWSHOT,
        maxTokens: 800,
        temperature: 0.4,
      });
      const v = validateNoteRelated(parsed, {
        candidateNoteIds: candidates.notes.map((n) => n.id),
        candidateProblemIds: candidates.problems.map((p) => p.id),
      });
      if (v.valid) llmRanked = parsed;
      else {
        console.warn("[notes.related] LLM output rejected:", v.violations);
      }
    } catch (e) {
      if (!(e instanceof AIError)) {
        console.error("[notes.related] AI call threw:", e.message);
      }
    }

    const fallback = llmRanked
      ? null
      : buildFallbackNoteRelated({ rawNotes, rawProblems });
    const ranked = llmRanked || fallback;

    // Hydrate each ID with display fields from the embedding query so the
    // client doesn't need a second lookup.
    const noteById = new Map(rawNotes.map((n) => [n.id, n]));
    const probById = new Map(rawProblems.map((p) => [p.id, p]));

    return success(res, {
      aiGenerated: !!llmRanked,
      relatedNotes: (ranked.relatedNotes || [])
        .map((r) => {
          const n = noteById.get(r.id);
          if (!n) return null;
          return {
            id: r.id,
            title: n.title,
            tags: n.tags || [],
            updatedAt: n.updatedAt,
            similarity: similarityScore(n.distance),
            rationale: r.rationale,
          };
        })
        .filter(Boolean),
      relatedProblems: (ranked.relatedProblems || [])
        .map((r) => {
          const p = probById.get(r.id);
          if (!p) return null;
          return {
            id: r.id,
            title: p.title,
            difficulty: p.difficulty,
            category: p.category,
            tags: p.tags || [],
            similarity: similarityScore(p.distance),
            rationale: r.rationale,
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    console.error("getRelatedForNote:", err);
    return error(res, "Failed to load related items", 500);
  }
}

// ============================================================================
// AI: SUMMARY
// ============================================================================
export async function generateNoteSummary(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, title: true, contentMarkdown: true, tags: true },
    });
    if (!note) return error(res, "Note not found", 404);

    // Content-quality gate — gibberish or near-empty notes can't be
    // summarized usefully. Reject with a clear 400 instead of letting
    // the AI return empties and silently falling back.
    const q = assessNoteContentQuality(note.contentMarkdown);
    if (q.chars < 80 || q.uniqueWords < 8) {
      return error(
        res,
        "Note is too thin to summarize — add at least a paragraph of meaningful content (8+ unique words).",
        400,
      );
    }

    let summary;
    let fallbackReason = null;
    const prepped = prepareNoteContentForAi(note.contentMarkdown);
    if (prepped.wasCompressed) {
      console.log(
        `[notes.summary] compressed ${prepped.originalChars}→${prepped.finalChars} chars for AI`,
      );
    }
    try {
      const { system, user } = noteSummaryPrompt({
        title: note.title,
        contentMarkdown: prepped.content,
        tags: note.tags,
        isCompressed: prepped.wasCompressed,
      });
      // aiComplete with jsonMode=true (the default) returns the parsed
      // JSON object directly. No extractJSON call needed — that was a
      // bug that caused "text.indexOf is not a function" because
      // extractJSON expects a raw string with embedded JSON.
      const parsed = await aiComplete({
        systemPrompt: system,
        userPrompt: user,
        userId,
        // Larger budget for long notes — JSON of 5 takeaways + 3 questions
        // + tldr + suggestedReviewFocus comfortably fits in 1500 tokens.
        // 900 was prone to mid-JSON truncation on long notes.
        maxTokens: 1500,
        temperature: 0.5,
        surface: "note:summary",
        fewShotMessages: NOTE_SUMMARY_FEWSHOT,
      });
      const v = validateNoteSummary(parsed, { hasContent });
      if (v.valid) summary = parsed;
      else {
        fallbackReason = `validator:${v.violations.join(",")}`;
        console.warn("[notes.summary] LLM output rejected:", v.violations);
      }
    } catch (e) {
      fallbackReason =
        e instanceof AIError ? `ai-error:${e.code}` : `ai-threw:${e.message}`;
      console.error("[notes.summary] AI call failed:", fallbackReason);
    }
    const isFallback = !summary;
    if (!summary) {
      summary = buildFallbackNoteSummary();
    }

    await prisma.note.update({
      where: { id: note.id },
      data: { summary, summaryGeneratedAt: new Date() },
    });

    return success(res, {
      summary,
      fallback: isFallback,
      ...(fallbackReason ? { fallbackReason } : {}),
    });
  } catch (err) {
    console.error("generateNoteSummary:", err);
    return error(res, "Failed to generate summary", 500);
  }
}

// ============================================================================
// AI: FLASHCARD DRAFTS
// ============================================================================
//
// Returns drafts only — does NOT persist Flashcard rows. The user
// reviews each draft (accept/reject + edit) in the FlashcardDraftReview
// UI, then sends accepted drafts to POST /flashcards as a bulk create.
// ============================================================================
export async function generateNoteFlashcards(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, title: true, contentMarkdown: true, tags: true },
    });
    if (!note) return error(res, "Note not found", 404);

    const q = assessNoteContentQuality(note.contentMarkdown);
    if (q.chars < 200 || q.uniqueWords < 20) {
      return error(
        res,
        "Note is too thin for flashcards — write at least a couple of paragraphs first (20+ unique words).",
        400,
      );
    }

    let drafts;
    let fallbackReason = null;
    const prepped = prepareNoteContentForAi(note.contentMarkdown);
    try {
      const { system, user } = noteFlashcardsPrompt({
        title: note.title,
        contentMarkdown: prepped.content,
        tags: note.tags,
        isCompressed: prepped.wasCompressed,
      });
      const parsed = await aiComplete({
        systemPrompt: system,
        userPrompt: user,
        userId,
        surface: "note:flashcards",
        fewShotMessages: NOTE_FLASHCARDS_FEWSHOT,
        // Up from 1500 — 7 drafts × ~700 chars + JSON skeleton can hit
        // ~2000 tokens; 1500 was prone to mid-JSON truncation.
        maxTokens: 2200,
        temperature: 0.6,
      });
      const v = validateNoteFlashcards(parsed);
      if (v.valid) drafts = parsed.drafts;
      else {
        fallbackReason = `validator:${v.violations.join(",")}`;
        console.warn("[notes.flashcards] LLM output rejected:", v.violations);
      }
    } catch (e) {
      fallbackReason =
        e instanceof AIError ? `ai-error:${e.code}` : `ai-threw:${e.message}`;
      console.error("[notes.flashcards] AI call failed:", fallbackReason);
    }
    const isFallback = !drafts;
    if (!drafts) {
      const fb = buildFallbackNoteFlashcards();
      drafts = fb.drafts;
    }

    return success(res, {
      drafts,
      fallback: isFallback,
      ...(fallbackReason ? { fallbackReason } : {}),
    });
  } catch (err) {
    console.error("generateNoteFlashcards:", err);
    return error(res, "Failed to generate flashcards", 500);
  }
}

// ============================================================================
// AI: AUTO-TAG
// ============================================================================
export async function suggestNoteTags(req, res) {
  try {
    const userId = req.user.id;
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, title: true, contentMarkdown: true, tags: true },
    });
    if (!note) return error(res, "Note not found", 404);

    const q = assessNoteContentQuality(note.contentMarkdown);
    if (q.chars < 60 || q.uniqueWords < 5) {
      return error(
        res,
        "Note is too thin for tag suggestions — add a few sentences first.",
        400,
      );
    }

    let result;
    let fallbackReason = null;
    const prepped = prepareNoteContentForAi(note.contentMarkdown);
    try {
      const { system, user } = noteAutoTagPrompt({
        title: note.title,
        contentMarkdown: prepped.content,
        existingTags: note.tags,
        isCompressed: prepped.wasCompressed,
      });
      const parsed = await aiComplete({
        systemPrompt: system,
        userPrompt: user,
        userId,
        surface: "note:autotag",
        fewShotMessages: NOTE_AUTOTAG_FEWSHOT,
        maxTokens: 300,
        temperature: 0.3,
      });
      const v = validateNoteAutoTag(parsed, { existingTags: note.tags });
      if (v.valid) result = parsed;
      else {
        fallbackReason = `validator:${v.violations.join(",")}`;
        console.warn("[notes.autotag] LLM output rejected:", v.violations);
      }
    } catch (e) {
      fallbackReason =
        e instanceof AIError ? `ai-error:${e.code}` : `ai-threw:${e.message}`;
      console.error("[notes.autotag] AI call failed:", fallbackReason);
    }
    const isFallback = !result;
    if (!result) {
      result = buildFallbackNoteAutoTag({
        contentMarkdown: note.contentMarkdown,
        existingTags: note.tags,
      });
    }

    // Persist the suggestion list (separate from user-applied `tags`).
    await prisma.note.update({
      where: { id: note.id },
      data: { suggestedTags: result.tags },
    });

    return success(res, {
      tags: result.tags,
      fallback: isFallback,
      ...(fallbackReason ? { fallbackReason } : {}),
    });
  } catch (err) {
    console.error("suggestNoteTags:", err);
    return error(res, "Failed to suggest tags", 500);
  }
}

// ============================================================================
// LIST TAGS — distinct tags + usage count for the filter UI
// ============================================================================
//
// Aggregates tags across the user's non-archived notes. Returns at most
// the top 50 by usage to keep the response small. The list page uses
// this to render quick-pick chips above the search bar.
// ============================================================================
export async function listTags(req, res) {
  try {
    const userId = req.user.id;
    const notes = await prisma.note.findMany({
      where: { userId, archivedAt: null },
      select: { tags: true },
    });
    const counts = new Map();
    for (const n of notes) {
      for (const t of n.tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    const tags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([tag, count]) => ({ tag, count }));
    return success(res, { tags });
  } catch (err) {
    console.error("listTags:", err);
    return error(res, "Failed to load tags", 500);
  }
}

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
      select: { id: true, pinned: true, archivedAt: true },
    });
    if (!existing) return error(res, "Note not found", 404);
    if (existing.archivedAt) {
      return error(res, "Restore the note before pinning it", 400);
    }

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
