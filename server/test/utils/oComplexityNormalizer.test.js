import { describe, it, expect } from "vitest";
import {
  normalizeOComplexity,
  isValidOComplexity,
} from "../../src/utils/oComplexityNormalizer.js";

describe("normalizeOComplexity", () => {
  it("wraps bare expressions in O(...)", () => {
    expect(normalizeOComplexity("n")).toBe("O(n)");
    expect(normalizeOComplexity("n log n")).toBe("O(n log n)");
  });

  it("preserves already-wrapped expressions", () => {
    expect(normalizeOComplexity("O(n)")).toBe("O(n)");
    expect(normalizeOComplexity("O(1)")).toBe("O(1)");
  });

  it("trims whitespace", () => {
    expect(normalizeOComplexity("  n  ")).toBe("O(n)");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(normalizeOComplexity("")).toBe("");
    expect(normalizeOComplexity("   ")).toBe("");
    expect(normalizeOComplexity(null)).toBe("");
  });
});

describe("isValidOComplexity", () => {
  it("accepts O(...)", () => {
    expect(isValidOComplexity("O(n)")).toBe(true);
    expect(isValidOComplexity("O(n log n)")).toBe(true);
    expect(isValidOComplexity("O(1)")).toBe(true);
  });

  it("rejects empty or non-O strings", () => {
    expect(isValidOComplexity("")).toBe(false);
    expect(isValidOComplexity("linear")).toBe(false);
    expect(isValidOComplexity("n")).toBe(false);
  });
});
