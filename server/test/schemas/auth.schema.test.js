import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  onboardingSchema,
  changePasswordSchema,
  switchTeamSchema,
  updateProfileSchema,
} from "../../src/schemas/auth.schema.js";

// ── T189 ──────────────────────────────────────────────────────
describe("registerSchema", () => {
  it("test 189: accepts a canonical register payload", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "SecureP@ss1",
      name: "Jane Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  // ── T190 ──────────────────────────────────────────────────────
  it("test 190: rejects unknown keys (strict-mode enforcement)", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "SecureP@ss1",
      name: "Jane Doe",
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

  // ── T191 ──────────────────────────────────────────────────────
  it("test 191: rejects an invalid email format", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "SecureP@ss1",
      name: "Jane Doe",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.code === "invalid_string" || i.code === "invalid_email",
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T192 ──────────────────────────────────────────────────────
describe("loginSchema", () => {
  it("test 192: accepts a canonical login payload", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  // ── T193 ──────────────────────────────────────────────────────
  it("test 193: rejects when password is missing", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.includes("password"),
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T194 / T195 ───────────────────────────────────────────────
describe("onboardingSchema", () => {
  it("test 194: accepts mode: individual (no joinCode needed)", () => {
    const result = onboardingSchema.safeParse({ mode: "individual" });
    expect(result.success).toBe(true);
  });

  it("test 195a: rejects mode: team with no joinCode and no teamName (refinement fires)", () => {
    const result = onboardingSchema.safeParse({ mode: "team" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.includes("joinCode") || /join|team/i.test(i.message),
      );
      expect(issue).toBeDefined();
    }
  });

  it("test 195b: accepts mode: team with joinCode provided", () => {
    const result = onboardingSchema.safeParse({
      mode: "team",
      joinCode: "ABC123",
    });
    expect(result.success).toBe(true);
  });

  it("test 195c: accepts mode: team with teamName provided", () => {
    const result = onboardingSchema.safeParse({
      mode: "team",
      teamName: "Acme",
    });
    expect(result.success).toBe(true);
  });
});

// ── T196 ──────────────────────────────────────────────────────
describe("changePasswordSchema", () => {
  it("test 196: accepts a well-formed change-password payload (happy path)", () => {
    // Note: cross-field newPassword-differs-from-currentPassword check
    // lives in the controller, NOT the schema. This test only verifies
    // the schema accepts a well-formed payload.
    const result = changePasswordSchema.safeParse({
      currentPassword: "CurrentP@ss123",
      newPassword: "NewP@ss1234",
    });
    expect(result.success).toBe(true);
  });
});

// ── T197 ──────────────────────────────────────────────────────
describe("switchTeamSchema", () => {
  it("test 197: rejects unknown keys (strict-mode enforcement)", () => {
    const result = switchTeamSchema.safeParse({
      teamId: "team_abc123",
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

// ── T198 ──────────────────────────────────────────────────────
describe("updateProfileSchema", () => {
  it("test 198: rejects unknown keys (strict-mode enforcement)", () => {
    const result = updateProfileSchema.safeParse({
      name: "Alice",
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
