// ============================================================================
// Learn-AI routes — REST proxy over the external Python MCP server.
// ============================================================================
//
// Mounted via mountRoutes() in src/index.js, gated by LEARN_AI_ENABLED so the
// router is only registered when the feature is on. All routes require a
// valid JWT (authenticate). `read_chunk` additionally requires SUPER_ADMIN
// because it returns full chunk text (file-content leak).
//
// Body validation lives in schemas/learnAi.schema.js. The controllers are
// thin wrappers around services/mcp.service.js::callMcpTool.
// ============================================================================

import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/superAdmin.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  searchCodeSchema,
  searchDocsSchema,
  findSimilarSchema,
  explainSymbolSchema,
  recentChangesSchema,
  readChunkSchema,
  deepExplainSchema,
} from "../schemas/learnAi.schema.js";
import {
  searchCode,
  searchDocs,
  findSimilar,
  explainSymbol,
  recentChanges,
  readChunk,
  deepExplain,
} from "../controllers/learnAi.controller.js";

const router = Router();

router.use(authenticate);

router.post("/search-code", validate(searchCodeSchema), searchCode);
router.post("/search-docs", validate(searchDocsSchema), searchDocs);
router.post("/find-similar", validate(findSimilarSchema), findSimilar);
router.post("/explain-symbol", validate(explainSymbolSchema), explainSymbol);
router.post("/recent-changes", validate(recentChangesSchema), recentChanges);
router.post("/deep-explain", validate(deepExplainSchema), deepExplain);

// SuperAdmin-only — full chunk text is a file-content leak vector.
router.post(
  "/read-chunk",
  requireSuperAdmin,
  validate(readChunkSchema),
  readChunk,
);

export default router;
