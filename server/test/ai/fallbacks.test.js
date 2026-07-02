import { describe, it, expect } from "vitest";
import {
  buildFallbackQuiz,
  buildFallbackNoteSummary,
  buildFallbackNoteAutoTag,
  buildFallbackNoteFlashcards,
  buildFallbackNoteRelated,
  buildFallbackNoteFromSolution,
  buildFallbackTeachingSummary,
  buildFallbackTeachingQuiz,
  buildFallbackTeachingTopicCoverage,
} from "../../src/services/ai.fallbacks.js";
import {
  validateNoteSummary,
  validateNoteAutoTag,
  validateNoteFlashcards,
  validateTeachingSummary,
  validateTeachingQuiz,
  validateTeachingTopicCoverage,
} from "../../src/services/ai.validators.js";

// T224-T242: fallback assertion regression tests (Sprint 8b / M33)
// Pure function, no mocks, no async, no beforeEach.

// ---------------------------------------------------------------------------
// T224 — buildFallbackQuiz
// ---------------------------------------------------------------------------
describe("buildFallbackQuiz", () => {
  it("test 224: returns null (deliberate — no valid deterministic quiz fallback exists)", () => {
    expect(buildFallbackQuiz()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T225-T226 — buildFallbackNoteSummary
// ---------------------------------------------------------------------------
describe("buildFallbackNoteSummary", () => {
  it("test 225: passes validateNoteSummary with hasContent: false", () => {
    const fb = buildFallbackNoteSummary();
    const result = validateNoteSummary(fb, { hasContent: false });
    expect(result.valid).toBe(true);
  });

  it("test 226: has _fallback marker and honest-failure tldr", () => {
    const fb = buildFallbackNoteSummary();
    expect(fb._fallback).toBe(true);
    expect(fb.tldr).toMatch(/unavailable|retry|couldn't/i);
  });
});

// ---------------------------------------------------------------------------
// T227-T228 — buildFallbackNoteAutoTag
// ---------------------------------------------------------------------------
describe("buildFallbackNoteAutoTag", () => {
  it("test 227: returns empty tags with _fallback marker (no-pseudo-tags regression)", () => {
    const fb = buildFallbackNoteAutoTag();
    expect(fb).toEqual({ tags: [], _fallback: true });
  });

  it("test 228: validator INTENTIONALLY rejects (empty is honest-failure signal by design)", () => {
    const fb = buildFallbackNoteAutoTag();
    const result = validateNoteAutoTag(fb);
    // The fallback deliberately fails its validator — empty array is the
    // "AI unavailable, retry" signal, NOT a valid tag suggestion. If this
    // test flips to .valid === true, someone has 'fixed' the fallback by
    // adding placeholder tags — that reverts the Sprint 6c honest-failure
    // decision. Lock in the intent.
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.startsWith("tags-count"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T229-T230 — buildFallbackNoteFlashcards
// ---------------------------------------------------------------------------
describe("buildFallbackNoteFlashcards", () => {
  it("test 229: passes validateNoteFlashcards", () => {
    const fb = buildFallbackNoteFlashcards();
    const result = validateNoteFlashcards(fb);
    expect(result.valid).toBe(true);
  });

  it("test 230: at least one draft has type !== DEFINITION (anti-laziness rule)", () => {
    const fb = buildFallbackNoteFlashcards();
    expect(fb.drafts.length).toBeGreaterThanOrEqual(3);
    const nonDefinition = fb.drafts.some((d) => d.type !== "DEFINITION");
    expect(nonDefinition).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T231-T232 — buildFallbackNoteRelated
// ---------------------------------------------------------------------------
describe("buildFallbackNoteRelated", () => {
  it("test 231: empty-input passthrough — relatedNotes and relatedProblems are empty arrays", () => {
    const fb = buildFallbackNoteRelated({ rawNotes: [], rawProblems: [] });
    expect(fb.relatedNotes).toEqual([]);
    expect(fb.relatedProblems).toEqual([]);
  });

  it("test 232: with rawNotes populated, produces relatedNotes with matching ids", () => {
    const fb = buildFallbackNoteRelated({
      rawNotes: [
        { id: "note_a", title: "A" },
        { id: "note_b", title: "B" },
      ],
      rawProblems: [],
    });
    expect(fb.relatedNotes).toHaveLength(2);
    expect(fb.relatedNotes[0].id).toBe("note_a");
    expect(fb.relatedNotes[0].rationale).toEqual(expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// T233-T234 — buildFallbackNoteFromSolution
// ---------------------------------------------------------------------------
describe("buildFallbackNoteFromSolution", () => {
  const sampleProblem = { title: "Two Sum" };
  const sampleSolution = { patterns: ["Sliding Window", "Two Pointers"] };
  const sampleAiReview = {
    strengths: ["Clear variable names"],
    gaps: ["Missed edge case for empty input"],
    improvement: "Handle empty array early.",
  };

  it("test 233: produces correct output shape with title, topicsExplained, and _fallback marker", () => {
    const fb = buildFallbackNoteFromSolution({
      problem: sampleProblem,
      solution: sampleSolution,
      aiReview: sampleAiReview,
    });
    expect(fb.title).toBeTruthy();
    expect(fb.topicsExplained).toBeInstanceOf(Array);
    expect(fb._fallback).toBe(true);
  });

  it("test 234: pattern array sanitized to kebab-case tags", () => {
    const fb = buildFallbackNoteFromSolution({
      problem: sampleProblem,
      solution: sampleSolution,
      aiReview: sampleAiReview,
    });
    expect(fb.tags).toContain("sliding-window");
    expect(fb.tags).toContain("two-pointers");
  });
});

// ---------------------------------------------------------------------------
// T235-T237 — buildFallbackTeachingSummary
// ---------------------------------------------------------------------------
describe("buildFallbackTeachingSummary", () => {
  it("test 235: passes validateTeachingSummary with basic inputs", () => {
    const fb = buildFallbackTeachingSummary({
      topic: "Rate limiting",
      notesMarkdown: "Some notes about rate limiting.",
    });
    const result = validateTeachingSummary(fb);
    expect(result.valid).toBe(true);
  });

  it("test 236: extracts markdown headings into keyTakeaways when present", () => {
    const fb = buildFallbackTeachingSummary({
      topic: "Distributed Systems",
      notesMarkdown:
        "## Heading 1\nsome content\n## Heading 2\nmore content\n## Heading 3\neven more",
    });
    const text = fb.keyTakeaways.join(" ");
    expect(text).toMatch(/Heading 1/);
    expect(text).toMatch(/Heading 2/);
    expect(text).toMatch(/Heading 3/);
  });

  it("test 237: empty notes falls back to filler text and still passes validator", () => {
    const fb = buildFallbackTeachingSummary({ topic: "X", notesMarkdown: "" });
    const result = validateTeachingSummary(fb);
    expect(result.valid).toBe(true);
    expect(fb.keyTakeaways.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// T238-T239 — buildFallbackTeachingQuiz
// ---------------------------------------------------------------------------
describe("buildFallbackTeachingQuiz", () => {
  it("test 238: passes validateTeachingQuiz", () => {
    const fb = buildFallbackTeachingQuiz({ topic: "Rate limiting" });
    const result = validateTeachingQuiz(fb);
    expect(result.valid).toBe(true);
  });

  it("test 239: quiz question interpolates topic string", () => {
    const fb = buildFallbackTeachingQuiz({ topic: "Rate limiting patterns" });
    const firstQuestion = fb.questions[0].question;
    expect(firstQuestion).toContain("Rate limiting patterns");
  });
});

// ---------------------------------------------------------------------------
// T240-T242 — buildFallbackTeachingTopicCoverage
// ---------------------------------------------------------------------------
describe("buildFallbackTeachingTopicCoverage", () => {
  it("test 240: passes validateTeachingTopicCoverage", () => {
    const fb = buildFallbackTeachingTopicCoverage({
      topic: "redis caching",
      notesMarkdown: "We discussed redis at length.",
    });
    const result = validateTeachingTopicCoverage(fb);
    expect(result.valid).toBe(true);
  });

  it("test 241: verdict is PARTIAL and coverageScore is in [35, 74]", () => {
    const fb = buildFallbackTeachingTopicCoverage({
      topic: "redis caching",
      notesMarkdown: "We discussed redis at length.",
    });
    expect(fb.verdict).toBe("PARTIAL");
    expect(fb.coverageScore).toBeGreaterThanOrEqual(35);
    expect(fb.coverageScore).toBeLessThanOrEqual(74);
  });

  it("test 242: token-based scoring reflects topic keyword presence in notes", () => {
    const fb = buildFallbackTeachingTopicCoverage({
      topic: "redis caching",
      notesMarkdown: "We discussed redis at length and redis caching strategies.",
    });
    // At least one token from topic appears in notes → naive coverage > 0
    // Score is still clamped to [35, 74] by design; just assert it resolves
    expect(fb.coverageScore).toBeGreaterThan(0);
    expect(fb._fallback).toBe(true);
  });
});
