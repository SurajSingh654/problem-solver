// ============================================================================
// ProbSolver — Flashcards Routes (P5)
// ============================================================================
//
// Personal-only — `authenticate` middleware only, no requireTeamContext.
// Mounted in src/index.js inside the FEATURE_NOTES_ENABLED gate (the
// flashcards feature ships behind the same flag as Notes).
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  createFlashcards,
  listFlashcards,
  getFlashcardQueue,
  updateFlashcard,
  archiveFlashcard,
  reviewFlashcard,
  getFlashcardStats,
} from "../controllers/flashcards.controller.js";

const router = Router();

router.use(authenticate);

router.post("/", createFlashcards);
router.get("/", listFlashcards);

// Static paths before dynamic.
router.get("/queue", getFlashcardQueue);
router.get("/stats", getFlashcardStats);

router.patch("/:id", updateFlashcard);
router.delete("/:id", archiveFlashcard);
router.post("/:id/review", reviewFlashcard);

export default router;
