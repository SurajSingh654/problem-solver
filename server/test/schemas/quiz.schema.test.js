import { describe, it, expect } from "vitest";
import { generateQuizSchema } from "../../src/schemas/quiz.schema.js";

// Divergence note: generateQuizSchema wraps fields in a `body` object:
//   z.object({ body: z.object({ subject, difficulty, count, context }) }).strict()
// The test payloads must therefore use { body: { ... } }.

// ── T212 ──────────────────────────────────────────────────────
describe("generateQuizSchema", () => {
  it("test 212: accepts a canonical generate-quiz payload", () => {
    const result = generateQuizSchema.safeParse({
      body: {
        subject: "Binary Search",
        difficulty: "MEDIUM",
        count: 10,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.subject).toBe("Binary Search");
    }
  });

  // ── T213 ──────────────────────────────────────────────────────
  it("test 213: rejects unknown keys at top level (strict-mode enforcement)", () => {
    const result = generateQuizSchema.safeParse({
      body: {
        subject: "Binary Search",
        difficulty: "MEDIUM",
        count: 10,
      },
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
