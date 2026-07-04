#!/usr/bin/env node
// ============================================================================
// curriculum-sync — CLI wrapper over syncCurriculumTemplates()
// ============================================================================
//
// Local sibling of `POST /api/v1/super-admin/curriculum/templates/sync`.
// Meant for authors editing the `server/curriculum/` tree in a checkout, and
// for the eventual pre-deploy step that syncs the tree to prod.
//
// Usage (from `server/`):
//   npm run curriculum:sync            # writes to DB
//   npm run curriculum:sync:dry        # dry-run — prints diff only
//
// Root is always resolved as `<cwd>/curriculum`, so running the script from
// `server/` picks up `server/curriculum/`. The script does NOT accept a
// `--root` flag by design: prod syncs must target the canonical location.
// ============================================================================

import path from "path";
import { syncCurriculumTemplates } from "../src/services/curriculumSync.service.js";

const dryRun = process.argv.includes("--dry-run");
const root = path.resolve(process.cwd(), "curriculum");

console.log(`[curriculum-sync] root=${root} dryRun=${dryRun}`);

try {
  const diff = await syncCurriculumTemplates({ root, dryRun });
  console.log(JSON.stringify(diff, null, 2));
  console.log("[curriculum-sync] done");
  process.exit(0);
} catch (err) {
  console.error("[curriculum-sync] FAILED:", err.message);
  process.exit(1);
}
