import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const embeddingServiceMock = vi.hoisted(() => ({
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => true),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

const { scheduleNoteEmbedding, cancelNoteEmbedding } = await import(
  "../../src/services/notes.embedding.js"
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  embeddingServiceMock.isEmbeddingEnabled.mockReturnValue(true);
  embeddingServiceMock.embedAndPersist.mockResolvedValue([0.1, 0.2]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notes.embedding — debouncer + cancel", () => {
  it("test 22: cancelNoteEmbedding(id) clears the timer + returns true", () => {
    scheduleNoteEmbedding("note_1");
    const returned = cancelNoteEmbedding("note_1");
    expect(returned).toBe(true);
  });

  it("test 23: cancelNoteEmbedding(id) returns false when no timer exists", () => {
    const returned = cancelNoteEmbedding("nonexistent_note");
    expect(returned).toBe(false);
  });

  it("test 24: cancelNoteEmbedding(null) returns false + is a no-op", () => {
    const returned = cancelNoteEmbedding(null);
    expect(returned).toBe(false);
    const returned2 = cancelNoteEmbedding(undefined);
    expect(returned2).toBe(false);
  });

  it("test 25: schedule then cancel prevents embedAndPersist from firing", async () => {
    scheduleNoteEmbedding("note_2");
    cancelNoteEmbedding("note_2");
    await vi.advanceTimersByTimeAsync(6000);
    expect(embeddingServiceMock.embedAndPersist).not.toHaveBeenCalled();
  });
});
