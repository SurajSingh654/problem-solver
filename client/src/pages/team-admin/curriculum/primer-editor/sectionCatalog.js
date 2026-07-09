// ============================================================================
// sectionCatalog.js — metadata for the 12 primer section types
// ============================================================================
//
// Mirrors the Zod discriminated union in server/src/schemas/curriculum.schema.js.
// Adding a new section type is a four-step change:
//   1. Add the section variant to `curriculum.schema.js`
//   2. Add the reader component + registry entry under
//      `client/src/pages/learn/tabs/primer/`
//   3. Add the editor entry here (this file) — controls the "add section"
//      dropdown label + which per-type editor renders
//   4. Add the editor component in `SectionEditors.jsx`
//
// Field labels come from the pedagogy reviewer's naming. Order in the array
// determines dropdown order in the authoring UI.
// ============================================================================

export const SECTION_CATALOG = [
    {
        type: 'objectives',
        label: 'Learning objectives',
        description: '2-4 outcome-based statements. What can the learner DO after reading?',
        group: 'universal',
    },
    {
        type: 'prerequisites',
        label: 'Prerequisites',
        description: 'Warning strip listing prereq concepts. Prereqs themselves are managed on the Concept graph.',
        group: 'universal',
    },
    {
        type: 'mentalModel',
        label: 'Mental model',
        description: 'The picture the learner should carry away. Analogy + optional diagram.',
        group: 'universal',
    },
    {
        type: 'body',
        label: 'Body',
        description: 'Free-form deep-dive markdown. Use for exposition that doesn’t fit a structured type.',
        group: 'universal',
    },
    {
        type: 'workedExample',
        label: 'Worked example',
        description: 'A concrete walk-through applying the mental model.',
        group: 'universal',
    },
    {
        type: 'checkYourself',
        label: 'Check yourself',
        description: 'References the concept’s expectedQuestions. Reveal-on-click by default.',
        group: 'universal',
    },
    {
        type: 'cheatsheet',
        label: 'Cheatsheet',
        description: 'Compact reference. Collapsed on first visit, primary on return visits.',
        group: 'universal',
    },
    {
        type: 'codeReference',
        label: 'Code reference',
        description: 'Syntax / API / config / query examples. For languages, frameworks, SQL.',
        group: 'domain',
    },
    {
        type: 'diagram',
        label: 'Diagram',
        description: 'Architecture / UML / data flow / packet flow. Image URL or ASCII fallback.',
        group: 'domain',
    },
    {
        type: 'comparison',
        label: 'Comparison',
        description: 'Tradeoffs, version diffs, protocol choice, pattern-vs-pattern.',
        group: 'domain',
    },
    {
        type: 'gotchas',
        label: 'Gotchas',
        description: 'Anti-patterns, failure modes, common mistakes, edge cases.',
        group: 'domain',
    },
    {
        type: 'complexity',
        label: 'Complexity',
        description: 'Time/space, query cost, throughput/latency, bandwidth.',
        group: 'domain',
    },
]

/** Fast lookup by type. */
export const SECTION_LABEL_BY_TYPE = Object.fromEntries(
    SECTION_CATALOG.map((s) => [s.type, s.label]),
)

/**
 * Return a fresh empty section for the given type — used when the author
 * clicks "add section". Shape mirrors the Zod schema defaults.
 */
export function emptySection(type) {
    switch (type) {
        case 'objectives':
            return { type, items: [{ verb: '', outcome: '' }] }
        case 'prerequisites':
            return { type, note: '' }
        case 'mentalModel':
            return { type, markdown: '' }
        case 'body':
            return { type, markdown: '', heading: '' }
        case 'workedExample':
            return { type, markdown: '' }
        case 'checkYourself':
            return { type, revealMode: 'click' }
        case 'cheatsheet':
            return { type, markdown: '' }
        case 'codeReference':
            return { type, markdown: '', language: '', kind: '' }
        case 'diagram':
            return { type, diagramUrl: '', markdown: '', caption: '' }
        case 'comparison':
            return { type, markdown: '', dimensions: [] }
        case 'gotchas':
            return { type, markdown: '' }
        case 'complexity':
            return { type, markdown: '', dimensions: [] }
        default:
            return { type, markdown: '' }
    }
}
