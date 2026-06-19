import { normalizeBigO } from "./optimizationStats.js"

/**
 * Resolve which canonical approach the user implemented and decide whether
 * to surface a discrepancy. Pure, deterministic, no I/O.
 *
 * Inputs:
 *   solution    — { timeComplexity, spaceComplexity, patterns: string[] }
 *   primary     — { pattern, keyInsight, timeComplexity, spaceComplexity }
 *   alternatives — array of { name, pattern, keyInsight, timeComplexity, spaceComplexity }
 *   aiFeedback  — Solution.aiFeedback JSON or null
 *
 * Output:
 *   { matchedApproach: "primary" | "<alt.name>",
 *     discrepancy: null | { type, summary, expected, actual, source } }
 */
export function matchCanonicalApproach({ solution, primary, alternatives, aiFeedback }) {
  const alts = Array.isArray(alternatives) ? alternatives : []

  if (!isTrusted(aiFeedback)) {
    return {
      matchedApproach: "primary",
      discrepancy: buildSolveTimeFlagged(solution, primary, aiFeedback),
    }
  }

  const approaches = [
    { name: "primary", ...primary },
    ...alts.map((a) => ({ ...a })),
  ]

  const userTuple = tupleKey(solution.timeComplexity, solution.spaceComplexity)
  const candidates = approaches.filter(
    (a) => tupleKey(a.timeComplexity, a.spaceComplexity) === userTuple,
  )

  if (candidates.length === 0) {
    return {
      matchedApproach: "primary",
      discrepancy: buildOffCanonical(solution, primary),
    }
  }

  let chosen
  if (candidates.length === 1) {
    chosen = candidates[0]
  } else {
    chosen =
      candidates.find((c) => patternsOverlap(c.pattern, solution.patterns)) ||
      candidates[0]
  }

  if (!patternsOverlap(chosen.pattern, solution.patterns)) {
    return {
      matchedApproach: chosen.name,
      discrepancy: buildPatternMislabel(solution, chosen),
    }
  }

  return { matchedApproach: chosen.name, discrepancy: null }
}

function tupleKey(time, space) {
  return `${normalizeBigO(time)}|${normalizeBigO(space)}`
}

function patternsOverlap(canonicalPattern, userPatterns) {
  const canonical = tokenizePattern(canonicalPattern)
  const user = (userPatterns || []).flatMap(tokenizePattern)
  if (canonical.length === 0 || user.length === 0) return false
  const userSet = new Set(user)
  return canonical.some((t) => userSet.has(t))
}

function tokenizePattern(s) {
  if (typeof s !== "string") return []
  return s
    .toLowerCase()
    .split(/[\s/&,-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function fmtComplexity(time, space) {
  const t = time || "—"
  const s = space || "—"
  return `T: ${t} · S: ${s}`
}

function buildOffCanonical(solution, primary) {
  return {
    type: "off_canonical",
    summary:
      "Your stored notes don't match any valid approach for this problem. Your original solution may be suboptimal.",
    expected: {
      pattern: primary.pattern || "—",
      complexity: fmtComplexity(primary.timeComplexity, primary.spaceComplexity),
    },
    actual: {
      pattern: (solution.patterns || []).join(", ") || "—",
      complexity: fmtComplexity(solution.timeComplexity, solution.spaceComplexity),
    },
    source: "structural",
  }
}

function buildPatternMislabel(solution, chosen) {
  const userLabel = (solution.patterns || []).join(", ") || "—"
  return {
    type: "pattern_mislabel",
    summary: `Your notes labeled this "${userLabel}", but the canonical pattern is "${chosen.pattern}". Same approach, mislabeled.`,
    expected: {
      pattern: chosen.pattern,
      complexity: fmtComplexity(chosen.timeComplexity, chosen.spaceComplexity),
    },
    actual: {
      pattern: userLabel,
      complexity: fmtComplexity(solution.timeComplexity, solution.spaceComplexity),
    },
    source: "structural",
  }
}

function isTrusted(aiFeedback) {
  if (!aiFeedback || typeof aiFeedback !== "object") return true
  if (aiFeedback.flags?.wrongPattern === true) return false
  if (aiFeedback.complexityCheck?.timeCorrect === false) return false
  if (aiFeedback.complexityCheck?.spaceCorrect === false) return false
  return true
}

function buildSolveTimeFlagged(solution, primary, aiFeedback) {
  const cc = aiFeedback?.complexityCheck
  const flags = aiFeedback?.flags
  const reasons = []
  if (flags?.wrongPattern === true) {
    const claimed = (solution.patterns || []).join(", ") || "—"
    const correct = flags.correctPattern || primary.pattern || "the canonical pattern"
    reasons.push(`AI flagged your stored pattern (you tagged "${claimed}", canonical is "${correct}")`)
  }
  if (cc?.timeCorrect === false || cc?.spaceCorrect === false) {
    const aiRead = fmtComplexity(cc?.timeComplexity, cc?.spaceComplexity)
    const stored = fmtComplexity(solution.timeComplexity, solution.spaceComplexity)
    reasons.push(`AI flagged your stored complexity at solve time (you stored ${stored}, AI read ${aiRead})`)
  }
  const reasonText = reasons.length > 0 ? reasons.join("; ") : "AI flagged your stored solution at solve time"
  return {
    type: "solve_time_flagged",
    summary: `${reasonText}. Grading against the canonical primary.`,
    expected: {
      pattern: primary.pattern || "—",
      complexity: fmtComplexity(primary.timeComplexity, primary.spaceComplexity),
    },
    actual: {
      pattern: (solution.patterns || []).join(", ") || "—",
      complexity: fmtComplexity(solution.timeComplexity, solution.spaceComplexity),
    },
    source: "ai_solve_time",
  }
}
