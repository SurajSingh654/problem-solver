// ============================================================================
// Notes controller integration tests
// ============================================================================
//
// These tests exercise wire-level integration: controller → ai.service →
// validator → fallback → prisma write. Each test corresponds to a
// real-world bug we shipped and is a regression guard.
//
// What's mocked:
//   - prisma.note (in-memory map, returns predictable rows)
//   - aiComplete (reads scenario from a per-test variable)
//   - notes.embedding scheduleNoteEmbedding (no-op)
//
// What's real:
//   - notes.controller.js logic (the unit under test)
//   - validator + fallback wiring
//   - extractJSON-vs-already-parsed contract
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

// ── Mocks ─────────────────────────────────────────────────────────
let mockNoteRows = new Map();
let aiBehavior = { kind: "valid" };

vi.mock("../../src/lib/prisma.js", () => ({
    default: {
        note: {
            findFirst: vi.fn(async ({ where }) => {
                const row = mockNoteRows.get(where.id);
                if (!row) return null;
                if (where.userId && row.userId !== where.userId) return null;
                return { ...row };
            }),
            findMany: vi.fn(async () => []),
            update: vi.fn(async ({ where, data }) => {
                const row = mockNoteRows.get(where.id);
                const next = { ...row, ...data };
                mockNoteRows.set(where.id, next);
                return next;
            }),
            create: vi.fn(async ({ data }) => {
                const id = data.id || `note_${mockNoteRows.size + 1}`;
                const row = { id, ...data };
                mockNoteRows.set(id, row);
                return row;
            }),
        },
        teamMembership: {
            findMany: vi.fn(async () => []),
        },
    },
}));

vi.mock("../../src/services/notes.embedding.js", () => ({
    scheduleNoteEmbedding: vi.fn(),
}));

vi.mock("../../src/services/ai.service.js", () => ({
    aiComplete: vi.fn(async () => {
        if (aiBehavior.kind === "throws") throw new Error(aiBehavior.message);
        if (aiBehavior.kind === "ai-error") {
            const e = new Error(aiBehavior.message);
            e.name = "AIError";
            e.code = aiBehavior.code || "UNKNOWN";
            throw e;
        }
        // Default: aiComplete with jsonMode=true returns a parsed object.
        // This is the contract that the real implementation honours; the
        // controller MUST NOT call extractJSON on it.
        return aiBehavior.payload;
    }),
    AIError: class AIError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    },
}));

vi.mock("../../src/services/embedding.service.js", () => ({
    findSimilarNotes: vi.fn(async () => []),
    findProblemsByNoteEmbedding: vi.fn(async () => []),
}));

// ── Import the controller AFTER mocks are registered ──────────────
import {
    generateNoteSummary,
    suggestNoteTags,
} from "../../src/controllers/notes.controller.js";

// ── Helpers ───────────────────────────────────────────────────────
const VALID_AI_SUMMARY = {
    tldr: "Two Sum uses a HashMap-based complement lookup pattern for O(n) time.",
    keyTakeaways: [
        "Complement pattern: fix one element, look up its complement.",
        "HashMap trades O(n) space for O(1) lookup.",
        "Single-pass works because earlier elements are already in the map.",
    ],
    openQuestions: [],
    suggestedReviewFocus: "Drill the complement-pattern intuition before 3Sum.",
};

const LONG_NOTE_CONTENT = `
# Two Sum problem
This is a classic interview question that tests whether you understand
hash maps as a tool for trading space for time. The brute force is
O(n^2) — for each element, check every other element. The optimal is
O(n) using a HashMap of value to index. As you iterate, ask whether
the complement (target minus current value) is already in the map.

## Why single-pass works
By the time you reach element j, its pair i is already mapped because
i ran first. The map only ever needs to remember elements you've seen.

## Trade-offs
You spend O(n) extra space to remove the inner loop. Worth it almost
always.
`.repeat(2);

beforeEach(() => {
    mockNoteRows = new Map();
    aiBehavior = { kind: "valid", payload: VALID_AI_SUMMARY };
});

// ── Regression: extractJSON on already-parsed JSON ──────────────────
//
// aiComplete with jsonMode=true returns a parsed object. The controller
// previously called extractJSON(parsed), which called text.indexOf("{")
// on the object → "indexOf is not a function" → silent fallback.
//
// Guard: the success path must accept the parsed object directly.
describe("generateNoteSummary — happy path (regression: extractJSON contract)", () => {
    it("accepts the parsed JSON returned by aiComplete and persists it", async () => {
        mockNoteRows.set("n1", {
            id: "n1",
            userId: "user_test",
            title: "Two Sum",
            contentMarkdown: LONG_NOTE_CONTENT,
            tags: [],
        });
        aiBehavior = { kind: "valid", payload: VALID_AI_SUMMARY };

        const res = await invoke(
            generateNoteSummary,
            makeReq({ params: { id: "n1" } }),
        );

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.fallback).toBe(false);
        expect(res.body.data.summary.tldr).toContain("Two Sum");
        // The persisted row should carry the AI summary, not a fallback.
        expect(mockNoteRows.get("n1").summary._fallback).toBeUndefined();
    });
});

// ── Regression: hasContent reference after gate refactor ───────────
//
// We replaced the cheap length check with a quality gate but left a
// dangling `hasContent` symbol inside the success path. The bug was a
// ReferenceError on every successful AI summary. This test exercises
// the success path end-to-end and would fail with ReferenceError if
// re-introduced.
describe("generateNoteSummary — quality gate + success path (regression: hasContent)", () => {
    it("rejects gibberish notes with a 400 (not a ReferenceError)", async () => {
        mockNoteRows.set("n2", {
            id: "n2",
            userId: "user_test",
            title: "Random",
            contentMarkdown: "asdfghjklqwerty",
            tags: [],
        });
        const res = await invoke(
            generateNoteSummary,
            makeReq({ params: { id: "n2" } }),
        );
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toMatch(/too thin/i);
    });

    it("does NOT throw ReferenceError on valid content (the original bug)", async () => {
        mockNoteRows.set("n3", {
            id: "n3",
            userId: "user_test",
            title: "OK note",
            contentMarkdown: LONG_NOTE_CONTENT,
            tags: [],
        });
        aiBehavior = { kind: "valid", payload: VALID_AI_SUMMARY };
        const res = await invoke(
            generateNoteSummary,
            makeReq({ params: { id: "n3" } }),
        );
        // Status 500 with "hasContent is not defined" was the symptom.
        expect(res.status).toBe(200);
        expect(res.body.data.fallback).toBe(false);
    });
});

// ── Fallback path surfaces a useful reason ─────────────────────────
//
// When AI throws or validator rejects, the response must include
// fallbackReason so the UI can show why and the user can act.
describe("generateNoteSummary — fallback paths surface fallbackReason", () => {
    it("returns fallback + reason when aiComplete throws", async () => {
        mockNoteRows.set("n4", {
            id: "n4",
            userId: "user_test",
            title: "OK",
            contentMarkdown: LONG_NOTE_CONTENT,
            tags: [],
        });
        aiBehavior = { kind: "throws", message: "openai timeout" };
        const res = await invoke(
            generateNoteSummary,
            makeReq({ params: { id: "n4" } }),
        );
        expect(res.status).toBe(200);
        expect(res.body.data.fallback).toBe(true);
        expect(res.body.data.fallbackReason).toContain("ai-threw");
    });

    it("returns fallback + reason when LLM output fails validation", async () => {
        mockNoteRows.set("n5", {
            id: "n5",
            userId: "user_test",
            title: "OK",
            contentMarkdown: LONG_NOTE_CONTENT,
            tags: [],
        });
        // Only 1 takeaway (validator requires 3-5).
        aiBehavior = {
            kind: "valid",
            payload: {
                tldr: "ok",
                keyTakeaways: ["only one"],
                openQuestions: [],
                suggestedReviewFocus: "x",
            },
        };
        const res = await invoke(
            generateNoteSummary,
            makeReq({ params: { id: "n5" } }),
        );
        expect(res.status).toBe(200);
        expect(res.body.data.fallback).toBe(true);
        expect(res.body.data.fallbackReason).toMatch(/^validator:/);
        expect(res.body.data.fallbackReason).toContain("keyTakeaways-count");
    });
});

// ── suggestNoteTags — fallback returns empty (not pseudo-tags) ─────
describe("suggestNoteTags — honest fallback (regression: pseudo-tags)", () => {
    it("returns empty tags array on AI failure rather than garbage", async () => {
        mockNoteRows.set("n6", {
            id: "n6",
            userId: "user_test",
            title: "OK",
            contentMarkdown: LONG_NOTE_CONTENT,
            tags: [],
        });
        aiBehavior = { kind: "throws", message: "openai timeout" };
        const res = await invoke(
            suggestNoteTags,
            makeReq({ params: { id: "n6" } }),
        );
        expect(res.status).toBe(200);
        expect(res.body.data.fallback).toBe(true);
        expect(res.body.data.tags).toEqual([]);
    });
});
