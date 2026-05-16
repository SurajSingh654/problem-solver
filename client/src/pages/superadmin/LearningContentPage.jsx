// ============================================================================
// SuperAdmin — Learning Content (Topic + Concept authoring & publishing)
// ============================================================================
//
// One page that lets a SuperAdmin:
//   1. See all topics with concept-status breakdown
//   2. Drill into a topic and see all concepts (any status)
//   3. Edit a concept's content inline (primer markdown, worked example,
//      sources, expected questions)
//   4. Flip status: DRAFT → REVIEWED → PUBLISHED (and back, for rollback)
//   5. Add / delete concepts
//   6. Manage prereq edges between concepts
//
// THIS IS THE TOOL THAT PUBLISHES CONTENT TO USERS. The user-facing /learn
// page filters to PUBLISHED only — nothing reaches members until the
// SuperAdmin promotes a concept (and the parent topic) here.
// ============================================================================
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { useConfirm } from '@hooks/useConfirm'
import { toast } from '@store/useUIStore'
import { cn } from '@utils/cn'
import {
    useAdminTopics,
    useAdminTopic,
    useUpdateTopic,
    useCreateConcept,
    useUpdateConcept,
    useDeleteConcept,
    useAddPrereq,
    useRemovePrereq,
} from '@hooks/useTopicsAdmin'

const STATUS_TONES = {
    DRAFT:     'bg-warning-soft text-warning-fg border-warning-line',
    REVIEWED:  'bg-info-soft text-info-fg border-info-line',
    PUBLISHED: 'bg-success-soft text-success-fg border-success-line',
}

const NEXT_STATUS = {
    DRAFT:     'REVIEWED',
    REVIEWED:  'PUBLISHED',
    PUBLISHED: 'DRAFT',     // rollback path
}

const NEXT_LABEL = {
    DRAFT:     'Mark reviewed →',
    REVIEWED:  'Publish →',
    PUBLISHED: '↓ Unpublish',
}

export default function LearningContentPage() {
    const topicsQ = useAdminTopics()
    const [selectedSlug, setSelectedSlug] = useState(null)

    // Auto-select the first (or only) topic on first load.
    useEffect(() => {
        if (selectedSlug == null && topicsQ.data?.topics?.length > 0) {
            setSelectedSlug(topicsQ.data.topics[0].slug)
        }
    }, [topicsQ.data, selectedSlug])

    if (topicsQ.isLoading) {
        return <div className="p-6 flex justify-center"><Spinner size="lg" /></div>
    }
    const topics = topicsQ.data?.topics ?? []

    return (
        <div className="p-6 max-w-[1300px] mx-auto space-y-6">
            <header>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Learning Content
                </h1>
                <p className="text-sm text-text-tertiary max-w-2xl leading-relaxed">
                    Author + publish curated topic content. Until a Topic and its
                    Concepts are PUBLISHED, members see nothing — this is the
                    architectural anti-hallucination defense, not a polish gate.
                </p>
            </header>

            {topics.length === 0 ? (
                <EmptyState />
            ) : (
                <>
                    <TopicTabs topics={topics} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
                    {selectedSlug && <TopicDetail slug={selectedSlug} />}
                </>
            )}
        </div>
    )
}

function EmptyState() {
    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center space-y-3">
            <div className="text-5xl">📦</div>
            <h2 className="text-lg font-bold text-text-primary">No topics seeded</h2>
            <p className="text-sm text-text-tertiary max-w-md mx-auto">
                Run <code className="text-brand-fg-soft bg-brand-soft px-1 rounded text-[11px]">node prisma/seeds/topic-system-design.js</code>{' '}
                from the server directory to seed System Design + 15 DRAFT concepts,
                then come back here to author + publish.
            </p>
        </div>
    )
}

// ── Topic tabs ───────────────────────────────────────────────────────

function TopicTabs({ topics, selectedSlug, onSelect }) {
    return (
        <div className="flex gap-2 flex-wrap border-b border-border-default pb-3">
            {topics.map((t) => {
                const isSelected = t.slug === selectedSlug
                const breakdown = t.conceptStatusBreakdown
                return (
                    <button
                        key={t.slug}
                        type="button"
                        onClick={() => onSelect(t.slug)}
                        className={cn(
                            'px-3 py-2 rounded-xl border text-left transition-colors',
                            isSelected
                                ? 'bg-brand-soft border-brand-line'
                                : 'bg-surface-1 border-border-default hover:border-border-strong',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-text-primary">{t.name}</p>
                            <span className={cn(
                                'text-[9px] font-bold px-1.5 py-px rounded-full border',
                                STATUS_TONES[t.status],
                            )}>{t.status}</span>
                        </div>
                        <p className="text-[10px] text-text-disabled mt-0.5">
                            {breakdown.PUBLISHED} pub · {breakdown.REVIEWED} rev · {breakdown.DRAFT} draft
                            {' · '}{t.enrollmentCount} enrolled
                        </p>
                    </button>
                )
            })}
        </div>
    )
}

// ── Topic detail (header + concepts list + editor) ───────────────────

function TopicDetail({ slug }) {
    const topicQ = useAdminTopic(slug)
    const [editingConceptId, setEditingConceptId] = useState(null)
    const [adding, setAdding] = useState(false)

    if (topicQ.isLoading) return <div className="py-8 flex justify-center"><Spinner /></div>
    if (topicQ.isError || !topicQ.data?.topic) {
        return (
            <div className="bg-danger-soft border border-danger-line rounded-xl p-4 text-sm text-danger-fg">
                Couldn&rsquo;t load topic.
            </div>
        )
    }
    const topic = topicQ.data.topic

    return (
        <div className="space-y-6">
            <TopicHeader topic={topic} />

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-text-disabled uppercase tracking-widest">
                        Concepts ({topic.concepts.length})
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
                        {adding ? 'Cancel' : '+ Add concept'}
                    </Button>
                </div>

                {adding && (
                    <NewConceptForm slug={slug} onDone={() => setAdding(false)} />
                )}

                <div className="space-y-2">
                    {topic.concepts.map((c) => (
                        <ConceptRow
                            key={c.id}
                            concept={c}
                            allConcepts={topic.concepts}
                            slug={slug}
                            isEditing={editingConceptId === c.id}
                            onEdit={() => setEditingConceptId(c.id === editingConceptId ? null : c.id)}
                        />
                    ))}
                </div>
            </section>
        </div>
    )
}

// ── Topic header (status + basic field edits) ────────────────────────

function TopicHeader({ topic }) {
    const updateTopic = useUpdateTopic(topic.slug)
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState({
        name: topic.name,
        description: topic.description,
        mockInterviewCategory: topic.mockInterviewCategory ?? '',
        estimatedHoursToMastery: topic.estimatedHoursToMastery ?? '',
    })

    async function flipStatus() {
        const next = NEXT_STATUS[topic.status]
        try {
            await updateTopic.mutateAsync({ status: next })
            toast.success(`Topic status: ${next}`)
        } catch (err) {
            toast.error(err?.response?.data?.error?.message || 'Update failed.')
        }
    }

    async function saveFields() {
        try {
            await updateTopic.mutateAsync({
                name: draft.name,
                description: draft.description,
                mockInterviewCategory: draft.mockInterviewCategory || null,
                estimatedHoursToMastery: draft.estimatedHoursToMastery
                    ? Number(draft.estimatedHoursToMastery) : null,
            })
            toast.success('Topic updated.')
            setEditing(false)
        } catch (err) {
            toast.error(err?.response?.data?.error?.message || 'Update failed.')
        }
    }

    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    {editing ? (
                        <input
                            className="w-full bg-surface-2 border border-border-default rounded-lg text-base font-bold text-text-primary px-2 py-1"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        />
                    ) : (
                        <h2 className="text-lg font-extrabold text-text-primary">{topic.name}</h2>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            STATUS_TONES[topic.status],
                        )}>{topic.status}</span>
                        <span className="text-[10px] text-text-disabled">{topic.category.replace(/_/g, ' ')}</span>
                        {topic.publishedAt && (
                            <span className="text-[10px] text-text-disabled">
                                published {new Date(topic.publishedAt).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    {editing ? (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                            <Button variant="primary" size="sm" loading={updateTopic.isPending} onClick={saveFields}>
                                Save
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit fields</Button>
                            <Button variant="primary" size="sm" loading={updateTopic.isPending} onClick={flipStatus}>
                                {NEXT_LABEL[topic.status]}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {editing ? (
                <div className="space-y-2 mt-3">
                    <Field label="Description">
                        <textarea
                            rows={3}
                            className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5 font-mono"
                            value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Mock Interview category (used by VALIDATE stage)">
                            <input
                                className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                                value={draft.mockInterviewCategory}
                                onChange={(e) => setDraft({ ...draft, mockInterviewCategory: e.target.value })}
                                placeholder="SYSTEM_DESIGN"
                            />
                        </Field>
                        <Field label="Estimated hours to mastery">
                            <input
                                type="number" min={1} max={1000}
                                className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                                value={draft.estimatedHoursToMastery}
                                onChange={(e) => setDraft({ ...draft, estimatedHoursToMastery: e.target.value })}
                            />
                        </Field>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-text-tertiary leading-relaxed mt-2">
                    {topic.description}
                </p>
            )}
        </div>
    )
}

// ── Concept row — collapsed view + expandable editor ─────────────────

function ConceptRow({ concept, allConcepts, slug, isEditing, onEdit }) {
    const updateConcept = useUpdateConcept(slug)
    const deleteConcept = useDeleteConcept(slug)
    const confirm = useConfirm()

    async function flipStatus() {
        const next = NEXT_STATUS[concept.status]
        try {
            await updateConcept.mutateAsync({ id: concept.id, status: next })
            toast.success(`Concept status: ${next}`)
        } catch (err) {
            toast.error(err?.response?.data?.error?.message || 'Update failed.')
        }
    }

    async function handleDelete() {
        const ok = await confirm({
            title: `Delete "${concept.name}"?`,
            description: 'This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true,
        })
        if (!ok) return
        try {
            await deleteConcept.mutateAsync(concept.id)
            toast.success('Concept deleted.')
        } catch (err) {
            toast.error(err?.response?.data?.error?.message || 'Delete failed.')
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-1 border border-border-default rounded-xl overflow-hidden"
        >
            <div className="flex items-center gap-3 p-3">
                <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-tertiary flex-shrink-0">
                    {concept.order}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text-primary">{concept.name}</p>
                    <p className="text-[10px] text-text-disabled font-mono">{concept.slug}</p>
                </div>
                <span className={cn(
                    'text-[9px] font-bold px-1.5 py-px rounded-full border',
                    STATUS_TONES[concept.status],
                )}>{concept.status}</span>
                <Button variant="ghost" size="xs" onClick={onEdit}>
                    {isEditing ? 'Close' : 'Edit'}
                </Button>
                <Button variant="ghost" size="xs" loading={updateConcept.isPending} onClick={flipStatus}>
                    {NEXT_LABEL[concept.status]}
                </Button>
            </div>

            <AnimatePresence initial={false}>
                {isEditing && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-border-subtle"
                    >
                        <ConceptEditor
                            concept={concept}
                            allConcepts={allConcepts}
                            slug={slug}
                            onDelete={handleDelete}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

// ── Concept editor — full content + prereqs ──────────────────────────

function ConceptEditor({ concept, allConcepts, slug, onDelete }) {
    const updateConcept = useUpdateConcept(slug)
    const addPrereq = useAddPrereq(slug)
    const removePrereq = useRemovePrereq(slug)

    const [draft, setDraft] = useState({
        name: concept.name,
        order: concept.order,
        primerMarkdown: concept.primerMarkdown,
        workedExample: concept.workedExample ?? '',
        canonicalSourcesText: JSON.stringify(concept.canonicalSources, null, 2),
        expectedQuestionsText: JSON.stringify(concept.expectedQuestions, null, 2),
    })

    async function save() {
        // Parse the JSON-edited fields with helpful error messages.
        let canonicalSources, expectedQuestions
        try {
            canonicalSources = JSON.parse(draft.canonicalSourcesText)
            if (!Array.isArray(canonicalSources)) throw new Error('must be an array')
        } catch (e) {
            toast.error(`canonicalSources JSON invalid: ${e.message}`)
            return
        }
        try {
            expectedQuestions = JSON.parse(draft.expectedQuestionsText)
            if (!Array.isArray(expectedQuestions)) throw new Error('must be an array')
        } catch (e) {
            toast.error(`expectedQuestions JSON invalid: ${e.message}`)
            return
        }

        try {
            await updateConcept.mutateAsync({
                id: concept.id,
                name: draft.name,
                order: Number(draft.order),
                primerMarkdown: draft.primerMarkdown,
                workedExample: draft.workedExample.trim() ? draft.workedExample : null,
                canonicalSources,
                expectedQuestions,
            })
            toast.success('Concept saved.')
        } catch (err) {
            toast.error(err?.response?.data?.error?.message || 'Save failed.')
        }
    }

    const otherConcepts = useMemo(
        () => allConcepts.filter((c) => c.id !== concept.id),
        [allConcepts, concept.id],
    )
    const prereqIds = new Set((concept.prerequisites ?? []).map((p) => p.prereqId))

    return (
        <div className="p-4 space-y-4 bg-surface-2/40">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                <Field label="Name">
                    <input
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-sm text-text-primary px-2 py-1.5"
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                </Field>
                <Field label="Order">
                    <input
                        type="number" min={0}
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-sm text-text-primary px-2 py-1.5"
                        value={draft.order}
                        onChange={(e) => setDraft({ ...draft, order: e.target.value })}
                    />
                </Field>
            </div>

            <Field label="Primer markdown (user-facing)">
                <textarea
                    rows={8}
                    className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-2 font-mono"
                    value={draft.primerMarkdown}
                    onChange={(e) => setDraft({ ...draft, primerMarkdown: e.target.value })}
                />
            </Field>

            <Field label="Worked example (optional)">
                <textarea
                    rows={5}
                    className="w-full bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-2 font-mono"
                    value={draft.workedExample}
                    onChange={(e) => setDraft({ ...draft, workedExample: e.target.value })}
                />
            </Field>

            <Field label='Canonical sources — JSON array of {title, url, type, author?}'>
                <textarea
                    rows={5}
                    className="w-full bg-surface-2 border border-border-default rounded-lg text-[11px] text-text-primary px-2 py-2 font-mono"
                    value={draft.canonicalSourcesText}
                    onChange={(e) => setDraft({ ...draft, canonicalSourcesText: e.target.value })}
                />
            </Field>

            <Field label="Expected questions — JSON array of strings (used by TEACH stage mock-students)">
                <textarea
                    rows={4}
                    className="w-full bg-surface-2 border border-border-default rounded-lg text-[11px] text-text-primary px-2 py-2 font-mono"
                    value={draft.expectedQuestionsText}
                    onChange={(e) => setDraft({ ...draft, expectedQuestionsText: e.target.value })}
                />
            </Field>

            <div>
                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                    Prerequisites
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {(concept.prerequisites ?? []).length === 0 && (
                        <span className="text-[11px] text-text-disabled italic">No prerequisites.</span>
                    )}
                    {(concept.prerequisites ?? []).map((p) => {
                        const target = allConcepts.find((c) => c.id === p.prereqId)
                        return (
                            <span key={p.id} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-3 border border-border-default">
                                {target?.name ?? p.prereqId}
                                <button
                                    type="button"
                                    className="text-text-disabled hover:text-danger-fg"
                                    onClick={() => removePrereq.mutate({ id: concept.id, depId: p.id })}
                                >×</button>
                            </span>
                        )
                    })}
                </div>
                <select
                    className="bg-surface-2 border border-border-default rounded-lg text-xs text-text-primary px-2 py-1.5"
                    defaultValue=""
                    onChange={(e) => {
                        const prereqId = e.target.value
                        if (!prereqId) return
                        addPrereq.mutate({ id: concept.id, prereqId }, {
                            onError: (err) =>
                                toast.error(err?.response?.data?.error?.message || 'Failed to add prereq.'),
                        })
                        e.target.value = ''
                    }}
                >
                    <option value="">+ Add prereq…</option>
                    {otherConcepts
                        .filter((c) => !prereqIds.has(c.id))
                        .map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger-fg">
                    Delete concept
                </Button>
                <Button variant="primary" size="sm" loading={updateConcept.isPending} onClick={save}>
                    Save changes
                </Button>
            </div>
        </div>
    )
}

// ── New concept form ────────────────────────────────────────────────

function NewConceptForm({ slug, onDone }) {
    const create = useCreateConcept(slug)
    const [name, setName] = useState('')
    const [conceptSlug, setConceptSlug] = useState('')

    async function submit() {
        if (!name.trim() || !conceptSlug.trim()) {
            toast.error('Name and slug are required.')
            return
        }
        try {
            await create.mutateAsync({
                name: name.trim(),
                slug: conceptSlug.trim(),
                primerMarkdown: '[Empty draft — author this before publishing]',
            })
            toast.success('Concept created (DRAFT).')
            onDone()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message || 'Create failed.')
        }
    }

    return (
        <div className="bg-brand-soft/30 border border-brand-line rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Field label="Name">
                    <input
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-sm text-text-primary px-2 py-1.5"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value)
                            // Auto-suggest slug from name on first character.
                            if (!conceptSlug) {
                                setConceptSlug(
                                    e.target.value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                                )
                            }
                        }}
                    />
                </Field>
                <Field label="Slug (kebab-case)">
                    <input
                        className="w-full bg-surface-2 border border-border-default rounded-lg text-sm text-text-primary px-2 py-1.5 font-mono"
                        value={conceptSlug}
                        onChange={(e) => setConceptSlug(e.target.value)}
                    />
                </Field>
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
                <Button variant="primary" size="sm" loading={create.isPending} onClick={submit}>
                    Create (DRAFT)
                </Button>
            </div>
        </div>
    )
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="block text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                {label}
            </span>
            {children}
        </label>
    )
}
