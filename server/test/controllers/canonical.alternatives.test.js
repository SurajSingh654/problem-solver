import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let lastSystemPrompt = "";
let aiPayload = null;
let originalFlag;

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ systemPrompt }) => {
    lastSystemPrompt = systemPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AI_MODEL_FAST: "gpt-4o-mini",
  AIError: class AIError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

const { generateCanonicalAnswer } = await import(
  "../../src/controllers/ai.controller.js"
);

const problem = {
  title: "Climbing Stairs",
  description: "You're climbing a staircase with n steps...",
  difficulty: "EASY",
  category: "CODING",
};

describe("generateCanonicalAnswer with FEATURE_CANONICAL_ALTERNATIVES=true", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    lastSystemPrompt = "";
    aiPayload = {
      pattern: "Dynamic Programming",
      keyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      alternatives: [
        {
          name: "Memoized recursion",
          pattern: "Dynamic Programming",
          keyInsight: "Cache subproblem results to avoid recomputation.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("includes the alternatives clause in the system prompt", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result).not.toBeNull();
    expect(lastSystemPrompt).toMatch(/alternatives/i);
    expect(lastSystemPrompt).toMatch(/0[\s-]?3/i);
  });

  it("returns primary fields plus the alternatives array", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result.pattern).toBe("Dynamic Programming");
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].name).toBe("Memoized recursion");
  });

  it("returns alternatives = [] when AI returns no alternatives", async () => {
    aiPayload = { ...aiPayload, alternatives: [] };
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result.alternatives).toEqual([]);
  });

  it("drops alternatives identical to primary in (pattern, time, space)", async () => {
    aiPayload = {
      ...aiPayload,
      alternatives: [
        {
          name: "Same as primary",
          pattern: aiPayload.pattern,
          keyInsight: "different prose",
          timeComplexity: aiPayload.timeComplexity,
          spaceComplexity: aiPayload.spaceComplexity,
        },
      ],
    };
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result.alternatives).toEqual([]);
  });
});

describe("generateCanonicalAnswer with FEATURE_CANONICAL_ALTERNATIVES=false", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "false";
    lastSystemPrompt = "";
    aiPayload = {
      pattern: "Dynamic Programming",
      keyInsight: "ways(n) = ways(n-1) + ways(n-2).",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("does not include alternatives clause in system prompt (uses v1 prompt)", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result).not.toBeNull();
    expect(lastSystemPrompt).not.toMatch(/alternatives/i);
  });

  it("returns primary only — alternatives is [] (validator default)", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    // validateCanonicalAnswer always returns alternatives: [] when none provided.
    expect(result.alternatives).toEqual([]);
  });
});
