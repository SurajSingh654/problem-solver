import { describe, it, expect, beforeEach, vi } from "vitest";

const ragMock = vi.hoisted(() => ({
  findSimilarTeammateSolutions: vi.fn(),
  formatTeammateContext: vi.fn(),
}));
vi.mock("../../src/services/rag.service.js", () => ragMock);

describe("aiReview RAG migration (T15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T15: passes problemId/teamId/userId/queryText to findSimilarTeammateSolutions and feeds rows into formatTeammateContext", async () => {
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
    ragMock.formatTeammateContext.mockReturnValueOnce(
      "Teammate 1 (Alice):\n  Approach: two pointers\n  ...",
    );

    const { findSimilarTeammateSolutions, formatTeammateContext } =
      await import("../../src/services/rag.service.js");

    const rows = await findSimilarTeammateSolutions({
      problemId: "prob_1",
      teamId: "team_1",
      userId: "user_1",
      queryText: "two pointers solution",
    });
    expect(ragMock.findSimilarTeammateSolutions).toHaveBeenCalledWith({
      problemId: "prob_1",
      teamId: "team_1",
      userId: "user_1",
      queryText: "two pointers solution",
    });

    const ctx = formatTeammateContext(rows);
    expect(ragMock.formatTeammateContext).toHaveBeenCalledWith(sampleRows);
    expect(ctx).toContain("Teammate 1 (Alice)");
  });
});
