// ============================================================================
// AUTO-NOTE FROM AI SOLUTION REVIEW
// ============================================================================
//
// Triggered (fire-and-forget) by aiReview.controller.js::reviewSolution after a
// NEW review lands (cache hits skip — note already exists). Generates a
// structured study note from (problem, solution, AI review), persists it
// with linkedEntityType=SOLUTION, then auto-extracts flashcards on the
// SAME pipeline used by the manual note→flashcards button.
//
// CONTRACT WITH CALLER:
// - Throws nothing. Errors are caught and logged. The caller is fire-and-
//   forget — the user's review response must never block on this.
// - Idempotent on the Solution: if an auto-note already exists for this
//   solutionId, the note body is REFRESHED (title, content, tags) but the
//   existing flashcards are left untouched so SM-2 state isn't reset.
// - Skips entirely when the review is itself a fallback (no point
//   compounding a degraded review with degraded note generation).
// ============================================================================

import prisma from "../lib/prisma.js";
import { aiComplete, AIError } from "./ai.service.js";
import {
  noteFromSolutionPrompt,
  noteFlashcardsPrompt,
} from "./ai.prompts.js";
import {
  validateNoteFromSolution,
  validateNoteFlashcards,
} from "./ai.validators.js";
import {
  buildFallbackNoteFromSolution,
  buildFallbackNoteFlashcards,
} from "./ai.fallbacks.js";
import { initialSM2State } from "../utils/sm2.js";

// ── Markdown composer ────────────────────────────────────────────────
// Maps the strict JSON schema → readable, point-form markdown. Section
// headers are emoji-prefixed for scannability; bullets are tight.
function composeNoteMarkdown(noteJson) {
  const lines = [];

  if (Array.isArray(noteJson.whatYouGotRight) && noteJson.whatYouGotRight.length > 0) {
    lines.push("## 🎯 What you got right");
    for (const point of noteJson.whatYouGotRight) lines.push(`- ${point}`);
    lines.push("");
  }

  if (Array.isArray(noteJson.weakAreas) && noteJson.weakAreas.length > 0) {
    lines.push("## ⚠️ Weak areas");
    for (const w of noteJson.weakAreas) {
      lines.push(`- **[${w.severity}]** ${w.point}`);
    }
    lines.push("");
  }

  if (Array.isArray(noteJson.mistakes) && noteJson.mistakes.length > 0) {
    lines.push("## 🐛 Mistakes you made");
    for (const m of noteJson.mistakes) lines.push(`- ${m}`);
    lines.push("");
  }

  if (Array.isArray(noteJson.howToOvercome) && noteJson.howToOvercome.length > 0) {
    lines.push("## 🔧 How to overcome");
    for (const h of noteJson.howToOvercome) lines.push(`- ${h}`);
    lines.push("");
  }

  if (Array.isArray(noteJson.topicsExplained) && noteJson.topicsExplained.length > 0) {
    lines.push("## 📚 Topics covered");
    lines.push("");
    for (const t of noteJson.topicsExplained) {
      lines.push(`### ${t.topic}`);
      for (const p of t.points || []) lines.push(`- ${p}`);
      lines.push("");
    }
  }

  if (Array.isArray(noteJson.betterApproachNextTime) && noteJson.betterApproachNextTime.length > 0) {
    lines.push("## ➡️ Better approach next time");
    for (const b of noteJson.betterApproachNextTime) lines.push(`- ${b}`);
    lines.push("");
  }

  if (noteJson._fallback) {
    lines.push(
      "---",
      "_⚠️ AI couldn't fully structure this note — content above came from the raw review. " +
      "Trigger a re-analysis from the problem page to regenerate._",
    );
  }

  return lines.join("\n").trim();
}

// ── Main orchestrator ────────────────────────────────────────────────

export async function generateAutoNoteFromReview({
  solutionId,
  userId,
  teamId,
  solution,
  problem,
  reviewRecord,
}) {
  if (!solution || !problem || !reviewRecord) {
    console.warn("[autoNote] missing inputs — aborting");
    return;
  }
  // Don't compound a degraded review with degraded note generation. Wait
  // for the user to force a re-analysis when the AI is healthy.
  if (reviewRecord.usedFallback) {
    console.log(`[autoNote] solution=${solutionId} review used fallback — skipping note generation`);
    return;
  }

  // ── 1. Generate the structured note JSON ────────────────────────
  let noteJson;
  let usedNoteFallback = false;
  try {
    const { system, user } = noteFromSolutionPrompt({
      problem,
      solution,
      aiReview: reviewRecord,
    });
    const parsed = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      teamId,
      surface: "note:fromSolution",
      maxTokens: 3500,
      temperature: 0.5,
    });
    const v = validateNoteFromSolution(parsed);
    if (v.valid) {
      noteJson = parsed;
    } else {
      console.warn("[autoNote] LLM output rejected:", v.violations);
    }
  } catch (e) {
    const code = e instanceof AIError ? `ai-error:${e.code}` : `ai-threw:${e.message}`;
    console.error("[autoNote] AI call failed:", code);
  }
  if (!noteJson) {
    noteJson = buildFallbackNoteFromSolution({ problem, solution, aiReview: reviewRecord });
    usedNoteFallback = true;
  }

  const markdown = composeNoteMarkdown(noteJson);

  // ── 2. Upsert the Note row ──────────────────────────────────────
  // Find any existing AUTO-GENERATED note linked to this solution.
  // User-edited notes (autoGenerated=false) are never touched, even if
  // their linkedEntityId matches.
  const existing = await prisma.note.findFirst({
    where: {
      userId,
      autoGenerated: true,
      linkedEntityType: "SOLUTION",
      linkedEntityId: solutionId,
      archivedAt: null,
    },
    select: { id: true },
  });

  let noteId;
  let isNewNote;
  if (existing) {
    // Refresh the note body but leave flashcards untouched — preserving
    // SM-2 state on cards the user has already been reviewing.
    await prisma.note.update({
      where: { id: existing.id },
      data: {
        title: noteJson.title.slice(0, 200),
        contentMarkdown: markdown,
        tags: noteJson.tags || [],
        suggestedTags: [],
      },
    });
    noteId = existing.id;
    isNewNote = false;
    console.log(`[autoNote] solution=${solutionId} note=${noteId} REFRESHED (fallback=${usedNoteFallback})`);
  } else {
    const created = await prisma.note.create({
      data: {
        userId,
        title: noteJson.title.slice(0, 200),
        contentMarkdown: markdown,
        tags: noteJson.tags || [],
        autoGenerated: true,
        linkedEntityType: "SOLUTION",
        linkedEntityId: solutionId,
        linkedEntityTitle: problem.title || null,
      },
      select: { id: true },
    });
    noteId = created.id;
    isNewNote = true;
    console.log(`[autoNote] solution=${solutionId} note=${noteId} CREATED (fallback=${usedNoteFallback})`);
  }

  // ── 3. Flashcards — only on first creation, to preserve SM-2 state ──
  // Subsequent re-analyses refresh the note body but leave existing cards
  // untouched. If the user wants new cards, they delete the note → next
  // re-analysis treats it as new.
  if (!isNewNote) return;

  let drafts;
  try {
    const { system, user } = noteFlashcardsPrompt({
      title: noteJson.title,
      contentMarkdown: markdown,
      tags: noteJson.tags || [],
    });
    const parsed = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      teamId,
      surface: "note:flashcards",
      maxTokens: 2200,
      temperature: 0.6,
    });
    const v = validateNoteFlashcards(parsed);
    if (v.valid) drafts = parsed.drafts;
    else {
      console.warn("[autoNote.flashcards] LLM output rejected:", v.violations);
    }
  } catch (e) {
    const code = e instanceof AIError ? e.code : e.message;
    console.error("[autoNote.flashcards] AI call failed:", code);
  }
  if (!drafts) {
    // Fallback drafts are honest "AI unavailable" placeholders — we DON'T
    // persist those. Better to leave the note flashcard-less than to put
    // garbage cards into the user's SM-2 queue.
    const fb = buildFallbackNoteFlashcards();
    if (fb._fallback) {
      console.log(`[autoNote.flashcards] solution=${solutionId} skipped persistence (fallback)`);
      return;
    }
    drafts = fb.drafts;
  }

  // Persist drafts. Cap at 7 (the prompt's upper bound). Bulk-insert.
  const sm2 = initialSM2State();
  const FRONT_MAX = 200;
  const BACK_MAX = 500;
  const cards = drafts
    .slice(0, 7)
    .map((d) => ({
      userId,
      noteId,
      front: String(d.front || "").slice(0, FRONT_MAX),
      back: String(d.back || "").slice(0, BACK_MAX),
      tags: Array.isArray(d.tagSuggestions)
        ? d.tagSuggestions.filter((t) => typeof t === "string").slice(0, 3)
        : [],
      aiGenerated: true,
      sm2EasinessFactor: sm2.easinessFactor,
      sm2Interval: sm2.interval,
      sm2Repetitions: sm2.repetitions,
      nextReviewDate: sm2.nextReviewDate,
    }))
    .filter((c) => c.front && c.back);

  if (cards.length === 0) {
    console.log(`[autoNote.flashcards] solution=${solutionId} produced 0 valid cards`);
    return;
  }

  await prisma.flashcard.createMany({ data: cards });
  console.log(`[autoNote.flashcards] solution=${solutionId} note=${noteId} persisted ${cards.length} cards`);
}
