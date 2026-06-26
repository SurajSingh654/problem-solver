// ============================================================================
// Notes — embedding writer with per-note debounce
// ============================================================================
//
// Fires `embedAndPersist("Note", noteId)` ~5 seconds after the user stops editing.
// Coalesces rapid saves so we don't burn embeddings on every keystroke
// (the detail page auto-saves every 1.2s).
//
// `cancelNoteEmbedding(noteId)` clears a pending timer — called from
// `deleteNotePermanent` to avoid firing an embed against a row that's
// about to be deleted. (The outbox's orphan self-heal handles the race
// where the timer fires between cancel-attempt and entity deletion.)
//
// Single-replica safe. If multiple replicas race on the same note, each
// will run its own embedding call — the result is idempotent (last write
// wins on the vector column), at worst a few wasted API calls.
//
// Failures log silently. Embedding is best-effort; the note save path
// never blocks on it.
// ============================================================================
import { embedAndPersist, isEmbeddingEnabled } from "./embedding.service.js";

const DEBOUNCE_MS = 5000;
const timers = new Map();

export function scheduleNoteEmbedding(noteId) {
  if (!noteId) return;
  if (!isEmbeddingEnabled()) return;

  const existing = timers.get(noteId);
  if (existing) clearTimeout(existing);

  const t = setTimeout(async () => {
    timers.delete(noteId);
    try {
      await embedAndPersist("Note", noteId);
    } catch (err) {
      console.error(`[notes.embedding] schedule failed for ${noteId}:`, err.message);
    }
  }, DEBOUNCE_MS);

  // Don't keep the process alive solely for pending embeddings on shutdown.
  if (typeof t.unref === "function") t.unref();
  timers.set(noteId, t);
}

export function cancelNoteEmbedding(noteId) {
  if (!noteId) return false;
  const existing = timers.get(noteId);
  if (!existing) return false;
  clearTimeout(existing);
  timers.delete(noteId);
  console.log(`[notes.embedding:cancelled] noteId=${noteId}`);
  return true;
}
