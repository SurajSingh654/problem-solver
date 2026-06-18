import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiBehavior = { kind: "valid", payload: {} };
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
          problemRow ? [{ id: problemRow.id, canonicalGeneratedAt: problemRow.canonicalGeneratedAt }] : [],
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
  aiComplete: vi.fn(async () => {
    if (aiBehavior.kind === "throws") throw new Error("ai-down");
    return aiBehavior.payload;
  }),
  isAIEnabled: () => true,
  AI_MODEL_FAST: "gpt-4o-mini",
}));

const { getCanonical } = await import("../../src/controllers/problems.controller.js");

describe("getCanonical", () => {
  beforeEach(() => {
    aiBehavior = {
      kind: "valid",
      payload: {
        pattern: "Array / Hashing",
        keyInsight: "Map values to indices for O(1) complement lookup.",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
      },
    };
    problemRow = {
      id: "prob_1",
      title: "Two Sum",
      description: "Given an array, find two indices that sum to target.",
      difficulty: "EASY",
      category: "CODING",
      teamId: "team_test",
      canonicalGeneratedAt: null,
      canonicalPattern: null,
      canonicalKeyInsight: null,
      canonicalTimeComplexity: null,
      canonicalSpaceComplexity: null,
      canonicalEditedAt: null,
    };
    updateCalls = [];
  });

  it("first fetch generates and persists the canonical answer", async () => {
    const req = makeReq({ params: { id: "prob_1" } });
    const { status, body } = await invoke(getCanonical, req);
    expect(status).toBe(200);
    expect(body.data.pattern).toBe("Array / Hashing");
    const persistCall = updateCalls.find((c) => c.data.canonicalGeneratedAt);
    expect(persistCall).toBeDefined();
    expect(persistCall.data.canonicalPattern).toBe("Array / Hashing");
  });

  it("second fetch reads cache without calling AI", async () => {
    problemRow.canonicalGeneratedAt = new Date();
    problemRow.canonicalPattern = "Array / Hashing";
    problemRow.canonicalKeyInsight = "cached";
    problemRow.canonicalTimeComplexity = "O(n)";
    problemRow.canonicalSpaceComplexity = "O(n)";
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const { status, body } = await invoke(getCanonical, req);
    expect(status).toBe(200);
    expect(body.data.pattern).toBe("Array / Hashing");
    expect(aiMod.aiComplete).not.toHaveBeenCalled();
  });

  it("returns 502 and does NOT persist when validator rejects AI output", async () => {
    aiBehavior = {
      kind: "valid",
      payload: { pattern: "Made-Up", keyInsight: "x", timeComplexity: "linear", spaceComplexity: "" },
    };
    const req = makeReq({ params: { id: "prob_1" } });
    const { status } = await invoke(getCanonical, req);
    expect(status).toBe(502);
    expect(updateCalls.find((c) => c.data.canonicalGeneratedAt)).toBeUndefined();
  });

  it("returns 503 when AI throws and row never generated", async () => {
    aiBehavior = { kind: "throws" };
    const req = makeReq({ params: { id: "prob_1" } });
    const { status } = await invoke(getCanonical, req);
    expect(status).toBe(503);
  });

  it("returns 404 when problem not found", async () => {
    problemRow = null;
    const req = makeReq({ params: { id: "missing" } });
    const { status } = await invoke(getCanonical, req);
    expect(status).toBe(404);
  });
});
