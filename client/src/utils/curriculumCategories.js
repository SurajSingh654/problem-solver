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

/** Ordered list for `<select>` dropdowns. */
export const CURRICULUM_CATEGORIES = [
  { value: 'LOW_LEVEL_DESIGN', label: 'Low-Level Design' },
  { value: 'HIGH_LEVEL_DESIGN', label: 'High-Level Design' },
  { value: 'AI_ENGINEERING',   label: 'AI Engineering' },
  { value: 'DATA_STRUCTURES',  label: 'Data Structures' },
]

/** `value → label` map for badge / display sites that don't iterate. */
export const CURRICULUM_CATEGORY_LABEL = Object.fromEntries(
  CURRICULUM_CATEGORIES.map((c) => [c.value, c.label]),
)
