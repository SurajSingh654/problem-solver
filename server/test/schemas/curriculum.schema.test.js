// ============================================================================
// curriculum.schema — module-import + validation regression tests
// ============================================================================
//
// Motivation (2026-07-09 prod incident): the initial `primerSectionsArraySchema`
// wrapped one of its section variants in `.refine()`, which produces a
// `ZodEffects`. Zod's `discriminatedUnion` requires each option to be a
// plain `ZodObject` — it accesses `option.shape[discriminator]` and throws
// `Cannot read properties of undefined (reading 'type')` at MODULE IMPORT.
// Because no test file actually imported the schema, `test:unit` passed
// green, the pre-push gate cleared, and the crash landed in prod.
//
// The primary purpose of this file: ensure `curriculum.schema.js` can be
// imported at all. Any regression that breaks schema construction — e.g.
// re-adding `.refine()` on a discriminated-union variant — fails here.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  primerSectionSchema,
  primerSectionsArraySchema,
  PRIMER_SECTION_TYPES,
} from "../../src/schemas/curriculum.schema.js";

describe("curriculum.schema — module load + shape", () => {
  it("exports the section-type list and it matches the discriminated union", () => {
    // Every listed type must have a matching variant in the union.
    // If someone adds a type here but forgets the variant (or vice versa),
    // the discriminatedUnion parse will fail.
    expect(PRIMER_SECTION_TYPES.length).toBe(12);
    for (const t of PRIMER_SECTION_TYPES) {
      const probe = { type: t, markdown: "x", items: [{ verb: "v", outcome: "o" }] };
      const parse = primerSectionSchema.safeParse(probe);
      // We don't care whether *this* probe is valid for every type — some
      // types need more fields — only that the parse returns without
      // throwing and reports the right discriminator branch.
      if (!parse.success) {
        const issueTypes = parse.error.issues.map((i) => i.code);
        // If the discriminator failed to route we'd see `invalid_union_discriminator`.
        expect(issueTypes).not.toContain("invalid_union_discriminator");
      }
    }
  });
});

describe("curriculum.schema — primerSectionsArraySchema", () => {
  it("accepts an empty array (fall-back-to-flat-fields signal)", () => {
    const r = primerSectionsArraySchema.safeParse([]);
    expect(r.success).toBe(true);
  });

  it("accepts a minimal body section", () => {
    const r = primerSectionsArraySchema.safeParse([
      { type: "body", markdown: "hello" },
    ]);
    expect(r.success).toBe(true);
  });

  it("accepts an objectives section with 1-4 items", () => {
    const r = primerSectionsArraySchema.safeParse([
      {
        type: "objectives",
        items: [
          { verb: "identify", outcome: "O(n log n) opportunities", bloomLevel: "apply" },
          { verb: "derive", outcome: "amortized cost of Union-Find" },
        ],
      },
    ]);
    expect(r.success).toBe(true);
  });

  it("rejects an unknown section type", () => {
    const r = primerSectionsArraySchema.safeParse([
      { type: "not_a_real_type", markdown: "x" },
    ]);
    expect(r.success).toBe(false);
  });

  it("rejects a diagram section with neither diagramUrl nor markdown", () => {
    // superRefine on the array — not on the section — catches this without
    // wrapping the section in ZodEffects (which would break the union).
    const r = primerSectionsArraySchema.safeParse([{ type: "diagram" }]);
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/diagram/i);
  });

  it("accepts a diagram section with only a markdown fallback", () => {
    const r = primerSectionsArraySchema.safeParse([
      { type: "diagram", markdown: "```\n[user] -> [api]\n```" },
    ]);
    expect(r.success).toBe(true);
  });

  it("rejects a diagram section with a non-http(s) diagramUrl", () => {
    const r = primerSectionsArraySchema.safeParse([
      { type: "diagram", diagramUrl: "javascript:alert(1)" },
    ]);
    expect(r.success).toBe(false);
  });

  it("caps the array at 20 sections", () => {
    const many = Array.from({ length: 21 }, () => ({ type: "body", markdown: "x" }));
    const r = primerSectionsArraySchema.safeParse(many);
    expect(r.success).toBe(false);
  });

  it("rejects markdown longer than 50KB", () => {
    const big = "x".repeat(50_001);
    const r = primerSectionsArraySchema.safeParse([
      { type: "body", markdown: big },
    ]);
    expect(r.success).toBe(false);
  });

  it("checkYourself defaults revealMode to 'click' when omitted", () => {
    const r = primerSectionsArraySchema.safeParse([{ type: "checkYourself" }]);
    expect(r.success).toBe(true);
    expect(r.data[0].revealMode).toBe("click");
  });
});
