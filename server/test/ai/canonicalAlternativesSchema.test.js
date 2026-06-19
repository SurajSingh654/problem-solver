import { describe, it, expect } from "vitest";
import { validateCanonicalAlternative, validateCanonicalAnswer } from "../../src/services/ai.validators.js";
import { CANONICAL_PATTERN_LABELS } from "../../src/utils/patternTaxonomy.js";

const validAlt = {
  name: "Memoized recursion",
  pattern: CANONICAL_PATTERN_LABELS[0],
  keyInsight: "Cache subproblem results to avoid recomputation.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
};

describe("validateCanonicalAlternative", () => {
  it("accepts a well-formed alternative", () => {
    expect(validateCanonicalAlternative(validAlt)).not.toBeNull();
  });

  it("rejects empty name", () => {
    expect(validateCanonicalAlternative({ ...validAlt, name: "" })).toBeNull();
  });

  it("rejects whitespace-only name", () => {
    expect(validateCanonicalAlternative({ ...validAlt, name: "   " })).toBeNull();
  });

  it("rejects name longer than 60 chars", () => {
    expect(validateCanonicalAlternative({ ...validAlt, name: "x".repeat(61) })).toBeNull();
  });

  it("rejects pattern outside taxonomy when no primary context provided", () => {
    expect(validateCanonicalAlternative({ ...validAlt, pattern: "Made-Up Pattern" })).toBeNull();
  });

  it("rejects timeComplexity not in O(...) form", () => {
    expect(validateCanonicalAlternative({ ...validAlt, timeComplexity: "linear" })).toBeNull();
  });

  it("rejects empty keyInsight", () => {
    expect(validateCanonicalAlternative({ ...validAlt, keyInsight: "" })).toBeNull();
  });

  it("rejects null input", () => {
    expect(validateCanonicalAlternative(null)).toBeNull();
  });
});

describe("validateCanonicalAnswer with alternatives", () => {
  const validAnswer = {
    pattern: CANONICAL_PATTERN_LABELS[0],
    keyInsight: "Use a hash map.",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
  };

  it("accepts answer without alternatives field (backward compat)", () => {
    expect(validateCanonicalAnswer(validAnswer)).not.toBeNull();
  });

  it("accepts answer with empty alternatives array", () => {
    const result = validateCanonicalAnswer({ ...validAnswer, alternatives: [] });
    expect(result).not.toBeNull();
    expect(result.alternatives).toEqual([]);
  });

  it("accepts answer with valid alternatives", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        {
          name: "Memoized",
          pattern: CANONICAL_PATTERN_LABELS[0],
          keyInsight: "Cache subproblems.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
  });

  it("drops alternatives that violate the differ-from-primary invariant", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        {
          name: "Same as primary",
          pattern: validAnswer.pattern,
          keyInsight: "Different prose, same trade-off.",
          timeComplexity: validAnswer.timeComplexity,
          spaceComplexity: validAnswer.spaceComplexity,
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toEqual([]);
  });

  it("drops invalid alternatives but keeps valid ones (lenient)", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        { name: "", pattern: validAnswer.pattern, keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
        {
          name: "Memoized",
          pattern: validAnswer.pattern,
          keyInsight: "ok",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].name).toBe("Memoized");
  });

  it("caps alternatives at 3", () => {
    const altsInput = Array.from({ length: 5 }, (_, i) => ({
      name: `Alt ${i}`,
      pattern: validAnswer.pattern,
      keyInsight: `insight ${i}`,
      timeComplexity: `O(n^${i + 2})`,
      spaceComplexity: "O(n)",
    }));
    const result = validateCanonicalAnswer({ ...validAnswer, alternatives: altsInput });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(3);
  });

  it("accepts alternative pattern outside taxonomy IF it matches primary pattern", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        {
          name: "Same pattern, different complexity",
          pattern: validAnswer.pattern,
          keyInsight: "alt insight",
          timeComplexity: "O(n log n)",
          spaceComplexity: "O(1)",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
  });
});
