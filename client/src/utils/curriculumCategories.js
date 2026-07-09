// ============================================================================
// Curriculum category taxonomy — shared across TEAM_ADMIN authoring surfaces
// ============================================================================
//
// Mirror of the Prisma `TopicCategory` enum (server/prisma/schema.prisma:2410),
// paired with human-readable labels. Three surfaces used to encode this list
// inline (CurriculumAdminPage, TopicMetadataTab, TemplateBrowserPage) — a new
// enum value had to be added in three places or the dropdowns would drift.
//
// If the Prisma enum grows, add the value here first and both the array +
// label map propagate to every consumer.
// ============================================================================

/**
 * Ordered list for `<select>` dropdowns. Group hints let the authoring UI
 * render sub-headings (Design / Fundamentals / Languages / Databases).
 * Order within a group is intentional — most-used first.
 *
 * `subCategoryHint` is a comma-separated suggestion string surfaced as
 * placeholder text under the subCategory input when the group is one of
 * the multi-flavor categories. Not enforced — subCategory is free-text.
 */
export const CURRICULUM_CATEGORIES = [
  // ── Design (LLD / HLD stay canonical) ─────────────────
  { value: 'LOW_LEVEL_DESIGN',     label: 'Low-Level Design' },
  { value: 'SYSTEM_DESIGN',        label: 'High-Level Design' },
  // ── CS fundamentals ──────────────────────────────────
  { value: 'DSA',                  label: 'Data Structures & Algorithms' },
  { value: 'AI_ENGINEERING',       label: 'AI Engineering' },
  { value: 'DBMS',                 label: 'Databases (concepts)' },
  { value: 'OS',                   label: 'Operating Systems' },
  { value: 'NETWORKS',             label: 'Computer Networks' },
  { value: 'CS_FUNDAMENTALS',      label: 'CS Fundamentals (misc.)' },
  // ── Phase D — cross-discipline expansion ──────────────
  {
    value: 'PROGRAMMING_LANGUAGE',
    label: 'Programming Language',
    subCategoryHint: 'e.g. Java, Python, Kotlin, TypeScript',
  },
  {
    value: 'FRAMEWORK',
    label: 'Framework',
    subCategoryHint: 'e.g. Spring Boot, React, Angular, Django',
  },
  {
    value: 'SQL',
    label: 'SQL Databases',
    subCategoryHint: 'e.g. PostgreSQL, MySQL, SQLite',
  },
  {
    value: 'NOSQL',
    label: 'NoSQL Databases',
    subCategoryHint: 'e.g. MongoDB, Redis, DynamoDB',
  },
  // ── Non-technical ────────────────────────────────────
  { value: 'BEHAVIORAL',           label: 'Behavioral' },
  { value: 'HR',                   label: 'HR' },
]

/**
 * The set of category values that expect a `subCategory` differentiator.
 * TopicMetadataTab shows the subCategory input only for these.
 */
export const CATEGORIES_WITH_SUBCATEGORY = new Set(
  CURRICULUM_CATEGORIES
    .filter((c) => Boolean(c.subCategoryHint))
    .map((c) => c.value),
)

/**
 * Look up the subCategory placeholder hint for a given category value.
 * Returns the empty string when the category doesn't expect a subCategory.
 */
export function subCategoryHintFor(category) {
  const entry = CURRICULUM_CATEGORIES.find((c) => c.value === category)
  return entry?.subCategoryHint ?? ''
}

/** `value → label` map for badge / display sites that don't iterate. */
export const CURRICULUM_CATEGORY_LABEL = Object.fromEntries(
  CURRICULUM_CATEGORIES.map((c) => [c.value, c.label]),
)
