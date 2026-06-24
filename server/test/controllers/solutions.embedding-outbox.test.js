import { describe, it, expect, beforeEach, vi } from "vitest";

const outboxMock = vi.hoisted(() => ({
  enqueueEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.outbox.js", () => outboxMock);

const embeddingServiceMock = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const prismaMock = vi.hoisted(() => ({
  solution: { findUnique: vi.fn() },
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const solutionsCtrl = await import("../../src/controllers/solutions.controller.js");

describe("generateSolutionEmbedding → outbox wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.solution.findUnique.mockResolvedValue({
      approach: "test approach",
      code: "function f() {}",
      keyInsight: "insight",
      patterns: ["arrays"],
      problem: { title: "Test problem" },
    });
  });

  it("test 16: when generateEmbedding returns null, enqueueEmbedding is called with ('Solution', solutionId)", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce(null);
    await solutionsCtrl.generateSolutionEmbedding("sol_test_1");
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledTimes(1);
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Solution",
      "sol_test_1",
      expect.stringContaining("generateEmbedding returned null"),
    );
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("test 17: when raw SQL UPDATE throws, enqueueEmbedding is called with the db error reason", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    prismaMock.$executeRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));
    await solutionsCtrl.generateSolutionEmbedding("sol_test_2");
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Solution",
      "sol_test_2",
      expect.stringContaining("db update failed"),
    );
  });

  it("test 18: when embedding succeeds, enqueueEmbedding is NOT called", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    prismaMock.$executeRawUnsafe.mockResolvedValueOnce(undefined);
    await solutionsCtrl.generateSolutionEmbedding("sol_test_3");
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
