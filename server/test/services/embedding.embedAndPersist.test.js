import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  solution: { findUnique: vi.fn() },
  problem: { findUnique: vi.fn() },
  note: { findUnique: vi.fn() },
  $executeRawUnsafe: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// Track calls to generateEmbedding so we can control its return value per test
const oaiCalls = vi.hoisted(() => ({ embedding: [0.1, 0.2, 0.3] }));

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor() {
      this.embeddings = {
        create: vi.fn(async () => ({
          data: [{ embedding: oaiCalls.embedding }],
        })),
      };
    }
  },
}));

vi.mock("../../src/config/env.js", () => ({
  OPENAI_API_KEY: "test-key",
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
  AI_REQUEST_TIMEOUT_MS: 30000,
}));

const outboxMock = vi.hoisted(() => ({
  enqueueEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.outbox.js", () => outboxMock);

// Import under test AFTER mocks are registered
const { embedAndPersist } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  oaiCalls.embedding = [0.1, 0.2, 0.3];
  prismaMock.$executeRawUnsafe.mockResolvedValue(1);
  outboxMock.enqueueEmbedding.mockResolvedValue(undefined);
});

describe("embedAndPersist", () => {
  // ── Solution ──────────────────────────────────────────────────────────────

  it("test 27: Solution happy path — loads, embeds, writes SQL, returns embedding", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce({
      approach: "two-pointer",
      code: "function f() {}",
      keyInsight: "key insight here",
      patterns: ["arrays"],
      problem: { title: "Two Sum", difficulty: "EASY", category: "CODING", tags: [] },
    });

    const result = await embedAndPersist("Solution", "sol_1");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, vectorStr, entityId] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/UPDATE "solutions"/);
    expect(sql).toMatch(/embedding/);
    expect(vectorStr).toBe("[0.1,0.2,0.3]");
    expect(entityId).toBe("sol_1");
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
  });

  it("test 28: null embedding → enqueueEmbedding called + no SQL UPDATE", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce({
      approach: "brute force",
      code: "for loop",
      keyInsight: "key insight text",
      patterns: ["sliding window"],
      problem: { title: "Test Problem", difficulty: "MEDIUM", category: "CODING", tags: [] },
    });
    oaiCalls.embedding = null;

    const result = await embedAndPersist("Solution", "sol_2");

    expect(result).toBeNull();
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledTimes(1);
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Solution",
      "sol_2",
      "generateEmbedding returned null",
    );
  });

  it("test 29: SQL UPDATE throws → enqueueEmbedding called with db-update reason", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce({
      approach: "dynamic programming",
      code: "dp table",
      keyInsight: "overlapping subproblems",
      patterns: ["dp"],
      problem: { title: "Climbing Stairs", difficulty: "EASY", category: "CODING", tags: [] },
    });
    prismaMock.$executeRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));

    const result = await embedAndPersist("Solution", "sol_3");

    expect(result).toBeNull();
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledTimes(1);
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Solution",
      "sol_3",
      expect.stringContaining("db update failed"),
    );
  });

  it("test 30: entity not found → returns null + no enqueueEmbedding", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce(null);

    const result = await embedAndPersist("Solution", "sol_missing");

    expect(result).toBeNull();
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
  });

  // ── Problem ───────────────────────────────────────────────────────────────

  it("test 31: Problem happy path — loads, embeds, writes SQL, returns embedding", async () => {
    prismaMock.problem.findUnique.mockResolvedValueOnce({
      title: "Two Sum",
      category: "CODING",
      difficulty: "EASY",
      description: "Find two numbers that add up to target",
      tags: ["arrays", "hash-map"],
      companyTags: ["Google", "Amazon"],
      realWorldContext: null,
    });

    const result = await embedAndPersist("Problem", "prob_1");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, , entityId] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/UPDATE "problems"/);
    expect(entityId).toBe("prob_1");
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
  });

  // ── Note ──────────────────────────────────────────────────────────────────

  it("test 32: Note happy path — loads, embeds, writes SQL, returns embedding", async () => {
    prismaMock.note.findUnique.mockResolvedValueOnce({
      title: "DP patterns overview",
      tags: ["dp", "memoization"],
      linkedEntityType: "PROBLEM",
      contentMarkdown: "Dynamic programming is a technique for solving overlapping subproblems...",
    });

    const result = await embedAndPersist("Note", "note_1");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, , entityId] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/UPDATE "notes"/);
    expect(entityId).toBe("note_1");
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
  });

  // ── Unknown entityType ─────────────────────────────────────────────────

  it("test 33: unknown entityType logs error and returns null", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await embedAndPersist("Widget", "widget_1");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Embedding] Unknown entityType"),
    );
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
