import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

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

const { findSimilarNotes } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findSimilarNotes", () => {
  it("test 50: happy path returns the rows from the vector query", async () => {
    const sampleRows = [
      { id: "note_b", title: "Other note 1", tags: ["a"], updatedAt: new Date(), distance: 0.1 },
      { id: "note_c", title: "Other note 2", tags: ["b"], updatedAt: new Date(), distance: 0.15 },
      { id: "note_d", title: "Other note 3", tags: ["c"], updatedAt: new Date(), distance: 0.2 },
    ];
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce(sampleRows);

    const result = await findSimilarNotes("note_a", "user_1", 5);

    expect(result).toEqual(sampleRows);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[1]).toBe("note_a");
    expect(args[2]).toBe("user_1");
    expect(args[3]).toBe(5);
  });

  it("test 51: DB throws → returns [] + logs [Embedding] Similar notes search failed:", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));

    const result = await findSimilarNotes("note_a", "user_1", 5);

    expect(result).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Embedding] Similar notes search failed:"),
      expect.stringContaining("connection refused"),
    );
    errSpy.mockRestore();
  });

  it("test 52: custom limit parameter is the 4th positional arg in $queryRawUnsafe", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarNotes("note_a", "user_1", 10);
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[3]).toBe(10);
  });
});
