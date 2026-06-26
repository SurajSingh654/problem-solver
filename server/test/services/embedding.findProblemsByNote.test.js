import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("../../src/config/env.js", () => envMock);

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

const { findProblemsByNoteEmbedding } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findProblemsByNoteEmbedding — M16 source pre-check", () => {
  it("test 34: returns [] + logs when source note has NULL embedding", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);  // pre-check: empty

    const result = await findProblemsByNoteEmbedding("note_no_embed", ["team_1"], 5);

    expect(result).toEqual([]);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);  // ONLY pre-check ran
    const [sql] = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/embedding IS NOT NULL/);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("note_no_embed has no embedding yet"),
    );
    logSpy.mockRestore();
  });

  it("test 35: runs cross-table query when source note has non-NULL embedding", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ "?column?": 1 }]);  // pre-check: row
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "p1", title: "Problem 1", difficulty: "MEDIUM", category: "CODING", tags: [], distance: 0.12 },
      { id: "p2", title: "Problem 2", difficulty: "HARD", category: "CODING", tags: [], distance: 0.18 },
    ]);

    const result = await findProblemsByNoteEmbedding("note_with_embed", ["team_1"], 5);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("p1");
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    const mainSql = prismaMock.$queryRawUnsafe.mock.calls[1][0];
    expect(mainSql).toMatch(/SELECT.*FROM problems/s);
    expect(mainSql).toMatch(/embedding <=> /);
  });
});
