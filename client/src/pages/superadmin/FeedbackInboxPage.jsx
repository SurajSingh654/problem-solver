// ============================================================================
// ProbSolver v3.0 — Feedback Inbox (Super Admin) with Export
// ============================================================================
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useFeedbackList, useUpdateFeedbackStatus } from '@hooks/useFeedback'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { formatRelativeDate } from '@utils/formatters'
import FeedbackExportBar from '@components/features/feedback/FeedbackExportBar'

const SUGGESTED_NOTES = {
    OPEN: [
        "Reopening — the issue persists after the previous fix.",
        "Reopening for further investigation.",
    ],
    ACKNOWLEDGED: [
        "Thanks for reporting — we've confirmed this issue and added it to our backlog.",
        "This bug is acknowledged, thanks for reporting. We'll prioritize it shortly.",
        "We've seen this and are investigating. Will update you once we have a fix timeline.",
    ],
    IN_PROGRESS: [
        "We're actively working on this. Expect a fix in the next deployment.",
        "Currently being implemented — will update when it's live.",
        "This is in development now. Thanks for your patience.",
    ],
    RESOLVED: [
        "Fixed and deployed. Please verify on your end and let us know if it recurs.",
        "This has been resolved in the latest release. Thanks for reporting!",
        "Implemented as suggested — the feature is now live. Thank you for the feedback!",
    ],
    WONT_FIX: [
        "After review, this is working as intended. Here's why: ",
        "We've decided not to implement this at this time due to scope/priority constraints.",
        "This conflicts with an existing design decision. Feel free to discuss further if needed.",
    ],
}

const STATUS_OPTIONS = [
    { id: 'OPEN', label: 'Open', color: 'text-info bg-info/10 border-info/20' },
    { id: 'ACKNOWLEDGED', label: 'Acknowledged', color: 'text-warning bg-warning/10 border-warning/20' },
    { id: 'IN_PROGRESS', label: 'In Progress', color: 'text-brand-300 bg-brand-400/10 border-brand-400/20' },
    { id: 'RESOLVED', label: 'Resolved', color: 'text-success bg-success/10 border-success/20' },
    { id: 'WONT_FIX', label: "Won't Fix", color: 'text-text-disabled bg-surface-3 border-border-default' },
]

const TYPE_CONFIG = {
    BUG: { icon: '🐛', label: 'Bug', color: 'text-danger' },
    SUGGESTION: { icon: '💡', label: 'Suggestion', color: 'text-warning' },
    QUESTION: { icon: '❓', label: 'Question', color: 'text-info' },
}

const SEVERITY_CONFIG = {
    CRITICAL: { label: 'Critical', color: 'text-danger', dot: 'bg-danger' },
    HIGH: { label: 'High', color: 'text-orange-400', dot: 'bg-orange-400' },
    MEDIUM: { label: 'Medium', color: 'text-warning', dot: 'bg-warning' },
    LOW: { label: 'Low', color: 'text-success', dot: 'bg-success' },
}

// ── Summary stats bar ──────────────────────────────────────────
function SummaryBar({ summary }) {
    if (!summary) return null
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
                { label: 'Open', value: summary.open, color: 'text-info', bg: 'bg-info/5 border-info/20' },
                { label: 'Acknowledged', value: summary.acknowledged, color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
                { label: 'In Progress', value: summary.inProgress, color: 'text-brand-300', bg: 'bg-brand-400/5 border-brand-400/20' },
                { label: 'Critical', value: summary.critical, color: 'text-danger', bg: 'bg-danger/5 border-danger/20' },
            ].map(s => (
                <div key={s.label}
                    className={cn('border rounded-xl px-4 py-3 text-center', s.bg)}
                >
                    <div className={cn('text-2xl font-extrabold font-mono', s.color)}>
                        {s.value}
                    </div>
                    <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                        {s.label}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Report card with inline status update + checkbox ───────────
function ReportCard({ report, isSelected, onToggleSelect }) {
    const updateStatus = useUpdateFeedbackStatus()
    const [expanded, setExpanded] = useState(false)
    const [editingStatus, setEditingStatus] = useState(false)
    const [newStatus, setNewStatus] = useState(report.status)
    const [adminNote, setAdminNote] = useState(report.adminNote || '')

    const type = TYPE_CONFIG[report.type] || TYPE_CONFIG.BUG
    const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.MEDIUM
    const statusConfig = STATUS_OPTIONS.find(s => s.id === report.status) || STATUS_OPTIONS[0]

    async function handleStatusUpdate() {
        await updateStatus.mutateAsync({
            feedbackId: report.id,
            data: { status: newStatus, adminNote: adminNote || null },
        })
        setEditingStatus(false)
    }

    return (
        <motion.div
            layout
            className={cn(
                'border rounded-xl overflow-hidden transition-all',
                isSelected
                    ? 'border-brand-400/40 bg-brand-400/5'
                    : report.severity === 'CRITICAL'
                        ? 'border-danger/30 bg-danger/3'
                        : report.severity === 'HIGH'
                            ? 'border-orange-400/20 bg-surface-1'
                            : 'border-border-default bg-surface-1'
            )}
        >
            {/* Card header */}
            <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-surface-2/50 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                {/* Checkbox */}
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation()
                        onToggleSelect(report.id)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-border-strong text-brand-400
                               focus:ring-brand-400/30 focus:ring-2 cursor-pointer
                               bg-surface-3 accent-brand-400 mt-0.5 flex-shrink-0"
                    aria-label={`Select report: ${report.title}`}
                />
                <span className="text-xl flex-shrink-0 mt-0.5">{type.icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold text-text-primary">
                            {report.title}
                        </p>
                        {report.severity === 'CRITICAL' && (
                            <span className="text-[9px] font-bold text-danger bg-danger/10 border border-danger/20 px-1.5 py-px rounded-full flex-shrink-0">
                                CRITICAL
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className={cn('text-[11px] font-semibold', type.color)}>
                            {type.label}
                        </span>
                        <div className="flex items-center gap-1">
                            <div className={cn('w-1.5 h-1.5 rounded-full', severity.dot)} />
                            <span className={cn('text-[11px] font-semibold', severity.color)}>
                                {severity.label}
                            </span>
                        </div>
                        <span className="text-[11px] text-text-disabled">
                            {report.user?.name} · {formatRelativeDate(report.createdAt)}
                        </span>
                        {report.team && (
                            <span className="text-[11px] text-text-disabled">
                                Team: {report.team.name}
                            </span>
                        )}
                        {report.affectedArea && (
                            <span className="text-[10px] bg-surface-3 border border-border-subtle rounded-full px-2 py-px text-text-disabled">
                                {report.affectedArea}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn(
                        'text-[10px] font-bold px-2 py-px rounded-full border',
                        statusConfig.color
                    )}>
                        {statusConfig.label}
                    </span>
                    <motion.div
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-text-disabled"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </motion.div>
                </div>
            </div>

            {/* Expanded content */}
            {expanded && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-t border-border-default"
                >
                    <div className="p-4 space-y-4">
                        <div>
                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                                Description
                            </p>
                            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                                {report.description}
                            </p>
                        </div>
                        {report.stepsToReproduce && (
                            <div>
                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                                    Steps to Reproduce
                                </p>
                                <div
                                    className="text-xs text-text-secondary bg-surface-0 border border-border-default
                       rounded-lg p-3 leading-relaxed prose-content"
                                    dangerouslySetInnerHTML={{ __html: report.stepsToReproduce }}
                                />
                            </div>
                        )}
                        <div className="pt-3 border-t border-border-subtle">
                            {!editingStatus ? (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {report.adminNote && (
                                            <div>
                                                <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-1">
                                                    Your Note
                                                </p>
                                                <p className="text-xs text-text-secondary">
                                                    {report.adminNote}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); setEditingStatus(true) }}
                                    >
                                        Update Status
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                    <div>
                                        <p className="text-xs font-semibold text-text-primary mb-2">
                                            New Status
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {STATUS_OPTIONS.map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setNewStatus(s.id)}
                                                    className={cn(
                                                        'text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all',
                                                        newStatus === s.id
                                                            ? s.color
                                                            : 'text-text-disabled bg-surface-3 border-border-default hover:border-border-strong'
                                                    )}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Admin note with suggestions */}
                                    <div>
                                        <label className="block text-xs font-semibold text-text-primary mb-1.5">
                                            Note for member
                                            <span className="ml-1.5 text-[10px] font-normal text-text-disabled">
                                                optional — visible to the submitter
                                            </span>
                                        </label>
                                        {/* Suggested notes — clickable chips */}
                                        {SUGGESTED_NOTES[newStatus]?.length > 0 && (
                                            <div className="mb-2">
                                                <p className="text-[10px] text-text-disabled mb-1.5">Quick suggestions:</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {SUGGESTED_NOTES[newStatus].map((note, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setAdminNote(note)}
                                                            className="text-[10px] text-text-tertiary bg-surface-3 border border-border-subtle
                                   rounded-lg px-2.5 py-1.5 text-left hover:border-brand-400/30
                                   hover:text-text-secondary transition-colors leading-tight max-w-[280px]"
                                                        >
                                                            {note}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <textarea
                                            rows={3}
                                            value={adminNote}
                                            onChange={e => setAdminNote(e.target.value)}
                                            placeholder="e.g. This will be fixed in the next deployment. Thanks for reporting!"
                                            className="w-full bg-surface-3 border border-border-strong rounded-xl
                   text-sm text-text-primary placeholder:text-text-disabled
                   px-3 py-2 outline-none resize-none
                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            loading={updateStatus.isPending}
                                            onClick={handleStatusUpdate}
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingStatus(false)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function FeedbackInboxPage() {
    const [statusFilter, setStatusFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [selectedIds, setSelectedIds] = useState(new Set())

    const { data, isLoading } = useFeedbackList({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
    })

    const reports = data?.reports || []
    const summary = data?.summary
    const total = data?.pagination?.total || reports.length

    // ── Selection handlers ──────────────────────────────
    function toggleSelect(id) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function toggleSelectAll() {
        if (reports.length === 0) return
        const allOnPageSelected = reports.every(r => selectedIds.has(r.id))
        if (allOnPageSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev)
                reports.forEach(r => next.delete(r.id))
                return next
            })
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev)
                reports.forEach(r => next.add(r.id))
                return next
            })
        }
    }

    function clearSelection() {
        setSelectedIds(new Set())
    }

    const allOnPageSelected = reports.length > 0 && reports.every(r => selectedIds.has(r.id))
    const someOnPageSelected = reports.some(r => selectedIds.has(r.id))

    // Build filters object for export bar
    const activeFilters = {}
    if (typeFilter) activeFilters.type = typeFilter
    if (statusFilter) activeFilters.status = statusFilter

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Feedback Inbox
                </h1>
                <p className="text-sm text-text-tertiary">
                    All member-submitted bug reports, suggestions, and questions.
                    Select reports and export them as CSV, JSON, or Markdown for AI-assisted resolution.
                </p>
            </div>

            {/* Summary */}
            <SummaryBar summary={summary} />

            {/* Export Bar */}
            <FeedbackExportBar
                selectedIds={Array.from(selectedIds)}
                totalCount={total}
                filters={activeFilters}
                onClearSelection={clearSelection}
            />

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-5">
                <div className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1">
                    {[
                        { id: '', label: 'All' },
                        { id: 'OPEN', label: 'Open' },
                        { id: 'ACKNOWLEDGED', label: 'Acknowledged' },
                        { id: 'IN_PROGRESS', label: 'In Progress' },
                        { id: 'RESOLVED', label: 'Resolved' },
                        { id: 'WONT_FIX', label: "Won't Fix" },
                    ].map(s => (
                        <button
                            key={s.id}
                            onClick={() => setStatusFilter(s.id)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                statusFilter === s.id
                                    ? 'bg-brand-400/15 text-brand-300'
                                    : 'text-text-tertiary hover:text-text-primary'
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1">
                    {[
                        { id: '', label: 'All Types' },
                        { id: 'BUG', label: '🐛 Bugs' },
                        { id: 'SUGGESTION', label: '💡 Suggestions' },
                        { id: 'QUESTION', label: '❓ Questions' },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTypeFilter(t.id)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                typeFilter === t.id
                                    ? 'bg-brand-400/15 text-brand-300'
                                    : 'text-text-tertiary hover:text-text-primary'
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Reports list */}
            {isLoading ? (
                <div className="flex justify-center py-16">
                    <Spinner size="lg" />
                </div>
            ) : reports.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                    <div className="text-3xl mb-3">📭</div>
                    <p className="text-sm font-semibold text-text-primary mb-1">
                        {statusFilter || typeFilter ? 'No reports match these filters' : 'No reports yet'}
                    </p>
                    <p className="text-xs text-text-tertiary">
                        {statusFilter || typeFilter
                            ? 'Try adjusting the filters above.'
                            : 'Reports from members will appear here.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Select all header */}
                    <div className="flex items-center gap-3 px-4 py-2 bg-surface-2/50 border border-border-subtle rounded-xl">
                        <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            ref={el => {
                                if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected
                            }}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-border-strong text-brand-400
                                       focus:ring-brand-400/30 focus:ring-2 cursor-pointer
                                       bg-surface-3 accent-brand-400"
                            aria-label="Select all reports on this page"
                        />
                        <span className="text-xs text-text-tertiary">
                            {allOnPageSelected
                                ? `All ${reports.length} on this page selected`
                                : someOnPageSelected
                                    ? `${selectedIds.size} selected`
                                    : `Select all on this page (${reports.length})`}
                        </span>
                    </div>

                    {reports.map((report, i) => (
                        <motion.div
                            key={report.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                        >
                            <ReportCard
                                report={report}
                                isSelected={selectedIds.has(report.id)}
                                onToggleSelect={toggleSelect}
                            />
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    )
}