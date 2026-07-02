import { describe, it, expect } from "vitest";
import {
  createFeedbackSchema,
  updateFeedbackStatusSchema,
  exportFeedbackQuerySchema,
} from "../../src/schemas/feedback.schema.js";

// ── T204 ──────────────────────────────────────────────────────
describe("createFeedbackSchema", () => {
  it("test 204: accepts a canonical create-feedback payload", () => {
    const result = createFeedbackSchema.safeParse({
      type: "BUG",
      title: "Login button broken",
      description: "When I click login nothing happens after submitting.",
      severity: "HIGH",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("BUG");
    }
  });
});

// ── T205 ──────────────────────────────────────────────────────
describe("updateFeedbackStatusSchema", () => {
  it("test 205: rejects an invalid status enum value", () => {
    const result = updateFeedbackStatusSchema.safeParse({
      status: "MAYBE_FIXED",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) =>
          i.code === "invalid_enum_value" ||
          i.path.includes("status"),
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T206 ──────────────────────────────────────────────────────
describe("exportFeedbackQuerySchema", () => {
  it("test 206: accepts canonical export query params", () => {
    // exportFeedbackQuerySchema uses .transform() on optional comma-separated
    // strings; format is the only required field. All other fields are optional.
    const result = exportFeedbackQuerySchema.safeParse({
      format: "csv",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
    }
  });
});
