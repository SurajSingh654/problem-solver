import { describe, it, expect } from "vitest";
import {
  createDesignSessionSchema,
  submitScenarioResponseSchema,
  aiCoachingSchema,
  updateSessionStatusSchema,
  savePhaseSchema,
} from "../../src/schemas/designStudio.schema.js";

// ── T199 ──────────────────────────────────────────────────────
describe("createDesignSessionSchema", () => {
  it("test 199: accepts a canonical create-session payload", () => {
    const result = createDesignSessionSchema.safeParse({
      designType: "SYSTEM_DESIGN",
      title: "Design a URL Shortener",
      difficulty: "MEDIUM",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.designType).toBe("SYSTEM_DESIGN");
    }
  });
});

// ── T200 ──────────────────────────────────────────────────────
describe("submitScenarioResponseSchema", () => {
  it("test 200: accepts a canonical submit-scenario-response payload", () => {
    const result = submitScenarioResponseSchema.safeParse({
      scenarioId: "scen_001",
      response:
        "I would shard the database by user ID to distribute load evenly.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenarioId).toBe("scen_001");
    }
  });
});

// ── T201 ──────────────────────────────────────────────────────
describe("aiCoachingSchema", () => {
  it("test 201: rejects unknown keys (strict-mode enforcement)", () => {
    const result = aiCoachingSchema.safeParse({
      mode: "validate",
      phaseId: "requirements",
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

// ── T202 ──────────────────────────────────────────────────────
describe("updateSessionStatusSchema", () => {
  it("test 202: rejects invalid status enum value", () => {
    const result = updateSessionStatusSchema.safeParse({
      status: "IN_PROGRESS_MAYBE",
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

// ── T203 ──────────────────────────────────────────────────────
describe("savePhaseSchema", () => {
  it("test 203: rejects when required phaseId is missing", () => {
    // savePhaseSchema requires phaseId (min 1). Omitting it should fail.
    const result = savePhaseSchema.safeParse({
      content: "Some content here",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.includes("phaseId"),
      );
      expect(issue).toBeDefined();
    }
  });
});
