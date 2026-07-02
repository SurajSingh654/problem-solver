import { describe, it, expect } from "vitest";
import {
  createProblemSchema,
  updateProblemSchema,
  batchCreateProblemsSchema,
  canonicalPatchSchema,
} from "../../src/schemas/problem.schema.js";

// ── T207 ──────────────────────────────────────────────────────
describe("createProblemSchema", () => {
  it("test 207: accepts a canonical create-problem payload", () => {
    const result = createProblemSchema.safeParse({
      title: "Two Sum",
      difficulty: "EASY",
      category: "CODING",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Two Sum");
    }
  });

  // ── T208 ──────────────────────────────────────────────────────
  it("test 208: rejects unknown keys (strict-mode enforcement)", () => {
    const result = createProblemSchema.safeParse({
      title: "Two Sum",
      difficulty: "EASY",
      category: "CODING",
      unknownField: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.code === "unrecognized_keys" || i.path.includes("unknownField"),
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T209 ──────────────────────────────────────────────────────
describe("updateProblemSchema", () => {
  it("test 209: accepts an empty object (all fields are .partial())", () => {
    // updateProblemSchema uses .strict() with all fields optional.
    // An empty object is valid Zod behavior for a fully-optional strict schema.
    const result = updateProblemSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ── T210 ──────────────────────────────────────────────────────
describe("batchCreateProblemsSchema", () => {
  it("test 210a: accepts an array of 2 valid problems", () => {
    const result = batchCreateProblemsSchema.safeParse({
      problems: [
        { title: "Two Sum", difficulty: "EASY", category: "CODING" },
        { title: "Best Time to Buy Stock", difficulty: "MEDIUM", category: "CODING" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("test 210b: rejects when one item in the array is missing a required title", () => {
    const result = batchCreateProblemsSchema.safeParse({
      problems: [
        { title: "Two Sum", difficulty: "EASY", category: "CODING" },
        { difficulty: "EASY", category: "CODING" }, // missing title
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.includes("title") || i.path.some((p) => p === "title"),
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T211 ──────────────────────────────────────────────────────
describe("canonicalPatchSchema", () => {
  it("test 211a: accepts a partial canonical patch with one valid field", () => {
    // canonicalPatchSchema is .strict() and requires at least one field.
    // An empty object {} fails the cross-field refine.
    const result = canonicalPatchSchema.safeParse({
      canonicalKeyInsight: "Use a hash map for O(n) lookup.",
    });
    expect(result.success).toBe(true);
  });

  it("test 211b: rejects unknown keys (strict-mode enforcement)", () => {
    const result = canonicalPatchSchema.safeParse({
      canonicalKeyInsight: "Use a hash map.",
      unknownField: "x",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.code === "unrecognized_keys" || i.path.includes("unknownField"),
      );
      expect(issue).toBeDefined();
    }
  });
});
