// ============================================================================
// Curriculum Templates — Admin sync route (SUPER_ADMIN only)
// ============================================================================
//
// Mounted at `${prefix}/super-admin` (see `mountRoutes()` in `src/index.js`),
// giving the canonical path:
//
//   POST /api/v1/super-admin/curriculum/templates/sync[?dryRun=true]
//
// Auth chain: `authenticate` → `requireSuperAdmin` covers both 401 (no token)
// and 403 (non-SUPER_ADMIN token) at the router level, so the controller can
// assume the caller is trusted.
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/superAdmin.middleware.js";
import { syncTemplates } from "../controllers/curriculumTemplates.controller.js";

const router = Router();

router.use(authenticate, requireSuperAdmin);
router.post("/curriculum/templates/sync", syncTemplates);

export default router;
