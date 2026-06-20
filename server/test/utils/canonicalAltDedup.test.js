import { describe, it, expect } from "vitest";
import { dedupAndCapAlternatives } from "../../src/utils/canonicalAltDedup.js";

const primary = {
  pattern: "Dynamic Programming",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

describe("dedupAndCapAlternatives", () => {
  it("returns { kept: [], dropped: [] } for non-array input", () => {
    expect(dedupAndCapAlternatives(null, primary)).toEqual({ kept: [], dropped: [] });
    expect(dedupAndCapAlternatives(undefined, primary)).toEqual({ kept: [], dropped: [] });
    expect(dedupAndCapAlternatives("not an array", primary)).toEqual({ kept: [], dropped: [] });
    expect(dedupAndCapAlternatives({}, primary)).toEqual({ kept: [], dropped: [] });
  });

  it("drops alternatives identical to primary in (pattern, time, space)", () => {
    const alts = [
      { name: "Same as primary", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("Memoized");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("equals-primary");
    expect(dropped[0].item.name).toBe("Same as primary");
  });

  it("dedupes alternatives with the same name (keeps first)", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "first", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "second", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].keyInsight).toBe("first");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("dup-name");
  });

  it("dedupes alternatives identical in (pattern, time, space) — keeps first", () => {
    const alts = [
      { name: "First name", pattern: "Math", keyInsight: "x", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
      { name: "Second name", pattern: "Math", keyInsight: "y", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("First name");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("dup-tuple");
  });

  it("caps result at 3 even when input has more", () => {
    const alts = Array.from({ length: 5 }, (_, i) => ({
      name: `Alt ${i}`,
      pattern: "Dynamic Programming",
      keyInsight: `insight ${i}`,
      timeComplexity: `O(n^${i + 2})`,
      spaceComplexity: "O(n)",
    }));
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(3);
    expect(kept.map((a) => a.name)).toEqual(["Alt 0", "Alt 1", "Alt 2"]);
    expect(dropped).toHaveLength(2);
    expect(dropped.every((d) => d.reason === "over-cap")).toBe(true);
  });

  it("preserves valid alternatives untouched", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toEqual(alts);
    expect(dropped).toEqual([]);
  });

  it("returns dropped entries with item references and correct reasons (mixed)", () => {
    const alts = [
      { name: "Same", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" }, // equals-primary
      { name: "First", pattern: "Greedy", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
      { name: "First", pattern: "BFS", keyInsight: "z", timeComplexity: "O(V+E)", spaceComplexity: "O(V)" }, // dup-name
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("First");
    expect(kept[0].pattern).toBe("Greedy");
    expect(dropped).toHaveLength(2);
    expect(dropped.map((d) => d.reason).sort()).toEqual(["dup-name", "equals-primary"]);
  });
});
