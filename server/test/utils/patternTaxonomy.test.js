// ============================================================================
// patternTaxonomy — normalizer unit tests
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    CANONICAL_PATTERN_LABELS,
    FAANG_CORE_PATTERNS,
    normalizePatterns,
    isCanonicalPattern,
    isFaangCorePattern,
} from "../../src/utils/patternTaxonomy.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

describe("FAANG_CORE_PATTERNS", () => {
    it("has exactly 15 entries", () => {
        expect(FAANG_CORE_PATTERNS).toHaveLength(15);
    });

    it("is a subset of CANONICAL_PATTERN_LABELS — every core pattern is canonical", () => {
        const canonicalSet = new Set(CANONICAL_PATTERN_LABELS);
        for (const p of FAANG_CORE_PATTERNS) {
            expect(canonicalSet.has(p)).toBe(true);
        }
    });

    it("contains the foundational coding-interview patterns", () => {
        // Sanity check on the ones that empirically dominate FAANG loops.
        // If any of these drop out of core, that's a deliberate decision and
        // this test should be updated alongside the constant.
        const mustHave = [
            "Array / Hashing",
            "Two Pointers",
            "Trees",
            "Graphs",
            "Dynamic Programming",
        ];
        for (const p of mustHave) {
            expect(FAANG_CORE_PATTERNS).toContain(p);
        }
    });

    it("does NOT include niche patterns (Bit Manipulation, Math & Geometry, Tries, etc.)", () => {
        // Those exist in the canonical taxonomy as bonus coverage, not as
        // core requirements. If FAANG-core grows to include them, revisit
        // tier requirements (readinessTiers.js) too.
        const niche = ["Bit Manipulation", "Math & Geometry", "Tries", "Top K Elements"];
        for (const p of niche) {
            expect(FAANG_CORE_PATTERNS).not.toContain(p);
        }
    });
});

describe("isFaangCorePattern", () => {
    it("returns true for core patterns (case-insensitive)", () => {
        expect(isFaangCorePattern("Trees")).toBe(true);
        expect(isFaangCorePattern("trees")).toBe(true);
        expect(isFaangCorePattern("  Two Pointers ")).toBe(true);
    });

    it("returns false for canonical-but-non-core patterns", () => {
        expect(isFaangCorePattern("Bit Manipulation")).toBe(false);
        expect(isFaangCorePattern("Tries")).toBe(false);
        expect(isFaangCorePattern("Math & Geometry")).toBe(false);
    });

    it("returns false for invalid input", () => {
        expect(isFaangCorePattern(null)).toBe(false);
        expect(isFaangCorePattern(undefined)).toBe(false);
        expect(isFaangCorePattern("")).toBe(false);
        expect(isFaangCorePattern(42)).toBe(false);
    });
});

describe("pattern-count denominator consistency", () => {
    // Greppable invariant: no source file should hardcode "/16" as a pattern
    // denominator. Earlier code had this in 4 places; if a new one creeps in
    // it'll show up here as a regression. Counts pattern-related references
    // only — string content of /16 elsewhere (regex, dates, etc) is fine.
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(__dirname, "../../..");

    it("server stats.controller.js no longer hardcodes /16 as a pattern denominator", () => {
        const f = readFileSync(
            resolve(repoRoot, "server/src/controllers/stats.controller.js"),
            "utf8",
        );
        // Only assert that no `uniquePatterns.size / 16` style expression survives.
        // Plain `/16` could appear in unrelated math.
        expect(f).not.toMatch(/uniquePatterns\.size\s*\/\s*16\b/);
        expect(f).not.toMatch(/CANONICAL_PATTERN_COUNT\s*=\s*16\b/);
    });

    it("server stats.controller.js no longer redefines an inline 16-pattern array", () => {
        const f = readFileSync(
            resolve(repoRoot, "server/src/controllers/stats.controller.js"),
            "utf8",
        );
        // The inline duplicate `const CANONICAL_PATTERNS = [...]` is gone —
        // canonical taxonomy is imported from patternTaxonomy.js.
        expect(f).not.toMatch(/const\s+CANONICAL_PATTERNS\s*=\s*\[/);
    });
});
