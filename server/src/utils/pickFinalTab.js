function hasCode(s) {
  return typeof s === "string" && s.trim().length > 0
}

/**
 * Choose the canonical "final answer" tab from a CODING-category solution.
 *
 * Priority: Optimized > Alternative > BruteForce. Returns null tab when no
 * tab has code, so the caller can route to "No code provided" / incomplete.
 *
 * Pure, no I/O.
 */
export function pickFinalTab(solution) {
  if (hasCode(solution?.code)) {
    return {
      tab: "OPTIMIZED",
      code: solution.code,
      language: solution.language ?? null,
      time: solution.timeComplexity ?? null,
      space: solution.spaceComplexity ?? null,
      approach: solution.optimizedApproach || solution.approach || null,
    }
  }
  if (hasCode(solution?.alternativeMeta?.code)) {
    const m = solution.alternativeMeta
    return {
      tab: "ALTERNATIVE",
      code: m.code,
      language: m.language ?? null,
      time: m.timeComplexity ?? null,
      space: m.spaceComplexity ?? null,
      approach: solution.alternativeApproach || null,
    }
  }
  if (hasCode(solution?.bruteForceMeta?.code)) {
    const m = solution.bruteForceMeta
    return {
      tab: "BRUTE_FORCE",
      code: m.code,
      language: m.language ?? null,
      time: m.timeComplexity ?? null,
      space: m.spaceComplexity ?? null,
      approach: solution.bruteForce || null,
    }
  }
  return { tab: null, code: null, language: null, time: null, space: null, approach: null }
}
