import { describe, it, expect } from "vitest";
import {
  createSolutionSchema,
  updateSolutionSchema,
  submitReviewSchema,
  rateSolutionClaritySchema,
} from "../../src/schemas/solution.schema.js";

// ── T214 ──────────────────────────────────────────────────────
describe("createSolutionSchema", () => {
  it("test 214: accepts a canonical create-solution payload", () => {
    const result = createSolutionSchema.safeParse({
      code: "def two_sum(nums, target): pass",
      language: "PYTHON",
      confidence: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("PYTHON");
    }
  });
});

// ── T215 ──────────────────────────────────────────────────────
describe("updateSolutionSchema", () => {
  it("test 215: rejects unknown keys (5-touchpoint drift catcher)", () => {
    // updateSolutionSchema is createSolutionSchema.partial().strict().
    // The .strict() is load-bearing — dropping it makes the validate()
    // middleware silently strip unknown fields, hiding a Prisma/schema/
    // Zod drift bug at the request boundary. See project memory:
    // feedback_zod_schema_strip.md ("first diagnostic for 'field in
    // payload, persisted null'").
    const result = updateSolutionSchema.safeParse({
      code: "print('hi')",
      unknownField: "malicious",
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

// ── T216 ──────────────────────────────────────────────────────
describe("submitReviewSchema", () => {
  it("test 216: accepts a canonical submit-review payload with confidence 4", () => {
    // submitReviewSchema: { confidence: z.number().int().min(1).max(5), recallText?, peeked? }
    // solutionId is a URL param, NOT in the body.
    const result = submitReviewSchema.safeParse({ confidence: 4 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confidence).toBe(4);
    }
  });

  // ── T217 ──────────────────────────────────────────────────────
  it("test 217: rejects confidence 0 and confidence 6 (boundary enforcement)", () => {
    // Verifies the specific 1-5 contract. A future change to .min(0).max(10)
    // would break this — intentional, as the test locks the schema's numeric contract.
    const resultLow = submitReviewSchema.safeParse({ confidence: 0 });
    expect(resultLow.success).toBe(false);

    const resultHigh = submitReviewSchema.safeParse({ confidence: 6 });
    expect(resultHigh.success).toBe(false);

    // Boundary-inclusive acceptance
    const resultMin = submitReviewSchema.safeParse({ confidence: 1 });
    expect(resultMin.success).toBe(true);

    const resultMax = submitReviewSchema.safeParse({ confidence: 5 });
    expect(resultMax.success).toBe(true);
  });
});

// ── T218 ──────────────────────────────────────────────────────
describe("rateSolutionClaritySchema", () => {
  it("test 218: rejects rating 0 and rating 6; accepts boundary 1 and 5", () => {
    // rateSolutionClaritySchema: { rating: z.number().int().min(1).max(5) }
    const resultLow = rateSolutionClaritySchema.safeParse({ rating: 0 });
    expect(resultLow.success).toBe(false);

    const resultHigh = rateSolutionClaritySchema.safeParse({ rating: 6 });
    expect(resultHigh.success).toBe(false);

    const resultMin = rateSolutionClaritySchema.safeParse({ rating: 1 });
    expect(resultMin.success).toBe(true);

    const resultMax = rateSolutionClaritySchema.safeParse({ rating: 5 });
    expect(resultMax.success).toBe(true);
  });
});
