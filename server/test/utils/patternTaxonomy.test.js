// ============================================================================
// patternTaxonomy — normalizer unit tests
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    CANONICAL_PATTERN_LABELS,
    normalizePatterns,
    isCanonicalPattern,
} from "../../src/utils/patternTaxonomy.js";

describe("normalizePatterns", () => {
    let warnSpy;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    });
    afterEach(() => {
        warnSpy.mockRestore();
    });

    it("returns empty array for non-array input", () => {
        expect(normalizePatterns(null)).toEqual([]);
        expect(normalizePatterns(undefined)).toEqual([]);
        expect(normalizePatterns("Stack")).toEqual([]);
        expect(normalizePatterns({})).toEqual([]);
    });

    it("trims whitespace and collapses internal runs of spaces", () => {
        const out = normalizePatterns(["  Stack  ", "Two   Pointers"]);
        expect(out).toEqual(["Stack", "Two Pointers"]);
    });

    it("dedupes case-insensitively, keeping first-seen casing", () => {
        const out = normalizePatterns(["Stack", "stack", "STACK"]);
        expect(out).toEqual(["Stack"]);
    });

    it("drops empty / non-string entries silently", () => {
        const out = normalizePatterns(["", "  ", null, 42, undefined, "Stack"]);
        expect(out).toEqual(["Stack"]);
    });

    it("caps individual length at 60 chars", () => {
        const long = "x".repeat(80);
        const out = normalizePatterns([long]);
        expect(out[0]).toHaveLength(60);
    });

    it("caps the array at 10 entries", () => {
        const many = Array.from({ length: 25 }, (_, i) => `pattern-${i}`);
        const out = normalizePatterns(many);
        expect(out).toHaveLength(10);
    });

    it("logs once per non-canonical entry, not for canonical ones", () => {
        normalizePatterns(["Stack", "Sort & Sweep", "Two Pointers", "Mooncake Slicing"]);
        const calls = warnSpy.mock.calls.filter((c) =>
            String(c[0] ?? "").includes("[patterns:custom]"),
        );
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toContain('"Sort & Sweep"');
        expect(calls[1][0]).toContain('"Mooncake Slicing"');
    });

    it("includes user / solution context in the log when provided", () => {
        normalizePatterns(["Custom Pattern"], { userId: "u_42", solutionId: "s_7" });
        const last = warnSpy.mock.calls.at(-1)[0];
        expect(last).toContain("user=u_42");
        expect(last).toContain("sol=s_7");
    });

    it("does NOT log canonical entries", () => {
        normalizePatterns(["Stack", "Two Pointers", "Dynamic Programming"]);
        const customCalls = warnSpy.mock.calls.filter((c) =>
            String(c[0] ?? "").includes("[patterns:custom]"),
        );
        expect(customCalls).toHaveLength(0);
    });
});

describe("isCanonicalPattern", () => {
    it("returns true for known labels (case-insensitive)", () => {
        expect(isCanonicalPattern("Stack")).toBe(true);
        expect(isCanonicalPattern("stack")).toBe(true);
        expect(isCanonicalPattern("  Two Pointers ")).toBe(true);
        expect(isCanonicalPattern("Top K Elements")).toBe(true);
    });

    it("returns false for non-canonical or invalid input", () => {
        expect(isCanonicalPattern("Mooncake Slicing")).toBe(false);
        expect(isCanonicalPattern("")).toBe(false);
        expect(isCanonicalPattern(null)).toBe(false);
        expect(isCanonicalPattern(42)).toBe(false);
    });
});

describe("CANONICAL_PATTERN_LABELS", () => {
    it("includes the 9 newly added patterns from the expansion", () => {
        // Smoke check: if these get accidentally removed during a refactor,
        // skill / coverage analytics will quietly silently regress.
        const required = [
            "Fast & Slow Pointers",
            "Monotonic Stack",
            "Queue",
            "BFS",
            "DFS",
            "Top K Elements",
            "Matrix",
            "Union-Find",
            "Topological Sort",
        ];
        for (const r of required) {
            expect(CANONICAL_PATTERN_LABELS).toContain(r);
        }
    });

    it("has 25 entries total", () => {
        expect(CANONICAL_PATTERN_LABELS).toHaveLength(25);
    });
});
