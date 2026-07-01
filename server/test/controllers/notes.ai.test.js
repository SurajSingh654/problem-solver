import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoisted mocks (Pattern B) ─────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  note: { findFirst: vi.fn(), update: vi.fn() },
  problem: { findMany: vi.fn() },
  interviewSession: { findMany: vi.fn() },
  designSession: { findMany: vi.fn() },
  teachingSession: { findMany: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const aiMock = vi.hoisted(() => ({
  aiComplete: vi.fn(),
  AIError: class AIError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock("../../src/services/ai.service.js", () => aiMock);

const embeddingMock = vi.hoisted(() => ({
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  findProblemsByNoteEmbedding: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const {
  getRelatedForNote,
  generateNoteSummary,
  generateNoteFlashcards,
  suggestNoteTags,
  searchLinkableEntities,
} = await import("../../src/controllers/notes.controller.js");

// ── Pattern B beforeEach (Lead Engineer I2 fold-in) ──────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findFirst.mockReset();
  prismaMock.note.update.mockReset();
  prismaMock.problem.findMany.mockReset();
  prismaMock.interviewSession.findMany.mockReset();
  prismaMock.designSession.findMany.mockReset();
  prismaMock.teachingSession.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
  aiMock.aiComplete.mockReset();
  embeddingMock.findSimilarNotes.mockReset();
  embeddingMock.findSimilarNotes.mockResolvedValue([]);
  embeddingMock.findProblemsByNoteEmbedding.mockReset();
  embeddingMock.findProblemsByNoteEmbedding.mockResolvedValue([]);
});

// ── Helper ─────────────────────────────────────────────────────────────────────
function mockReqRes({ params = {}, query = {}, userId = "user_1" } = {}) {
  const req = { params, query, user: { id: userId }, requestId: "req_test_6c" };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  res.req = req;
  return { req, res };
}

// ── Test constants ─────────────────────────────────────────────────────────────
// LONG_NOTE_CONTENT must clear ALL quality gates:
//   - generateNoteSummary:   chars >= 80 && uniqueWords >= 8
//   - generateNoteFlashcards: chars >= 200 && uniqueWords >= 20
// Using 300+ chars and 30+ unique words to safely clear both thresholds.
const LONG_NOTE_CONTENT = `
Hash maps provide amortized constant-time lookup by storing key-value pairs in buckets
determined by the hash function. When two keys hash to the same bucket, collision resolution
strategies like chaining or open addressing handle conflicts. Understanding load factor,
rehashing, and the complement pattern allows solving two-sum, group anagram, and subarray
sum problems efficiently. Prime numbers help distribute keys uniformly, reducing worst-case
degradation from linear to nearly constant time in practice.
`.trim();

// VALID_SUMMARY_PAYLOAD must satisfy validateNoteSummary:
//   - tldr: non-empty string <= 280 chars
//   - keyTakeaways: array of 3-5 non-empty strings, each <= 240 chars
//   - openQuestions: array of 0-3 non-empty strings
//   - suggestedReviewFocus: non-empty string <= 200 chars
const VALID_SUMMARY_PAYLOAD = {
  tldr: "Hash maps enable O(1) average lookup using key hashing and collision resolution.",
  keyTakeaways: [
    "Hash function maps keys to bucket indices for fast retrieval.",
    "Chaining and open addressing resolve hash collisions differently.",
    "Load factor governs rehashing thresholds to maintain performance.",
  ],
  openQuestions: ["When does open addressing outperform chaining?"],
  suggestedReviewFocus: "Review the complement pattern for two-sum variants.",
};

// VALID_DRAFTS_PAYLOAD must satisfy validateNoteFlashcards:
//   - drafts: array of 3-7 objects with type in {CONCEPT, DEFINITION, CONTRAST}
//   - MIXED types: anti-laziness rule rejects all-same-type (>=5 all-DEFINITION)
//   - BA fold-in: must use a mix of CONCEPT, DEFINITION, CONTRAST
const VALID_DRAFTS_PAYLOAD = {
  drafts: [
    { type: "CONCEPT", front: "What is a hash map?", back: "A data structure providing O(1) average-case key-value lookup via hashing." },
    { type: "DEFINITION", front: "Load factor", back: "The ratio of stored entries to bucket count; triggers rehashing when exceeded." },
    { type: "CONTRAST", front: "Chaining vs open addressing", back: "Chaining uses linked lists per bucket; open addressing probes for an empty slot." },
  ],
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("searchLinkableEntities (all-branches mixed-authz)", () => {
  it("test 153: all 4 branches cover correct authz — team-scoped vs user-scoped", async () => {
    // Sub-case A: PROBLEM — team-scoped via teamId IN userTeamIds
    {
      prismaMock.teamMembership.findMany.mockResolvedValueOnce([
        { teamId: "team_1" },
        { teamId: "team_2" },
      ]);
      prismaMock.problem.findMany.mockResolvedValueOnce([
        { id: "prob_1", title: "Two Sum", difficulty: "EASY", category: "CODING" },
      ]);
      const { req, res } = mockReqRes({ query: { type: "PROBLEM", q: "two" } });
      await searchLinkableEntities(req, res);
      const arg = prismaMock.problem.findMany.mock.calls[0][0];
      expect(arg.where.teamId).toEqual({ in: ["team_1", "team_2"] });
      expect(arg.where.userId).toBeUndefined(); // POSITIVE+NEGATIVE authz pin
    }

    // Sub-case B: INTERVIEW_SESSION — user-scoped via userId
    {
      prismaMock.teamMembership.findMany.mockResolvedValueOnce([{ teamId: "team_1" }]);
      prismaMock.interviewSession.findMany.mockResolvedValueOnce([
        {
          id: "iv_1",
          createdAt: new Date(),
          status: "COMPLETED",
          problem: { title: "Two Sum" },
        },
      ]);
      const { req, res } = mockReqRes({ query: { type: "INTERVIEW_SESSION" } });
      await searchLinkableEntities(req, res);
      const arg = prismaMock.interviewSession.findMany.mock.calls[0][0];
      expect(arg.where.userId).toBe("user_1");
      expect(arg.where.teamId).toBeUndefined(); // private to the user, NOT team-shared
    }

    // Sub-case C: DESIGN_SESSION — user-scoped via userId
    {
      prismaMock.teamMembership.findMany.mockResolvedValueOnce([{ teamId: "team_1" }]);
      prismaMock.designSession.findMany.mockResolvedValueOnce([
        {
          id: "ds_1",
          title: "Url Shortener",
          designType: "SYSTEM_DESIGN",
          difficulty: "MEDIUM",
        },
      ]);
      const { req, res } = mockReqRes({ query: { type: "DESIGN_SESSION" } });
      await searchLinkableEntities(req, res);
      const arg = prismaMock.designSession.findMany.mock.calls[0][0];
      expect(arg.where.userId).toBe("user_1");
      expect(arg.where.teamId).toBeUndefined();
    }

    // Sub-case D: TEACHING_SESSION — team-scoped via teamId IN userTeamIds
    {
      prismaMock.teamMembership.findMany.mockResolvedValueOnce([
        { teamId: "team_1" },
        { teamId: "team_2" },
      ]);
      prismaMock.teachingSession.findMany.mockResolvedValueOnce([
        {
          id: "ts_1",
          title: "Hashing 101",
          topic: "Algorithms",
          status: "SCHEDULED",
        },
      ]);
      const { req, res } = mockReqRes({ query: { type: "TEACHING_SESSION" } });
      await searchLinkableEntities(req, res);
      const arg = prismaMock.teachingSession.findMany.mock.calls[0][0];
      expect(arg.where.teamId).toEqual({ in: ["team_1", "team_2"] });
      expect(arg.where.userId).toBeUndefined();
    }
  });
});

describe("getRelatedForNote", () => {
  it("test 154: ownership 404 (asserts where.userId)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await getRelatedForNote(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6c");
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 155: LLM-rank happy (aiGenerated: true) with team-scope passthrough", async () => {
    prismaMock.teamMembership.findMany.mockResolvedValueOnce([
      { teamId: "team_1" },
      { teamId: "team_2" },
    ]);
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_src",
      title: "Two Sum",
      summary: { tldr: "Hash lookup pattern.", keyTakeaways: [] },
    });
    // Embedding mocks must return rows whose IDs the validator can find as
    // candidates — without this T155 silently routes to the fallback branch
    // (BA + Lead fold-in).
    embeddingMock.findSimilarNotes.mockResolvedValueOnce([
      {
        id: "note_sim1",
        title: "3Sum",
        tags: [],
        updatedAt: new Date(),
        distance: 0.2,
      },
    ]);
    embeddingMock.findProblemsByNoteEmbedding.mockResolvedValueOnce([
      {
        id: "prob_1",
        title: "Two Sum II",
        difficulty: "EASY",
        category: "CODING",
        tags: [],
        distance: 0.3,
      },
    ]);
    aiMock.aiComplete.mockResolvedValueOnce({
      relatedNotes: [{ id: "note_sim1", rationale: "Both use hash complement." }],
      relatedProblems: [{ id: "prob_1", rationale: "Similar pattern, ascending input." }],
    });

    const { req, res } = mockReqRes({ params: { id: "note_src" } });
    await getRelatedForNote(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.data.aiGenerated).toBe(true);
    expect(json.data.relatedNotes[0]).toMatchObject({
      id: "note_sim1",
      rationale: "Both use hash complement.",
    });

    // SECURITY C1 fold-in: team-scope passthrough on the embedding query is the
    // load-bearing authz invariant for getRelatedForNote. A future refactor that
    // drops teamIds (or passes userId/null) cross-team-leaks problems.
    expect(embeddingMock.findSimilarNotes).toHaveBeenCalledWith("note_src", "user_1", 10);
    expect(embeddingMock.findProblemsByNoteEmbedding).toHaveBeenCalledWith(
      "note_src",
      ["team_1", "team_2"], // teamIds from userTeamIds(userId)
      10,
    );
  });

  it("test 156: graceful fallback to embedding-only when LLM rejected (aiGenerated: false)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_src",
      title: "Two Sum",
      summary: null,
    });
    embeddingMock.findSimilarNotes.mockResolvedValueOnce([
      {
        id: "note_sim1",
        title: "3Sum",
        tags: ["array"],
        updatedAt: new Date(),
        distance: 0.2,
      },
    ]);
    embeddingMock.findProblemsByNoteEmbedding.mockResolvedValueOnce([
      {
        id: "prob_1",
        title: "Two Sum II",
        difficulty: "EASY",
        category: "CODING",
        tags: [],
        distance: 0.3,
      },
    ]);
    // Specific AIError path (PO fold-in: pin the fallback trigger so the test
    // isn't ambiguous about which branch fired). AIError with code TIMEOUT.
    aiMock.aiComplete.mockRejectedValueOnce(
      new aiMock.AIError("openai timeout", "TIMEOUT"),
    );

    const { req, res } = mockReqRes({ params: { id: "note_src" } });
    await getRelatedForNote(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.data.aiGenerated).toBe(false);
    // Fallback ranking hydrates from the embedding-only candidates.
    expect(json.data.relatedNotes).toHaveLength(1);
    expect(json.data.relatedNotes[0].id).toBe("note_sim1");
    expect(json.data.relatedProblems).toHaveLength(1);
    expect(json.data.relatedProblems[0].id).toBe("prob_1");
  });
});

describe("generateNoteSummary (extends existing AI-behavior tests)", () => {
  it("test 157: ownership 404 (asserts where.userId)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await generateNoteSummary(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6c");
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 158: persists summary + summaryGeneratedAt to DB on happy path", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      title: "Two Sum",
      contentMarkdown: LONG_NOTE_CONTENT,
      tags: [],
    });
    aiMock.aiComplete.mockResolvedValueOnce(VALID_SUMMARY_PAYLOAD);
    prismaMock.note.update.mockResolvedValueOnce({});
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await generateNoteSummary(req, res);
    expect(prismaMock.note.update).toHaveBeenCalledTimes(1);
    const arg = prismaMock.note.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "note_1" });
    expect(arg.data.summary).toEqual(VALID_SUMMARY_PAYLOAD);
    expect(arg.data.summaryGeneratedAt).toBeInstanceOf(Date);
  });
});

describe("generateNoteFlashcards", () => {
  it("test 159: ownership 404 (asserts where.userId)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await generateNoteFlashcards(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
    expect(aiMock.aiComplete).not.toHaveBeenCalled();
  });

  it("test 160: quality-gate 400 when content < 200 chars", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      title: "T",
      contentMarkdown: "Short body content.",
      tags: [],
    });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await generateNoteFlashcards(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toMatch(/too thin for flashcards/i);
    expect(aiMock.aiComplete).not.toHaveBeenCalled();
  });

  it("test 161: happy path returns drafts with fallback: false (MIXED types, not all-DEFINITION)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      title: "T",
      contentMarkdown: LONG_NOTE_CONTENT,
      tags: [],
    });
    // VALID_DRAFTS_PAYLOAD has 3-7 drafts with MIXED types (not all DEFINITION) —
    // the validator at services/ai.validators.js rejects "all same type" as
    // anti-laziness. Use a mix of CONCEPT, DEFINITION, CONTRAST.
    aiMock.aiComplete.mockResolvedValueOnce(VALID_DRAFTS_PAYLOAD);
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await generateNoteFlashcards(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.data.drafts.length).toBeGreaterThanOrEqual(3);
    expect(json.data.fallback).toBe(false);
  });

  it("test 162: validator-reject routes to fallback (fallback: true, fallbackReason starts with 'validator:')", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      title: "T",
      contentMarkdown: LONG_NOTE_CONTENT,
      tags: [],
    });
    // Invalid: only 1 draft (validator requires 3-7) — triggers fallback
    aiMock.aiComplete.mockResolvedValueOnce({
      drafts: [{ type: "CONCEPT", front: "x", back: "y" }],
    });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await generateNoteFlashcards(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.data.fallback).toBe(true);
    expect(json.data.fallbackReason).toMatch(/^validator:/);
  });
});

describe("suggestNoteTags", () => {
  it("test 163: ownership 404 (asserts where.userId)", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce(null);
    const { req, res } = mockReqRes({ params: { id: "note_other" } });
    await suggestNoteTags(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "note_other",
      userId: "user_1",
    });
  });

  it("test 164: quality-gate 400 when content < 60 chars", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({
      id: "note_1",
      title: "T",
      contentMarkdown: "Short.",
      tags: [],
    });
    const { req, res } = mockReqRes({ params: { id: "note_1" } });
    await suggestNoteTags(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toMatch(/too thin for tag suggestions/i);
  });
});
