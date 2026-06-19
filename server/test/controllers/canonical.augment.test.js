import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let lastUserPrompt = "";
let aiPayload = null;
let problemRow = null;
let updateCalls = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    problem: {
      findFirst: vi.fn(async () => problemRow),
      update: vi.fn(async ({ where, data }) => {
        updateCalls.push({ where, data });
        problemRow = { ...problemRow, ...data };
        return problemRow;
      }),
    },
    solution: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(async () =>
          problemRow
            ? [{
                id: problemRow.id,
                canonicalGeneratedAt: problemRow.canonicalGeneratedAt,
                canonicalAltGeneratedAt: problemRow.canonicalAltGeneratedAt,
                canonicalPattern: problemRow.canonicalPattern,
                canonicalKeyInsight: problemRow.canonicalKeyInsight,
                canonicalTimeComplexity: problemRow.canonicalTimeComplexity,
                canonicalSpaceComplexity: problemRow.canonicalSpaceComplexity,
              }]
            : [],
        ),
        problem: {
          update: vi.fn(async ({ where, data }) => {
            updateCalls.push({ where, data });
            problemRow = { ...problemRow, ...data };
            return problemRow;
          }),
        },
      };
      return fn(tx);
    }),
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ userPrompt }) => {
    lastUserPrompt = userPrompt;
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

const { augmentCanonicalAlternatives } = await import(
  "../../src/controllers/ai.controller.js"
);
const { getCanonical } = await import(
  "../../src/controllers/problems.controller.js"
);

const primary = {
  pattern: "Dynamic Programming",
  keyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

const problemBase = {
  id: "prob_1",
  title: "Climbing Stairs",
  description: "Climb n stairs taking 1 or 2 steps...",
  difficulty: "EASY",
  category: "CODING",
  teamId: "team_test",
  canonicalGeneratedAt: new Date(),
  canonicalAltGeneratedAt: null,
  canonicalPattern: primary.pattern,
  canonicalKeyInsight: primary.keyInsight,
  canonicalTimeComplexity: primary.timeComplexity,
  canonicalSpaceComplexity: primary.spaceComplexity,
  canonicalAlternatives: null,
  canonicalEditedAt: null,
};

describe("augmentCanonicalAlternatives helper", () => {
  beforeEach(() => {
    lastUserPrompt = "";
    aiPayload = {
      alternatives: [
        {
          name: "Memoized recursion",
          pattern: "Dynamic Programming",
          keyInsight: "Cache subproblem results.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
  });

  it("returns the validated alternatives array", async () => {
    const result = await augmentCanonicalAlternatives(
      { ...problemBase },
      primary,
      { userId: "u", teamId: "t" },
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized recursion");
  });

  it("includes primary fields in the user prompt", async () => {
    await augmentCanonicalAlternatives({ ...problemBase }, primary, { userId: "u", teamId: "t" });
    expect(lastUserPrompt).toContain("primary_pattern");
    expect(lastUserPrompt).toContain(primary.pattern);
    expect(lastUserPrompt).toContain(primary.keyInsight);
  });

  it("returns [] when AI returns empty alternatives", async () => {
    aiPayload = { alternatives: [] };
    const result = await augmentCanonicalAlternatives(problemBase, primary, { userId: "u", teamId: "t" });
    expect(result).toEqual([]);
  });

  it("returns [] when AI response is malformed (missing alternatives field)", async () => {
    aiPayload = { not_alternatives: "garbage" };
    const result = await augmentCanonicalAlternatives(problemBase, primary, { userId: "u", teamId: "t" });
    expect(result).toEqual([]);
  });

  it("drops alternatives identical to primary", async () => {
    aiPayload = {
      alternatives: [
        {
          name: "Same",
          pattern: primary.pattern,
          keyInsight: "x",
          timeComplexity: primary.timeComplexity,
          spaceComplexity: primary.spaceComplexity,
        },
      ],
    };
    const result = await augmentCanonicalAlternatives(problemBase, primary, { userId: "u", teamId: "t" });
    expect(result).toEqual([]);
  });
});

describe("getCanonical lazy-augment branch (FEATURE_CANONICAL_ALTERNATIVES=true)", () => {
  let originalFlag;

  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    problemRow = { ...problemBase };
    updateCalls = [];
    aiPayload = {
      alternatives: [
        {
          name: "Memoized recursion",
          pattern: "Dynamic Programming",
          keyInsight: "Cache subproblems.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("triggers augmenter when canonicalAltGeneratedAt is null", async () => {
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.status).toBe(200);
    expect(aiMod.aiComplete).toHaveBeenCalledTimes(1);
    expect(res.body.data.alternatives).toHaveLength(1);
    expect(res.body.data.alternatives[0].name).toBe("Memoized recursion");
    const persistCall = updateCalls.find((c) => c.data.canonicalAltGeneratedAt);
    expect(persistCall).toBeDefined();
    expect(persistCall.data.canonicalAlternatives).toHaveLength(1);
  });

  it("does NOT touch primary fields when augmenting", async () => {
    const req = makeReq({ params: { id: "prob_1" } });
    await invoke(getCanonical, req);
    const persistCall = updateCalls.find((c) => c.data.canonicalAltGeneratedAt);
    expect(persistCall.data.canonicalPattern).toBeUndefined();
    expect(persistCall.data.canonicalKeyInsight).toBeUndefined();
    expect(persistCall.data.canonicalTimeComplexity).toBeUndefined();
    expect(persistCall.data.canonicalSpaceComplexity).toBeUndefined();
    expect(persistCall.data.canonicalGeneratedAt).toBeUndefined();
  });

  it("reads cache when canonicalAltGeneratedAt is set", async () => {
    problemRow = {
      ...problemBase,
      canonicalAltGeneratedAt: new Date(),
      canonicalAlternatives: [
        {
          name: "Cached",
          pattern: "Dynamic Programming",
          keyInsight: "x",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.status).toBe(200);
    expect(aiMod.aiComplete).not.toHaveBeenCalled();
    expect(res.body.data.alternatives[0].name).toBe("Cached");
  });

  it("returns primary alone (alternatives = []) when augmenter validator drops everything", async () => {
    aiPayload = {
      alternatives: [
        {
          name: "Same",
          pattern: primary.pattern,
          keyInsight: "x",
          timeComplexity: primary.timeComplexity,
          spaceComplexity: primary.spaceComplexity,
        },
      ],
    };
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.status).toBe(200);
    expect(res.body.data.alternatives).toEqual([]);
    const persistCall = updateCalls.find((c) => c.data.canonicalAltGeneratedAt);
    expect(persistCall).toBeDefined();
    expect(persistCall.data.canonicalAlternatives).toEqual([]);
  });
});

describe("getCanonical with FEATURE_CANONICAL_ALTERNATIVES=false", () => {
  let originalFlag;

  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "false";
    problemRow = { ...problemBase };
    updateCalls = [];
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("does NOT trigger augmenter (flag off)", async () => {
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.status).toBe(200);
    expect(aiMod.aiComplete).not.toHaveBeenCalled();
    expect(updateCalls.find((c) => c.data.canonicalAltGeneratedAt)).toBeUndefined();
  });
});
