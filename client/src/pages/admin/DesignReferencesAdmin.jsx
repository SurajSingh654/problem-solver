// ============================================================================
// Design References Admin
// ============================================================================
// Super-admin / team-admin surface for curating DesignReference content.
// Supports manual form entry AND a JSON-paste path for bulk import of
// seed files (server/prisma/seeds/design-references/*.json).
//
// The form is intentionally spartan — most fields map 1:1 to DB columns.
// Phases / tradeoffs / sources are JSON textareas because a full visual
// editor per field is out of scope for v1.
// ============================================================================
import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import api from '@services/api'
import {
    useCreateDesignReference,
    useUpdateDesignReference,
    useDeleteDesignReference,
} from '@hooks/useDesignReferences'
import { toast } from '@store/useUIStore'

const DESIGN_TYPES = ['SYSTEM_DESIGN', 'LOW_LEVEL_DESIGN']
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD']

function parseJSON(s, fallback) {
    if (!s || !s.trim()) return fallback
    try {
        return JSON.parse(s)
    } catch {
        throw new Error('Invalid JSON')
    }
}

// ── Fetch the admin's visible problems for the problemId picker ──────
function useAdminProblems() {
    return useQuery({
        queryKey: ['admin', 'problems', 'all'],
        queryFn: async () => {
            // Reuses the existing problems listing. Returns a simple array.
            const res = await api.get('/problems', { params: { limit: 200 } })
            return res.data.data.problems || []
        },
        staleTime: 1000 * 60,
    })
}

// ── Fetch all references across ALL of the admin's problems ──────────
// The public list endpoint is per-problem; for the admin table we fan
// out over every visible problem. Small N in practice (hundreds).
function useAllReferences(problems) {
    return useQuery({
        queryKey: ['admin', 'design-references', 'all', (problems || []).map((p) => p.id).sort()],
        enabled: Array.isArray(problems) && problems.length > 0,
        queryFn: async () => {
            const settled = await Promise.all(
                problems.map((p) =>
                    api.get('/design-references', { params: { problemId: p.id } })
                        .then((r) => r.data.data.references || [])
                        .catch(() => []),
                ),
            )
            const byId = {}
            const flat = []
            for (const refs of settled) {
                for (const r of refs) {
                    if (byId[r.id]) continue
                    byId[r.id] = true
                    flat.push(r)
                }
            }
            flat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            return flat
        },
    })
}

export default function DesignReferencesAdmin() {
    const { data: problems = [], isLoading: problemsLoading } = useAdminProblems()
    const { data: refs = [], isLoading: refsLoading, refetch } = useAllReferences(problems)

    const problemTitleById = useMemo(() => {
        const m = {}
        for (const p of problems) m[p.id] = p.title
        return m
    }, [problems])

    const [editing, setEditing] = useState(null) // null | { id: string | null, initial: object }

    return (
        <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
                    Design References
                </h1>
                <p className="text-sm text-text-secondary mt-1 max-w-3xl">
                    Curated worked-example architectures for design problems. Learners see
                    these only AFTER they&apos;ve attempted the problem (≥ 4 phases filled
                    or reached validation). Sweller&apos;s worked-example principle — exemplars
                    help after retrieval, not before.
                </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-text-tertiary">
                    {refs.length} reference{refs.length === 1 ? '' : 's'} across{' '}
                    {problems.length} problem{problems.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setEditing({ id: null, initial: blankReference() })}
                    >
                        + New Reference
                    </Button>
                </div>
            </div>

            {(problemsLoading || refsLoading) ? (
                <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
            ) : refs.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                    <span className="text-4xl mb-3 block">🧭</span>
                    <p className="text-sm font-semibold text-text-primary mb-1">No references yet</p>
                    <p className="text-xs text-text-tertiary max-w-md mx-auto">
                        Click &ldquo;New Reference&rdquo; to author your first curated architecture,
                        or paste a seed JSON file (see <code className="text-text-secondary">server/prisma/seeds/design-references/</code>).
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {refs.map((r, i) => (
                        <motion.div
                            key={r.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="bg-surface-1 border border-border-default rounded-xl p-4 flex items-start gap-3"
                        >
                            <span className="text-lg flex-shrink-0 mt-0.5">
                                {r.designType === 'SYSTEM_DESIGN' ? '🏗️' : '🔧'}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <p className="text-sm font-bold text-text-primary truncate">
                                        {r.title}
                                    </p>
                                    <span className="text-[10px] font-bold text-text-tertiary bg-surface-3 border border-border-default rounded-full px-2 py-px">
                                        {r.variant}
                                    </span>
                                    <span className="text-[10px] text-text-disabled">
                                        {r.difficulty}
                                    </span>
                                    <span className="text-[10px] text-text-disabled">
                                        v{r.version}
                                    </span>
                                </div>
                                <p className="text-[11px] text-text-tertiary line-clamp-2 mb-1">
                                    {r.summary}
                                </p>
                                <p className="text-[10px] text-text-disabled">
                                    Problem:{' '}
                                    {problemTitleById[r.problemId] || <span className="italic">(unknown — not in your visible problems)</span>}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await api.get(`/design-references/${r.id}`)
                                            setEditing({ id: r.id, initial: res.data.data.reference })
                                        } catch {
                                            toast.error('Failed to load reference.')
                                        }
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 rounded-md border bg-surface-3 text-text-tertiary border-border-default hover:border-brand-line transition-colors"
                                >
                                    Edit
                                </button>
                                <DeleteButton id={r.id} onDeleted={() => refetch()} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {editing && (
                <ReferenceFormModal
                    initial={editing.initial}
                    existingId={editing.id}
                    problems={problems}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null)
                        refetch()
                    }}
                />
            )}
        </div>
    )
}

function DeleteButton({ id, onDeleted }) {
    const del = useDeleteDesignReference()
    return (
        <button
            onClick={() => {
                if (!window.confirm('Delete this reference? Cannot be undone.')) return
                del.mutate(id, { onSuccess: onDeleted })
            }}
            disabled={del.isPending}
            className="text-[10px] font-bold px-2 py-1 rounded-md border bg-danger-soft text-danger-fg border-danger-line hover:bg-danger-soft transition-colors disabled:opacity-50"
        >
            Delete
        </button>
    )
}

function blankReference() {
    return {
        problemId: '',
        designType: 'SYSTEM_DESIGN',
        difficulty: 'MEDIUM',
        variant: '',
        title: '',
        summary: '',
        phases: {},
        diagramData: null,
        componentAnnotations: null,
        dataFlowDescription: '',
        tradeoffs: [],
        sources: [],
    }
}

function ReferenceFormModal({ initial, existingId, problems, onClose, onSaved }) {
    const create = useCreateDesignReference()
    const update = useUpdateDesignReference()

    const [form, setForm] = useState(() => ({
        problemId: initial.problemId || '',
        designType: initial.designType || 'SYSTEM_DESIGN',
        difficulty: initial.difficulty || 'MEDIUM',
        variant: initial.variant || '',
        title: initial.title || '',
        summary: initial.summary || '',
        phases: JSON.stringify(initial.phases || {}, null, 2),
        dataFlowDescription: initial.dataFlowDescription || '',
        componentAnnotations: JSON.stringify(initial.componentAnnotations || null, null, 2),
        tradeoffs: JSON.stringify(initial.tradeoffs || [], null, 2),
        sources: JSON.stringify(initial.sources || [], null, 2),
    }))

    const [importText, setImportText] = useState('')

    function update$(field, value) {
        setForm((f) => ({ ...f, [field]: value }))
    }

    function handleImport() {
        try {
            const parsed = JSON.parse(importText)
            setForm({
                problemId: parsed.problemId || form.problemId,
                designType: parsed.designType || 'SYSTEM_DESIGN',
                difficulty: parsed.difficulty || 'MEDIUM',
                variant: parsed.variant || '',
                title: parsed.title || '',
                summary: parsed.summary || '',
                phases: JSON.stringify(parsed.phases || {}, null, 2),
                dataFlowDescription: parsed.dataFlowDescription || '',
                componentAnnotations: JSON.stringify(parsed.componentAnnotations || null, null, 2),
                tradeoffs: JSON.stringify(parsed.tradeoffs || [], null, 2),
                sources: JSON.stringify(parsed.sources || [], null, 2),
            })
            setImportText('')
            toast.success('JSON imported into form — review and save.')
        } catch {
            toast.error('Invalid JSON.')
        }
    }

    async function handleSave() {
        let payload
        try {
            payload = {
                problemId: form.problemId,
                designType: form.designType,
                difficulty: form.difficulty,
                variant: form.variant.trim(),
                title: form.title.trim(),
                summary: form.summary.trim(),
                phases: parseJSON(form.phases, {}),
                dataFlowDescription: form.dataFlowDescription,
                componentAnnotations: parseJSON(form.componentAnnotations, null),
                tradeoffs: parseJSON(form.tradeoffs, []),
                sources: parseJSON(form.sources, []),
            }
        } catch {
            toast.error('One of the JSON fields is invalid — check phases / annotations / tradeoffs / sources.')
            return
        }
        if (!payload.problemId || !payload.variant || !payload.title || !payload.summary) {
            toast.error('problemId, variant, title, summary are required.')
            return
        }
        try {
            if (existingId) {
                await update.mutateAsync({ id: existingId, data: payload })
            } else {
                await create.mutateAsync(payload)
            }
            onSaved()
        } catch {
            // mutation hook already toasted
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4">
            <div className="bg-surface-1 border border-border-default rounded-2xl w-full max-w-3xl my-8 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
                    <h2 className="text-base font-bold text-text-primary">
                        {existingId ? 'Edit Reference' : 'New Reference'}
                    </h2>
                    <button onClick={onClose} className="text-text-disabled hover:text-text-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
                <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                    {!existingId && (
                        <section className="bg-surface-2 border border-border-subtle rounded-xl p-3 space-y-2">
                            <p className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                                Quick import (paste JSON)
                            </p>
                            <textarea
                                rows={4}
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder='Paste a seed JSON blob (from server/prisma/seeds/design-references/*.json) — fields pre-fill the form.'
                                className="w-full bg-surface-3 border border-border-default rounded-lg text-[11px] font-mono text-text-primary px-2.5 py-2 outline-none focus:border-brand-line"
                            />
                            <Button variant="secondary" size="sm" onClick={handleImport} disabled={!importText.trim()}>
                                Import into form
                            </Button>
                        </section>
                    )}

                    <Field label="Problem">
                        <select
                            value={form.problemId}
                            onChange={(e) => update$('problemId', e.target.value)}
                            className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400"
                        >
                            <option value="">— pick a problem —</option>
                            {problems.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.title} ({p.category})
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Design Type">
                            <select value={form.designType} onChange={(e) => update$('designType', e.target.value)}
                                className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400">
                                {DESIGN_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                            </select>
                        </Field>
                        <Field label="Difficulty">
                            <select value={form.difficulty} onChange={(e) => update$('difficulty', e.target.value)}
                                className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400">
                                {DIFFICULTIES.map((d) => (<option key={d} value={d}>{d}</option>))}
                            </select>
                        </Field>
                        <Field label="Variant (slug)">
                            <input value={form.variant} onChange={(e) => update$('variant', e.target.value)}
                                placeholder="sharded-kv" disabled={!!existingId}
                                className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400 disabled:opacity-60" />
                        </Field>
                    </div>

                    <Field label="Title">
                        <input value={form.title} onChange={(e) => update$('title', e.target.value)}
                            placeholder="Single-region Sharded KV"
                            className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400" />
                    </Field>

                    <Field label="Summary (1-3 sentences)">
                        <textarea rows={3} value={form.summary} onChange={(e) => update$('summary', e.target.value)}
                            className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400 resize-y" />
                    </Field>

                    <Field label="Phases (JSON object, keys = phaseId)">
                        <JSONTextarea rows={10} value={form.phases} onChange={(v) => update$('phases', v)} />
                    </Field>

                    <Field label="Data Flow Description">
                        <textarea rows={4} value={form.dataFlowDescription} onChange={(e) => update$('dataFlowDescription', e.target.value)}
                            className="w-full bg-surface-3 border border-border-strong rounded-lg text-sm text-text-primary px-3 py-2 outline-none focus:border-brand-400 resize-y" />
                    </Field>

                    <Field label="Component Annotations (JSON array or null)">
                        <JSONTextarea rows={6} value={form.componentAnnotations} onChange={(v) => update$('componentAnnotations', v)} />
                    </Field>

                    <Field label="Tradeoffs (JSON array of {choice, alternative, reason})">
                        <JSONTextarea rows={8} value={form.tradeoffs} onChange={(v) => update$('tradeoffs', v)} />
                    </Field>

                    <Field label="Sources (JSON array of {label, url})">
                        <JSONTextarea rows={6} value={form.sources} onChange={(v) => update$('sources', v)} />
                    </Field>
                </div>
                <div className="px-5 py-3 border-t border-border-default bg-surface-2/40 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={handleSave}
                        loading={create.isPending || update.isPending}>
                        {existingId ? 'Save changes' : 'Create reference'}
                    </Button>
                </div>
            </div>
        </div>
    )
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="block text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                {label}
            </span>
            {children}
        </label>
    )
}

function JSONTextarea({ rows, value, onChange }) {
    let invalid = false
    if (value && value.trim()) {
        try { JSON.parse(value) } catch { invalid = true }
    }
    return (
        <div className="space-y-1">
            <textarea
                rows={rows}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    'w-full bg-surface-3 border rounded-lg text-[11px] font-mono text-text-primary px-2.5 py-2 outline-none resize-y',
                    invalid ? 'border-danger-line focus:border-danger-line' : 'border-border-strong focus:border-brand-400',
                )}
            />
            {invalid && (
                <p className="text-[10px] text-danger-fg">Invalid JSON</p>
            )}
        </div>
    )
}
