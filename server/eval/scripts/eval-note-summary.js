// ============================================================================
// Eval entry point — note-summary surface
// ============================================================================
//
// Run: `npm run eval:notes` from server/.
// Or:  `EVAL_JUDGE=1 npm run eval:notes` to add the LLM-as-judge groundedness
//                                         metric (slower, costs gpt-4o calls).
//
// Loads the golden set, runs every item through the note-summary surface,
// computes basic + validation metrics (always) and groundedness (opt-in),
// prints summary, saves report.
// ============================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEval } from "../runner.js";
import { run as runSurface } from "../surfaces/note-summary.js";
import { basicMetrics } from "../metrics/basic.js";
import { validationMetrics } from "../metrics/validation.js";
import { groundednessJudge } from "../judges/groundedness.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const goldenSetPath = path.resolve(
  __dirname,
  "..",
  "golden-sets",
  "note-summary.json",
);

const useJudge = process.env.EVAL_JUDGE === "1";
const metrics = {
  basic: basicMetrics,
  validation: validationMetrics,
  ...(useJudge ? { groundedness: groundednessJudge } : {}),
};

if (useJudge) {
  console.log(
    "(EVAL_JUDGE=1) Running with LLM-as-judge groundedness metric — this adds one gpt-4o call per ok item.",
  );
}

// Sequential is the safer default. Bump concurrency to 3 once you trust
// the harness and your daily rate-limit headroom is comfortable.
await runEval({
  name: "note-summary",
  goldenSetPath,
  surface: runSurface,
  metrics,
  concurrency: 1,
});
