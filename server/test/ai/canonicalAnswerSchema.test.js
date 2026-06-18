import { describe, it, expect } from "vitest";
import { validateCanonicalAnswer } from "../../src/services/ai.validators.js";
import { CANONICAL_PATTERN_LABELS } from "../../src/utils/patternTaxonomy.js";

describe("validateCanonicalAnswer", () => {
  const valid = {
    pattern: CANONICAL_PATTERN_LABELS[0],
    keyInsight: "Use a hash map. Look up complements in O(1).",
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
  };

  it("accepts a well-formed canonical answer", () => {
    const result = validateCanonicalAnswer(valid);
    expect(result).not.toBeNull();
    expect(result.pattern).toBe(valid.pattern);
  });

  it("rejects empty keyInsight", () => {
    expect(validateCanonicalAnswer({ ...valid, keyInsight: "" })).toBeNull();
  });

  it("rejects pattern outside the canonical taxonomy", () => {
    expect(
      validateCanonicalAnswer({ ...valid, pattern: "Made-Up Pattern" }),
    ).toBeNull();
  });

  it("rejects timeComplexity not in O(...) form", () => {
    expect(
      validateCanonicalAnswer({ ...valid, timeComplexity: "linear" }),
    ).toBeNull();
  });

  it("rejects empty spaceComplexity", () => {
    expect(
      validateCanonicalAnswer({ ...valid, spaceComplexity: "" }),
    ).toBeNull();
  });

  it("rejects truly missing spaceComplexity field", () => {
    const { spaceComplexity: _ignored, ...rest } = valid;
    expect(validateCanonicalAnswer(rest)).toBeNull();
  });

  it("rejects whitespace-only keyInsight", () => {
    expect(validateCanonicalAnswer({ ...valid, keyInsight: "   " })).toBeNull();
  });

  it("rejects null input", () => {
    expect(validateCanonicalAnswer(null)).toBeNull();
  });
});
