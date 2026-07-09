// ============================================================================
// PrimerSectionRenderer — iterates concept.primerSections and dispatches
// each entry to its type-specific renderer via sectionRegistry.
// ============================================================================
//
// Legacy fallback: when concept.primerSections is empty (should only happen
// briefly during rollout if a concept somehow skipped the backfill), derive
// an equivalent ordered array from the flat fields so the reader surface
// never renders blank.
//
// Unknown-type fallback: an entry whose `type` doesn't match a registered
// renderer emits a dev-only console.warn and renders nothing. Prevents
// a client that's older than the server from crashing on new section
// types added post-deploy.
// ============================================================================

import { sectionRegistry } from './sectionRegistry'

/**
 * Derive an ordered section array from a concept's flat fields.
 * Matches the SQL backfill in
 * server/prisma/migrations/20260709100000_primer_sections_and_hint_note/migration.sql
 * so both paths render identically.
 */
function deriveFromFlatFields(concept) {
    const sections = []
    if (concept?.primerMarkdown?.trim()) {
        sections.push({ type: 'body', markdown: concept.primerMarkdown })
    }
    if (concept?.workedExample?.trim()) {
        sections.push({ type: 'workedExample', markdown: concept.workedExample })
    }
    if (concept?.cheatsheetMarkdown?.trim()) {
        sections.push({ type: 'cheatsheet', markdown: concept.cheatsheetMarkdown })
    }
    if (
        Array.isArray(concept?.expectedQuestions) &&
        concept.expectedQuestions.length > 0
    ) {
        sections.push({ type: 'checkYourself', revealMode: 'click' })
    }
    return sections
}

export default function PrimerSectionRenderer({ concept, topicSlug }) {
    let sections = Array.isArray(concept?.primerSections)
        ? concept.primerSections
        : []
    if (sections.length === 0) {
        sections = deriveFromFlatFields(concept)
    }
    if (sections.length === 0) {
        return (
            <p className="text-sm text-text-tertiary italic">
                No primer written yet for this concept.
            </p>
        )
    }
    return (
        <div className="space-y-8">
            {sections.map((section, i) => {
                const Renderer = sectionRegistry[section?.type]
                if (!Renderer) {
                    // Client is older than server. Skip; dev sees the warn.
                    if (import.meta.env.DEV) {
                        console.warn(
                            `[PrimerSectionRenderer] unknown section type "${section?.type}"`,
                            section,
                        )
                    }
                    return null
                }
                return (
                    <Renderer
                        key={i}
                        section={section}
                        concept={concept}
                        topicSlug={topicSlug}
                    />
                )
            })}
        </div>
    )
}
