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

/**
 * Detect return-visit state — the learner has viewed this primer before
 * (prior `primer_read` signal). Signal is fire-on-mount so any past visit
 * satisfies this. Fresh learners get first-visit mode; anyone who's been
 * here before gets `openByDefault` on the cheatsheet section so the
 * compact reference is expanded when they scroll to it.
 */
function isReturnVisit(concept) {
    const signals = concept?.mastery?.signals
    if (!Array.isArray(signals)) return false
    return signals.some((s) => s?.source === 'primer_read')
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
    const returnVisit = isReturnVisit(concept)
    return (
        <div className="space-y-8">
            {returnVisit && (
                <div className="rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-[11px] text-text-tertiary flex items-center justify-between gap-3">
                    <span>
                        Welcome back — cheatsheet is expanded for quick review.
                    </span>
                    <span className="font-mono text-[10px] opacity-70">review mode</span>
                </div>
            )}
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
                // On return visits, auto-open the cheatsheet. Other section
                // types don't take `openByDefault` — they just ignore it.
                const openByDefault =
                    returnVisit && section.type === 'cheatsheet'
                return (
                    <Renderer
                        key={i}
                        section={section}
                        concept={concept}
                        topicSlug={topicSlug}
                        openByDefault={openByDefault}
                    />
                )
            })}
        </div>
    )
}
