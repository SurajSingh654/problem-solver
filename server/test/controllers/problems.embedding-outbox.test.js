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
  problem: { findUnique: vi.fn() },
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const problemsCtrl = await import("../../src/controllers/problems.controller.js");

describe("generateProblemEmbedding → outbox wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.problem.findUnique.mockResolvedValue({
      title: "Test problem",
      description: "test desc",
      tags: ["dp"],
      category: "CODING",
    });
  });

  it("test 19: when generateEmbedding returns null, enqueueEmbedding('Problem', id) is called", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce(null);
    await problemsCtrl.generateProblemEmbedding("prob_test_1");
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledTimes(1);
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Problem",
      "prob_test_1",
      expect.stringContaining("generateEmbedding returned null"),
    );
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("test 20: when SQL UPDATE throws, enqueueEmbedding is called with db-update reason", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    prismaMock.$executeRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));
    await problemsCtrl.generateProblemEmbedding("prob_test_2");
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Problem",
      "prob_test_2",
      expect.stringContaining("db update failed"),
    );
  });

  it("test 21: when embedding succeeds, enqueueEmbedding is NOT called", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    prismaMock.$executeRawUnsafe.mockResolvedValueOnce(undefined);
    await problemsCtrl.generateProblemEmbedding("prob_test_3");
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
