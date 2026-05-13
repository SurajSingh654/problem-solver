// ============================================================================
// Design References routes
// ============================================================================
// Learner reads any reference they can see a Problem for. Mutations are
// admin-only — reference content is curated pedagogy, not UGC.
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAnyAdmin } from "../middleware/superAdmin.middleware.js";
import { optionalTeamContext } from "../middleware/team.middleware.js";
import {
  listReferences,
  getReference,
  createReference,
  updateReference,
  deleteReference,
} from "../controllers/designReferences.controller.js";

const router = Router();

router.use(authenticate);
router.use(optionalTeamContext);

// Learner-accessible
router.get("/", listReferences);
router.get("/:id", getReference);

// Admin-only mutations
router.post("/", requireAnyAdmin, createReference);
router.patch("/:id", requireAnyAdmin, updateReference);
router.delete("/:id", requireAnyAdmin, deleteReference);

export default router;
