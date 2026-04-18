import { Router } from "express";
import { getRecommendations } from "../controllers/recommendations.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/", getRecommendations);

export default router;
