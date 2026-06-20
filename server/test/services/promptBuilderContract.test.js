import { describe, it, expect } from "vitest";
import { solutionReviewPrompt } from "../../src/services/ai.prompts.js";

// Each migrated prompt builder must return:
//   { promptVersion, system, user, validate, buildFallback }
// Plus, when the builder consumes user-controlled content, the user prompt
// must include the literal string "<untrusted" (the untrusted-content tag).
//
// MIGRATED_BUILDERS is appended to as more prompts adopt the contract.
const MIGRATED_BUILDERS = [
  {
    name: "solutionReviewPrompt",
    build: solutionReviewPrompt,
    input: {
      problem: {
        id: "p1",
        title: "Test",
        description: "desc",
        difficulty: "EASY",
        category: "CODING",
      },
      category: "CODING",
      difficulty: "EASY",
      language: "PYTHON",
      code: "def x(): pass",
      approach: "linear scan",
      patterns: ["Hashing"],
      keyInsight: "use a set",
      feynmanExplanation: "explanation",
      realWorldConnection: "real world",
      confidence: 4,
      timeTaken: "MINS_15_30",
      solveMethod: "COLD",
      adminNotes: null,
      ragContext: "",
      followUpAnswers: [],
      followUpQuestionIds: [],
      patternBaseline: null,
      categorySpecificData: null,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      bruteForce: null,
      bruteForceMeta: null,
      optimizedApproach: null,
      alternativeApproach: null,
      alternativeMeta: null,
    },
    expectsUntrusted: true,
  },
];

// Minimally-shaped review payload that satisfies validateReview. Mirrors
// the VALID_REVIEW fixture in test/ai/validators.test.js (which is the
// authoritative test for validateReview itself). Used here only to
// exercise the validate-adapter contract — { valid, data } on success
// and { valid:false, violations } on failure.
const VALID_REVIEW_FIXTURE = {
  scores: {
    codeCorrectness: 7,
    patternAccuracy: 8,
    understandingDepth: 6,
    explanationQuality: 7,
    confidenceCalibration: 8,
  },
  flags: {
    languageMismatch: false,
    detectedLanguage: null,
    incompleteSubmission: false,
    wrongPattern: false,
    identifiedPattern: "Two Pointers",
    correctPattern: null,
  },
  strengths: ["Clear two-pointer setup", "Correct edge cases for empty input"],
  gaps: ["Could explain time complexity more concisely"],
  improvement: "Tighten the Feynman explanation to 2 sentences max.",
  interviewTip: "State the invariant explicitly before coding.",
  readinessVerdict: "Ready for an early-round technical screen on this pattern.",
  complexityCheck: {
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    timeCorrect: true,
    spaceCorrect: true,
    optimizationNote: null,
  },
  followUpEvaluations: [],
};

describe("Prompt builder contract (migrated builders)", () => {
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

  // Adapter-contract tests exercise the validate function returned by
  // solutionReviewPrompt — runAISurface relies on the { valid, data,
  // violations? } shape, which is NOT the raw shape that validateReview
  // returns. Without these, an adapter regression that drops `data` on
  // success would silently break runAISurface's transform path.
  describe("solutionReviewPrompt validate adapter", () => {
    const fixture = MIGRATED_BUILDERS[0]; // solutionReviewPrompt

    it("returns { valid: true, data } on a passing payload", () => {
      const result = fixture.build(fixture.input);
      const verdict = result.validate(VALID_REVIEW_FIXTURE);
      expect(verdict.valid).toBe(true);
      expect(verdict.data).toBeDefined();
      // Adapter passes parsed payload through as `data` — runAISurface
      // hands this to transform / persists it.
      expect(verdict.data).toBe(VALID_REVIEW_FIXTURE);
    });

    it("returns { valid: false, violations } on a failing payload", () => {
      const result = fixture.build(fixture.input);
      const verdict = result.validate({});
      expect(verdict.valid).toBe(false);
      expect(Array.isArray(verdict.violations)).toBe(true);
      expect(verdict.violations.length).toBeGreaterThan(0);
    });
  });
});
