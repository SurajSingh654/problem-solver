import { describe, it, expect, beforeEach, vi } from "vitest";

const ragMock = vi.hoisted(() => ({
  findSimilarTeammateSolutions: vi.fn(),
}));
vi.mock("../../src/services/rag.service.js", () => ragMock);

const prismaMock = vi.hoisted(() => ({
  team: { findUnique: vi.fn() },
  solution: { findMany: vi.fn() },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

describe("interview.engine searchTeammateSolutions vector branch (T16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T16: vector-search branch maps rag rows to snake_case tool output", async () => {
    const sampleRows = [
      {
        id: "sol_a",
        approach: "two pointers",
        keyInsight: "monotonic invariant",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 4,
        patterns: ["arrays"],
        authorName: "Alice",
        similarity: 0.92,
      },
    ];
    ragMock.findSimilarTeammateSolutions.mockResolvedValueOnce(sampleRows);
    prismaMock.team.findUnique.mockResolvedValueOnce({ isPersonal: false });

    const { tools } = await import("../../src/services/interview.engine.js");
    const handler = tools.searchTeammateSolutions;
    const result = await handler(
      { problemId: "prob_1", query: "two pointers" },
      { teamId: "team_1", userId: "user_1", problemId: "prob_1" },
    );

    expect(ragMock.findSimilarTeammateSolutions).toHaveBeenCalledWith({
      problemId: "prob_1",
      teamId: "team_1",
      userId: "user_1",
      queryText: "two pointers",
    });

    expect(result).toEqual({
      solutions: [
        {
          approach: "two pointers",
          key_insight: "monotonic invariant",
          time_complexity: "O(n)",
          space_complexity: "O(1)",
          patterns: ["arrays"],
          confidence: 4,
          author_name: "Alice",
        },
      ],
    });
  });
});
