import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  note: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  noteFolder: { findFirst: vi.fn() },
  // Entity-link resolution surfaces — defense-in-depth.
  // T123 short-circuits before reaching these, but a future test that
  // exercises a happy-path link would otherwise crash on undefined.findFirst.
  problem: { findFirst: vi.fn() },
  interviewSession: { findFirst: vi.fn() },
  designSession: { findFirst: vi.fn() },
  teachingSession: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// CRITICAL: hoist the embedding mock symbols so test assertions can reference
// them. Plain `vi.mock(factory)` creates the mock fns inside the module registry
// but doesn't expose them as bare identifiers — assertions like
// `expect(scheduleNoteEmbedding).toHaveBeenCalled()` would throw ReferenceError.
// Pattern matches existing `notes.delete-cancel.test.js`.
const notesEmbeddingMock = vi.hoisted(() => ({
  scheduleNoteEmbedding: vi.fn(),
  cancelNoteEmbedding: vi.fn(),
}));
vi.mock("../../src/services/notes.embedding.js", () => notesEmbeddingMock);

const {
  createNote,
  updateNote,
  duplicateNote,
  archiveNote,
  restoreNote,
  deleteNotePermanent,
  togglePin,
} = await import("../../src/controllers/notes.controller.js");

function mockReqRes({ body = {}, params = {}, userId = "user_1" } = {}) {
  const req = {
    body,
    params,
    user: { id: userId },
    requestId: "req_test_6b",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  res.req = req;  // error() helper reads res.req?.requestId
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset implementations to prevent permanent-mock bleed across tests
  // (lesson from Sprint 6a code-quality review).
  prismaMock.note.findFirst.mockReset();
  prismaMock.note.create.mockReset();
  prismaMock.note.update.mockReset();
  prismaMock.note.updateMany.mockReset();
  prismaMock.note.delete.mockReset();
  prismaMock.noteFolder.findFirst.mockReset();
  prismaMock.problem.findFirst.mockReset();
  prismaMock.interviewSession.findFirst.mockReset();
  prismaMock.designSession.findFirst.mockReset();
  prismaMock.teachingSession.findFirst.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
  notesEmbeddingMock.scheduleNoteEmbedding.mockReset();
  notesEmbeddingMock.cancelNoteEmbedding.mockReset();
});

// ---------------------------------------------------------------------------
// createNote — T121-T123
// ---------------------------------------------------------------------------
describe("createNote", () => {
  it("test 121: createNote happy", async () => {
    prismaMock.note.create.mockResolvedValueOnce({
      id: "note_new",
      userId: "user_1",
      title: "T",
      contentMarkdown: "",
      tags: [],
    });
    const { req, res } = mockReqRes({ body: { title: "T" } });
    await createNote(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    // Authz: create payload carries the caller's userId — no anonymous-note path.
    expect(prismaMock.note.create.mock.calls[0][0].data.userId).toBe("user_1");
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_new");
  });

  it("test 122: createNote empty title 400", async () => {
    const { req, res } = mockReqRes({ body: { title: "   " } });
    await createNote(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Title is required");
    expect(json.error.requestId).toBe("req_test_6b");
  });

  it("test 123: createNote invalid entity link 400", async () => {
    const { req, res } = mockReqRes({
      body: { title: "T", linkedEntityType: "BOGUS", linkedEntityId: "x" },
    });
    await createNote(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Invalid entity type");
    expect(json.error.requestId).toBe("req_test_6b");
  });
});

// ---------------------------------------------------------------------------
// updateNote — T124-T129
// ---------------------------------------------------------------------------
describe("updateNote", () => {
  it("test 124: updateNote ownership 404", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" }, body: { title: "X" } });
    await updateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Note not found");
    expect(json.error.requestId).toBe("req_test_6b");
    // AUTHZ INVARIANT: ownership filter must be in the where clause.
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 125: updateNote title change re-embeds", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
    prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", title: "X" });
    const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { title: "X" } });
    await updateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_1");
  });

  it("test 126: updateNote contentMarkdown change re-embeds (covers the || branch at L427-428)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
    prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", contentMarkdown: "new body" });
    const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { contentMarkdown: "new body" } });
    await updateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_1");
  });

  it("test 127: updateNote tags-only does NOT re-embed (conditional re-embed negative arm)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
    prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", tags: ["foo"] });
    const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { tags: ["foo"] } });
    await updateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
  });

  it("test 128: updateNote link-detach regression (covers L378-381)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
    prismaMock.note.update.mockResolvedValueOnce({
      id: "note_1", linkedEntityType: null, linkedEntityId: null, linkedEntityTitle: null,
    });
    const { req, res } = mockReqRes({
      params: { id: "note_1" },
      body: { linkedEntityType: null },  // detach
    });
    await updateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const updateArg = prismaMock.note.update.mock.calls[0][0];
    expect(updateArg.data.linkedEntityType).toBeNull();
    expect(updateArg.data.linkedEntityId).toBeNull();
    expect(updateArg.data.linkedEntityTitle).toBeNull();
    // Detach is metadata-only → must NOT re-embed
    expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
  });

  it("test 129: updateNote folder reassignment ownership 404", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
    prismaMock.noteFolder.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { folderId: "fold_other" } });
    await updateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Folder not found");
    expect(json.error.requestId).toBe("req_test_6b");
    // AUTHZ INVARIANT: note ownership filter
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_1",
      userId: "user_1",
    });
    // AUTHZ INVARIANT: folder ownership filter — preventing cross-user folder attachment
    expect(prismaMock.noteFolder.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "fold_other",
      userId: "user_1",
    });
  });
});

// ---------------------------------------------------------------------------
// duplicateNote — T130-T132
// ---------------------------------------------------------------------------
describe("duplicateNote", () => {
  it("test 130: duplicateNote ownership 404", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await duplicateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
    // AUTHZ INVARIANT
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 131: duplicateNote happy", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      title: "Original",
      contentMarkdown: "body",
      tags: ["a", "b"],
      folderId: "fold_1",
    });
    prismaMock.note.create.mockResolvedValueOnce({
      id: "note_copy",
      title: "Copy of Original",
      contentMarkdown: "body",
      tags: ["a", "b"],
      folderId: "fold_1",
    });
    const { req, res } = mockReqRes({ params: { id: "note_src" } });
    await duplicateNote(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const createArg = prismaMock.note.create.mock.calls[0][0];
    expect(createArg.data.title).toBe("Copy of Original");
    expect(createArg.data.contentMarkdown).toBe("body");
    expect(createArg.data.tags).toEqual(["a", "b"]);
    expect(createArg.data.folderId).toBe("fold_1");
    // Authz: copy belongs to the caller, not the source-note owner
    expect(createArg.data.userId).toBe("user_1");
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_copy");
  });

  it("test 132: duplicateNote link-reset regression", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      title: "Templated",
      contentMarkdown: "body",
      tags: [],
      folderId: null,
      linkedEntityType: "PROBLEM",  // present on source — must NOT leak to copy
      linkedEntityId: "prob_1",
    });
    prismaMock.note.create.mockResolvedValueOnce({ id: "note_copy", title: "Copy of Templated" });
    const { req, res } = mockReqRes({ params: { id: "note_src" } });
    await duplicateNote(req, res);
    const createArg = prismaMock.note.create.mock.calls[0][0];
    expect(createArg.data.linkedEntityType).toBeUndefined();
    expect(createArg.data.linkedEntityId).toBeUndefined();
    expect(createArg.data.linkedEntityTitle).toBeUndefined();
    expect(createArg.data.pinned).toBeUndefined();
    expect(createArg.data.archivedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// archiveNote — T133-T134
// ---------------------------------------------------------------------------
describe("archiveNote", () => {
  it("test 133: archiveNote ownership 404", async () => {
    prismaMock.note.updateMany.mockResolvedValueOnce({ count: 0 });
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await archiveNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
    // AUTHZ INVARIANT: updateMany must filter by userId — the where clause is the
    // only authz gate (no separate findFirst step).
    expect(prismaMock.note.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 134: archiveNote auto-unpin regression", async () => {
    prismaMock.note.updateMany.mockResolvedValueOnce({ count: 1 });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await archiveNote(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const arg = prismaMock.note.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "note_1", userId: "user_1", archivedAt: null });
    expect(arg.data.archivedAt).toBeInstanceOf(Date);
    expect(arg.data.pinned).toBe(false);  // auto-unpin invariant
  });
});

// ---------------------------------------------------------------------------
// restoreNote — T135-T136
// ---------------------------------------------------------------------------
describe("restoreNote", () => {
  it("test 135: restoreNote ownership 404 (already-active)", async () => {
    prismaMock.note.updateMany.mockResolvedValueOnce({ count: 0 });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await restoreNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
    expect(prismaMock.note.updateMany.mock.calls[0][0].where).toMatchObject({
      id: "note_1",
      userId: "user_1",
      archivedAt: { not: null },
    });
  });

  it("test 136: restoreNote happy", async () => {
    prismaMock.note.updateMany.mockResolvedValueOnce({ count: 1 });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await restoreNote(req, res);
    const arg = prismaMock.note.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      id: "note_1",
      userId: "user_1",
      archivedAt: { not: null },
    });
    expect(arg.data.archivedAt).toBeNull();
    expect(res.json.mock.calls[0][0].data.archived).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteNotePermanent — T137-T138 (complements existing T26 cancel-wiring)
// ---------------------------------------------------------------------------
describe("deleteNotePermanent", () => {
  it("test 137: deleteNotePermanent ownership 404", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await deleteNotePermanent(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(notesEmbeddingMock.cancelNoteEmbedding).not.toHaveBeenCalled();
    expect(prismaMock.note.delete).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 138: deleteNotePermanent happy round-trip", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
    prismaMock.note.delete.mockResolvedValueOnce({ id: "note_1" });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await deleteNotePermanent(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.deleted).toBe(true);
    expect(notesEmbeddingMock.cancelNoteEmbedding).toHaveBeenCalledTimes(1);
    expect(notesEmbeddingMock.cancelNoteEmbedding).toHaveBeenCalledWith("note_1");
    expect(prismaMock.note.delete).toHaveBeenCalledWith({ where: { id: "note_1" } });
    // Cancel BEFORE delete invariant (cancel pre-empts the debounced embed):
    const cancelOrder = notesEmbeddingMock.cancelNoteEmbedding.mock.invocationCallOrder[0];
    const deleteOrder = prismaMock.note.delete.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(deleteOrder);
  });
});

// ---------------------------------------------------------------------------
// togglePin — T139-T142
// ---------------------------------------------------------------------------
describe("togglePin", () => {
  it("test 139: togglePin ownership 404", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await togglePin(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 140: togglePin archived-pin rejection regression", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      pinned: false,
      archivedAt: new Date(),
    });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await togglePin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Restore the note before pinning it");
    expect(json.error.requestId).toBe("req_test_6b");
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("test 141: togglePin happy false → true", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      pinned: false,
      archivedAt: null,
    });
    prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", pinned: true });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await togglePin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const updateArg = prismaMock.note.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "note_1" });
    expect(updateArg.data).toEqual({ pinned: true });
  });

  it("test 142: togglePin happy true → false", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      pinned: true,
      archivedAt: null,
    });
    prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", pinned: false });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await togglePin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const updateArg = prismaMock.note.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ pinned: false });
  });
});
