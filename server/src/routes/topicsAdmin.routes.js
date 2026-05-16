// ============================================================================
// Topic Mastery Tracks — Admin Routes (SuperAdmin-only)
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/superAdmin.middleware.js";
import {
  listTopicsAdmin,
  getTopicAdmin,
  updateTopicAdmin,
  createConceptAdmin,
  updateConceptAdmin,
  deleteConceptAdmin,
  addPrereqAdmin,
  removePrereqAdmin,
} from "../controllers/topicsAdmin.controller.js";

const router = Router();

router.use(authenticate, requireSuperAdmin);

router.get("/topics", listTopicsAdmin);
router.get("/topics/:slug", getTopicAdmin);
router.patch("/topics/:slug", updateTopicAdmin);

router.post("/topics/:slug/concepts", createConceptAdmin);
router.patch("/concepts/:id", updateConceptAdmin);
router.delete("/concepts/:id", deleteConceptAdmin);

router.post("/concepts/:id/prereqs", addPrereqAdmin);
router.delete("/concepts/:id/prereqs/:depId", removePrereqAdmin);

export default router;
