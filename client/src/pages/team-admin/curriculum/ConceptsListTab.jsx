// ============================================================================
// ConceptsListTab — Concepts + Labs authoring shell (W3.T9)
// ============================================================================
//
// SCOPE (Phase 1 minimal shell):
//
//   Concept list — card-per-concept with order, name, slug, status badge,
//   and per-row actions (Edit primer, Edit rubric, Attach/edit lab, Run
//   lesson review, Publish).
//
//   New concept — inline expand form: slug, name, order, primerMarkdown
//   are the required fields; other Concept fields (workedExample,
//   canonicalSources, expectedQuestions, assessmentCriteria) are deferred
//   to Phase 2's full inline editor. Server accepts sensible defaults
//   for the deferred fields.
//
//   Edit primer — modal with a full-height MarkdownEditor for
//   primerMarkdown. Server recompiles primerHtml on save.
//
//   Edit rubric — modal with 8 textarea fields for the readinessRubric
//   keys (explainToJunior, sketchArchitecture, buildFromScratch,
//   nameFailureModes, compareAlternatives, estimateCost, blastRadius,
//   debugFromSymptoms). This IS required in Phase 1 — the publish gate
//   for a Concept is `readinessRubric != null`, so shipping without a
//   rubric editor would block every publish flow.
//
//   Lab editor — modal with title, taskMarkdown (MarkdownEditor),
//   referenceSolution (code textarea), starterCode (optional code
//   textarea), timeboxMinutes, expectedArtifacts (chip-style list).
//
//   Actions per row — Run lesson review (calls the AI validator; renders
//   an inline verdict panel below the row), Publish concept (fires the
//   publish endpoint; on 400 renders the gates checklist inline).
//
//   TODO / Phase 2: full inline editor with worked example + canonical
//   sources + expectedQuestions + assessmentCriteria editors, concept
//   reordering (drag or up/down arrows), concept deletion, richHtmlEnabled
//   toggle. All of those live on the schema today; the CRUD endpoints
//   already accept them (see updateConcept). The Phase 1 shell surfaces
//   just enough to fork a template, edit the primer, author a rubric,
//   attach a lab, review, and publish.
// ============================================================================
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    PlusCircle, FileText, Beaker, ClipboardCheck, GitPullRequestArrow,
    UploadCloud, X, Save,
} from 'lucide-react'
import useAuthStore from '@store/useAuthStore'
import { VerdictBadge, PublishGateChecklist, MarkdownEditor } from '@components/curriculum'
import PrimerSectionsEditor from './primer-editor/PrimerSectionsEditor'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { cn } from '@utils/cn'
import { useConfirm } from '@hooks/useConfirm'
import {
    useCreateConcept,
    useUpdateConcept,
    useCreateLab,
    useUpdateLab,
    useRunLessonReview,
    useRunLabShapeCheck,
    usePublishConcept,
    usePublishLab,
    extractErrorCode,
} from '@hooks/useCurriculumAdmin'

// Rubric key list is stable and small — hard-code the labels here rather
// than a JSON schema. Order matches the concept publish gate's expectation
// (all 8 must be present as non-empty strings for a "complete" rubric,
// though the server accepts any non-null JSON).
const RUBRIC_FIELDS = [
    { key: 'explainToJunior',      label: 'Explain to junior', hint: 'Simple analogy or ELI5 phrasing.' },
    { key: 'sketchArchitecture',   label: 'Sketch architecture', hint: 'What diagram / boxes-and-arrows they can draw.' },
    { key: 'buildFromScratch',     label: 'Build from scratch', hint: 'End-to-end implementation task.' },
    { key: 'nameFailureModes',     label: 'Name failure modes', hint: 'Ways the system fails in prod.' },
    { key: 'compareAlternatives',  label: 'Compare alternatives', hint: 'X vs Y trade-off they can defend.' },
    { key: 'estimateCost',         label: 'Estimate cost / complexity', hint: 'Back-of-envelope reasoning.' },
    { key: 'blastRadius',          label: 'Blast radius', hint: 'What breaks when this misbehaves.' },
    { key: 'debugFromSymptoms',    label: 'Debug from symptoms', hint: 'Given a symptom, root-cause path.' },
]

const LAB_LANGUAGES = [
    { value: 'JAVA', label: 'Java' },
    // Phase 1 ships Java only per the plan spec; the LabLanguage enum
    // in schema.prisma has more entries but we hide them from the UI
    // until the executor supports them.
]

// ─────────────────────────────────────────────────────────────────
// Small modal shell — inline; TODO extract to @components/ui/Modal.
// Adds ESC-to-close + return-focus-on-close + role=dialog aria-modal.
// Focus trap is intentionally minimal (autofocus + return-focus); a
// full tab-cycle trap is deferred until the shared primitive lands.
// ─────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, size = 'md' }) {
    const widthClass = {
        sm: 'max-w-md',
        md: 'max-w-2xl',
        lg: 'max-w-4xl',
    }[size]

    // ESC-to-close + return-focus-on-close. Effect only runs while open
    // so we don't attach a global listener when the modal isn't mounted.
    useEffect(() => {
        if (!open) return
        const previouslyFocused = document.activeElement
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onClose?.()
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            // Restore focus to the element that opened the modal.
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus()
            }
        }
    }, [open, onClose])

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="modal-title"
                        className={cn(
                            'w-full rounded-2xl border border-border-default bg-surface-1 shadow-xl overflow-hidden',
                            widthClass,
                        )}
                    >
                        <header className="flex items-center justify-between px-5 py-3 border-b border-border-default">
                            <h3 id="modal-title" className="text-base font-bold text-text-primary">
                                {title}
                            </h3>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1 rounded-md hover:bg-surface-3 text-text-tertiary"
                                aria-label="Close modal"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </header>
                        <div className="p-5 max-h-[75vh] overflow-y-auto">
                            {children}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

// ─────────────────────────────────────────────────────────────────
// New Concept form — minimal required fields only. Deferred fields
// (workedExample, sources, assessmentCriteria, expectedQuestions)
// populate with server-side defaults from createConcept.
// ─────────────────────────────────────────────────────────────────
function NewConceptForm({ topicId, existingCount, onCancel, onCreated }) {
    const [slug, setSlug]       = useState('')
    const [name, setName]       = useState('')
    const [order, setOrder]     = useState(existingCount + 1)
    const [primer, setPrimer]   = useState('')

    const create = useCreateConcept(topicId)

    const submit = async (e) => {
        e.preventDefault()
        if (!slug.trim() || !name.trim() || !primer.trim()) return
        try {
            const data = await create.mutateAsync({
                topicId,
                slug: slug.trim(),
                name: name.trim(),
                order: Number(order),
                primerMarkdown: primer,
            })
            onCreated?.(data?.concept)
        } catch {
            // useToastingMutation handles toasts; keep the form open for retry.
        }
    }

    return (
        <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={submit}
            className="rounded-2xl border border-border-default bg-surface-2 p-5 space-y-4 overflow-hidden"
        >
            <div className="grid gap-4 sm:grid-cols-3">
                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Slug
                    </label>
                    <Input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="01-inheritance"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Name
                    </label>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Inheritance"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Order
                    </label>
                    <Input
                        type="number"
                        min={1}
                        value={order}
                        onChange={(e) => setOrder(e.target.value)}
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Primer (markdown)
                </label>
                <MarkdownEditor
                    value={primer}
                    onChange={setPrimer}
                    height={220}
                />
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={onCancel}
                    disabled={create.isPending}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={create.isPending}
                >
                    Create concept
                </Button>
            </div>
        </motion.form>
    )
}

// The flat `PrimerEditor` component was removed in Phase C (2026-07-09).
// Primer editing lives in `./primer-editor/PrimerSectionsEditor.jsx` — a
// section-list editor that supersedes the single MarkdownEditor. The
// legacy `Concept.primerMarkdown` field is retained on the schema for
// one release cycle as a safety net; the section editor auto-seeds a
// { type: "body" } section from any existing flat markdown on first open.

// ─────────────────────────────────────────────────────────────────
// Rubric editor modal — 8 textareas mirroring RUBRIC_FIELDS.
// ─────────────────────────────────────────────────────────────────
function RubricEditor({ topic, concept, open, onClose }) {
    const [values, setValues] = useState(() => concept?.readinessRubric ?? {})
    const update = useUpdateConcept(concept?.id, topic.id)

    useEffect(() => {
        if (open) setValues(concept?.readinessRubric ?? {})
    }, [open, concept?.id, concept?.readinessRubric])

    if (!open) return null

    const save = async () => {
        // Only persist non-empty keys. Consumer of the rubric (Mentor
        // readiness classifier) treats absent keys as "no expectation set",
        // which is safer than storing empty strings.
        const cleaned = {}
        for (const [k, v] of Object.entries(values)) {
            if (typeof v === 'string' && v.trim() !== '') cleaned[k] = v.trim()
        }
        try {
            await update.mutateAsync({
                readinessRubric: Object.keys(cleaned).length === 0 ? null : cleaned,
            })
            onClose()
        } catch {
            // toast handled
        }
    }

    return (
        <Modal open={open} onClose={onClose} title={`Readiness rubric — ${concept.name}`} size="lg">
            <div className="space-y-5">
                <p className="text-xs text-text-tertiary">
                    Fill each field with a short concrete expectation. Empty fields are omitted from the persisted rubric. At least one field must be present for the concept to publish.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                    {RUBRIC_FIELDS.map((f) => (
                        <div key={f.key}>
                            <label className="block text-xs font-semibold text-text-secondary mb-1">
                                {f.label}
                            </label>
                            <p className="text-[11px] text-text-tertiary mb-1">{f.hint}</p>
                            <textarea
                                rows={2}
                                value={values[f.key] ?? ''}
                                onChange={(e) =>
                                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                                }
                                className="w-full rounded-lg border border-border-default bg-surface-1
                                           px-3 py-2 text-sm text-text-primary focus:outline-none
                                           focus:ring-2 focus:ring-brand-500 resize-y"
                            />
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={save}
                        loading={update.isPending}
                    >
                        <Save className="w-4 h-4" />
                        Save rubric
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────
// Lab editor modal — create if concept has no lab, else patch.
// expectedArtifacts is stored as JSON array; we render it as a
// simple comma-separated string input for Phase 1.
// ─────────────────────────────────────────────────────────────────
function LabEditor({ topic, concept, open, onClose }) {
    const existing = concept?.lab ?? null
    const [title, setTitle]           = useState(existing?.title ?? '')
    const [taskMarkdown, setTask]     = useState(existing?.taskMarkdown ?? '')
    const [starterCode, setStarter]   = useState(existing?.starterCode ?? '')
    const [reference, setReference]   = useState(existing?.referenceSolution ?? '')
    const [timebox, setTimebox]       = useState(
        existing?.timeboxMinutes == null ? '' : String(existing.timeboxMinutes),
    )
    const [language, setLanguage]     = useState(existing?.language ?? 'JAVA')
    // Comma-separated list of artifact names. Full JSON editor for
    // {type, name, description} tuples is Phase 2.
    const [artifactsText, setArtifactsText] = useState(() => {
        const items = Array.isArray(existing?.expectedArtifacts) ? existing.expectedArtifacts : []
        // Support either the full {name} shape or a bare string; take
        // whichever is present when reading, always emit {type, name}
        // when writing.
        return items.map((a) => (typeof a === 'string' ? a : a?.name ?? '')).filter(Boolean).join(', ')
    })

    const create = useCreateLab(topic.id)
    const patch  = useUpdateLab(existing?.id, topic.id)

    // Reset all local editor state whenever the modal opens against a
    // different concept — otherwise stale field values from the previous
    // row bleed into the next open.
    useEffect(() => {
        if (!open) return
        setTitle(existing?.title ?? '')
        setTask(existing?.taskMarkdown ?? '')
        setStarter(existing?.starterCode ?? '')
        setReference(existing?.referenceSolution ?? '')
        setTimebox(existing?.timeboxMinutes == null ? '' : String(existing.timeboxMinutes))
        setLanguage(existing?.language ?? 'JAVA')
        const items = Array.isArray(existing?.expectedArtifacts) ? existing.expectedArtifacts : []
        setArtifactsText(items.map((a) => (typeof a === 'string' ? a : a?.name ?? '')).filter(Boolean).join(', '))
    }, [open, concept?.id, existing])

    if (!open) return null

    const submit = async () => {
        const expectedArtifacts = artifactsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((name) => ({ type: 'file', name }))
        const payload = {
            title,
            taskMarkdown,
            starterCode: starterCode || null,
            referenceSolution: reference,
            timeboxMinutes: timebox === '' ? null : Number(timebox),
            language,
            expectedArtifacts,
        }
        try {
            if (existing) {
                await patch.mutateAsync(payload)
            } else {
                await create.mutateAsync({ conceptId: concept.id, ...payload })
            }
            onClose()
        } catch {
            // toast handled
        }
    }

    const busy = create.isPending || patch.isPending

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`${existing ? 'Edit' : 'Create'} lab — ${concept.name}`}
            size="lg"
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Title
                        </label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Language
                        </label>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="w-full rounded-lg border border-border-default bg-surface-1
                                       px-3 py-2 text-sm text-text-primary focus:outline-none
                                       focus:ring-2 focus:ring-brand-500"
                        >
                            {LAB_LANGUAGES.map((l) => (
                                <option key={l.value} value={l.value}>{l.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Task (markdown)
                    </label>
                    <MarkdownEditor value={taskMarkdown} onChange={setTask} height={220} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Starter code (optional)
                        </label>
                        <textarea
                            value={starterCode}
                            onChange={(e) => setStarter(e.target.value)}
                            rows={8}
                            className="w-full font-mono text-xs rounded-lg border border-border-default bg-surface-1
                                       px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Reference solution (required)
                        </label>
                        <textarea
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            rows={8}
                            className="w-full font-mono text-xs rounded-lg border border-border-default bg-surface-1
                                       px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                            required
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Timebox (minutes, optional)
                        </label>
                        <Input
                            type="number"
                            min={0}
                            value={timebox}
                            onChange={(e) => setTimebox(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Expected artifacts (comma-separated file names)
                        </label>
                        <Input
                            value={artifactsText}
                            onChange={(e) => setArtifactsText(e.target.value)}
                            placeholder="Solution.java, README.md"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button variant="primary" size="md" onClick={submit} loading={busy}>
                        <Save className="w-4 h-4" />
                        {existing ? 'Save lab' : 'Create lab'}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

// ─────────────────────────────────────────────────────────────────
// Per-concept row card — actions + inline verdict/gate panels.
// ─────────────────────────────────────────────────────────────────
// Advisory gates (SUPER_ADMIN can override) vs structural gates (never bypassable).
// Keep in sync with server: publishConcept honors force= for `lesson_review_verdict`;
// publishTopic honors force= for `curriculum_review_verdict`. `readiness_rubric_present`
// and `concepts_all_published` are structural and always enforced.
const ADVISORY_GATE_IDS = new Set(['lesson_review_verdict', 'curriculum_review_verdict'])
function onlyAdvisoryGatesFailing(gates) {
    const failing = gates.filter((g) => g.status === 'FAIL')
    return failing.length > 0 && failing.every((g) => ADVISORY_GATE_IDS.has(g.id))
}

function ConceptRow({ topic, concept }) {
    const confirm = useConfirm()
    const user = useAuthStore((s) => s.user)
    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const [primerOpen, setPrimerOpen]   = useState(false)
    const [rubricOpen, setRubricOpen]   = useState(false)
    const [labOpen, setLabOpen]         = useState(false)
    const [reviewOut, setReviewOut]     = useState(null)   // lesson review body
    const [labReviewOut, setLabReviewOut] = useState(null) // lab shape check body
    const [gateOut, setGateOut]         = useState(null)   // { gates } on concept-publish 400
    const [labGateOut, setLabGateOut]   = useState(null)   // { gates } on lab-publish 400

    const review     = useRunLessonReview(concept.id, topic.id)
    const labReview  = useRunLabShapeCheck(concept.lab?.id)
    const publish    = usePublishConcept(concept.id, topic.id)
    const publishLab = usePublishLab(concept.lab?.id, topic.id)

    const runReview = async () => {
        try {
            const data = await review.mutateAsync()
            setReviewOut(data)
        } catch {
            // toast handled
        }
    }

    const runLabReview = async () => {
        if (!concept.lab?.id) return
        try {
            const data = await labReview.mutateAsync()
            setLabReviewOut(data)
        } catch {
            // toast handled
        }
    }

    const runPublishLab = async () => {
        if (!concept.lab?.id) return
        setLabGateOut(null)
        try {
            await publishLab.mutateAsync()
            // toast handled; topic detail invalidated → status badge refreshes.
        } catch (err) {
            if (extractErrorCode(err) === 'PUBLISH_GATE_BLOCKED') {
                setLabGateOut(err.response.data.error.details ?? { gates: [] })
            }
        }
    }

    const runPublish = async ({ force = false } = {}) => {
        const ok = await confirm({
            title: force ? 'Publish anyway (SUPER_ADMIN override)?' : 'Publish this concept?',
            description: force
                ? `AI lesson-review verdict flagged issues. Overriding as SUPER_ADMIN. Action is audit-logged.`
                : `Learners will see "${concept.name}" once published. You can update it after.`,
            confirmLabel: force ? 'Publish anyway' : 'Publish',
            cancelLabel: 'Cancel',
        })
        if (!ok) return
        setGateOut(null)
        try {
            await publish.mutateAsync({ force })
            // toast handled; topic detail invalidated → status badge refreshes.
        } catch (err) {
            if (extractErrorCode(err) === 'PUBLISH_GATE_BLOCKED') {
                setGateOut(err.response.data.error.details ?? { gates: [] })
            }
            // Non-gate errors: fall through — no default toast because
            // publish is silent; render an inline error line.
        }
    }

    return (
        <div className="rounded-2xl border border-border-default bg-surface-2 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-text-tertiary">#{concept.order}</span>
                        <h3 className="text-base font-bold text-text-primary">{concept.name}</h3>
                        <VerdictBadge verdict={concept.status} />
                        {concept.lab && (
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-info-fg bg-info-soft border border-info-line rounded-full px-2 py-0.5">
                                Lab attached
                            </span>
                        )}
                    </div>
                    <div className="text-xs font-mono text-text-tertiary mt-1">{concept.slug}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPrimerOpen(true)}>
                        <FileText className="w-3.5 h-3.5" /> Primer
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRubricOpen(true)}>
                        <ClipboardCheck className="w-3.5 h-3.5" /> Rubric
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setLabOpen(true)}>
                        <Beaker className="w-3.5 h-3.5" /> {concept.lab ? 'Lab' : 'Attach lab'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={runReview}
                        loading={review.isPending}
                    >
                        <GitPullRequestArrow className="w-3.5 h-3.5" /> Run lesson review
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => runPublish()}
                        loading={publish.isPending}
                        disabled={concept.status === 'PUBLISHED'}
                    >
                        <UploadCloud className="w-3.5 h-3.5" /> Publish
                    </Button>
                </div>
            </div>

            {/* Inline lesson-review verdict panel */}
            {reviewOut && (
                <div className="rounded-xl border border-border-default bg-surface-1 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <VerdictBadge verdict={reviewOut.verdict} />
                        <span className="text-xs text-text-tertiary">
                            Lesson review verdict
                        </span>
                        {reviewOut.usedFallback && (
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-warning-fg bg-warning-soft border border-warning-line rounded-full px-2 py-0.5">
                                Fallback used
                            </span>
                        )}
                    </div>
                    {reviewOut.body?.oneLineSummary && (
                        <p className="text-sm text-text-secondary italic">
                            "{reviewOut.body.oneLineSummary}"
                        </p>
                    )}
                    {Array.isArray(reviewOut.body?.issues) && reviewOut.body.issues.length > 0 && (
                        <ul className="text-xs text-text-secondary list-disc pl-5 space-y-0.5">
                            {reviewOut.body.issues.map((it, i) => <li key={i}>{it}</li>)}
                        </ul>
                    )}
                </div>
            )}

            {/* Lab shape-check summary + run button + publish */}
            {concept.lab && (
                <div className="rounded-xl border border-border-default bg-surface-1 p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-xs text-text-secondary min-w-0">
                        <span className="font-semibold text-text-primary">{concept.lab.title}</span>
                        <span className="mx-2 opacity-40">·</span>
                        <VerdictBadge verdict={concept.lab.status} />
                        <span className="mx-2 opacity-40">·</span>
                        {concept.lab.language}
                        {concept.lab.timeboxMinutes != null && (
                            <>
                                <span className="mx-2 opacity-40">·</span>
                                {concept.lab.timeboxMinutes}m
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={runLabReview}
                            loading={labReview.isPending}
                        >
                            Run lab shape check
                        </Button>
                        {/* Publish visible only when lab is not yet PUBLISHED AND parent
                            concept is PUBLISHED — labs can't ship ahead of their concept. */}
                        {concept.lab.status !== 'PUBLISHED' && concept.status === 'PUBLISHED' && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={runPublishLab}
                                loading={publishLab.isPending}
                            >
                                <UploadCloud className="w-3.5 h-3.5" /> Publish lab
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {labGateOut?.gates && (
                <div className="rounded-xl border border-danger-line bg-danger-soft/40 p-4 space-y-2">
                    <p className="text-xs font-semibold text-danger-fg">
                        Lab publish blocked. Fix the failing gates below and retry.
                    </p>
                    <PublishGateChecklist gates={labGateOut.gates} />
                </div>
            )}
            {labReviewOut && (
                <div className="rounded-xl border border-border-default bg-surface-1 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <VerdictBadge verdict={labReviewOut.verdict} />
                        <span className="text-xs text-text-tertiary">Lab shape check</span>
                    </div>
                    {Array.isArray(labReviewOut.body?.issues) && labReviewOut.body.issues.length > 0 && (
                        <ul className="text-xs text-danger-fg list-disc pl-5 space-y-0.5">
                            {labReviewOut.body.issues.map((it, i) => <li key={i}>{it}</li>)}
                        </ul>
                    )}
                    {Array.isArray(labReviewOut.body?.strengths) && labReviewOut.body.strengths.length > 0 && (
                        <ul className="text-xs text-success-fg list-disc pl-5 space-y-0.5">
                            {labReviewOut.body.strengths.map((it, i) => <li key={i}>{it}</li>)}
                        </ul>
                    )}
                </div>
            )}

            {/* Publish gate failure inline */}
            {gateOut?.gates && (
                <div className="rounded-xl border border-danger-line bg-danger-soft/40 p-4 space-y-2">
                    <p className="text-xs font-semibold text-danger-fg">
                        Publish blocked. Fix the failing gates below and retry.
                    </p>
                    <PublishGateChecklist gates={gateOut.gates} />
                    {isSuperAdmin && onlyAdvisoryGatesFailing(gateOut.gates) && (
                        <div className="flex items-center gap-3 pt-2 border-t border-danger-line/40">
                            <p className="text-[11px] text-text-tertiary flex-1">
                                Only the advisory AI-review gate is failing. As SUPER_ADMIN you can publish anyway — the action is audit-logged.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => runPublish({ force: true })}
                                loading={publish.isPending}
                            >
                                <UploadCloud className="w-3.5 h-3.5" /> Publish anyway
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            {/* Phase C — section-based primer editor. Replaces the flat
                `PrimerEditor` (below, retained temporarily for direct
                markdown edits during the transition release). Section
                editor auto-seeds from legacy flat fields the first time
                it opens so authors never see a blank slate. */}
            <PrimerSectionsEditor topic={topic} concept={concept} open={primerOpen} onClose={() => setPrimerOpen(false)} />
            <RubricEditor topic={topic} concept={concept} open={rubricOpen} onClose={() => setRubricOpen(false)} />
            <LabEditor    topic={topic} concept={concept} open={labOpen}    onClose={() => setLabOpen(false)} />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Tab entry point
// ─────────────────────────────────────────────────────────────────
export default function ConceptsListTab({ topic }) {
    const [showNew, setShowNew] = useState(false)
    const concepts = topic.concepts ?? []

    if (concepts.length === 0 && !showNew) {
        return (
            <div className="rounded-2xl border border-border-default bg-surface-2 p-8 text-center space-y-4">
                <p className="text-sm text-text-secondary">
                    No concepts yet. Add the first concept to build out this topic.
                </p>
                <Button variant="primary" size="md" onClick={() => setShowNew(true)}>
                    <PlusCircle className="w-4 h-4" />
                    Add concept
                </Button>
                <p className="text-xs text-text-tertiary">
                    Never done this before?{' '}
                    <a href="/docs/how-to/task/author-topic" className="text-brand-fg-soft underline">
                        Read the Author a Topic guide →
                    </a>
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs text-text-tertiary">
                    {concepts.length} concept{concepts.length === 1 ? '' : 's'} — ordered by <span className="font-mono">order</span>.
                </p>
                <Button variant="primary" size="sm" onClick={() => setShowNew((v) => !v)}>
                    <PlusCircle className="w-3.5 h-3.5" />
                    {showNew ? 'Cancel' : 'New concept'}
                </Button>
            </div>

            <AnimatePresence>
                {showNew && (
                    <NewConceptForm
                        topicId={topic.id}
                        existingCount={concepts.length}
                        onCancel={() => setShowNew(false)}
                        onCreated={() => setShowNew(false)}
                    />
                )}
            </AnimatePresence>

            <div className="space-y-3">
                {concepts.map((c) => (
                    <ConceptRow key={c.id} topic={topic} concept={c} />
                ))}
            </div>
        </div>
    )
}
