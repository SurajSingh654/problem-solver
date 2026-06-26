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

const solutionsCtrl = await import("../../src/controllers/solutions.controller.js");

describe("generateSolutionEmbedding → outbox wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.AI_ENABLED = true;
    embeddingServiceMock.embedAndPersist.mockResolvedValue([0.1, 0.2]);
  });

  it("test 16: invokes embedAndPersist('Solution', id) when AI is enabled", async () => {
    embeddingServiceMock.embedAndPersist.mockResolvedValueOnce([0.1, 0.2]);
    await solutionsCtrl.generateSolutionEmbedding("sol_test_1");
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledTimes(1);
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledWith("Solution", "sol_test_1");
  });

  it("test 17: propagates without throwing when embedAndPersist returns null", async () => {
    embeddingServiceMock.embedAndPersist.mockResolvedValueOnce(null);
    await expect(solutionsCtrl.generateSolutionEmbedding("sol_test_2")).resolves.toBeUndefined();
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledTimes(1);
  });

  it("test 18: short-circuits when AI is disabled (no embedAndPersist call)", async () => {
    envMock.AI_ENABLED = false;
    await solutionsCtrl.generateSolutionEmbedding("sol_test_3");
    expect(embeddingServiceMock.embedAndPersist).not.toHaveBeenCalled();
  });
});
