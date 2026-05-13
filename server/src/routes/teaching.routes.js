// ============================================================================
// ProbSolver — Team Teaching Sessions Routes
// ============================================================================
//
// Mounted via mountRoutes() in src/index.js so the routes are available
// at both /api/v1/teaching and /api/teaching. The whole router is
// gated by FEATURE_TEACHING_SESSIONS upstream — when off, the router
// isn't registered at all.
//
// Phase shape:
//   P0 (this file): create / list / detail / patch / cancel /
//                   start / end
//   P1: live-room WS handlers (separate file, websocket.service.js)
//       + REST /:id/join + /:id/leave
//   P2: /:id/rate, /:id/flag, /admin/flags*
//   P3: /:id/notes (kicks off AI surfaces)
// ============================================================================
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import {
  createTeachingSession,
  listTeachingSessions,
  getTeachingSession,
  updateTeachingSession,
  cancelTeachingSession,
  startTeachingSession,
  endTeachingSession,
  joinTeachingSession,
  leaveTeachingSession,
  rateTeachingSession,
  flagTeachingSession,
  listTeachingFlags,
  dismissTeachingFlag,
  upholdTeachingFlag,
} from "../controllers/teaching.controller.js";

const router = Router();

router.use(authenticate);
router.use(requireTeamContext);

router.post("/", createTeachingSession);
router.get("/", listTeachingSessions);

// Admin queue lives at /teaching/admin/flags*. Mount before the dynamic
// `/:id` routes so the static path wins routing precedence.
router.get("/admin/flags", listTeachingFlags);
router.post("/admin/flags/:flagId/dismiss", dismissTeachingFlag);
router.post("/admin/flags/:flagId/uphold", upholdTeachingFlag);

router.get("/:id", getTeachingSession);
router.patch("/:id", updateTeachingSession);
router.delete("/:id", cancelTeachingSession);
router.post("/:id/start", startTeachingSession);
router.post("/:id/end", endTeachingSession);
router.post("/:id/cancel", cancelTeachingSession);
router.post("/:id/join", joinTeachingSession);
router.post("/:id/leave", leaveTeachingSession);
router.post("/:id/rate", rateTeachingSession);
router.post("/:id/flag", flagTeachingSession);

export default router;
