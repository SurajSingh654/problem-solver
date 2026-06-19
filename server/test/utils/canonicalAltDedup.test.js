import { describe, it, expect } from "vitest";
import { dedupAndCapAlternatives } from "../../src/utils/canonicalAltDedup.js";

const primary = {
  pattern: "Dynamic Programming",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

describe("dedupAndCapAlternatives", () => {
  it("returns empty array for non-array input", () => {
    expect(dedupAndCapAlternatives(null, primary)).toEqual([]);
    expect(dedupAndCapAlternatives(undefined, primary)).toEqual([]);
    expect(dedupAndCapAlternatives("not an array", primary)).toEqual([]);
    expect(dedupAndCapAlternatives({}, primary)).toEqual([]);
  });

  it("drops alternatives identical to primary in (pattern, time, space)", () => {
    const alts = [
      { name: "Same as primary", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized");
  });

  it("dedupes alternatives with the same name (keeps first)", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "first", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "second", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(1);
    expect(result[0].keyInsight).toBe("first");
  });

  it("dedupes alternatives identical in (pattern, time, space) — keeps first", () => {
    const alts = [
      { name: "First name", pattern: "Math", keyInsight: "x", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
      { name: "Second name", pattern: "Math", keyInsight: "y", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("First name");
  });

  it("caps result at 3 even when input has more", () => {
    const alts = Array.from({ length: 5 }, (_, i) => ({
      name: `Alt ${i}`,
      pattern: "Dynamic Programming",
      keyInsight: `insight ${i}`,
      timeComplexity: `O(n^${i + 2})`,
      spaceComplexity: "O(n)",
    }));
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(3);
    expect(result.map((a) => a.name)).toEqual(["Alt 0", "Alt 1", "Alt 2"]);
  });

  it("preserves valid alternatives untouched", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toEqual(alts);
  });
});
