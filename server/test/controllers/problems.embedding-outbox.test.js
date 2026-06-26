import { describe, it, expect, beforeEach, vi } from "vitest";

const embeddingServiceMock = vi.hoisted(() => ({
  embedAndPersist: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

const envMock = vi.hoisted(() => ({ AI_ENABLED: true }));
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return new Proxy(actual, {
    get(target, key) {
      if (key === "AI_ENABLED") return envMock.AI_ENABLED;
      return target[key];
    },
  });
});

const problemsCtrl = await import("../../src/controllers/problems.controller.js");

describe("generateProblemEmbedding → outbox wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.AI_ENABLED = true;
    embeddingServiceMock.embedAndPersist.mockResolvedValue([0.1, 0.2]);
  });

  it("test 19: invokes embedAndPersist('Problem', id) when AI is enabled", async () => {
    embeddingServiceMock.embedAndPersist.mockResolvedValueOnce([0.1, 0.2]);
    await problemsCtrl.generateProblemEmbedding("prob_test_1");
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledTimes(1);
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledWith("Problem", "prob_test_1");
  });

  it("test 20: propagates without throwing when embedAndPersist returns null", async () => {
    embeddingServiceMock.embedAndPersist.mockResolvedValueOnce(null);
    await expect(problemsCtrl.generateProblemEmbedding("prob_test_2")).resolves.toBeUndefined();
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledTimes(1);
  });

  it("test 21: short-circuits when AI is disabled (no embedAndPersist call)", async () => {
    envMock.AI_ENABLED = false;
    await problemsCtrl.generateProblemEmbedding("prob_test_3");
    expect(embeddingServiceMock.embedAndPersist).not.toHaveBeenCalled();
  });
});
