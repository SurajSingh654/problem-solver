// ============================================================================
// curriculum.schema.js — Zod schemas for the curriculum authoring surface
// ============================================================================
//
// Primer sections (Phase B): discriminated union over the 12 fixed section
// types documented in docs/superpowers/specs/2026-07-09-primer-section-model-design.md.
//
// Each section is `{ type, ...typeSpecificFields }`. Server accepts / rejects
// authored input against this schema before persisting to
// `Concept.primerSections`. The client renderer uses a matching switch —
// unknown types on the server side must NOT be silently accepted or a future
// authoring bug lands unrenderable content.
//
// Content-length caps are conservative but permissive — 50KB per markdown
// slot matches the caps already in place on flat `primerMarkdown` +
// `cheatsheetMarkdown`.
// ============================================================================

import { z } from "zod";

// Bloom's taxonomy levels — capture the DEPTH a learning objective targets.
// Optional per objective; not every author will label. Matches the shape the
// pedagogy reviewer recommended.
const bloomLevel = z.enum([
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);

// One learning objective — verb + outcome + optional Bloom level.
const objectiveItem = z
  .object({
    verb: z.string().trim().min(1).max(40),
    outcome: z.string().trim().min(1).max(240),
    bloomLevel: bloomLevel.optional(),
  })
  .strict();

// Shared markdown field — 50KB cap, trimmed. Nullable-to-empty on write.
const markdownField = z.string().trim().max(50_000);

// URL sanity check for diagram sources. http(s) only (mirror the client
// XSS block for canonicalSources.url + the DOMPurify img.src hook).
const diagramUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), "Diagram URL must be http(s).");

// ── Section variants ─────────────────────────────────────────────────

const objectivesSection = z
  .object({
    type: z.literal("objectives"),
    items: z.array(objectiveItem).min(1).max(6),
  })
  .strict();

const prerequisitesSection = z
  .object({
    type: z.literal("prerequisites"),
    // Author-supplied note shown ABOVE the prereq list — the per-prereq
    // hint lives on ConceptDependency.hintNote, not here.
    note: z.string().trim().max(400).optional(),
  })
  .strict();

const mentalModelSection = z
  .object({
    type: z.literal("mentalModel"),
    markdown: markdownField,
    diagramUrl: diagramUrl.optional(),
  })
  .strict();

const bodySection = z
  .object({
    type: z.literal("body"),
    markdown: markdownField,
    heading: z.string().trim().max(120).optional(),
  })
  .strict();

const workedExampleSection = z
  .object({
    type: z.literal("workedExample"),
    markdown: markdownField,
  })
  .strict();

const checkYourselfSection = z
  .object({
    type: z.literal("checkYourself"),
    // Defaults to "click" (reveal-on-tap accordion). "static" renders a
    // plain list — matches the pre-Phase-B behaviour for regression paths.
    revealMode: z.enum(["click", "static"]).default("click"),
    // Optional subset of the concept's `expectedQuestions` — if omitted,
    // the client renders every entry from that array.
    questionSlugs: z.array(z.string().trim().max(120)).max(20).optional(),
  })
  .strict();

const cheatsheetSection = z
  .object({
    type: z.literal("cheatsheet"),
    markdown: markdownField,
  })
  .strict();

// Domain-flavored types. Kept intentionally small — one markdown field per
// type keeps the authoring surface tractable and lets domain-specific
// visual treatment happen on the client.

const codeReferenceSection = z
  .object({
    type: z.literal("codeReference"),
    markdown: markdownField,
    // Fenced-code language hint, e.g. "java" / "python" / "sql".
    language: z.string().trim().max(40).optional(),
    // What kind of reference — "syntax" / "api" / "config" / "queries" / free-text label.
    kind: z.string().trim().max(40).optional(),
  })
  .strict();

const diagramSection = z
  .object({
    type: z.literal("diagram"),
    diagramUrl: diagramUrl.optional(),
    // Fallback markdown when no image is available yet (e.g. ASCII art).
    markdown: markdownField.optional(),
    caption: z.string().trim().max(240).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.diagramUrl) || Boolean(v.markdown),
    "diagram section needs at least one of diagramUrl or markdown",
  );

const comparisonSection = z
  .object({
    type: z.literal("comparison"),
    markdown: markdownField,
    // Optional list of dimensions being compared — nudges authors to
    // structure the markdown as a table with these columns.
    dimensions: z.array(z.string().trim().max(80)).max(8).optional(),
  })
  .strict();

const gotchasSection = z
  .object({
    type: z.literal("gotchas"),
    markdown: markdownField,
  })
  .strict();

const complexitySection = z
  .object({
    type: z.literal("complexity"),
    markdown: markdownField,
    // Which dimensions the analysis covers — hint for the renderer to
    // surface labelled badges. Superset covers DSA + SQL + system-design.
    dimensions: z
      .array(z.enum(["time", "space", "io", "bandwidth", "cost"]))
      .max(5)
      .optional(),
  })
  .strict();

// ── Discriminated union over all 12 section types ───────────────────

export const primerSectionSchema = z.discriminatedUnion("type", [
  objectivesSection,
  prerequisitesSection,
  mentalModelSection,
  bodySection,
  workedExampleSection,
  checkYourselfSection,
  cheatsheetSection,
  codeReferenceSection,
  diagramSection,
  comparisonSection,
  gotchasSection,
  complexitySection,
]);

/**
 * The full `Concept.primerSections` array. Empty array is allowed — that's
 * the DEFAULT and it signals "fall back to legacy flat fields on the read
 * path". Capped at 20 sections per concept to keep the surface finite.
 */
export const primerSectionsArraySchema = z.array(primerSectionSchema).max(20);

/** All section type strings, useful for tests + client sectionRegistry keys. */
export const PRIMER_SECTION_TYPES = /** @type {const} */ ([
  "objectives",
  "prerequisites",
  "mentalModel",
  "body",
  "workedExample",
  "checkYourself",
  "cheatsheet",
  "codeReference",
  "diagram",
  "comparison",
  "gotchas",
  "complexity",
]);
