import { describe, it, expect, beforeEach, vi } from "vitest";

const notesEmbeddingMock = vi.hoisted(() => ({
  scheduleNoteEmbedding: vi.fn(),
  cancelNoteEmbedding: vi.fn(),
}));
vi.mock("../../src/services/notes.embedding.js", () => notesEmbeddingMock);

const prismaMock = vi.hoisted(() => ({
  note: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const { deleteNotePermanent } = await import(
  "../../src/controllers/notes.controller.js"
);

function mockReqRes(noteId, userId = "user_1") {
  const req = {
    params: { id: noteId },
    user: { id: userId },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteNotePermanent — M10 wiring", () => {
  it("test 26: calls cancelNoteEmbedding(id) before prisma.note.delete", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_target" });
    prismaMock.note.delete.mockResolvedValueOnce({ id: "note_target" });

    const { req, res } = mockReqRes("note_target");
    await deleteNotePermanent(req, res);

    expect(notesEmbeddingMock.cancelNoteEmbedding).toHaveBeenCalledWith(
      "note_target",
    );
    expect(prismaMock.note.delete).toHaveBeenCalledWith({
      where: { id: "note_target" },
    });

    const cancelOrder =
      notesEmbeddingMock.cancelNoteEmbedding.mock.invocationCallOrder[0];
    const deleteOrder =
      prismaMock.note.delete.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(deleteOrder);
  });
});
