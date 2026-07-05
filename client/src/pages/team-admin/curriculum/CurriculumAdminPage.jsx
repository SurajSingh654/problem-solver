// ============================================================================
// CurriculumAdminPage — TEAM_ADMIN curriculum status board (W3.T8)
// ============================================================================
//
// Landing page for the TEAM_ADMIN curriculum authoring flow. Shows:
//   1. Status board (DRAFT / REVIEWED / PUBLISHED counts) — quick "how many
//      topics still need reviewer attention" scan.
//   2. Primary actions — "Fork from template" (default entry point) and
//      "New Topic (blank)" (secondary, for reviewers writing from scratch).
//   3. Topics table — every team-scoped Topic with slug / name / status /
//      concept count / last-updated. Each row links to the authoring page
//      (W3.T9) via /admin/curriculum/topics/:id.
//
// Server-side filter by req.teamId is authoritative — this page shows only
// the current team's topics regardless of what topic-ids the URL contains.
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { PlusCircle, LibraryBig, Loader2 } from 'lucide-react'
import { VerdictBadge } from '@components/curriculum'
import { Button } from '@components/ui/Button'
import { EmptyState } from '@components/ui/EmptyState'
import { Input } from '@components/ui/Input'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'
import {
    useCurriculumAdminTopics,
    useCreateBlankTopic,
} from '@hooks/useCurriculumAdmin'

// The four canonical Topic categories mirror the Prisma enum
// (schema.prisma: TopicCategory). Keep in sync if a new one lands — the
// server rejects unknown values as validation errors.
const CATEGORIES = [
    { value: 'LOW_LEVEL_DESIGN', label: 'Low-Level Design' },
    { value: 'HIGH_LEVEL_DESIGN', label: 'High-Level Design' },
    { value: 'AI_ENGINEERING', label: 'AI Engineering' },
    { value: 'DATA_STRUCTURES', label: 'Data Structures' },
]

const STATUS_BUCKETS = [
    { status: 'DRAFT',     label: 'Draft',     tone: 'gray'    },
    { status: 'REVIEWED',  label: 'Reviewed',  tone: 'warning' },
    { status: 'PUBLISHED', label: 'Published', tone: 'success' },
]

// ────────────────────────────────────────────────────────────────
// Status cards — 3 large "how many are in each bucket" tiles.
// ────────────────────────────────────────────────────────────────
function StatusBoard({ topics }) {
    const counts = useMemo(() => {
        const acc = { DRAFT: 0, REVIEWED: 0, PUBLISHED: 0 }
        for (const t of topics) {
            if (t.status in acc) acc[t.status] += 1
        }
        return acc
    }, [topics])

    return (
        <div className="grid gap-4 sm:grid-cols-3">
            {STATUS_BUCKETS.map((b) => (
                <div
                    key={b.status}
                    className="rounded-2xl border border-border-default bg-surface-2 p-5"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider text-text-tertiary">
                            {b.label}
                        </span>
                        <VerdictBadge verdict={b.status} />
                    </div>
                    <div className="mt-3 text-4xl font-extrabold font-mono text-text-primary">
                        {counts[b.status]}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// New-topic inline form — expands under the primary action.
// ────────────────────────────────────────────────────────────────
function NewTopicForm({ onCancel, onCreated }) {
    const [slug, setSlug] = useState('')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState(CATEGORIES[0].value)
    const [hours, setHours] = useState('')

    const create = useCreateBlankTopic()

    const submit = async (e) => {
        e.preventDefault()
        // Basic client-side presence guard — server does the authoritative
        // validation, but blocking here saves a round-trip on empty forms.
        if (!slug.trim() || !name.trim() || !description.trim()) return

        try {
            const data = await create.mutateAsync({
                slug: slug.trim(),
                name: name.trim(),
                description: description.trim(),
                category,
                estimatedHoursToMastery: hours ? Number(hours) : undefined,
            })
            onCreated?.(data?.topic)
        } catch {
            // useToastingMutation already toasted; keep the form open so
            // the reviewer can fix the input and retry.
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
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Slug
                    </label>
                    <Input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="oop-for-lld"
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
                        placeholder="OOP for LLD"
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Description
                </label>
                <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A short summary the learner sees on the topic tile."
                    required
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Category
                    </label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-lg border border-border-default bg-surface-1
                                   px-3 py-2 text-sm text-text-primary focus:outline-none
                                   focus:ring-2 focus:ring-brand-500"
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Estimated hours (optional)
                    </label>
                    <Input
                        type="number"
                        min={0}
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                        placeholder="8"
                    />
                </div>
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
                    Create draft
                </Button>
            </div>
        </motion.form>
    )
}

// ────────────────────────────────────────────────────────────────
// Topics table — clickable rows to the authoring page.
// ────────────────────────────────────────────────────────────────
function TopicsTable({ topics, onRowClick }) {
    return (
        <div className="rounded-2xl border border-border-default overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-surface-2 text-text-tertiary">
                    <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">Slug</th>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Concepts</th>
                        <th className="px-4 py-3 font-semibold">Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {topics.map((t) => (
                        <tr
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onRowClick(t)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onRowClick(t)
                                }
                            }}
                            className={cn(
                                'border-t border-border-default cursor-pointer',
                                'hover:bg-surface-2 focus:outline-none focus:bg-surface-2',
                            )}
                        >
                            <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                                {t.slug}
                            </td>
                            <td className="px-4 py-3 font-semibold text-text-primary">
                                {t.name}
                            </td>
                            <td className="px-4 py-3">
                                <VerdictBadge verdict={t.status} />
                            </td>
                            <td className="px-4 py-3 tabular-nums text-text-secondary">
                                {t._count?.concepts ?? 0}
                            </td>
                            <td className="px-4 py-3 text-text-tertiary">
                                {formatShortDate(t.updatedAt)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────
export default function CurriculumAdminPage() {
    const navigate = useNavigate()
    const [showNewForm, setShowNewForm] = useState(false)

    const { data: topics, isLoading, isError, error } = useCurriculumAdminTopics()

    // Loading state — full-page spinner. Curriculum admin is small enough
    // that a page-level spinner is fine; splitting to per-section skeletons
    // is overkill for a "usually < 30 topics" table.
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner size="lg" />
            </div>
        )
    }

    if (isError) {
        return (
            <div className="p-8">
                <p className="text-sm text-danger-fg">
                    Failed to load topics: {error?.message ?? 'unknown error'}
                </p>
            </div>
        )
    }

    const rows = topics ?? []

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
            {/* Header ─────────────────────────────────────────────── */}
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                        Curriculum Admin
                    </h1>
                    <p className="text-sm text-text-tertiary mt-1">
                        Your team's Topics. Fork a template to start, or write a Topic from scratch.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="md"
                        onClick={() => navigate('/admin/curriculum/templates')}
                    >
                        <LibraryBig className="w-4 h-4" />
                        Browse templates
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={() => setShowNewForm((v) => !v)}
                    >
                        <PlusCircle className="w-4 h-4" />
                        New topic
                    </Button>
                </div>
            </header>

            {/* New-topic form (expandable) ─────────────────────────── */}
            <AnimatePresence>
                {showNewForm && (
                    <NewTopicForm
                        onCancel={() => setShowNewForm(false)}
                        onCreated={(topic) => {
                            setShowNewForm(false)
                            if (topic?.id) {
                                navigate(`/admin/curriculum/topics/${topic.id}`)
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Status board ────────────────────────────────────────── */}
            <StatusBoard topics={rows} />

            {/* Topics table or empty state ─────────────────────────── */}
            {rows.length === 0 ? (
                <EmptyState
                    icon={<Loader2 className="w-6 h-6 text-brand-500" />}
                    title="No topics yet"
                    description="Fork from a template to get started, or write a topic from scratch."
                    actionLabel="Browse templates"
                    onAction={() => navigate('/admin/curriculum/templates')}
                />
            ) : (
                <TopicsTable
                    topics={rows}
                    onRowClick={(t) => navigate(`/admin/curriculum/topics/${t.id}`)}
                />
            )}
        </div>
    )
}
