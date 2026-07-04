// ============================================================================
// Curriculum Templates — Sync Controller (SUPER_ADMIN only)
// ============================================================================
//
// Thin wrapper over `curriculumSync.service.js`. Reads two inputs from the
// request:
//   - `?dryRun=true|false` query param → forwards to the service. Default
//     false. Parsed loose-truthy so `?dryRun=1`/`?dryRun=TRUE` also work.
//   - `req.body.root` (optional) → override the curriculum root directory.
//     Used by the integration test to point at `test/fixtures/curriculum-sync`
//     instead of the real `server/curriculum/` tree. Resolved against
//     `process.cwd()` so relative paths like `test/fixtures/…` work.
//     Undefined here means the service falls back to its own default
//     (`<cwd>/curriculum`).
//
// Errors from the service are wrapped in a standard 500 with a stable
// `SYNC_FAILED` code so callers can distinguish sync failures from other
// 500s (e.g. auth internal errors, which have their own codes).
// ============================================================================

import path from "path";
import { syncCurriculumTemplates } from "../services/curriculumSync.service.js";
import { success, error } from "../utils/response.js";

export async function syncTemplates(req, res) {
  const dryRun = String(req.query.dryRun ?? "false").toLowerCase() === "true";
  const rootRaw = req.body?.root;
  const root = rootRaw ? path.resolve(process.cwd(), rootRaw) : undefined;

  try {
    const diff = await syncCurriculumTemplates({ root, dryRun });
    return success(res, diff);
  } catch (err) {
    return error(res, err.message, 500, "SYNC_FAILED");
  }
}
