// ============================================================================
// TemplateBrowserPage — TEAM_ADMIN template library + fork flow (W3.T8)
// ============================================================================
//
// The reviewer's entry point to the global TopicTemplate library. Each card
// exposes a "Fork into my team" action that:
//   1. Confirms via <ConfirmModal> (destructive-looking but safe — creates
//      an editable COPY, doesn't mutate the template).
//   2. Calls the fork mutation, which the hook navigates to the new topic's
//      authoring page on success.
//   3. Handles 409 DUPLICATE_SLUG inline on the card ("Already forked — go
//      to My Topics") — the useToastingMutation error toast is a redundant
//      safety net but the inline state is the primary UX.
//
// Only PUBLISHED templates are shown; the server filters them, but see the
// controller comment for the rationale.
// ============================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, GitFork, Clock, BookOpen } from 'lucide-react'
import { Button } from '@components/ui/Button'
import { EmptyState } from '@components/ui/EmptyState'
import { Spinner } from '@components/ui/Spinner'
import { useConfirm } from '@hooks/useConfirm'
import { extractErrorCode } from '@services/api'
import {
    useCurriculumTemplates,
    useForkTemplate,
} from '@hooks/useCurriculumAdmin'

// Category → display label. Kept inline (not imported) because the pair
// exists in `CurriculumAdminPage.jsx` too and is a 4-entry map — the
// duplication is cheap and lets each page tune the labels if needed.
const CATEGORY_LABEL = {
    LOW_LEVEL_DESIGN: 'Low-Level Design',
    HIGH_LEVEL_DESIGN: 'High-Level Design',
    AI_ENGINEERING: 'AI Engineering',
    DATA_STRUCTURES: 'Data Structures',
}

// Strip markdown syntax down to a readable card teaser. The card has
// line-clamp-3 so we mostly need to kill the visible syntax noise
// (headings, bold markers, code backticks, bullet markers). Full
// markdown rendering would defeat line-clamp and add height thrash.
function plainSummary(md, maxLen = 220) {
    if (!md) return ''
    let s = String(md)
    // Drop fenced code blocks entirely
    s = s.replace(/```[\s\S]*?```/g, ' ')
    // Drop headings including the leading '#'
    s = s.replace(/^#{1,6}\s+.*$/gm, '')
    // Bold + italic markers
    s = s.replace(/\*\*(.+?)\*\*/g, '$1')
    s = s.replace(/\*(.+?)\*/g, '$1')
    s = s.replace(/__(.+?)__/g, '$1')
    s = s.replace(/_(.+?)_/g, '$1')
    // Inline code backticks
    s = s.replace(/`([^`]+)`/g, '$1')
    // Bullet + numbered list markers at start of line
    s = s.replace(/^[\s]*[-*+]\s+/gm, '')
    s = s.replace(/^[\s]*\d+\.\s+/gm, '')
    // Blockquote markers
    s = s.replace(/^>\s?/gm, '')
    // Link syntax: keep the label, drop the target
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim()
    if (s.length <= maxLen) return s
    return s.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}

// ────────────────────────────────────────────────────────────────
// Single template card
// ────────────────────────────────────────────────────────────────
function TemplateCard({ template, onFork, disabled, alreadyForked }) {
    return (
        <div className="rounded-2xl border border-border-default bg-surface-2 p-5 flex flex-col gap-4">
            <div>
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-text-primary">
                        {template.name}
                    </h3>
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">
                        {CATEGORY_LABEL[template.category] ?? template.category}
                    </span>
                </div>
                <p className="text-xs font-mono text-text-tertiary mt-0.5">
                    {template.slug}
                </p>
            </div>

            <p className="text-sm text-text-secondary line-clamp-3 flex-1">
                {plainSummary(template.description)}
            </p>

            <div className="flex items-center gap-4 text-xs text-text-tertiary">
                <span className="inline-flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {template._count?.concepts ?? 0} concept
                    {(template._count?.concepts ?? 0) === 1 ? '' : 's'}
                </span>
                {template.estimatedHoursToMastery != null && (
                    <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {template.estimatedHoursToMastery} hr
                    </span>
                )}
            </div>

            {alreadyForked ? (
                <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-fg">
                    Already forked — see it under{' '}
                    <a href="/admin/curriculum" className="underline font-semibold">
                        Curriculum Admin
                    </a>
                    .{' '}
                    <a href="/docs/how-to/task/fork-template" className="underline">
                        Why? →
                    </a>
                </div>
            ) : (
                <Button
                    variant="primary"
                    size="md"
                    onClick={() => onFork(template)}
                    disabled={disabled}
                    fullWidth
                >
                    <GitFork className="w-4 h-4" />
                    Fork into my team
                </Button>
            )}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────
export default function TemplateBrowserPage() {
    const navigate = useNavigate()
    const confirm = useConfirm()

    const { data: templates, isLoading, isError, error } = useCurriculumTemplates()
    const fork = useForkTemplate()

    // Track which template slug (if any) hit a 409 DUPLICATE_SLUG so we can
    // render the inline "Already forked" chip without a fresh network call.
    // Multiple templates can be attempted in one session — use a Set.
    const [alreadyForked, setAlreadyForked] = useState(() => new Set())

    const handleFork = async (template) => {
        const ok = await confirm({
            title: 'Fork template?',
            description: `This creates an editable copy of "${template.name}" in your team. You can customize it before publishing.`,
            confirmLabel: 'Fork',
            cancelLabel: 'Cancel',
            danger: false,
        })
        if (!ok) return
        try {
            await fork.mutateAsync(template.slug)
            // Success path: hook navigates to the authoring page — no further
            // state needed here. This page unmounts.
        } catch (err) {
            if (extractErrorCode(err) === 'DUPLICATE_SLUG') {
                setAlreadyForked((prev) => new Set(prev).add(template.slug))
            }
            // Other errors already surfaced via useToastingMutation's toast.
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Spinner size="lg" />
            </div>
        )
    }

    if (isError) {
        const msg =
            error?.response?.data?.error?.message ??
            error?.message ??
            'unknown error'
        return (
            <div className="p-8">
                <p className="text-sm text-danger-fg">Failed to load templates: {msg}</p>
            </div>
        )
    }

    const rows = templates ?? []

    return (
        <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
            {/* Header ─────────────────────────────────────────────── */}
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/admin/curriculum')}
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </Button>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                        Curriculum Templates
                    </h1>
                    <p className="text-sm text-text-tertiary mt-1">
                        Fork a template into your team. Each fork creates an editable copy.
                    </p>
                </div>
            </header>

            {rows.length === 0 ? (
                <EmptyState
                    icon="📚"
                    title="No templates available"
                    description="Ask your SUPER_ADMIN to publish curriculum templates before you can fork them."
                />
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((t) => (
                        <TemplateCard
                            key={t.id}
                            template={t}
                            onFork={handleFork}
                            disabled={fork.isPending}
                            alreadyForked={alreadyForked.has(t.slug)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
