// ============================================================================
// Eval entry point — note-summary surface
// ============================================================================
//
// Run: `npm run eval:notes` from server/.
//
// Loads the golden set, runs every item through the note-summary surface,
// computes basic + validation metrics, prints summary, saves report.
// ============================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEval } from "../runner.js";
import { run as runSurface } from "../surfaces/note-summary.js";
import { basicMetrics } from "../metrics/basic.js";
import { validationMetrics } from "../metrics/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const goldenSetPath = path.resolve(
  __dirname,
  "..",
  "golden-sets",
  "note-summary.json",
);

// Sequential is the safer default. Bump concurrency to 3 once you trust
// the harness and your daily rate-limit headroom is comfortable.
await runEval({
  name: "note-summary",
  goldenSetPath,
  surface: runSurface,
  metrics: {
    basic: basicMetrics,
    validation: validationMetrics,
  },
  concurrency: 1,
});
