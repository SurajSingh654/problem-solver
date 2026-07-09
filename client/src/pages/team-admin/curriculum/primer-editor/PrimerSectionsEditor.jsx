// ============================================================================
// PrimerSectionsEditor — TEAM_ADMIN authoring modal for concept.primerSections
// ============================================================================
//
// Section-list editor:
//   * Renders each section as an expand-collapse card via <details>
//   * Reorder with ▲/▼ buttons (keyboard-accessible; drag-reorder can land
//     in a later polish pass if authors ask for it)
//   * Remove per-section with a trash button
//   * "Add section" dropdown grouped into universal / domain-flavored
//   * Save writes the whole array via useUpdateConcept
//
// Seeding rule: when opening a concept whose `primerSections` is empty but
// whose legacy `primerMarkdown` has content, auto-seed a single { type:'body' }
// section from the flat field so authors don't accidentally save an empty
// array and lose their content.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ArrowDown,
    ArrowUp,
    Plus,
    Save,
    Trash2,
    X,
} from 'lucide-react'
import { Button } from '@components/ui/Button'
import { useUpdateConcept } from '@hooks/useCurriculumAdmin'
import { cn } from '@utils/cn'
import { SECTION_CATALOG, SECTION_LABEL_BY_TYPE, emptySection } from './sectionCatalog'
import { EDITOR_REGISTRY } from './editorRegistry'

// Mirror the read-side fallback so first-open of a legacy concept doesn't
// hand the author a blank slate — they see their existing markdown as a
// body section and can restructure from there.
function seedFromLegacy(concept) {
    const seeded = []
    if (concept?.primerMarkdown?.trim()) {
        seeded.push({ type: 'body', markdown: concept.primerMarkdown })
    }
    if (concept?.workedExample?.trim()) {
        seeded.push({ type: 'workedExample', markdown: concept.workedExample })
    }
    if (concept?.cheatsheetMarkdown?.trim()) {
        seeded.push({ type: 'cheatsheet', markdown: concept.cheatsheetMarkdown })
    }
    if (
        Array.isArray(concept?.expectedQuestions) &&
        concept.expectedQuestions.length > 0
    ) {
        seeded.push({ type: 'checkYourself', revealMode: 'click' })
    }
    return seeded
}

export default function PrimerSectionsEditor({ topic, concept, open, onClose }) {
    const update = useUpdateConcept(concept?.id, topic.id)
    const [sections, setSections] = useState([])
    const [validationIssues, setValidationIssues] = useState(null)
    const [addOpen, setAddOpen] = useState(false)

    // Re-seed on open. Depend on concept.id so re-editing after save picks
    // up the freshly-persisted array.
    useEffect(() => {
        if (!open) return
        const fromServer = Array.isArray(concept?.primerSections)
            ? concept.primerSections
            : []
        setSections(
            fromServer.length > 0 ? fromServer : seedFromLegacy(concept),
        )
        setValidationIssues(null)
        setAddOpen(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, concept?.id])

    // ESC-to-close + return-focus-on-close. Mirrors the other modals.
    useEffect(() => {
        if (!open) return
        const previouslyFocused = document.activeElement
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose?.()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            if (previouslyFocused?.focus) previouslyFocused.focus()
        }
    }, [open, onClose])

    const updateSection = (index, next) => {
        setSections((prev) => prev.map((s, i) => (i === index ? next : s)))
    }
    const removeSection = (index) => {
        setSections((prev) => prev.filter((_, i) => i !== index))
    }
    const moveSection = (index, delta) => {
        setSections((prev) => {
            const target = index + delta
            if (target < 0 || target >= prev.length) return prev
            const next = [...prev]
            ;[next[index], next[target]] = [next[target], next[index]]
            return next
        })
    }
    const addSection = (type) => {
        setSections((prev) => [...prev, emptySection(type)])
        setAddOpen(false)
    }

    const save = async () => {
        setValidationIssues(null)
        try {
            await update.mutateAsync({ primerSections: sections })
            onClose?.()
        } catch (err) {
            const details = err?.response?.data?.error?.details
            if (details?.issues) {
                setValidationIssues(details.issues)
            }
            // Toast for other failures is handled by the hook.
        }
    }

    // Group catalog entries so the add menu splits universal / domain-flavored.
    const grouped = useMemo(() => {
        const g = { universal: [], domain: [] }
        for (const s of SECTION_CATALOG) g[s.group]?.push(s)
        return g
    }, [])

    if (!open) return null

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    role="presentation"
                    className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 8 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="primer-sections-title"
                        className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border-default bg-surface-1 shadow-xl overflow-hidden flex flex-col"
                    >
                        <header className="flex items-center justify-between px-5 py-3 border-b border-border-default">
                            <div>
                                <h3
                                    id="primer-sections-title"
                                    className="text-base font-bold text-text-primary"
                                >
                                    Primer sections — {concept.name}
                                </h3>
                                <p className="text-[11px] text-text-tertiary mt-0.5">
                                    Structured primer authoring. Reorder with ▲▼, remove with 🗑, add from the menu below.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close"
                                className="p-1 rounded hover:bg-surface-2 text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </header>

                        <div className="flex-1 overflow-auto p-5 space-y-4">
                            {sections.length === 0 && (
                                <div className="text-center py-8 text-sm text-text-tertiary">
                                    No sections yet. Add one from the menu below to get started.
                                </div>
                            )}

                            {sections.map((section, i) => {
                                const Editor = EDITOR_REGISTRY[section.type]
                                const label =
                                    SECTION_LABEL_BY_TYPE[section.type] ??
                                    section.type
                                return (
                                    <details
                                        key={`${section.type}-${i}`}
                                        open
                                        className="rounded-xl border border-border-default bg-surface-2 overflow-hidden"
                                    >
                                        <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface-3">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <span className="text-[10px] font-mono text-text-tertiary shrink-0">
                                                    {String(i + 1).padStart(2, '0')}
                                                </span>
                                                <span className="text-sm font-semibold text-text-primary">
                                                    {label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        moveSection(i, -1)
                                                    }}
                                                    disabled={i === 0}
                                                    aria-label="Move up"
                                                    className="p-1.5 rounded hover:bg-surface-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ArrowUp className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        moveSection(i, +1)
                                                    }}
                                                    disabled={i === sections.length - 1}
                                                    aria-label="Move down"
                                                    className="p-1.5 rounded hover:bg-surface-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ArrowDown className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        removeSection(i)
                                                    }}
                                                    aria-label="Remove section"
                                                    className="p-1.5 rounded hover:bg-danger-soft text-text-tertiary hover:text-danger-fg"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </summary>
                                        <div className="p-4 border-t border-border-default">
                                            {Editor ? (
                                                <Editor
                                                    section={section}
                                                    onChange={(next) =>
                                                        updateSection(i, next)
                                                    }
                                                />
                                            ) : (
                                                <p className="text-sm text-danger-fg">
                                                    No editor registered for type “{section.type}”.
                                                </p>
                                            )}
                                        </div>
                                    </details>
                                )
                            })}

                            {/* Add-section menu */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setAddOpen((v) => !v)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border-default bg-surface-2 hover:border-brand-400 hover:text-text-primary px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add section
                                </button>
                                {addOpen && (
                                    <div
                                        role="menu"
                                        className="absolute z-10 left-0 mt-1 w-[420px] rounded-xl border border-border-default bg-surface-1 shadow-xl p-2 max-h-[60vh] overflow-auto"
                                    >
                                        {['universal', 'domain'].map((group) => (
                                            <div key={group} className="mb-1 last:mb-0">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary px-2 py-1.5">
                                                    {group === 'universal'
                                                        ? 'Universal core'
                                                        : 'Domain-flavored'}
                                                </p>
                                                {grouped[group].map((s) => (
                                                    <button
                                                        key={s.type}
                                                        type="button"
                                                        onClick={() => addSection(s.type)}
                                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2"
                                                    >
                                                        <p className="text-sm font-semibold text-text-primary">
                                                            {s.label}
                                                        </p>
                                                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                                                            {s.description}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {validationIssues && validationIssues.length > 0 && (
                                <div className="rounded-xl border border-danger-line bg-danger-soft p-4 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-danger-fg">
                                        Server rejected the sections
                                    </p>
                                    <ul className="space-y-1 text-xs text-danger-fg">
                                        {validationIssues.map((iss, i) => (
                                            <li key={i}>
                                                <span className="font-mono opacity-70">
                                                    {iss.path?.join('.') || '.'}:
                                                </span>{' '}
                                                {iss.message}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <footer
                            className={cn(
                                'px-5 py-3 border-t border-border-default flex items-center justify-between gap-3',
                                'bg-surface-2',
                            )}
                        >
                            <p className="text-[11px] text-text-tertiary">
                                {sections.length} section
                                {sections.length === 1 ? '' : 's'}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="md" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    size="md"
                                    onClick={save}
                                    loading={update.isPending}
                                >
                                    <Save className="w-4 h-4" />
                                    Save primer
                                </Button>
                            </div>
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
