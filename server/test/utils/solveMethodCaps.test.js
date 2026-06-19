import { describe, it, expect } from "vitest"
import { applySolveMethodCaps } from "../../src/utils/solveMethodCaps.js"

const fullScores = () => ({
  codeCorrectness: 10,
  patternAccuracy: 9,
  understandingDepth: 8,
  explanationQuality: 9,
  confidenceCalibration: 7,
})

describe("applySolveMethodCaps — COLD / null / unknown", () => {
  it("returns scores unchanged and empty adjustments for COLD", () => {
    const scores = fullScores()
    const result = applySolveMethodCaps(scores, "COLD")
    expect(result.scores).toEqual(scores)
    expect(result.adjustments).toEqual([])
  })

  it("returns scores unchanged for null solveMethod (legacy)", () => {
    const scores = fullScores()
    const result = applySolveMethodCaps(scores, null)
    expect(result.scores).toEqual(scores)
    expect(result.adjustments).toEqual([])
  })

  it("returns scores unchanged for unknown solveMethod string", () => {
    const scores = fullScores()
    const result = applySolveMethodCaps(scores, "MYSTERY")
    expect(result.scores).toEqual(scores)
    expect(result.adjustments).toEqual([])
  })
})

describe("applySolveMethodCaps — SAW_APPROACH", () => {
  it("caps patternAccuracy at 5 and understandingDepth at 6", () => {
    const result = applySolveMethodCaps(fullScores(), "SAW_APPROACH")
    expect(result.scores).toEqual({
      codeCorrectness: 10,
      patternAccuracy: 5,
      understandingDepth: 6,
      explanationQuality: 9,
      confidenceCalibration: 7,
    })
    expect(result.adjustments).toHaveLength(2)
  })

  it("emits adjustment entries with reason text and from/applied", () => {
    const result = applySolveMethodCaps(fullScores(), "SAW_APPROACH")
    const pa = result.adjustments.find((a) => a.dimension === "patternAccuracy")
    const ud = result.adjustments.find((a) => a.dimension === "understandingDepth")
    expect(pa.fromAI).toBe(9)
    expect(pa.applied).toBe(5)
    expect(pa.reason).toMatch(/canonical pattern/i)
    expect(ud.fromAI).toBe(8)
    expect(ud.applied).toBe(6)
    expect(ud.reason).toMatch(/Karpicke-Roediger/)
  })

  it("emits no adjustments when scores already below caps", () => {
    const lowScores = {
      codeCorrectness: 7,
      patternAccuracy: 4,
      understandingDepth: 5,
      explanationQuality: 6,
      confidenceCalibration: 6,
    }
    const result = applySolveMethodCaps(lowScores, "SAW_APPROACH")
    expect(result.scores).toEqual(lowScores)
    expect(result.adjustments).toEqual([])
  })
})

describe("applySolveMethodCaps — HINTS", () => {
  it("caps patternAccuracy at 8 and understandingDepth at 8", () => {
    const result = applySolveMethodCaps(
      { codeCorrectness: 10, patternAccuracy: 9, understandingDepth: 9, explanationQuality: 8, confidenceCalibration: 7 },
      "HINTS",
    )
    expect(result.scores.patternAccuracy).toBe(8)
    expect(result.scores.understandingDepth).toBe(8)
    expect(result.adjustments).toHaveLength(2)
  })

  it("does not cap below score (HINTS allows ≤ 8)", () => {
    const lowish = { codeCorrectness: 9, patternAccuracy: 7, understandingDepth: 8, explanationQuality: 6, confidenceCalibration: 6 }
    const result = applySolveMethodCaps(lowish, "HINTS")
    expect(result.scores).toEqual(lowish)
    expect(result.adjustments).toEqual([])
  })
})

describe("applySolveMethodCaps — defensive shapes", () => {
  it("ignores non-numeric dimension values (no NaN, no crash)", () => {
    const partial = { codeCorrectness: 10, patternAccuracy: null, understandingDepth: undefined, explanationQuality: 9 }
    const result = applySolveMethodCaps(partial, "SAW_APPROACH")
    // null/undefined are not capped (typeof !== "number")
    expect(result.scores.patternAccuracy).toBeNull()
    expect(result.scores.understandingDepth).toBeUndefined()
    expect(result.adjustments).toEqual([])
  })

  it("never returns the input scores reference (caller can mutate the result safely)", () => {
    const cold = fullScores()
    const coldResult = applySolveMethodCaps(cold, "COLD")
    expect(coldResult.scores).not.toBe(cold)

    const saw = fullScores()
    const sawResult = applySolveMethodCaps(saw, "SAW_APPROACH")
    expect(sawResult.scores).not.toBe(saw)
  })

  it("does not crash when scores is null (returns empty-shape result)", () => {
    expect(() => applySolveMethodCaps(null, "COLD")).not.toThrow()
    expect(() => applySolveMethodCaps(null, "SAW_APPROACH")).not.toThrow()
  })
})
