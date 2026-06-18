import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let lockRow = null;
let _updateData = null;
let attemptData = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    $transaction: vi.fn(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(async () => (lockRow ? [lockRow] : [])),
        solution: {
          update: vi.fn(async ({ data }) => { _updateData = data; return {}; }),
        },
        reviewAttempt: {
          create: vi.fn(async ({ data }) => { attemptData = data; return data; }),
        },
      };
      return fn(tx);
    }),
  },
}));

const { submitReview } = await import(
  "../../src/controllers/solutions.controller.js"
);

describe("submitReview (peeked)", () => {
  beforeEach(() => {
    lockRow = {
      id: "sol_1",
      sm2EasinessFactor: 2.5,
      sm2Interval: 1,
      sm2Repetitions: 0,
      reviewDates: [],
      lapseCount: 0,
    };
    _updateData = null;
    attemptData = null;
  });

  it("clamps SM-2 quality to 3 when peeked=true and confidence=5", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { confidence: 5, peeked: true },
    });
    const res = await invoke(submitReview, req);
    expect(res.status).toBe(200);
    expect(attemptData.peeked).toBe(true);
    expect(attemptData.quality).toBe(3);
  });

  it("does not clamp when peeked=false", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { confidence: 5, peeked: false },
    });
    const res = await invoke(submitReview, req);
    expect(res.status).toBe(200);
    expect(attemptData.peeked).toBe(false);
    expect(attemptData.quality).toBeGreaterThan(3);
  });

  it("treats omitted peeked as false", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { confidence: 5 },
    });
    const res = await invoke(submitReview, req);
    expect(res.status).toBe(200);
    expect(attemptData.peeked).toBe(false);
  });
});
