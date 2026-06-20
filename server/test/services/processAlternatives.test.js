import { describe, it, expect, vi, beforeEach } from "vitest";
import { processAlternatives } from "../../src/services/ai.validators.js";

const primary = {
  pattern: "Dynamic Programming",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

const VALID_ALT = {
  name: "Memoized",
  pattern: "Greedy",
  keyInsight: "trade space for time",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
};

describe("processAlternatives", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns valid alternatives unchanged when no drops", () => {
    const result = processAlternatives([VALID_ALT], primary, {
      surface: "canonical-generate",
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns [] for empty input with no warns", () => {
    const result = processAlternatives([], primary, { surface: "canonical-generate" });
    expect(result).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs zod-invalid drop with reason and identifying info", () => {
    processAlternatives(
      [{ name: "bad", pattern: "x" /* missing keyInsight, timeComplexity, spaceComplexity */ }],
      primary,
      { surface: "canonical-generate", problemId: "p1" },
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).toContain("[canonical:alt-dropped]");
    expect(msg).toContain("surface=canonical-generate");
    expect(msg).toContain("problemId=p1");
    expect(msg).toContain("reason=zod-invalid");
    expect(msg).toContain('name="bad"');
    expect(msg).toContain('pattern="x"');
  });

  it("logs equals-primary drop", () => {
    const altSameAsPrimary = {
      name: "Twin",
      pattern: "Dynamic Programming",
      keyInsight: "x",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
    processAlternatives([altSameAsPrimary], primary, {
      surface: "canonical-augment",
      problemId: "p2",
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=equals-primary");
  });

  it("logs dup-name drop", () => {
    const result = processAlternatives(
      [VALID_ALT, { ...VALID_ALT, pattern: "Greedy", spaceComplexity: "O(1)" }],
      primary,
      { surface: "canonical-generate" },
    );
    expect(result).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=dup-name");
  });

  it("logs dup-tuple drop when same (pattern, time, space) but different name", () => {
    // Guards the order of dup-name vs dup-tuple checks. Two alts share the
    // tuple but have different names — second should log dup-tuple, not dup-name.
    const alt1 = { ...VALID_ALT, name: "FirstName" };
    const alt2 = { ...VALID_ALT, name: "SecondName" };
    const result = processAlternatives([alt1, alt2], primary, { surface: "canonical-generate" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("FirstName");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=dup-tuple");
  });

  it("logs every over-cap drop (not just the first — guards the break→continue change)", () => {
    // 6 valid alts with cap = 3 means 3 over-cap drops should be logged.
    // The previous behavior was `break` after kept.length >= MAX, which would
    // emit 0 over-cap warns. This test guards the new continue-and-report
    // behavior; with break, this test fails (0 calls instead of 3).
    // Each alt needs a unique (pattern, time, space) tuple to bypass the
    // dup-tuple dedup and reach the over-cap branch. O_NOTATION_RE is
    // /^O\(.+\)$/ so any "O(...)" string with non-empty contents passes.
    const alts = [
      { ...VALID_ALT, name: "A", timeComplexity: "O(1)" },
      { ...VALID_ALT, name: "B", timeComplexity: "O(log n)" },
      { ...VALID_ALT, name: "C", timeComplexity: "O(n log n)" },
      { ...VALID_ALT, name: "D", timeComplexity: "O(n^2)" },
      { ...VALID_ALT, name: "E", timeComplexity: "O(2^n)" },
      { ...VALID_ALT, name: "F", timeComplexity: "O(n!)" },
    ];
    const result = processAlternatives(alts, primary, { surface: "canonical-augment" });
    expect(result).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls.every(([msg]) => msg.includes("reason=over-cap"))).toBe(true);
  });

  it("emits one log line per drop (not aggregated)", () => {
    const alts = [
      { name: "bad1" /* zod-invalid */ },
      { name: "bad2" /* zod-invalid */ },
    ];
    processAlternatives(alts, primary, { surface: "canonical-generate" });
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("omits problemId from log when context didn't include it", () => {
    processAlternatives([{ name: "bad" }], primary, { surface: "canonical-generate" });
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).not.toContain("problemId=");
  });

  it('emits name="?" pattern="?" fallback for non-object zod-invalid items', () => {
    processAlternatives([null, "not-an-object", 42], primary, {
      surface: "canonical-generate",
    });
    // Each non-object reaches the orchestrator and is rejected by Zod
    // (validateCanonicalAlternative returns null for non-objects).
    expect(warnSpy).toHaveBeenCalledTimes(3);
    for (const [msg] of warnSpy.mock.calls) {
      expect(msg).toContain('name="?"');
      expect(msg).toContain('pattern="?"');
      expect(msg).toContain("reason=zod-invalid");
    }
  });
});
