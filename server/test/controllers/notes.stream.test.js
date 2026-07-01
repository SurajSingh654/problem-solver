// ============================================================================
// notes.stream.test.js — Sprint 6c, T165-T167
// Streaming success-path regression tests for generateNoteFromTemplates.
// Mock surface: Pattern C (streaming aiStream async-iterable + write-capturing res).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Pattern C mock setup ───────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  note: { findMany: vi.fn(), create: vi.fn() },
  problem: { findFirst: vi.fn() },
  noteFolder: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const aiMock = vi.hoisted(() => ({
  aiStream: vi.fn(),
  AIError: class AIError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("../../src/services/ai.service.js", () => aiMock);

const notesEmbeddingMock = vi.hoisted(() => ({
  scheduleNoteEmbedding: vi.fn(),
}));
vi.mock("../../src/services/notes.embedding.js", () => notesEmbeddingMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, AI_MODEL_PRIMARY: "gpt-4o" };
});

const { generateNoteFromTemplates } = await import(
  "../../src/controllers/notesAiTemplate.controller.js"
);

// Streaming-capable res mock: captures every res.write() call as a parsed
// NDJSON line, plus exposes `emitClose()` to simulate client-disconnect.
function makeStreamingReqRes({ body = {}, userId = "user_1" } = {}) {
  const writes = [];
  const closeHandlers = [];
  const req = {
    body,
    user: { id: userId },
    requestId: "req_test_6c",
    on(event, handler) {
      if (event === "close") closeHandlers.push(handler);
    },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn((line) => {
      writes.push(JSON.parse(line.trim()));
      return true;
    }),
    end: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  res.req = req;
  return {
    req,
    res,
    writes,
    emitClose: () => closeHandlers.forEach((h) => h()),
  };
}

// Helper: build an async-iterable that yields fake OpenAI chunks.
async function* chunkStream(chunks) {
  for (const c of chunks) {
    yield { choices: [{ delta: { content: c } }] };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findMany.mockReset();
  prismaMock.note.create.mockReset();
  prismaMock.problem.findFirst.mockReset();
  prismaMock.noteFolder.findFirst.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
  aiMock.aiStream.mockReset();
  notesEmbeddingMock.scheduleNoteEmbedding.mockReset();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateNoteFromTemplates — streaming success path", () => {
  it("test 165: streams chunks → persists → emits done + team-scope problem re-fetch", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_t1", title: "Template", contentMarkdown: "Body content here." },
    ]);
    prismaMock.teamMembership.findMany.mockResolvedValueOnce([
      { teamId: "team_1" },
      { teamId: "team_2" },
    ]);
    // Team-scope re-fetch — controller MUST re-authorize the problemId against
    // the caller's teamIds. A future refactor reading req.body.problemId raw
    // without this re-fetch would let a user attach their note to a problem
    // they can't access. This test pins the re-fetch.
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "Two Sum",
      difficulty: "EASY",
      description: "...",
    });
    aiMock.aiStream.mockResolvedValueOnce(
      chunkStream([
        "# Hello\n\n",
        "This is the generated note body. ".repeat(5), // total > MIN_OUTPUT_CHARS (60)
      ]),
    );
    prismaMock.note.create.mockResolvedValueOnce({ id: "note_new", title: "Hello" });

    const { req, res, writes } = makeStreamingReqRes({
      body: { templateNoteIds: ["note_t1"], problemId: "prob_1" },
    });
    await generateNoteFromTemplates(req, res);

    const chunkLines = writes.filter((w) => "chunk" in w);
    expect(chunkLines.length).toBeGreaterThanOrEqual(2);

    // AUTHZ INVARIANT: the problem lookup must be team-scoped, not raw-by-id.
    expect(prismaMock.problem.findFirst).toHaveBeenCalledTimes(1);
    const probArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(probArg.where.id).toBe("prob_1");
    expect(probArg.where.teamId).toEqual({ in: ["team_1", "team_2"] });

    expect(prismaMock.note.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.note.create.mock.calls[0][0];
    expect(createArg.data.userId).toBe("user_1");
    expect(createArg.data.contentMarkdown).toMatch(/Hello[\s\S]*generated note body/);
    // Linked-entity snapshot inherits from the team-scope-validated row, NOT from req.body raw
    expect(createArg.data.linkedEntityType).toBe("PROBLEM");
    expect(createArg.data.linkedEntityId).toBe("prob_1");
    expect(createArg.data.linkedEntityTitle).toBe("Two Sum");

    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
    expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_new");

    const lastLine = writes[writes.length - 1];
    expect(lastLine).toMatchObject({ done: true, noteId: "note_new" });
    expect(res.end).toHaveBeenCalled();
  });

  it("test 166: client-disconnect bails persist", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_t1", title: "Template", contentMarkdown: "Body" },
    ]);

    // Declare closeFn FIRST so the generator can capture it by reference at
    // definition time (Lead Engineer fold-in: avoids TDZ/hoisting fragility).
    let closeFn;
    let emittedClose = false;
    async function* disconnectStream() {
      yield { choices: [{ delta: { content: "# Partial\n" } }] };
      // Microtask flush makes the close-handler timing deterministic — the
      // controller's `for await` loop checks `clientGone` at the top of each
      // iteration; we need the handler to fire AFTER yield 1 returns control
      // and BEFORE yield 2 is consumed.
      await Promise.resolve();
      if (!emittedClose) {
        closeFn();
        emittedClose = true;
      }
      yield { choices: [{ delta: { content: "more content" } }] };
    }
    aiMock.aiStream.mockResolvedValueOnce(disconnectStream());

    const refs = makeStreamingReqRes({ body: { templateNoteIds: ["note_t1"] } });
    closeFn = refs.emitClose; // wire after refs exists
    await generateNoteFromTemplates(refs.req, refs.res);

    // Note: chunk 1 IS written (controller's sendLine fires before the next
    // iteration's clientGone check). Only persist + scheduleNoteEmbedding bail.
    expect(prismaMock.note.create).not.toHaveBeenCalled();
    expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
    expect(refs.res.end).toHaveBeenCalled();
  });

  it("test 167: too-short output → EMPTY_OUTPUT line + no persist", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_t1", title: "Template", contentMarkdown: "Body" },
    ]);
    aiMock.aiStream.mockResolvedValueOnce(chunkStream(["hi"])); // < MIN_OUTPUT_CHARS

    const { req, res, writes } = makeStreamingReqRes({
      body: { templateNoteIds: ["note_t1"] },
    });
    await generateNoteFromTemplates(req, res);

    const errLine = writes.find((w) => w.code === "EMPTY_OUTPUT");
    expect(errLine).toBeDefined();
    expect(errLine.error).toMatch(/empty or too-short/i);
    expect(prismaMock.note.create).not.toHaveBeenCalled();
    expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });
});
