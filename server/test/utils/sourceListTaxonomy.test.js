// ============================================================================
// sourceListTaxonomy — normalizer unit tests
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    CANONICAL_SOURCE_LISTS,
    normalizeSourceLists,
    isCanonicalSourceList,
} from "../../src/utils/sourceListTaxonomy.js";

describe("normalizeSourceLists", () => {
    let warnSpy;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    });
    afterEach(() => {
        warnSpy.mockRestore();
    });

    it("returns empty array for non-array input", () => {
        expect(normalizeSourceLists(null)).toEqual([]);
        expect(normalizeSourceLists(undefined)).toEqual([]);
        expect(normalizeSourceLists("Striver A2Z")).toEqual([]);
        expect(normalizeSourceLists({})).toEqual([]);
    });

    it("trims whitespace and collapses internal runs of spaces", () => {
        const out = normalizeSourceLists(["  Striver A2Z  ", "Neetcode    150"]);
        expect(out).toEqual(["Striver A2Z", "Neetcode 150"]);
    });

    it("dedupes case-insensitively, keeping first-seen casing", () => {
        const out = normalizeSourceLists(["Striver A2Z", "striver a2z", "STRIVER A2Z"]);
        expect(out).toEqual(["Striver A2Z"]);
    });

    it("drops empty / non-string entries silently", () => {
        const out = normalizeSourceLists(["", "  ", null, 42, undefined, "Blind 75"]);
        expect(out).toEqual(["Blind 75"]);
    });

    it("caps individual length at 50 chars", () => {
        const long = "x".repeat(80);
        const out = normalizeSourceLists([long]);
        expect(out[0]).toHaveLength(50);
    });

    it("caps the array at 30 entries", () => {
        const many = Array.from({ length: 50 }, (_, i) => `sheet-${i}`);
        const out = normalizeSourceLists(many);
        expect(out).toHaveLength(30);
    });

    it("logs once per non-canonical entry, not for canonical ones", () => {
        normalizeSourceLists([
            "Striver A2Z",
            "Apna College DSA",
            "Neetcode 150",
            "Custom Sheet 2026",
        ]);
        const calls = warnSpy.mock.calls.filter((c) =>
            String(c[0] ?? "").includes("[sourceLists:custom]"),
        );
        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toContain('"Apna College DSA"');
        expect(calls[1][0]).toContain('"Custom Sheet 2026"');
    });

    it("includes user / problem context in the log when provided", () => {
        normalizeSourceLists(["Some Custom Sheet"], { userId: "u_42", problemId: "p_7" });
        const last = warnSpy.mock.calls.at(-1)[0];
        expect(last).toContain("user=u_42");
        expect(last).toContain("problem=p_7");
    });

    it("does NOT log canonical entries", () => {
        normalizeSourceLists([
            "Striver A2Z",
            "Neetcode 150",
            "Blind 75",
            "LeetCode Top 100",
        ]);
        const customCalls = warnSpy.mock.calls.filter((c) =>
            String(c[0] ?? "").includes("[sourceLists:custom]"),
        );
        expect(customCalls).toHaveLength(0);
    });
});

describe("isCanonicalSourceList", () => {
    it("returns true for known labels (case-insensitive)", () => {
        expect(isCanonicalSourceList("Striver A2Z")).toBe(true);
        expect(isCanonicalSourceList("striver a2z")).toBe(true);
        expect(isCanonicalSourceList("  Neetcode 150 ")).toBe(true);
        expect(isCanonicalSourceList("Blind 75")).toBe(true);
        expect(isCanonicalSourceList("LeetCode Top 100")).toBe(true);
    });

    it("returns false for non-canonical or invalid input", () => {
        expect(isCanonicalSourceList("Apna College DSA")).toBe(false);
        expect(isCanonicalSourceList("")).toBe(false);
        expect(isCanonicalSourceList(null)).toBe(false);
        expect(isCanonicalSourceList(42)).toBe(false);
    });
});

describe("CANONICAL_SOURCE_LISTS", () => {
    it("has exactly 4 entries at launch", () => {
        expect(CANONICAL_SOURCE_LISTS).toHaveLength(4);
    });

    it("includes the four launch curricula", () => {
        const required = ["Striver A2Z", "Neetcode 150", "Blind 75", "LeetCode Top 100"];
        for (const r of required) {
            expect(CANONICAL_SOURCE_LISTS).toContain(r);
        }
    });

    it("entries are unique (no accidental duplicates)", () => {
        const set = new Set(CANONICAL_SOURCE_LISTS.map((s) => s.toLowerCase()));
        expect(set.size).toBe(CANONICAL_SOURCE_LISTS.length);
    });
});
