import { Router } from "express";
import {
  startSession,
  useHint,
  completeSession,
  abandonSession,
  getMySessions,
  getSession,
} from "../controllers/sim.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);

router.post("/", startSession);
router.get("/my", getMySessions);
router.get("/:id", getSession);
router.patch("/:id/hint", useHint);
router.patch("/:id/complete", completeSession);
router.patch("/:id/abandon", abandonSession);

export default router;
