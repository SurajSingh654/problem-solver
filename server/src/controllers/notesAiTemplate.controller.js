// ============================================================================
// Notes — AI "New from template" controller
// ============================================================================
//
// User picks 1-3 of their own notes (treated as STRUCTURAL TEMPLATES) and
// optionally a Problem for context. The LLM merges templates and fills in
// content using the context. Output streams to the client as NDJSON over
// a chunked HTTP response, then the final markdown is persisted as a new
// Note and the new note's id is sent in a terminator event.
//
// Streaming protocol (NDJSON — one JSON object per line, '\n'-delimited):
//   {"chunk": "...token text..."}        — incremental output
//   {"done": true, "noteId": "...", "title": "..."}  — success terminator
//   {"error": "...", "code": "..."}      — failure terminator
//
// Why NDJSON over chunked HTTP rather than SSE / WebSocket:
//   - One-shot generation; no need for the full SSE event spec
//   - Existing WebSocket service is for long-lived bidirectional sessions
//   - Client reads via fetch + ReadableStream getReader()
// ============================================================================

import prisma from "../lib/prisma.js";
import { aiStream, AIError } from "../services/ai.service.js";
import { AI_MODEL_PRIMARY } from "../config/env.js";
import { noteFromTemplatesPrompt } from "../services/ai.prompts.js";
import { scheduleNoteEmbedding } from "../services/notes.embedding.js";

const MAX_TEMPLATES = 3;
const MIN_OUTPUT_CHARS = 60; // a complete note is at least this long
const CONTENT_MAX = 50_000;

// Resolve the team IDs the requesting user has access to. Used to gate
// which Problems they may pin as context (mirrors notes.controller.js).
async function userTeamIds(userId) {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

// Send a single NDJSON line on the wire. Flushes immediately so the
// client sees tokens as they arrive.
function sendLine(res, obj) {
  res.write(JSON.stringify(obj) + "\n");
}

export async function generateNoteFromTemplates(req, res) {
  const userId = req.user.id;
  const {
    templateNoteIds,
    problemId,
    targetFolderId,
  } = req.body ?? {};

  // ── Validation ────────────────────────────────────────────────────
  if (
    !Array.isArray(templateNoteIds) ||
    templateNoteIds.length < 1 ||
    templateNoteIds.length > MAX_TEMPLATES ||
    !templateNoteIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    return res.status(400).json({
      success: false,
      error: {
        message: `templateNoteIds must be 1–${MAX_TEMPLATES} note IDs`,
      },
    });
  }

  // Fetch templates (must all be owned by this user).
  const templates = await prisma.note.findMany({
    where: { id: { in: templateNoteIds }, userId },
    select: { id: true, title: true, contentMarkdown: true },
  });
  if (templates.length !== templateNoteIds.length) {
    return res.status(404).json({
      success: false,
      error: { message: "One or more templates not found" },
    });
  }
  // Preserve the order the user submitted (findMany doesn't guarantee it).
  const orderedTemplates = templateNoteIds.map((id) =>
    templates.find((t) => t.id === id),
  );

  // Optional Problem context.
  let problemSnapshot = null;
  if (problemId) {
    if (typeof problemId !== "string") {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid problemId" },
      });
    }
    const teamIds = await userTeamIds(userId);
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId: { in: teamIds } },
      select: { id: true, title: true, difficulty: true, description: true },
    });
    if (!problem) {
      return res.status(404).json({
        success: false,
        error: { message: "Problem not found or not accessible" },
      });
    }
    problemSnapshot = problem;
  }

  // Optional target folder must belong to the user (or absent → uncategorized).
  let folderId = null;
  if (targetFolderId) {
    if (typeof targetFolderId !== "string") {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid targetFolderId" },
      });
    }
    const folder = await prisma.noteFolder.findFirst({
      where: { id: targetFolderId, userId },
      select: { id: true },
    });
    if (!folder) {
      return res.status(404).json({
        success: false,
        error: { message: "Target folder not found" },
      });
    }
    folderId = folder.id;
  }

  // ── Switch response into streaming mode ────────────────────────────
  // Headers must be set BEFORE any res.write. We use NDJSON (one JSON
  // object per line). Disable any buffering proxies might apply.
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // nginx hint
  res.flushHeaders?.();

  // Honor client disconnect: abort streaming if the request is closed
  // mid-flight. We can't cancel the OpenAI stream itself but we stop
  // writing and skip the persist step.
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
  });

  const { system, user } = noteFromTemplatesPrompt({
    templates: orderedTemplates,
    problem: problemSnapshot,
  });

  let stream;
  try {
    stream = await aiStream({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      userId,
      model: AI_MODEL_PRIMARY,
      temperature: 0.6,
      maxTokens: 4000,
      surface: "note:from-templates",
    });
  } catch (err) {
    sendLine(res, {
      error:
        err instanceof AIError ? err.message : "Failed to start AI stream",
      code: err instanceof AIError ? err.code : "AI_ERROR",
    });
    return res.end();
  }

  let fullContent = "";
  try {
    for await (const chunk of stream) {
      if (clientGone) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        // Hard guard against runaway output; abort if we exceed the
        // notes content cap.
        if (fullContent.length > CONTENT_MAX) {
          fullContent = fullContent.slice(0, CONTENT_MAX);
          sendLine(res, { chunk: delta });
          break;
        }
        sendLine(res, { chunk: delta });
      }
    }
  } catch (err) {
    sendLine(res, {
      error: err?.message || "AI stream interrupted",
      code: "STREAM_ERROR",
    });
    return res.end();
  }

  if (clientGone) {
    // Don't persist if the user closed the page.
    return res.end();
  }

  const trimmed = fullContent.trim();
  if (trimmed.length < MIN_OUTPUT_CHARS) {
    sendLine(res, {
      error: "AI returned an empty or too-short note. Please retry.",
      code: "EMPTY_OUTPUT",
    });
    return res.end();
  }

  // Derive the title from the first `# heading` line if present;
  // otherwise fall back to the problem title or a generic stamp.
  const title = deriveTitle(trimmed, problemSnapshot, orderedTemplates);

  let note;
  try {
    note = await prisma.note.create({
      data: {
        userId,
        title,
        contentMarkdown: trimmed,
        tags: [],
        suggestedTags: [],
        folderId,
        ...(problemSnapshot
          ? {
              linkedEntityType: "PROBLEM",
              linkedEntityId: problemSnapshot.id,
              linkedEntityTitle: problemSnapshot.title,
            }
          : {}),
      },
      select: { id: true, title: true },
    });
  } catch (err) {
    console.error("generateNoteFromTemplates: persist failed:", err);
    sendLine(res, {
      error: "Generated content but failed to save the note. Please retry.",
      code: "PERSIST_FAILED",
    });
    return res.end();
  }

  scheduleNoteEmbedding(note.id);

  sendLine(res, { done: true, noteId: note.id, title: note.title });
  res.end();
}

// Pull a title from the first markdown H1 (`# ...`) the model emits.
// Fall back to problem title (when present) or a generic stamp.
function deriveTitle(markdown, problem, templates) {
  const firstH1 = /^#\s+(.+)$/m.exec(markdown);
  if (firstH1?.[1]) {
    return firstH1[1].trim().slice(0, 200);
  }
  if (problem?.title) return `Notes — ${problem.title}`.slice(0, 200);
  if (templates?.[0]?.title) {
    return `From ${templates[0].title}`.slice(0, 200);
  }
  return `AI Note — ${new Date().toISOString().slice(0, 10)}`;
}
