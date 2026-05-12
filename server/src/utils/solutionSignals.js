// ============================================================================
// Solution content signals — category-aware
// ============================================================================
//
// Different categories store their "main content" in different places:
//
//   CODING                      → generic columns (approach, keyInsight, code…)
//   HR, BEHAVIORAL,
//   CS_FUNDAMENTALS, SQL        → categorySpecificData JSON
//
// Analytics / stats that count "has reflective content" or "has code" need
// to ask per-category what the right signal is. These helpers centralize
// that logic so every counter agrees on what "content present" means.
//
// Legacy rows (submitted before the split) may have both places populated;
// the helpers tolerate that by falling back to generic columns if
// categorySpecificData is empty.
// ============================================================================

const CODING_FIRST_CATEGORIES = new Set(["CODING"]);

export function isCodingSolution(solution) {
  const category = solution?.problem?.category;
  return !category || CODING_FIRST_CATEGORIES.has(category);
}

function hasNonEmptyCsd(csd) {
  if (!csd || typeof csd !== "object") return false;
  return Object.values(csd).some(
    (v) => typeof v === "string" && v.trim().length > 20,
  );
}

function hasGenericReflection(solution) {
  return !!(
    solution?.keyInsight?.trim?.() ||
    solution?.feynmanExplanation?.trim?.()
  );
}

/**
 * Does this solution contain reflective / depth content appropriate to its
 * category? Used by product-health and skill counters that were previously
 * reading only generic columns globally.
 */
export function hasReflectiveContent(solution) {
  if (isCodingSolution(solution)) return hasGenericReflection(solution);
  // Non-CODING: categorySpecificData is canonical, but fall back to
  // generic columns for truly-legacy rows (pre-categorySpecificData).
  return hasNonEmptyCsd(solution?.categorySpecificData) || hasGenericReflection(solution);
}

/**
 * Does this solution have code? Only meaningful for CODING. Non-CODING
 * submissions never have code and shouldn't count toward this denominator.
 */
export function hasCodeSignal(solution) {
  return isCodingSolution(solution) && !!solution?.code?.trim?.();
}

/**
 * Does this CODING solution show both brute-force and optimized approaches?
 * Not meaningful for non-CODING categories.
 */
export function hasBothApproaches(solution) {
  if (!isCodingSolution(solution)) return false;
  const bf = solution?.bruteForce?.trim?.();
  const opt = solution?.optimizedApproach?.trim?.();
  return !!(bf && bf.length > 20 && opt && opt.length > 20);
}
