import { describe, it, expect, beforeEach, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("../../src/config/env.js", () => envMock);

const oaiCalls = vi.hoisted(() => ({ embeddings: [] }));

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor(opts) {
      this.opts = opts;
      this.embeddings = {
        create: vi.fn(async (args) => {
          oaiCalls.embeddings.push(args);
          return { data: [{ embedding: [0.1, 0.2, 0.3] }] };
        }),
      };
    }
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));

const { generateEmbedding } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  oaiCalls.embeddings.length = 0;
});

describe("generateEmbedding — M15 env var lock-in", () => {
  it("test 36: passes AI_EMBEDDING_MODEL from env to OpenAI", async () => {
    envMock.AI_EMBEDDING_MODEL = "test-marker-model-3-xlarge";
    const result = await generateEmbedding("hello world");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(oaiCalls.embeddings).toHaveLength(1);
    expect(oaiCalls.embeddings[0].model).toBe("test-marker-model-3-xlarge");
  });
});
