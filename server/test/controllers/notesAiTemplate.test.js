import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  note: { findMany: vi.fn(), create: vi.fn() },
  problem: { findFirst: vi.fn() },
  solution: { findFirst: vi.fn() },
  noteFolder: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/ai.service.js", () => ({
  aiStream: vi.fn(),
  AIError: class AIError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, AI_MODEL_PRIMARY: "gpt-4o" };
});

vi.mock("../../src/services/notes.embedding.js", () => ({
  scheduleNoteEmbedding: vi.fn(),
}));

const { generateNoteFromTemplates } = await import(
  "../../src/controllers/notesAiTemplate.controller.js"
);

function mockReqRes({ body = {}, userId = "user_1" } = {}) {
  const req = {
    body,
    user: { id: userId },
    requestId: "req_test_h6",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  // CRITICAL: error() helper reads requestId from res.req?.requestId — wire the back-reference.
  res.req = req;
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findMany.mockReset();
  prismaMock.note.create.mockReset();
  prismaMock.problem.findFirst.mockReset();
  prismaMock.solution.findFirst.mockReset();
  prismaMock.noteFolder.findFirst.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
});

describe("generateNoteFromTemplates — H6 envelope fix regression guards", () => {
  it("test 115: rejects invalid templateNoteIds with 400 + envelope + requestId", async () => {
    const { req, res } = mockReqRes({ body: { templateNoteIds: [] } });
    await generateNoteFromTemplates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error.message).toMatch(/templateNoteIds must be 1.{1,3}3/);
    expect(jsonArg.error.requestId).toBe("req_test_h6");
  });

  it("test 116: 404 when templates not found (user doesn't own one)", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_owned", title: "T1", contentMarkdown: "..." },
    ]);

    const { req, res } = mockReqRes({
      body: { templateNoteIds: ["note_owned", "note_other_user"] },
    });
    await generateNoteFromTemplates(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.error.message).toMatch(/templates not found/i);
    expect(jsonArg.error.requestId).toBe("req_test_h6");
  });

  it("test 117: rejects non-string topicFocus with 400 + envelope", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);

    const { req, res } = mockReqRes({
      body: { templateNoteIds: ["note_1"], topicFocus: 123 },
    });
    await generateNoteFromTemplates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toMatch(/topicFocus.*string/i);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
  });

  it("test 118: rejects invalid problemId (type 400 + accessibility 404)", async () => {
    // Sub-case A: problemId is not a string (line 110 in the source)
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], problemId: 42 },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Invalid problemId/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }

    // Sub-case B: problemId is a string but not accessible (line 121 in source)
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], problemId: "prob_other_team" },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Problem not found/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }
  });

  it("test 119: includeSubmission rejects when no problem OR no submission exists", async () => {
    // Sub-case A: includeSubmission without problemId (line 136)
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], includeSubmission: true },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Pick a Problem first/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }

    // Sub-case B: includeSubmission with problem but no submission (line 157)
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1", title: "Two Sum", difficulty: "EASY", description: "...",
    });
    prismaMock.solution.findFirst.mockResolvedValueOnce(null);
    {
      const { req, res } = mockReqRes({
        body: {
          templateNoteIds: ["note_1"],
          problemId: "prob_1",
          includeSubmission: true,
        },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/haven't submitted/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }
  });

  it("test 120: rejects invalid targetFolderId (type 400 + accessibility 404)", async () => {
    // Sub-case A: targetFolderId is not a string (line 182)
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], targetFolderId: 99 },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Invalid targetFolderId/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }

    // Sub-case B: targetFolderId is a string but not owned (line 192)
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);
    prismaMock.noteFolder.findFirst.mockResolvedValueOnce(null);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], targetFolderId: "folder_other_user" },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/folder not found/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }
  });
});
