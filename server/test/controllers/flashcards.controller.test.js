// ============================================================================
// Flashcards controller integration tests
// ============================================================================
//
// Targets the SM-2 field-name regression: spreading initialSM2State()
// without renaming gave Prisma keys it doesn't know (`easinessFactor`
// instead of `sm2EasinessFactor`), causing a 500. This test asserts the
// controller passes ONLY recognized fields to `prisma.flashcard.create`
// / `createMany`.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

// ── Mocks ─────────────────────────────────────────────────────────
let createCalls = [];
let createManyCalls = [];

vi.mock("../../src/lib/prisma.js", () => ({
    default: {
        flashcard: {
            create: vi.fn(async ({ data }) => {
                createCalls.push(data);
                return { id: `fc_${createCalls.length}`, ...data };
            }),
            createMany: vi.fn(async ({ data }) => {
                createManyCalls.push(data);
                return { count: data.length };
            }),
            findMany: vi.fn(async () => []),
            findFirst: vi.fn(async () => null),
        },
        note: {
            findFirst: vi.fn(async ({ where }) =>
                where.id === "note_owned"
                    ? { id: "note_owned", userId: "user_test" }
                    : null,
            ),
        },
    },
}));

import { createFlashcards } from "../../src/controllers/flashcards.controller.js";

// SM-2 column names the schema uses. Catching extra keys is the entire
// point of this regression guard.
const ALLOWED_KEYS = new Set([
    "id",
    "userId",
    "noteId",
    "front",
    "back",
    "tags",
    "sm2EasinessFactor",
    "sm2Interval",
    "sm2Repetitions",
    "lapseCount",
    "nextReviewDate",
    "reviewCount",
    "lastReviewedAt",
    "reviewDates",
    "aiGenerated",
    "archivedAt",
    "createdAt",
    "updatedAt",
]);

beforeEach(() => {
    createCalls = [];
    createManyCalls = [];
});

describe("createFlashcards — SM-2 field-name contract (regression)", () => {
    it("single-card create passes only schema-recognized keys to Prisma", async () => {
        const res = await invoke(
            createFlashcards,
            makeReq({
                body: {
                    front: "What's the complement pattern?",
                    back: "Fix one element, look up its complement.",
                    tags: ["two-sum"],
                },
            }),
        );

        expect(res.status).toBe(201);
        expect(createCalls).toHaveLength(1);

        const passed = createCalls[0];
        // Schema field names must be present (not the unprefixed sm2 init keys).
        expect(passed).toHaveProperty("sm2EasinessFactor");
        expect(passed).toHaveProperty("sm2Interval");
        expect(passed).toHaveProperty("sm2Repetitions");
        expect(passed).toHaveProperty("nextReviewDate");
        // Unprefixed keys would be rejected by Prisma at runtime — this guard
        // catches a regression at unit-test time.
        expect(passed).not.toHaveProperty("easinessFactor");
        expect(passed).not.toHaveProperty("interval");
        expect(passed).not.toHaveProperty("repetitions");

        for (const k of Object.keys(passed)) {
            expect(ALLOWED_KEYS.has(k)).toBe(true);
        }
    });

    it("bulk create from AI drafts passes only schema-recognized keys", async () => {
        const res = await invoke(
            createFlashcards,
            makeReq({
                body: {
                    noteId: "note_owned",
                    cards: [
                        {
                            front: "front 1",
                            back: "back 1",
                            tags: ["t"],
                            aiGenerated: true,
                        },
                        {
                            front: "front 2",
                            back: "back 2",
                            tags: [],
                            aiGenerated: true,
                        },
                    ],
                },
            }),
        );

        expect(res.status).toBe(201);
        expect(createManyCalls).toHaveLength(1);
        for (const row of createManyCalls[0]) {
            expect(row).toHaveProperty("sm2EasinessFactor");
            expect(row).not.toHaveProperty("easinessFactor");
            for (const k of Object.keys(row)) {
                expect(ALLOWED_KEYS.has(k)).toBe(true);
            }
        }
    });

    it("rejects bulk with no valid cards as 400", async () => {
        const res = await invoke(
            createFlashcards,
            makeReq({
                body: {
                    cards: [{ front: "", back: "" }],
                },
            }),
        );
        expect(res.status).toBe(400);
        expect(createManyCalls).toHaveLength(0);
    });
});
