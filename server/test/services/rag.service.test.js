import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const embeddingServiceMock = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

const ragModule = await import("../../src/services/rag.service.js");
const {
  findSimilarTeammateSolutions,
  formatTeammateContext,
  RAG_FRESHNESS_DAYS,
  RAG_TEAMMATE_LIMIT_DEFAULT,
  RAG_APPROACH_CHAR_CAP,
  RAG_KEY_INSIGHT_CHAR_CAP,
  RAG_CONTEXT_HARD_CAP,
} = ragModule;

beforeEach(() => {
  vi.clearAllMocks();
  embeddingServiceMock.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  prismaMock.$queryRawUnsafe.mockResolvedValue([]);
});

describe("rag.service — constants", () => {
  it("exports the 5 documented constants", () => {
    expect(RAG_FRESHNESS_DAYS).toBe(180);
    expect(RAG_TEAMMATE_LIMIT_DEFAULT).toBe(3);
    expect(RAG_APPROACH_CHAR_CAP).toBe(400);
    expect(RAG_KEY_INSIGHT_CHAR_CAP).toBe(300);
    expect(RAG_CONTEXT_HARD_CAP).toBe(2400);
  });
});

describe("findSimilarTeammateSolutions", () => {
  const baseParams = {
    problemId: "prob_1",
    teamId: "team_1",
    userId: "user_1",
    queryText: "two pointers approach",
  };
  const SAMPLE_ROW = {
    id: "sol_a",
    approach: "two pointers",
    keyInsight: "monotonic invariant",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    confidence: 4,
    patterns: ["arrays", "two-pointers"],
    authorName: "Alice",
    similarity: 0.92,
  };

  it("T1: happy path — embed → SQL → return rows", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([SAMPLE_ROW]);
    const rows = await findSimilarTeammateSolutions(baseParams);
    expect(rows).toEqual([SAMPLE_ROW]);
    expect(embeddingServiceMock.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(embeddingServiceMock.generateEmbedding).toHaveBeenCalledWith(
      "two pointers approach",
    );
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[1]).toMatch(/^\[0\.1,0\.2,0\.3\]$/);
    expect(args[2]).toBe("team_1");
    expect(args[3]).toBe("prob_1");
    expect(args[4]).toBe("user_1");
    expect(args[5]).toBe("180");
    expect(args[6]).toBe(3);
  });

  it("T2: empty queryText → returns [] without embedding or DB call", async () => {
    const rows = await findSimilarTeammateSolutions({ ...baseParams, queryText: "" });
    expect(rows).toEqual([]);
    expect(embeddingServiceMock.generateEmbedding).not.toHaveBeenCalled();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("T3: generateEmbedding returns null → returns [], no DB call", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce(null);
    const rows = await findSimilarTeammateSolutions(baseParams);
    expect(rows).toEqual([]);
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("T4: DB throws → returns [], logs [rag.service] error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));
    const rows = await findSimilarTeammateSolutions(baseParams);
    expect(rows).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[rag.service]"),
      expect.stringContaining("connection refused"),
    );
    errSpy.mockRestore();
  });

  it("T5: SQL includes updatedAt freshness predicate", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions(baseParams);
    const sql = prismaMock.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toMatch(/"updatedAt"\s*>\s*now\(\)/);
    expect(sql).toMatch(/\|\| ' days'\)::interval/);
  });

  it("T6: SQL orders by vector and includes parameterized LIMIT", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions(baseParams);
    const sql = prismaMock.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toMatch(/ORDER BY s\.embedding\s*<=>/);
    expect(sql).toMatch(/LIMIT \$6/);
  });

  it("T7: custom limit parameter is the 7th positional arg", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions({ ...baseParams, limit: 5 });
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[6]).toBe(5);
  });

  it("T8: custom freshnessDays parameter is the 6th positional arg", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions({ ...baseParams, freshnessDays: 90 });
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[5]).toBe("90");
  });
});

describe("formatTeammateContext", () => {
  it("T9: empty array → empty string", () => {
    expect(formatTeammateContext([])).toBe("");
    expect(formatTeammateContext(null)).toBe("");
    expect(formatTeammateContext(undefined)).toBe("");
  });

  it("T10: typical rows produce Teammate N (name): structure", () => {
    const rows = [
      {
        approach: "two pointers walking inward",
        keyInsight: "loop invariant on sum",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 4,
        patterns: ["arrays", "two-pointers"],
        authorName: "Alice",
      },
    ];
    const out = formatTeammateContext(rows);
    expect(out).toContain("Teammate 1 (Alice):");
    expect(out).toContain("Approach: two pointers walking inward");
    expect(out).toContain("Key Insight: loop invariant on sum");
    expect(out).toContain("Complexity: O(n) time, O(1) space");
    expect(out).toContain("Pattern: arrays, two-pointers");
    expect(out).toContain("Confidence: 4/5");
  });

  it("T11: approach > 400 chars is truncated to 400", () => {
    const longApproach = "x".repeat(800);
    const rows = [
      {
        approach: longApproach,
        keyInsight: "short",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 3,
        patterns: [],
        authorName: "Bob",
      },
    ];
    const out = formatTeammateContext(rows);
    const approachMatch = out.match(/Approach: (x+)/);
    expect(approachMatch).not.toBeNull();
    expect(approachMatch[1].length).toBe(400);
  });

  it("T12: keyInsight > 300 chars is truncated to 300", () => {
    const longInsight = "y".repeat(600);
    const rows = [
      {
        approach: "short",
        keyInsight: longInsight,
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 3,
        patterns: [],
        authorName: "Carol",
      },
    ];
    const out = formatTeammateContext(rows);
    const insightMatch = out.match(/Key Insight: (y+)/);
    expect(insightMatch).not.toBeNull();
    expect(insightMatch[1].length).toBe(300);
  });

  it("T13: many-teammate input → total cap fires with [...truncated] marker", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      approach: "x".repeat(400),
      keyInsight: "y".repeat(300),
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      confidence: 3,
      patterns: ["pattern"],
      authorName: `User${i + 1}`,
    }));
    const out = formatTeammateContext(rows);
    expect(out.endsWith("[...truncated]")).toBe(true);
    const beforeMarker = out.slice(0, -"\n[...truncated]".length);
    expect(beforeMarker.length).toBeLessThanOrEqual(RAG_CONTEXT_HARD_CAP);
  });

  it("T14: null fields produce 'Not provided' / 'Not identified' / '?' fallbacks", () => {
    const rows = [
      {
        approach: null,
        keyInsight: null,
        timeComplexity: null,
        spaceComplexity: null,
        confidence: null,
        patterns: null,
        authorName: "Anon",
      },
    ];
    const out = formatTeammateContext(rows);
    expect(out).toContain("Approach: Not provided");
    expect(out).toContain("Key Insight: Not provided");
    expect(out).toContain("Complexity: ? time, ? space");
    expect(out).toContain("Pattern: Not identified");
    expect(out).toContain("Confidence: ?/5");
  });
});
