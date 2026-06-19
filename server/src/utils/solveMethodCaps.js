const CAPS = {
  SAW_APPROACH: {
    codeCorrectness:       { max: 10, reason: null },
    patternAccuracy:       { max: 5,  reason: "Saw the canonical pattern; didn't recognize it independently" },
    understandingDepth:    { max: 6,  reason: "Reading is shallower than independent reasoning (Karpicke-Roediger 2008)" },
    explanationQuality:    { max: 10, reason: null },
    confidenceCalibration: { max: 10, reason: null },
  },
  HINTS: {
    codeCorrectness:       { max: 10, reason: null },
    patternAccuracy:       { max: 8,  reason: "Used hints; partial credit only on pattern recognition" },
    understandingDepth:    { max: 8,  reason: "Used hints; partial credit only on depth" },
    explanationQuality:    { max: 10, reason: null },
    confidenceCalibration: { max: 10, reason: null },
  },
  COLD: null,
}

/**
 * Clamp dimension scores against per-solveMethod caps.
 *
 * Caps reflect the epistemic gap between the score the LLM gave (based on
 * surface signals — does the code work, is the prose coherent) and what the
 * candidate actually demonstrated (did they recognize the pattern, did they
 * reason about depth independently, vs. transcribing a canonical answer).
 *
 * Returns the (possibly modified) scores plus the list of adjustments
 * applied. Adjustments are emitted only when a cap actually fired.
 *
 * COLD, null, or unknown solveMethod: no caps applied, empty adjustments.
 */
export function applySolveMethodCaps(scores, solveMethod) {
  const caps = CAPS[solveMethod] ?? null
  if (!caps) return { scores, adjustments: [] }

  const adjusted = { ...scores }
  const adjustments = []
  for (const [dim, { max, reason }] of Object.entries(caps)) {
    const v = adjusted[dim]
    if (typeof v === "number" && v > max) {
      adjustments.push({ dimension: dim, fromAI: v, applied: max, reason })
      adjusted[dim] = max
    }
  }
  return { scores: adjusted, adjustments }
}
