import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  note: { findFirst: vi.fn(), findMany: vi.fn() },
  problem: { findMany: vi.fn() },
  interviewSession: { findMany: vi.fn() },
  designSession: { findMany: vi.fn() },
  teachingSession: { findMany: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([{ teamId: "team_1" }]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const {
  listNotes, getNote, listTags, listNotesByEntity, searchLinkableEntities,
} = await import("../../src/controllers/notes.controller.js");

function mockReqRes({ params = {}, query = {}, userId = "user_1" } = {}) {
  const req = { params, query, user: { id: userId }, requestId: "req_test_6c" };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  res.req = req;
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findFirst.mockReset();
  prismaMock.note.findMany.mockReset();
  prismaMock.problem.findMany.mockReset();
  prismaMock.interviewSession.findMany.mockReset();
  prismaMock.designSession.findMany.mockReset();
  prismaMock.teachingSession.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([{ teamId: "team_1" }]);
});

describe("listNotes", () => {
  it("test 143: happy default", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes({});
    await listNotes(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.data.notes).toEqual([]);
    expect(json.data.nextCursor).toBeNull();
    const arg = prismaMock.note.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ userId: "user_1", archivedAt: null });
    expect(arg.where.userId).toBe("user_1");  // explicit authz pin
    expect(arg.orderBy).toEqual([{ pinned: "desc" }, { updatedAt: "desc" }]);
  });

  it("test 144: filter shape", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([]);
    const { req, res } = mockReqRes({
      query: { archived: "true", pinned: "true", tag: "react" },
    });
    await listNotes(req, res);
    const arg = prismaMock.note.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      userId: "user_1",
      archivedAt: { not: null },
      pinned: true,
      tags: { has: "react" },
    });
  });

  it("test 145: cursor pagination (hasMore=true => nextCursor set)", async () => {
    // Mock returns limit+1 rows so hasMore=true.
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `note_${i}`, title: `T${i}`, _count: { flashcards: 0 }, folder: null,
    }));
    prismaMock.note.findMany.mockResolvedValueOnce(rows);
    const { req, res } = mockReqRes({ query: { limit: "10", cursor: "note_seed" } });
    await listNotes(req, res);
    const json = res.json.mock.calls[0][0];
    expect(json.data.notes.length).toBe(10);
    expect(json.data.nextCursor).toBe("note_9");
    const arg = prismaMock.note.findMany.mock.calls[0][0];
    expect(arg.where.userId).toBe("user_1");  // authz invariant
    expect(arg.take).toBe(11);  // limit + 1
    expect(arg.skip).toBe(1);
    expect(arg.cursor).toEqual({ id: "note_seed" });
  });
});

describe("getNote", () => {
  it("test 146: ownership 404", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await getNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Note not found");
    expect(json.error.requestId).toBe("req_test_6c");
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other", userId: "user_1",
    });
  });

  it("test 147: happy (dtoNote shape, _count + folder includes)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1", title: "T",
      _count: { flashcards: 3 },
      folder: { id: "fold_1", name: "F", parentId: null },
    });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await getNote(req, res);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.data.note.id).toBe("note_1");
    expect(json.data.note.flashcardCount).toBe(3);
    expect(json.data.note.folder).toMatchObject({ id: "fold_1", name: "F" });
    const arg = prismaMock.note.findFirst.mock.calls[0][0];
    expect(arg.include._count.select.flashcards).toBe(true);
    expect(arg.include.folder.select).toEqual({ id: true, name: true, parentId: true });
  });
});

describe("listTags", () => {
  it("test 148: aggregation: counts + ordering desc + excludes archived", async () => {
    // controller L948-951 does NOT dedupe within a row — "a" appears 2x in row 1 + 1x in row 2 = 3
    prismaMock.note.findMany.mockResolvedValueOnce([
      { tags: ["a", "a", "b"] },  // dupe-within-row possible
      { tags: ["a", "c"] },
      { tags: ["b"] },
    ]);
    const { req, res } = mockReqRes({});
    await listTags(req, res);
    const json = res.json.mock.calls[0][0];
    // "a" total = 3 (2 from row1 + 1 from row2), "b" 2, "c" 1
    expect(json.data.tags).toEqual([
      { tag: "a", count: 3 },
      { tag: "b", count: 2 },
      { tag: "c", count: 1 },
    ]);
    expect(prismaMock.note.findMany.mock.calls[0][0].where).toMatchObject({
      userId: "user_1",
      archivedAt: null,
    });
  });

  it("test 149: top-50 cap + ordering by count desc", async () => {
    // 60 distinct tags, varying counts so ordering is testable.
    // tag0 appears 60x, tag1 appears 59x, ..., tag59 appears 1x.
    const rows = [];
    for (let i = 0; i < 60; i++) {
      for (let j = 0; j <= 60 - i - 1; j++) {
        rows.push({ tags: [`tag${i}`] });
      }
    }
    prismaMock.note.findMany.mockResolvedValueOnce(rows);
    const { req, res } = mockReqRes({});
    await listTags(req, res);
    const tags = res.json.mock.calls[0][0].data.tags;
    expect(tags.length).toBe(50);
    // Top-50 by count means the highest-frequency tag is first AND
    // the array is sorted strictly descending by count.
    expect(tags[0].tag).toBe("tag0");
    expect(tags[0].count).toBe(60);
    expect(tags[49].count).toBeGreaterThanOrEqual(tags[0].count - 49);
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i].count).toBeLessThanOrEqual(tags[i - 1].count);  // monotonically non-increasing
    }
    expect(prismaMock.note.findMany.mock.calls[0][0].where.userId).toBe("user_1");
  });
});

describe("listNotesByEntity", () => {
  it("test 150: invalid entity type 400 + requestId", async () => {
    const { req, res } = mockReqRes({ params: { type: "BOGUS", id: "x" } });
    await listNotesByEntity(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = res.json.mock.calls[0][0];
    expect(json.error.message).toBe("Invalid entity type");
    expect(json.error.requestId).toBe("req_test_6c");
  });

  it("test 151: happy (where includes type/id/userId/archivedAt)", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", _count: { flashcards: 0 } },
    ]);
    const { req, res } = mockReqRes({ params: { type: "PROBLEM", id: "prob_1" } });
    await listNotesByEntity(req, res);
    const arg = prismaMock.note.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      userId: "user_1",
      archivedAt: null,
      linkedEntityType: "PROBLEM",
      linkedEntityId: "prob_1",
    });
  });
});

describe("searchLinkableEntities", () => {
  it("test 152: invalid entity type 400 + requestId", async () => {
    const { req, res } = mockReqRes({ query: { type: "BOGUS" } });
    await searchLinkableEntities(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toBe("Invalid entity type");
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6c");
  });
});
