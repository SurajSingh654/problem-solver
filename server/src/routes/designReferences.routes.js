// ============================================================================
// Design References routes
// ============================================================================
// Learner reads any reference they can see a Problem for. Mutations are
// admin-only — reference content is curated pedagogy, not UGC.
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAnyAdmin } from "../middleware/superAdmin.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import {
  listReferences,
  getReference,
  createReference,
  updateReference,
  deleteReference,
} from "../controllers/designReferences.controller.js";

const router = Router();

router.use(authenticate);
// H1 fix (Sprint 3.1): requireTeamContext (strict), replacing the prior
// optional-team variant. Logged-in users without a team now get 403
// NO_TEAM_CONTEXT instead of pass-through with req.teamId === null (which
// previously let the controller's missing teamId filter leak references
// across teams).
router.use(requireTeamContext);

// Learner-accessible
router.get("/", listReferences);
router.get("/:id", getReference);

// Admin-only mutations
router.post("/", requireAnyAdmin, createReference);
router.patch("/:id", requireAnyAdmin, updateReference);
router.delete("/:id", requireAnyAdmin, deleteReference);

export default router;
