// ============================================================================
// Solutions controller — Submit ↔ Edit round-trip integration tests
// ============================================================================
//
// Regression guard for the v3.0 refactor that left Submit and Edit on
// different data shapes. Specifically:
//
//   1. New tabbed Submit writes both `approach` (legacy back-compat) AND
//      `bruteForce` / `optimizedApproach`. GET should return them all.
//   2. Legacy rows have only `approach` populated. The read-time backfill
//      in getProblemSolutions must mirror `approach` → `optimizedApproach`
//      so Edit's tabbed editor pre-fills correctly. The mirror must NOT
//      overwrite `optimizedApproach` when it's already populated.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

// ── Mocks ─────────────────────────────────────────────────────────────
let mockSolutionRows = [];
let mockProblem = { id: "prob_1", title: "Two Sum", teamId: "team_test" };

vi.mock("../../src/lib/prisma.js", () => ({
    default: {
        problem: {
            findFirst: vi.fn(async ({ where }) => {
                if (where.id !== mockProblem.id) return null;
                if (where.teamId !== mockProblem.teamId) return null;
                return { id: mockProblem.id, title: mockProblem.title };
            }),
        },
        solution: {
            findMany: vi.fn(async () => mockSolutionRows),
        },
    },
}));

// Heavy services not exercised by GET, but the controller imports them
// at module scope. Stub to keep the import chain happy.
vi.mock("../../src/services/skillComputation.service.js", () => ({
    recomputeSkillsFromSolution: vi.fn(),
}));
vi.mock("../../src/utils/sm2.js", () => ({
    initialSM2State: () => ({}),
    calculateSM2: () => ({}),
    confidenceToQuality: () => 3,
    estimateRetention: () => 1,
}));
vi.mock("../aiReview.controller.js", () => ({}));
vi.mock("../../src/controllers/aiReview.controller.js", () => ({
    reviewSolution: vi.fn(),
}));

import { getProblemSolutions } from "../../src/controllers/solutions.controller.js";

beforeEach(() => {
    mockSolutionRows = [];
});

function baseReq() {
    return makeReq({
        params: { problemId: "prob_1" },
        user: { id: "user_test", globalRole: "USER", currentTeamId: "team_test" },
        teamId: "team_test",
    });
}

describe("getProblemSolutions — legacy backfill mirror", () => {
    it("mirrors `approach` → `optimizedApproach` when only the legacy column is populated", async () => {
        mockSolutionRows = [
            {
                id: "sol_legacy",
                userId: "user_test",
                problemId: "prob_1",
                teamId: "team_test",
                approach: "<p>brute force then hashmap</p>",
                bruteForce: null,
                optimizedApproach: null,
                code: "def twoSum...",
                language: "PYTHON",
                clarityRatings: [],
                followUpAnswers: [],
                createdAt: new Date(),
            },
        ];

        const { status, body } = await invoke(getProblemSolutions, baseReq());

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        const sol = body.data.solutions[0];
        expect(sol.approach).toBe("<p>brute force then hashmap</p>");
        expect(sol.optimizedApproach).toBe("<p>brute force then hashmap</p>"); // mirrored
        expect(sol.bruteForce).toBeNull();
    });

    it("does NOT overwrite `optimizedApproach` when it is already populated", async () => {
        mockSolutionRows = [
            {
                id: "sol_new",
                userId: "user_test",
                problemId: "prob_1",
                teamId: "team_test",
                approach: "<p>one-pass hashmap</p>",
                bruteForce: "<p>nested loops O(n²)</p>",
                optimizedApproach: "<p>one-pass hashmap O(n)</p>",
                code: "def twoSum...",
                language: "PYTHON",
                clarityRatings: [],
                followUpAnswers: [],
                createdAt: new Date(),
            },
        ];

        const { status, body } = await invoke(getProblemSolutions, baseReq());

        expect(status).toBe(200);
        const sol = body.data.solutions[0];
        // Original optimizedApproach must be preserved — different from `approach`.
        expect(sol.optimizedApproach).toBe("<p>one-pass hashmap O(n)</p>");
        expect(sol.bruteForce).toBe("<p>nested loops O(n²)</p>");
    });

    it("does not mirror when both columns are empty (no false-positive backfill)", async () => {
        mockSolutionRows = [
            {
                id: "sol_empty",
                userId: "user_test",
                problemId: "prob_1",
                teamId: "team_test",
                approach: null,
                bruteForce: null,
                optimizedApproach: null,
                code: null,
                language: null,
                clarityRatings: [],
                followUpAnswers: [],
                createdAt: new Date(),
            },
        ];

        const { status, body } = await invoke(getProblemSolutions, baseReq());

        expect(status).toBe(200);
        const sol = body.data.solutions[0];
        expect(sol.optimizedApproach).toBeNull();
        expect(sol.approach).toBeNull();
    });

    it("preserves bruteForceMeta + alternativeMeta JSON columns end-to-end", async () => {
        // Simulates what the new tabbed Submit form writes: per-tab metadata
        // packed in JSON for the BruteForce + Alternative tabs.
        mockSolutionRows = [
            {
                id: "sol_full_tabs",
                userId: "user_test",
                problemId: "prob_1",
                teamId: "team_test",
                approach: "<p>optimized canonical</p>",
                bruteForce: "<p>brute approach text</p>",
                bruteForceMeta: {
                    code: "for i ... for j ...",
                    language: "PYTHON",
                    timeComplexity: "O(n²)",
                    spaceComplexity: "O(1)",
                },
                optimizedApproach: "<p>optimized canonical</p>",
                alternativeApproach: "<p>alt approach text</p>",
                alternativeMeta: {
                    code: "// some alt code",
                    language: "JAVA",
                    timeComplexity: "O(n log n)",
                    spaceComplexity: "O(n)",
                },
                code: "def twoSum...",
                language: "PYTHON",
                timeComplexity: "O(n)",
                spaceComplexity: "O(n)",
                clarityRatings: [],
                followUpAnswers: [],
                createdAt: new Date(),
            },
        ];

        const { status, body } = await invoke(getProblemSolutions, baseReq());

        expect(status).toBe(200);
        const sol = body.data.solutions[0];
        // Per-tab JSON columns round-trip intact.
        expect(sol.bruteForceMeta).toEqual({
            code: "for i ... for j ...",
            language: "PYTHON",
            timeComplexity: "O(n²)",
            spaceComplexity: "O(1)",
        });
        expect(sol.alternativeApproach).toBe("<p>alt approach text</p>");
        expect(sol.alternativeMeta.timeComplexity).toBe("O(n log n)");
        // Canonical Optimized columns unaffected.
        expect(sol.optimizedApproach).toBe("<p>optimized canonical</p>");
        expect(sol.timeComplexity).toBe("O(n)");
    });

    it("treats whitespace-only `approach` as empty (no spurious mirror)", async () => {
        mockSolutionRows = [
            {
                id: "sol_ws",
                userId: "user_test",
                problemId: "prob_1",
                teamId: "team_test",
                approach: "   \n\t  ",
                bruteForce: null,
                optimizedApproach: null,
                code: null,
                language: null,
                clarityRatings: [],
                followUpAnswers: [],
                createdAt: new Date(),
            },
        ];

        const { status, body } = await invoke(getProblemSolutions, baseReq());

        expect(status).toBe(200);
        const sol = body.data.solutions[0];
        // Whitespace-only doesn't trigger the mirror — Edit would have nothing
        // useful to display anyway.
        expect(sol.optimizedApproach).toBeNull();
    });
});
