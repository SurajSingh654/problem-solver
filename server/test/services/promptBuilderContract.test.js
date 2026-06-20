import { describe, it, expect } from "vitest";

// Each migrated prompt builder must return:
//   { promptVersion, system, user, validate, buildFallback }
// Plus, when the builder consumes user-controlled content, the user prompt
// must include the literal string "<untrusted" (the untrusted-content tag).
//
// MIGRATED_BUILDERS is appended to as more prompts adopt the contract.
// Sprint 2 only migrates solutionReviewPrompt (Task 11).
const MIGRATED_BUILDERS = [
  // Populated in Task 11
];

describe("Prompt builder contract (migrated builders)", () => {
  if (MIGRATED_BUILDERS.length === 0) {
    it("scaffolding only — no builders migrated yet", () => {
      expect(MIGRATED_BUILDERS).toEqual([]);
    });
    return;
  }

  for (const fixture of MIGRATED_BUILDERS) {
    describe(fixture.name, () => {
      it("returns the contract triple", () => {
        const result = fixture.build(fixture.input);
        expect(typeof result.promptVersion).toBe("string");
        expect(result.promptVersion).toMatch(/^v\d+-\d{4}-\d{2}$/);
        expect(typeof result.system).toBe("string");
        expect(typeof result.user).toBe("string");
        expect(typeof result.validate).toBe("function");
        expect(typeof result.buildFallback).toBe("function");
      });

      it("wraps user content in <untrusted> tags when present", () => {
        const result = fixture.build(fixture.input);
        if (fixture.expectsUntrusted) {
          expect(result.user).toContain("<untrusted");
        }
      });
    });
  }
});
