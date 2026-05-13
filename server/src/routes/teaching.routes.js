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
} from "../controllers/teaching.controller.js";

const router = Router();

router.use(authenticate);
router.use(requireTeamContext);

router.post("/", createTeachingSession);
router.get("/", listTeachingSessions);
router.get("/:id", getTeachingSession);
router.patch("/:id", updateTeachingSession);
router.delete("/:id", cancelTeachingSession);
router.post("/:id/start", startTeachingSession);
router.post("/:id/end", endTeachingSession);
router.post("/:id/cancel", cancelTeachingSession);
router.post("/:id/join", joinTeachingSession);
router.post("/:id/leave", leaveTeachingSession);

export default router;
