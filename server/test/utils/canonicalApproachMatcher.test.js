import { describe, it, expect } from "vitest"
import { matchCanonicalApproach } from "../../src/utils/canonicalApproachMatcher.js"

const climbingPrimary = {
  pattern: "Dynamic Programming",
  keyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
}

const memoizedAlt = {
  name: "Memoized recursion",
  pattern: "Dynamic Programming",
  keyInsight: "Cache subproblem results.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
}

describe("matchCanonicalApproach — trusted + structural match", () => {
  it("matches the alternative when notes complexity equals an alt", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("Memoized recursion")
    expect(result.discrepancy).toBeNull()
  })

  it("matches primary when notes complexity equals primary", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy).toBeNull()
  })

  it("normalizes big-O variants (O(n^2) ≡ O(n²) ≡ O(n*n))", () => {
    const altQuadratic = {
      ...memoizedAlt,
      name: "Brute force",
      timeComplexity: "O(n^2)",
      spaceComplexity: "O(1)",
    }
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n²)",
        spaceComplexity: "O(1)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [altQuadratic],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("Brute force")
    expect(result.discrepancy).toBeNull()
  })
})

describe("matchCanonicalApproach — off_canonical", () => {
  it("falls back to primary when no approach matches by complexity", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(n)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy).not.toBeNull()
    expect(result.discrepancy.type).toBe("off_canonical")
    expect(result.discrepancy.expected.complexity).toBe("T: O(n) · S: O(1)")
    expect(result.discrepancy.actual.complexity).toBe("T: O(n^2) · S: O(n)")
    expect(result.discrepancy.source).toBe("structural")
  })

  it("falls back to primary when only primary exists and notes don't match", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n log n)",
        spaceComplexity: "O(1)",
        patterns: ["Sorting"],
      },
      primary: climbingPrimary,
      alternatives: [],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("off_canonical")
  })
})

describe("matchCanonicalApproach — pattern_mislabel", () => {
  it("matches by complexity but flags pattern mismatch", () => {
    const slidingPrimary = {
      pattern: "Sliding Window",
      keyInsight: "Two pointers + running aggregate.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    }
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Array"],
      },
      primary: slidingPrimary,
      alternatives: [],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("pattern_mislabel")
    expect(result.discrepancy.expected.pattern).toBe("Sliding Window")
    expect(result.discrepancy.actual.pattern).toBe("Array")
  })

  it("treats Array / Hashing as overlapping with Hashing (token intersection)", () => {
    const hashPrimary = {
      pattern: "Hashing",
      keyInsight: "Use a hash map.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    }
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Array / Hashing"],
      },
      primary: hashPrimary,
      alternatives: [],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy).toBeNull()
  })
})

describe("matchCanonicalApproach — tie-break", () => {
  it("picks the alt whose pattern matches the user's patterns when complexity ties", () => {
    const primary = {
      pattern: "Dynamic Programming",
      keyInsight: "DP",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    }
    const recursionAlt = {
      name: "Recursion with memo",
      pattern: "Recursion",
      keyInsight: "memo",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    }
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Recursion"],
      },
      primary,
      alternatives: [recursionAlt],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("Recursion with memo")
    expect(result.discrepancy).toBeNull()
  })
})

describe("matchCanonicalApproach — solve_time_flagged (TRUST gate)", () => {
  const validSolution = {
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    patterns: ["Dynamic Programming"],
  }

  it("forces primary when aiFeedback.flags.wrongPattern is true", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        flags: {
          wrongPattern: true,
          identifiedPattern: "Recursion",
          correctPattern: "Dynamic Programming",
        },
      },
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("solve_time_flagged")
    expect(result.discrepancy.source).toBe("ai_solve_time")
  })

  it("forces primary when complexityCheck.timeCorrect is false", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        complexityCheck: {
          timeCorrect: false,
          spaceCorrect: true,
          timeComplexity: "O(n^2)",
          spaceComplexity: "O(n)",
        },
      },
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("solve_time_flagged")
  })

  it("forces primary when complexityCheck.spaceCorrect is false", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        complexityCheck: {
          timeCorrect: true,
          spaceCorrect: false,
        },
      },
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("solve_time_flagged")
  })

  it("trusts notes when aiFeedback flags are clean (timeCorrect=true, spaceCorrect=true, wrongPattern=false)", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        flags: { wrongPattern: false },
        complexityCheck: { timeCorrect: true, spaceCorrect: true },
      },
    })
    expect(result.matchedApproach).toBe("Memoized recursion")
    expect(result.discrepancy).toBeNull()
  })

  it("trusts notes when aiFeedback is null (no signal)", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("Memoized recursion")
  })

  it("trusts notes when aiFeedback fields are missing (legacy graceful)", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: { someOtherField: "value" },
    })
    expect(result.matchedApproach).toBe("Memoized recursion")
  })

  it("trusts notes when aiFeedback is passed as a raw array (defensive — caller must normalize)", () => {
    // The controller normalizes Solution.aiFeedback before calling. If a caller forgets,
    // the matcher should treat the array as no-signal (trust=true), not as a flagged record.
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: [
        {
          flags: { wrongPattern: true },
          complexityCheck: { timeCorrect: false, spaceCorrect: false },
        },
      ],
    })
    expect(result.matchedApproach).toBe("Memoized recursion")
    expect(result.discrepancy).toBeNull()
  })

  it("solve_time_flagged: summary includes both wrongPattern and complexity reasons when both fire", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Recursion"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        flags: { wrongPattern: true, correctPattern: "Dynamic Programming" },
        complexityCheck: {
          timeCorrect: false,
          spaceCorrect: true,
          timeComplexity: "O(n^2)",
          spaceComplexity: "O(n)",
        },
      },
    })
    expect(result.discrepancy.type).toBe("solve_time_flagged")
    expect(result.discrepancy.summary).toContain("AI flagged your stored pattern")
    expect(result.discrepancy.summary).toContain("AI flagged your stored complexity")
  })
})

describe("matchCanonicalApproach — malformed input safety", () => {
  it("treats solution with missing complexity as off_canonical (no false match)", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: null,
        spaceComplexity: null,
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("off_canonical")
  })

  it("does not match an alternative with missing complexity even when user's is also missing", () => {
    const altMissing = {
      name: "Malformed alt",
      pattern: "Dynamic Programming",
      keyInsight: "x",
      timeComplexity: null,
      spaceComplexity: null,
    }
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: null,
        spaceComplexity: null,
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [altMissing],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy.type).toBe("off_canonical")
  })
})

describe("matchCanonicalApproach — defensive: missing canonical pattern", () => {
  it("does not flag pattern_mislabel when matched approach has empty pattern", () => {
    const primaryNoPattern = {
      pattern: "",
      keyInsight: "x",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    }
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Array"],
      },
      primary: primaryNoPattern,
      alternatives: [],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy).toBeNull()
  })
})

describe("matchCanonicalApproach — defensive: null/missing primary", () => {
  it("returns matchedApproach='primary' with no discrepancy when primary is null", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Array"],
      },
      primary: null,
      alternatives: [],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy).toBeNull()
  })

  it("returns matchedApproach='primary' with no discrepancy when primary is undefined", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Array"],
      },
      primary: undefined,
      alternatives: [],
      aiFeedback: null,
    })
    expect(result.matchedApproach).toBe("primary")
    expect(result.discrepancy).toBeNull()
  })
})
