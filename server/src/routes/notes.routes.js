// ============================================================================
// ProbSolver — Notes Routes (P0)
// ============================================================================
//
// Mounted via mountRoutes() in src/index.js. Personal-only — uses
// `authenticate` middleware only, NOT requireTeamContext, so notes
// survive team switches and never depend on team status.
//
// The whole router is gated by FEATURE_NOTES_ENABLED upstream — when off,
// it isn't registered at all.
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import {
  createNote,
  listNotes,
  getNote,
  updateNote,
  archiveNote,
  deleteNotePermanent,
  restoreNote,
  togglePin,
  listNotesByEntity,
  searchLinkableEntities,
  listTags,
  getRelatedForNote,
  generateNoteSummary,
  suggestNoteTags,
  generateNoteFlashcards,
  duplicateNote,
} from "../controllers/notes.controller.js";
import {
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from "../controllers/notesFolders.controller.js";

const router = Router();

router.use(authenticate);

router.post("/", createNote);
router.get("/", listNotes);

// Static paths must come before the dynamic `/:id` route so they win
// routing precedence.
router.get("/folders", listFolders);
router.post("/folders", createFolder);
router.patch("/folders/:id", updateFolder);
router.delete("/folders/:id", deleteFolder);
router.get("/link-search", searchLinkableEntities);
router.get("/tags", listTags);
router.get("/by-entity/:type/:id", listNotesByEntity);

router.get("/:id", getNote);
router.get("/:id/related", aiLimiter, getRelatedForNote);
router.post("/:id/ai/summary", aiLimiter, generateNoteSummary);
router.post("/:id/ai/suggest-tags", aiLimiter, suggestNoteTags);
router.post("/:id/ai/flashcards", aiLimiter, generateNoteFlashcards);
router.patch("/:id", updateNote);
router.delete("/:id", archiveNote);
router.delete("/:id/permanent", deleteNotePermanent);
router.post("/:id/restore", restoreNote);
router.post("/:id/pin", togglePin);
router.post("/:id/duplicate", duplicateNote);

export default router;
