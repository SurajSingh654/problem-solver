// ============================================================================
// Calibration question banks — topic-slug → questions[] registry.
// ============================================================================
//
// Adding a calibration for another Topic is a one-line addition here. The
// controller looks up by Topic.slug; an unknown slug returns 404.
// ============================================================================

import aiEngineering from "./aiEngineering.questions.js";

export const CALIBRATION_BANKS = {
  "ai-engineering": aiEngineering,
};
