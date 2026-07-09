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
 * clicks "add section". Optional string fields are deliberately OMITTED
 * (not seeded with '') because Zod's `.optional()` variants that carry
 * `.refine()` — notably `diagramUrl` with its `^https?:` check — fire
 * that refine on empty strings and reject with a confusing "must be
 * http(s)" error the author never triggered. Editor inputs handle
 * undefined via `value={value ?? ''}` so blank UI still works.
 */
export function emptySection(type) {
    switch (type) {
        case 'objectives':
            return { type, items: [{ verb: '', outcome: '' }] }
        case 'prerequisites':
            return { type }
        case 'mentalModel':
            return { type, markdown: '' }
        case 'body':
            return { type, markdown: '' }
        case 'workedExample':
            return { type, markdown: '' }
        case 'checkYourself':
            return { type, revealMode: 'click' }
        case 'cheatsheet':
            return { type, markdown: '' }
        case 'codeReference':
            return { type, markdown: '' }
        case 'diagram':
            return { type }
        case 'comparison':
            return { type, markdown: '' }
        case 'gotchas':
            return { type, markdown: '' }
        case 'complexity':
            return { type, markdown: '' }
        default:
            return { type, markdown: '' }
    }
}

/**
 * Strip empty-string / empty-array optional fields from a section before
 * it hits the wire. Zod's `.optional()` refinements (e.g. diagramUrl's
 * `^https?:` check) fire on empty-string values, so we must send
 * `undefined` for "not filled in" — not `""`.
 *
 * Non-optional fields are preserved as-is (empty required content is
 * still an error, but at least the failure message points at the real
 * missing field rather than "URL must be http(s)").
 */
export function normalizeSectionForWire(section) {
    if (!section || typeof section !== 'object') return section
    const out = { ...section }
    const stripIfBlank = [
        'markdown',
        'heading',
        'note',
        'diagramUrl',
        'excalidraw',
        'caption',
        'language',
        'kind',
    ]
    for (const k of stripIfBlank) {
        if (typeof out[k] === 'string' && out[k].trim() === '') {
            delete out[k]
        }
    }
    if (Array.isArray(out.dimensions) && out.dimensions.length === 0) {
        delete out.dimensions
    }
    if (out.type === 'objectives' && Array.isArray(out.items)) {
        // Drop objective rows where both verb and outcome are empty — they'd
        // fail Zod's `.min(1)` and confuse the author about why save failed.
        out.items = out.items.filter(
            (it) =>
                (it?.verb ?? '').trim().length > 0 ||
                (it?.outcome ?? '').trim().length > 0,
        )
    }
    return out
}
