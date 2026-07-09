// ============================================================================
// TopicMetadataTab — edit topic-level metadata (W3.T9)
// ============================================================================
//
// Editable fields:
//   - name (single-line)
//   - description (short text; the CurriculumAdmin card body)
//   - category (select, mirrors the Prisma enum)
//   - estimatedHoursToMastery (int, optional)
//   - cheatsheetMarkdown → cheatsheetHtml (rich viewer output; sanitized
//     server-side before persist)
//
// Save-button semantics: disabled when no field has diverged from the
// original topic. We diff against `props.topic` (the seed) rather than
// tracking dirtiness on each onChange to keep the state model simple —
// invalidating the topic detail on save refetches, but if the user
// navigates away without saving we don't want a stray "unsaved" flag
// bleeding into other tabs.
// ============================================================================
import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { MarkdownEditor } from '@components/curriculum'
import { useUpdateTopic } from '@hooks/useCurriculumAdmin'
import {
    CURRICULUM_CATEGORIES as CATEGORIES,
    CATEGORIES_WITH_SUBCATEGORY,
    subCategoryHintFor,
} from '@utils/curriculumCategories'

export default function TopicMetadataTab({ topic }) {
    const [name, setName]                 = useState(topic.name ?? '')
    const [description, setDescription]   = useState(topic.description ?? '')
    const [category, setCategory]         = useState(topic.category ?? 'LOW_LEVEL_DESIGN')
    const [subCategory, setSubCategory]   = useState(topic.subCategory ?? '')
    const [hours, setHours]               = useState(
        topic.estimatedHoursToMastery == null ? '' : String(topic.estimatedHoursToMastery),
    )
    // We treat cheatsheet as HTML-in-DB. The MarkdownEditor emits raw
    // markdown text; the server will sanitize + persist it under
    // `cheatsheetHtml`. This is intentional — the schema field is HTML,
    // and the reviewer types markdown; the server bridge handles it.
    // We seed with the current HTML so the editor renders it in the
    // "code" pane; the reviewer edits it and the update PATCH will
    // re-sanitize.
    const [cheatsheet, setCheatsheet]     = useState(topic.cheatsheetHtml ?? '')

    const update = useUpdateTopic(topic.id)

    // Diff against the seed to compute the payload — a save without any
    // changed fields is a no-op we suppress at the button level.
    const changedFields = useMemo(() => {
        const changes = {}
        if (name !== (topic.name ?? '')) changes.name = name
        if (description !== (topic.description ?? '')) changes.description = description
        if (category !== (topic.category ?? '')) changes.category = category

        // subCategory: send only when the CURRENT category expects one AND
        // the trimmed value has diverged. Categories that don't expect a
        // subCategory (DSA, LLD, HLD, …) auto-clear the field on save so a
        // stale value from a previous category doesn't linger.
        const nextSubCategory = CATEGORIES_WITH_SUBCATEGORY.has(category)
            ? subCategory.trim() || null
            : null
        const prevSubCategory = topic.subCategory ?? null
        if (nextSubCategory !== prevSubCategory) {
            changes.subCategory = nextSubCategory
        }

        // hours is an int OR null OR undefined; empty string means "clear it".
        const nextHours = hours === '' ? null : Number(hours)
        const prevHours = topic.estimatedHoursToMastery ?? null
        if (nextHours !== prevHours && !Number.isNaN(nextHours)) {
            changes.estimatedHoursToMastery = nextHours
        }

        if (cheatsheet !== (topic.cheatsheetHtml ?? '')) {
            // null vs empty-string — send null when the reviewer cleared the
            // editor so the server can strip the column rather than storing
            // an empty HTML doc.
            changes.cheatsheetHtml = cheatsheet.trim() === '' ? null : cheatsheet
        }
        return changes
    }, [name, description, category, subCategory, hours, cheatsheet, topic])

    const isDirty = Object.keys(changedFields).length > 0

    const submit = (e) => {
        e.preventDefault()
        if (!isDirty) return
        // Fire-and-forget — useToastingMutation handles the success/error
        // toasts. Query invalidation refetches the topic detail so the
        // next render sees the persisted values.
        update.mutate(changedFields)
    }

    return (
        <form onSubmit={submit} className="space-y-6">
            <div className="rounded-2xl border border-border-default bg-surface-2 p-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Name
                        </label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>
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
                </div>

                {/* subCategory — only for grouped categories (languages,
                    frameworks, SQL/NoSQL). Free-text so we don't have to
                    ship a new enum every time a new language ships. */}
                {CATEGORIES_WITH_SUBCATEGORY.has(category) && (
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                            Sub-category
                        </label>
                        <Input
                            value={subCategory}
                            onChange={(e) => setSubCategory(e.target.value)}
                            placeholder={subCategoryHintFor(category)}
                        />
                        <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                            Free-text differentiator within {category.replace(/_/g, ' ').toLowerCase()}.
                            Leave blank if this Topic covers the discipline in general.
                        </p>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-border-default bg-surface-1
                                   px-3 py-2 text-sm text-text-primary focus:outline-none
                                   focus:ring-2 focus:ring-brand-500 resize-y"
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Estimated hours to mastery (optional)
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

            <div className="rounded-2xl border border-border-default bg-surface-2 p-5 space-y-3">
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-1">
                        Cheatsheet
                    </label>
                    <p className="text-xs text-text-tertiary mb-3">
                        A quick reference the learner sees at the top of the topic detail
                        page. Markdown supported. HTML is sanitized server-side before
                        persist.
                    </p>
                </div>
                <MarkdownEditor
                    value={cheatsheet}
                    onChange={setCheatsheet}
                    height={280}
                />
            </div>

            <div className="flex justify-end gap-2">
                <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={update.isPending}
                    disabled={!isDirty || update.isPending}
                >
                    <Save className="w-4 h-4" />
                    Save metadata
                </Button>
            </div>
        </form>
    )
}
