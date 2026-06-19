import { describe, it, expect } from "vitest"
import { pickFinalTab } from "../../src/utils/pickFinalTab.js"

describe("pickFinalTab", () => {
  it("returns OPTIMIZED tab when only optimized code is filled", () => {
    const result = pickFinalTab({
      code: "def two_sum(nums, target):\n    return []",
      language: "PYTHON",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      optimizedApproach: "Hash map for O(1) lookup",
    })
    expect(result).toEqual({
      tab: "OPTIMIZED",
      code: "def two_sum(nums, target):\n    return []",
      language: "PYTHON",
      time: "O(n)",
      space: "O(n)",
      approach: "Hash map for O(1) lookup",
    })
  })

  it("returns ALTERNATIVE tab when optimized empty but alternative filled", () => {
    const result = pickFinalTab({
      code: null,
      alternativeMeta: {
        code: "function ts(a, t) { return [] }",
        language: "JAVASCRIPT",
        timeComplexity: "O(n log n)",
        spaceComplexity: "O(1)",
      },
      alternativeApproach: "Sort then two-pointer",
    })
    expect(result).toEqual({
      tab: "ALTERNATIVE",
      code: "function ts(a, t) { return [] }",
      language: "JAVASCRIPT",
      time: "O(n log n)",
      space: "O(1)",
      approach: "Sort then two-pointer",
    })
  })

  it("returns BRUTE_FORCE tab when only brute force is filled", () => {
    const result = pickFinalTab({
      code: null,
      alternativeMeta: null,
      bruteForceMeta: {
        code: "def ts(a,t):\n  for i in range(len(a)):\n    for j in range(i+1,len(a)):\n      if a[i]+a[j]==t: return [i,j]",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "Nested loop comparing every pair",
    })
    expect(result.tab).toBe("BRUTE_FORCE")
    expect(result.code).toContain("for i in range")
    expect(result.time).toBe("O(n^2)")
    expect(result.approach).toBe("Nested loop comparing every pair")
  })

  it("returns OPTIMIZED tab when all three are filled (Optimized wins)", () => {
    const result = pickFinalTab({
      code: "optimized()",
      language: "PYTHON",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      optimizedApproach: "opt approach",
      alternativeMeta: { code: "alt()", language: "PYTHON", timeComplexity: "O(n log n)", spaceComplexity: "O(1)" },
      alternativeApproach: "alt approach",
      bruteForceMeta: { code: "brute()", language: "PYTHON", timeComplexity: "O(n^2)", spaceComplexity: "O(1)" },
      bruteForce: "brute approach",
    })
    expect(result.tab).toBe("OPTIMIZED")
    expect(result.code).toBe("optimized()")
  })

  it("returns null tab when no code anywhere", () => {
    const result = pickFinalTab({
      code: null,
      alternativeMeta: null,
      bruteForceMeta: null,
    })
    expect(result).toEqual({
      tab: null,
      code: null,
      language: null,
      time: null,
      space: null,
      approach: null,
    })
  })

  it("treats whitespace-only code as empty", () => {
    const result = pickFinalTab({
      code: "   \n\t  ",
      bruteForceMeta: {
        code: "def real(): return 1",
        language: "PYTHON",
        timeComplexity: "O(1)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "trivial",
    })
    expect(result.tab).toBe("BRUTE_FORCE")
  })

  it("falls back through optimizedApproach → approach when filling approach field", () => {
    const result = pickFinalTab({
      code: "def x(): pass",
      language: "PYTHON",
      timeComplexity: "O(1)",
      spaceComplexity: "O(1)",
      optimizedApproach: null,
      approach: "Generic approach prose",
    })
    expect(result.approach).toBe("Generic approach prose")
  })
})
