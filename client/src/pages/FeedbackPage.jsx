// ============================================================================
// ProbSolver v3.0 — Feedback Page (Member Submission)
// ============================================================================
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSubmitFeedback, useFeedbackList, useSimilarFeedback } from '@hooks/useFeedback'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { cn } from '@utils/cn'
import { formatRelativeDate } from '@utils/formatters'

const TYPES = [
    {
        id: 'BUG',
        label: 'Bug Report',
        icon: '🐛',
        desc: 'Something is broken or not working as expected',
        color: 'text-danger',
        bg: 'bg-danger/10 border-danger/30',
    },
    {
        id: 'SUGGESTION',
        label: 'Suggestion',
        icon: '💡',
        desc: 'An idea to improve or enhance a feature',
        color: 'text-warning',
        bg: 'bg-warning/10 border-warning/30',
    },
    {
        id: 'QUESTION',
        label: 'Question',
        icon: '❓',
        desc: 'Something is confusing and you need help',
        color: 'text-info',
        bg: 'bg-info/10 border-info/30',
    },
]

const SEVERITIES = [
    { id: 'LOW', label: 'Low', desc: 'Minor inconvenience', color: 'text-success', dot: 'bg-success' },
    { id: 'MEDIUM', label: 'Medium', desc: 'Noticeably affects usage', color: 'text-warning', dot: 'bg-warning' },
    { id: 'HIGH', label: 'High', desc: 'Significantly blocks me', color: 'text-orange-400', dot: 'bg-orange-400' },
    { id: 'CRITICAL', label: 'Critical', desc: 'Completely broken', color: 'text-danger', dot: 'bg-danger' },
]

const AFFECTED_AREAS = [
    'Problems & Solutions',
    'AI Mock Interview',
    'Quizzes',
    'Review Queue',
    'Intelligence Report (6D)',
    'Team Features',
    'Leaderboard',
    'Dashboard',
    'Authentication / Login',
    'Profile & Settings',
    'Admin Panel',
    'Navigation / Sidebar',
    'Other',
]

const STATUS_CONFIG = {
    OPEN: { label: 'Open', color: 'text-info bg-info/10 border-info/20' },
    ACKNOWLEDGED: { label: 'Acknowledged', color: 'text-warning bg-warning/10 border-warning/20' },
    IN_PROGRESS: { label: 'In Progress', color: 'text-brand-300 bg-brand-400/10 border-brand-400/20' },
    RESOLVED: { label: 'Resolved', color: 'text-success bg-success/10 border-success/20' },
    WONT_FIX: { label: "Won't Fix", color: 'text-text-disabled bg-surface-3 border-border-default' },
}

const TYPE_CONFIG = {
    BUG: { icon: '🐛', label: 'Bug' },
    SUGGESTION: { icon: '💡', label: 'Suggestion' },
    QUESTION: { icon: '❓', label: 'Question' },
}

function StatusBadge({ status }) {
    const s = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN
    return (
        <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border', s.color)}>
            {s.label}
        </span>
    )
}

// ── Similar reports panel ──────────────────────────────
// Shown inline while the user is composing their report.
// Surfaces open reports that may already describe the same issue.
// Never blocks submission — always gives the user a choice.
function SimilarReportsPanel({ similar, onDismiss }) {
    if (!similar || similar.length === 0) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-warning/5 border border-warning/25 rounded-2xl p-4"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5">
                    <span className="text-lg flex-shrink-0">⚠️</span>
                    <div>
                        <p className="text-sm font-bold text-text-primary">
                            Similar reports already exist
                        </p>
                        <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                            These open reports may describe the same issue.
                            Check if yours is already covered before submitting.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-text-disabled hover:text-text-primary flex-shrink-0 mt-0.5"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className="space-y-2.5">
                {similar.map(report => {
                    const t = TYPE_CONFIG[report.type] || TYPE_CONFIG.BUG
                    const s = STATUS_CONFIG[report.status] || STATUS_CONFIG.OPEN
                    return (
                        <div key={report.id}
                            className="bg-surface-1 border border-border-default rounded-xl p-3"
                        >
                            <div className="flex items-start gap-2 mb-1.5">
                                <span className="text-sm flex-shrink-0">{t.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-text-primary leading-tight">
                                        {report.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className={cn(
                                            'text-[10px] font-bold px-1.5 py-px rounded-full border',
                                            s.color
                                        )}>
                                            {s.label}
                                        </span>
                                        {report.affectedArea && (
                                            <span className="text-[10px] text-text-disabled">
                                                {report.affectedArea}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-text-disabled">
                                            by {report.user?.name} · {formatRelativeDate(report.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {report.description && (
                                <p className="text-[11px] text-text-tertiary leading-relaxed line-clamp-2 ml-6">
                                    {report.description}
                                </p>
                            )}
                        </div>
                    )
                })}
            </div>

            <p className="text-[11px] text-text-disabled mt-3 pt-3 border-t border-border-subtle">
                If your issue is different from the above, go ahead and submit — your report is still valuable.
            </p>
        </motion.div>
    )
}

// ── All reports list (visible to all members) ──────────
// UPDATED: was "My Reports" showing only the user's own reports.
// Now shows all reports from the team so everyone knows what's been raised.
function AllReports() {
    const [statusFilter, setStatusFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')

    const { data, isLoading } = useFeedbackList({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
    })

    const reports = data?.reports || []

    return (
        <div className="space-y-4">
            {/* Filter row */}
            <div className="flex flex-wrap gap-2">
                <div className="flex gap-1 bg-surface-2 border border-border-default rounded-xl p-1">
                    {[
                        { id: '', label: 'All' },
                        { id: 'OPEN', label: 'Open' },
                        { id: 'IN_PROGRESS', label: 'In Progress' },
                        { id: 'RESOLVED', label: 'Resolved' },
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
                        { id: '', label: 'All' },
                        { id: 'BUG', label: '🐛' },
                        { id: 'SUGGESTION', label: '💡' },
                        { id: 'QUESTION', label: '❓' },
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

            {/* Reports */}
            {isLoading ? (
                <div className="text-center py-8">
                    <p className="text-xs text-text-disabled">Loading reports...</p>
                </div>
            ) : reports.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-sm text-text-disabled">No reports found.</p>
                    {(statusFilter || typeFilter) && (
                        <p className="text-xs text-text-disabled mt-1">
                            Try adjusting the filters.
                        </p>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {reports.map((report, i) => {
                        const t = TYPE_CONFIG[report.type] || TYPE_CONFIG.BUG
                        return (
                            <motion.div
                                key={report.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="bg-surface-2 border border-border-default rounded-xl p-4"
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                        <span className="text-base flex-shrink-0 mt-0.5">{t.icon}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-text-primary truncate">
                                                {report.title}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="text-[10px] text-text-disabled">
                                                    {report.user?.name}
                                                </span>
                                                {report.affectedArea && (
                                                    <span className="text-[10px] text-text-disabled">
                                                        · {report.affectedArea}
                                                    </span>
                                                )}
                                                <span className="text-[10px] text-text-disabled">
                                                    · {formatRelativeDate(report.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <StatusBadge status={report.status} />
                                </div>
                                <p className="text-xs text-text-tertiary leading-relaxed line-clamp-2 ml-6">
                                    {report.description}
                                </p>
                                {/* Admin note — shown to all if present */}
                                {report.adminNote && (
                                    <div className="mt-3 pt-3 border-t border-border-subtle ml-6">
                                        <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-1">
                                            Admin Response
                                        </p>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                            {report.adminNote}
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function FeedbackPage() {
    const submitFeedback = useSubmitFeedback()

    const [type, setType] = useState('BUG')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [severity, setSeverity] = useState('MEDIUM')
    const [affectedArea, setAffectedArea] = useState('')
    const [stepsToReproduce, setStepsToReproduce] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [activeTab, setActiveTab] = useState('submit')
    const [dismissedSimilar, setDismissedSimilar] = useState(false)

    // Debounced title for similarity check
    const [debouncedTitle, setDebouncedTitle] = useState('')
    const debounceRef = useRef(null)

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setDebouncedTitle(title)
            // Reset dismissed state when title changes significantly
            if (title.trim().length < 5) setDismissedSimilar(false)
        }, 600)
        return () => clearTimeout(debounceRef.current)
    }, [title])

    // Reset dismissed when title changes meaningfully
    useEffect(() => {
        setDismissedSimilar(false)
    }, [debouncedTitle])

    const { data: similarReports } = useSimilarFeedback({
        title: debouncedTitle,
        type,
        affectedArea,
    })

    const showSimilarPanel = !dismissedSimilar &&
        similarReports &&
        similarReports.length > 0 &&
        title.trim().length >= 5

    const isBug = type === 'BUG'

    async function handleSubmit(e) {
        e.preventDefault()
        if (!title.trim() || !description.trim()) return

        await submitFeedback.mutateAsync({
            type,
            title: title.trim(),
            description: description.trim(),
            severity: isBug ? severity : 'LOW',
            affectedArea: affectedArea || null,
            stepsToReproduce: isBug && stepsToReproduce ? stepsToReproduce.trim() : null,
        })

        setSubmitted(true)
        setTitle('')
        setDescription('')
        setSeverity('MEDIUM')
        setAffectedArea('')
        setStepsToReproduce('')
        setDebouncedTitle('')
        setDismissedSimilar(false)
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-extrabold text-text-primary mb-2">
                    Feedback & Issues
                </h1>
                <p className="text-sm text-text-tertiary leading-relaxed">
                    Found a bug? Have a suggestion? Confused about something?
                    Every report is reviewed — your feedback directly shapes how ProbSolver improves.
                </p>
            </div>

            {/* Tabs — UPDATED: "My Reports" → "All Reports" */}
            <div className="flex gap-1 bg-surface-2 border border-border-default
                            rounded-xl p-1 mb-6">
                {[
                    { id: 'submit', label: 'Submit Report', icon: '📝' },
                    // UPDATED: was "My Reports" — now "All Reports" since members see everything
                    { id: 'all', label: 'All Reports', icon: '📋' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg',
                            'text-xs font-semibold transition-all',
                            activeTab === tab.id
                                ? 'bg-brand-400/15 text-brand-300'
                                : 'text-text-tertiary hover:text-text-primary'
                        )}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'submit' ? (
                <div className="space-y-5">
                    {/* Success banner */}
                    {submitted && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-success/5 border border-success/20 rounded-2xl p-4
                                       flex items-start gap-3"
                        >
                            <span className="text-xl flex-shrink-0">✅</span>
                            <div>
                                <p className="text-sm font-semibold text-text-primary mb-0.5">
                                    Report submitted — thank you!
                                </p>
                                <p className="text-xs text-text-tertiary">
                                    We review every report. Track the status in "All Reports".
                                </p>
                            </div>
                            <button
                                onClick={() => setSubmitted(false)}
                                className="text-text-disabled hover:text-text-primary ml-auto flex-shrink-0"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Report type */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                            <p className="text-sm font-bold text-text-primary mb-3">
                                What kind of report is this?
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {TYPES.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                            setType(t.id)
                                            setDismissedSimilar(false)
                                        }}
                                        className={cn(
                                            'flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left',
                                            'transition-all duration-150',
                                            type === t.id
                                                ? t.bg
                                                : 'bg-surface-3 border-border-default hover:border-border-strong'
                                        )}
                                    >
                                        <span className="text-2xl">{t.icon}</span>
                                        <span className={cn(
                                            'text-xs font-bold',
                                            type === t.id ? t.color : 'text-text-secondary'
                                        )}>
                                            {t.label}
                                        </span>
                                        <span className="text-[10px] text-text-disabled leading-tight">
                                            {t.desc}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main fields */}
                        <div className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-4">
                            {/* Title — similar detection fires here */}
                            <div>
                                <label className="block text-sm font-semibold text-text-primary mb-1.5">
                                    Title
                                    <span className="ml-1 text-danger text-xs">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder={
                                        type === 'BUG'
                                            ? 'e.g. Submit button not working on Behavioral workspace'
                                            : type === 'SUGGESTION'
                                                ? 'e.g. Add keyboard shortcut to navigate between sections'
                                                : 'e.g. How do I see my teammate\'s solutions?'
                                    }
                                    required
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                                               text-sm text-text-primary placeholder:text-text-tertiary
                                               px-3.5 py-2.5 outline-none
                                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>

                            {/* SIMILAR REPORTS PANEL — shown inline after title input */}
                            <AnimatePresence>
                                {showSimilarPanel && (
                                    <SimilarReportsPanel
                                        similar={similarReports}
                                        onDismiss={() => setDismissedSimilar(true)}
                                    />
                                )}
                            </AnimatePresence>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-text-primary mb-1.5">
                                    Description
                                    <span className="ml-1 text-danger text-xs">*</span>
                                </label>
                                <textarea
                                    rows={4}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder={
                                        type === 'BUG'
                                            ? 'Describe what happened. What were you trying to do? What did you expect vs what actually happened?'
                                            : type === 'SUGGESTION'
                                                ? 'Describe the improvement. What problem would it solve? How would it work?'
                                                : 'Describe what you\'re confused about. What were you trying to do when you got stuck?'
                                    }
                                    required
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                                               text-sm text-text-primary placeholder:text-text-tertiary
                                               px-3.5 py-2.5 outline-none resize-y
                                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>

                            {/* Affected area */}
                            <div>
                                <label className="block text-sm font-semibold text-text-primary mb-1.5">
                                    Affected Area
                                    <span className="ml-1.5 text-xs font-normal text-text-disabled">optional</span>
                                </label>
                                <select
                                    value={affectedArea}
                                    onChange={e => {
                                        setAffectedArea(e.target.value)
                                        setDismissedSimilar(false)
                                    }}
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                                               text-sm text-text-primary
                                               px-3.5 py-2.5 outline-none
                                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                >
                                    <option value="">Select the area affected...</option>
                                    {AFFECTED_AREAS.map(area => (
                                        <option key={area} value={area}>{area}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Bug-specific fields */}
                        {isBug && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-danger/5 border border-danger/15 rounded-2xl p-5 space-y-4"
                            >
                                <p className="text-xs font-bold text-danger uppercase tracking-widest">
                                    🐛 Bug Details
                                </p>
                                <div>
                                    <label className="block text-sm font-semibold text-text-primary mb-2">
                                        Severity
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {SEVERITIES.map(s => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setSeverity(s.id)}
                                                className={cn(
                                                    'flex flex-col items-start gap-1 p-3 rounded-xl border',
                                                    'transition-all duration-150',
                                                    severity === s.id
                                                        ? 'bg-surface-1 border-border-strong'
                                                        : 'bg-surface-3 border-border-default hover:border-border-strong'
                                                )}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <div className={cn('w-2 h-2 rounded-full', s.dot)} />
                                                    <span className={cn(
                                                        'text-xs font-bold',
                                                        severity === s.id ? s.color : 'text-text-secondary'
                                                    )}>
                                                        {s.label}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] text-text-disabled leading-tight">
                                                    {s.desc}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-text-primary mb-1.5">
                                        Steps to Reproduce
                                        <span className="ml-1.5 text-xs font-normal text-text-disabled">
                                            optional but very helpful
                                        </span>
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={stepsToReproduce}
                                        onChange={e => setStepsToReproduce(e.target.value)}
                                        placeholder={
                                            '1. Go to Problems page\n' +
                                            '2. Click on any Behavioral problem\n' +
                                            '3. Fill in the STAR workspace\n' +
                                            '4. Click Submit\n' +
                                            '5. Error appears: [describe error]'
                                        }
                                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                                   text-sm text-text-primary placeholder:text-text-disabled
                                                   font-mono text-xs
                                                   px-3.5 py-2.5 outline-none resize-y
                                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* Submit */}
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-text-disabled">
                                We review every report and respond in the app.
                            </p>
                            <Button
                                type="submit"
                                variant="primary"
                                size="md"
                                loading={submitFeedback.isPending}
                                disabled={!title.trim() || !description.trim()}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                                Send Report
                            </Button>
                        </div>
                    </form>
                </div>
            ) : (
                // UPDATED: was MyReports() — now AllReports() with full team visibility
                <AllReports />
            )}
        </div>
    )
}