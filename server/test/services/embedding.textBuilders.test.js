import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));
vi.mock("../../src/config/env.js", () => ({
  OPENAI_API_KEY: "sk-test",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

const { buildSolutionText, buildProblemText, buildNoteText } = await import(
  "../../src/services/embedding.service.js"
);

describe("buildSolutionText", () => {
  it("test 41: minimal solution (no problem context) returns non-empty without crashing", () => {
    const solution = {
      approach: "two pointers",
      patterns: [],
    };
    const out = buildSolutionText(solution, null);
    expect(typeof out).toBe("string");
    expect(out).not.toContain("Problem:");
    expect(out).not.toContain("Difficulty:");
  });

  it("test 42: all fields populated → every expected line appears", () => {
    const solution = {
      patterns: ["arrays", "two-pointers"],
      bruteForce: "nested loop",
      optimizedApproach: "two pointers",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      keyInsight: "monotonic invariant",
      feynmanExplanation: "walk pointers inward",
      code: "function f() { return 0; }",
    };
    const problem = {
      title: "Two Sum",
      difficulty: "EASY",
      category: "CODING",
    };
    const out = buildSolutionText(solution, problem);
    expect(out).toContain("Problem: Two Sum");
    expect(out).toContain("Difficulty: EASY");
    expect(out).toContain("Category: CODING");
    expect(out).toContain("Patterns: arrays, two-pointers");
    expect(out).toContain("Brute Force: nested loop");
    expect(out).toContain("Optimized: two pointers");
    expect(out).toContain("Time: O(n)");
    expect(out).toContain("Space: O(1)");
    expect(out).toContain("Key Insight: monotonic invariant");
    expect(out).toContain("Explanation: walk pointers inward");
    expect(out).toContain("Code: function f() { return 0; }");
  });

  it("test 43: categorySpecificData flattening — only strings included, capped at 2000 chars", () => {
    const longString = "y".repeat(3000);
    const solution = {
      approach: "x",
      patterns: [],
      categorySpecificData: {
        starMethod: "situation text",
        learnings: longString,
        skipMe: 42,
        nullField: null,
      },
    };
    const out = buildSolutionText(solution, null);
    expect(out).toContain("situation text");
    expect(out).not.toContain("42");
    const ys = (out.match(/y+/g) || []).join("");
    expect(ys.length).toBeLessThanOrEqual(2000);
  });

  it("test 44: code > 1000 chars truncated to first 1000 in output", () => {
    const longCode = "a".repeat(2000);
    const solution = {
      approach: "x",
      patterns: [],
      code: longCode,
    };
    const out = buildSolutionText(solution, null);
    const codeLine = out.split("\n").find((line) => line.startsWith("Code: "));
    expect(codeLine).toBeDefined();
    const codeContent = codeLine.replace(/^Code: /, "");
    expect(codeContent.length).toBe(1000);
    expect(codeContent).toBe("a".repeat(1000));
  });
});

describe("buildProblemText", () => {
  it("test 45: minimal problem (only title) returns Title: line without crashing", () => {
    const out = buildProblemText({ title: "Two Sum" });
    expect(out).toBe("Title: Two Sum");
  });

  it("test 46: tags as JSON-encoded string is parsed", () => {
    const out = buildProblemText({
      title: "Two Sum",
      tags: '["array","hashmap"]',
    });
    expect(out).toContain("Tags: array, hashmap");
  });

  it("test 47: tags as array + companyTags both render", () => {
    const out = buildProblemText({
      title: "Two Sum",
      tags: ["array", "hashmap"],
      companyTags: ["Google", "Amazon"],
    });
    expect(out).toContain("Tags: array, hashmap");
    expect(out).toContain("Companies: Google, Amazon");
  });
});

describe("buildNoteText", () => {
  it("test 48: minimal note (only title) returns Title: line", () => {
    const out = buildNoteText({ title: "Notes on HNSW" });
    expect(out).toBe("Title: Notes on HNSW");
  });

  it("test 49: null/empty fields are skipped — output is just Title section", () => {
    const out = buildNoteText({
      title: "Notes on HNSW",
      tags: null,
      linkedEntityType: null,
      contentMarkdown: null,
    });
    expect(out).toBe("Title: Notes on HNSW");
  });
});
