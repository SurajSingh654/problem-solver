import { describe, it, expect } from "vitest";
import {
  createTeamSchema,
  joinTeamSchema,
  inviteMembersSchema,
  changeMemberRoleSchema,
  approveTeamSchema,
} from "../../src/schemas/team.schema.js";

// ── T219 ──────────────────────────────────────────────────────
describe("createTeamSchema", () => {
  it("test 219: accepts a canonical create-team payload", () => {
    const result = createTeamSchema.safeParse({
      name: "Engineering",
      description: "The core eng team",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Engineering");
    }
  });
});

// ── T220 ──────────────────────────────────────────────────────
describe("joinTeamSchema", () => {
  it("test 220: accepts a canonical join-team payload with joinCode", () => {
    const result = joinTeamSchema.safeParse({ joinCode: "ABC123XY" });
    expect(result.success).toBe(true);
    if (result.success) {
      // schema transforms joinCode to uppercase
      expect(result.data.joinCode).toBe("ABC123XY");
    }
  });
});

// ── T221 ──────────────────────────────────────────────────────
describe("inviteMembersSchema", () => {
  it("test 221a: accepts an array of valid email addresses", () => {
    const result = inviteMembersSchema.safeParse({
      emails: ["alice@example.com", "bob@example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("test 221b: rejects when one email in the array is invalid", () => {
    const result = inviteMembersSchema.safeParse({
      emails: ["alice@example.com", "not-an-email"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.includes("emails") || i.path.some((p) => p === 1),
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T222 ──────────────────────────────────────────────────────
describe("changeMemberRoleSchema", () => {
  it("test 222: rejects an invalid role enum value", () => {
    // Divergence note: changeMemberRoleSchema only has `role` field.
    // userId is a URL param, NOT in the request body.
    const result = changeMemberRoleSchema.safeParse({ role: "SUPER_HERO" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) =>
          i.code === "invalid_enum_value" ||
          i.path.includes("role"),
      );
      expect(issue).toBeDefined();
    }
  });
});

// ── T223 ──────────────────────────────────────────────────────
describe("approveTeamSchema", () => {
  it("test 223: rejects unknown keys (strict-mode enforcement)", () => {
    const result = approveTeamSchema.safeParse({
      action: "approve",
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
