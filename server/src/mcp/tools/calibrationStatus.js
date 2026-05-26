// ============================================================================
// MCP tool — get_calibration_status
// ============================================================================
//
// Returns the user's D10 (Verification & Meta-cognition) calibration data.
// Calibration is the durable LLM-era skill — it answers "how well does
// your self-assessment track ground truth?"
//
// LLM use:
//   "How calibrated is my self-assessment?"
//   "Am I overconfident on coding correctness?"
//   "What's my calibration delta?"
//
// PRIVACY/SECURITY:
//   - Reads from get6DReport's analytics.verification block (D10 v2 path)
//   - Surfaces sub-component scores: calibration_accuracy,
//     complexity_verification, pattern_accuracy, probe_defense, edge_case
//   - Returns activation message when D10 flag is off OR fewer than 5
//     AI-reviewed solutions
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { get6DReport } from "../../controllers/stats.controller.js";

const inputSchema = z.object({}).strict();

async function handler() {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      content: [
        {
          type: "text",
          text: "No active team context. Switch to a team in the web UI before querying calibration status.",
        },
      ],
      isError: true,
    };
  }

  const captured = await callController(get6DReport, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
  });

  const report = captured?.data?.report;
  const verification = report?.analytics?.verification;
  const d10 = (report?.dimensions || []).find((d) => d.key === "verificationMetacognition");

  if (!verification) {
    return {
      content: [
        {
          type: "text",
          text:
            d10?.activationMessage ||
            "D10 (Verification & Meta-cognition) is not active. " +
            "It activates with FEATURE_VERIFICATION_METACOGNITION=true and ≥5 AI-reviewed coding solutions.",
        },
      ],
      isError: false,
    };
  }

  // Build a verbose-but-bounded shape with all the meta-cognitive signals.
  const summary = {
    score: verification.score ?? null,
    ci: Array.isArray(verification.ci) && verification.ci.length === 2
      ? [verification.ci[0], verification.ci[1]]
      : null,
    source_quality: verification.sourceQuality ?? null,
    ceiling: verification.ceiling ?? null,
    sample_sizes: {
      ai_reviews: verification.reviewCount ?? 0,
      calibration_data_points: verification.calibrationN ?? 0,
      complexity_check_rows: verification.complexityCheckCount ?? 0,
      follow_up_evaluations: verification.followUpCount ?? 0,
      mocks_with_signals: verification.mockCount ?? 0,
    },
    calibration: {
      delta: verification.calibrationDelta ?? null, // 0..1 — smaller is better (Kruger-Dunning)
      score: verification.calibrationScore ?? null, // 0..100 — higher is better
    },
    sub_components: {
      complexity_verification: verification.complexityScore ?? null,
      pattern_accuracy: verification.patternAccuracyScore ?? null,
      probe_defense: verification.probeDefenseScore ?? null,
      edge_case_independence: verification.edgeCaseScore ?? null,
    },
    flags: {
      wrong_pattern_count: verification.wrongPatternCount ?? 0,
    },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
  };
}

export function register(server) {
  server.registerTool(
    "get_calibration_status",
    {
      title: "Get calibration status (D10)",
      description:
        "Get the user's D10 Verification & Meta-cognition data — the durable LLM-era skill " +
        "that measures how well their self-assessment tracks ground truth (Kruger-Dunning). " +
        "Returns: calibration delta (0..1, smaller=better), source-quality tier, sub-component " +
        "scores (complexity verification, pattern accuracy, probe defense, edge-case independence), " +
        "and sample-size counts. Use for 'am I overconfident?' or 'how do I read my calibration gap?'. " +
        "Returns activation message when D10 flag is off or sample size insufficient (<5 AI reviews).",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}
