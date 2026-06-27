import { describe, it, expect, beforeEach, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("../../src/config/env.js", () => envMock);

const oaiCalls = vi.hoisted(() => ({ embeddings: [], shouldThrow: false }));

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor(opts) {
      this.opts = opts;
      this.embeddings = {
        create: vi.fn(async (args) => {
          oaiCalls.embeddings.push(args);
          if (oaiCalls.shouldThrow) {
            throw new Error("OpenAI down");
          }
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
  oaiCalls.shouldThrow = false;
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

describe("generateEmbedding — edge cases", () => {
  it("test 37: empty string input returns null without OpenAI call", async () => {
    const result = await generateEmbedding("");
    expect(result).toBeNull();
    expect(oaiCalls.embeddings).toHaveLength(0);
  });

  it("test 38: whitespace-only input returns null without OpenAI call", async () => {
    const result = await generateEmbedding("   \n\t  ");
    expect(result).toBeNull();
    expect(oaiCalls.embeddings).toHaveLength(0);
  });

  it("test 39: OpenAI throws → returns null + logs [Embedding] Generation failed:", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    oaiCalls.shouldThrow = true;
    const result = await generateEmbedding("hello world");
    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Embedding] Generation failed:"),
      expect.stringContaining("OpenAI down"),
    );
    errSpy.mockRestore();
  });

  it("test 40: input > 8000 chars is truncated to exactly 8000 before send", async () => {
    const longInput = "x".repeat(10000);
    await generateEmbedding(longInput);
    expect(oaiCalls.embeddings).toHaveLength(1);
    expect(oaiCalls.embeddings[0].input.length).toBe(8000);
    expect(oaiCalls.embeddings[0].input).toBe("x".repeat(8000));
  });
});
