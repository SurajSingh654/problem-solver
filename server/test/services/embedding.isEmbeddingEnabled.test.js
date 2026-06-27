import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));
vi.mock("../../src/config/env.js", () => ({
  OPENAI_API_KEY: "sk-test",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

const { isEmbeddingEnabled } = await import(
  "../../src/services/embedding.service.js"
);

const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  if (ORIGINAL_AI_ENABLED === undefined) delete process.env.AI_ENABLED;
  else process.env.AI_ENABLED = ORIGINAL_AI_ENABLED;
  if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
});

describe("isEmbeddingEnabled", () => {
  it("test 53: both AI_ENABLED=true AND OPENAI_API_KEY set → true", () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENAI_API_KEY = "sk-real-key";
    expect(isEmbeddingEnabled()).toBe(true);
  });

  it("test 54: AI_ENABLED=false → false even with OPENAI_API_KEY set", () => {
    process.env.AI_ENABLED = "false";
    process.env.OPENAI_API_KEY = "sk-real-key";
    expect(isEmbeddingEnabled()).toBe(false);
  });

  it("test 55: OPENAI_API_KEY missing → false even with AI_ENABLED=true", () => {
    process.env.AI_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingEnabled()).toBe(false);
  });
});
