import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

// Per-test env mock — re-set before each test, then dynamically import the
// service so it picks up the current AI_ENABLED value at module-load time.

beforeEach(() => {
  vi.resetModules();
});

async function importWithEnv(envOverrides) {
  vi.doMock("../../src/config/env.js", () => ({
    OPENAI_API_KEY: envOverrides.OPENAI_API_KEY ?? "",
    AI_ENABLED: envOverrides.AI_ENABLED ?? false,
    AI_REQUEST_TIMEOUT_MS: 30000,
    AI_EMBEDDING_MODEL: "text-embedding-3-small",
  }));
  return await import("../../src/services/embedding.service.js");
}

describe("isEmbeddingEnabled — aligned with env.js AI_ENABLED", () => {
  it("test 53: returns true when env.js AI_ENABLED is true (OPENAI_API_KEY set)", async () => {
    const { isEmbeddingEnabled } = await importWithEnv({
      OPENAI_API_KEY: "sk-real-key",
      AI_ENABLED: true,
    });
    expect(isEmbeddingEnabled()).toBe(true);
  });

  it("test 54: returns false when env.js AI_ENABLED is false (no OPENAI_API_KEY)", async () => {
    const { isEmbeddingEnabled } = await importWithEnv({
      OPENAI_API_KEY: "",
      AI_ENABLED: false,
    });
    expect(isEmbeddingEnabled()).toBe(false);
  });
});
