// ============================================================================
// WorkspaceEditor — shared shell for HR / Behavioral / Technical Knowledge
// ============================================================================
//
// These three submission workspaces share the same structure:
//   header (icon + label + N/M sections filled + progress bar)
//   tab strip (one button per section)
//   optional banner (caller decides when to show)
//   active section card: header, hint, optional preamble, textarea,
//                        optional char-count progress
//   prev/next nav
//
// Differences between workspaces:
//   - Per-section `charThreshold` (depth-progress bar appears when set)
//   - Per-section `tabDoneThreshold` (green ✓ in tab strip)
//   - Progress bar color
//   - Optional "High signal" label for non-required sections
//   - Optional custom preamble above the textarea (TK subject picker)
//   - Optional banner with caller-owned visibility (via render prop)
//
// The Database workspace has enough bespoke shape (schema reference,
// SQL editor, two modes) that it stays custom and does NOT use this shell.
// ============================================================================

import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'

export function WorkspaceEditor({
    headerIcon,
    headerLabel,
    progressColorClass = 'bg-brand-400',
    sections,
    fieldConfigs = {},
    values,
    onChange,
    defaultActiveSection,
    nonRequiredBadgeLabel = null,
    showCoreCompleteBadge = false,
    banner = null,
    renderSectionAbove = null,
}) {
    const [activeSection, setActiveSection] = useState(
        defaultActiveSection ?? sections[0]?.key,
    )

    function update(field, value) {
        onChange({ ...values, [field]: value })
    }

    const activeIndex = sections.findIndex(s => s.key === activeSection)
    const activeSectionConfig = sections[activeIndex]

    const isSectionDone = (s) => {
        const len = values[s.key]?.trim?.()?.length ?? 0
        return len >= (s.tabDoneThreshold ?? 30)
    }
    const completedCount = sections.filter(isSectionDone).length
    const requiredComplete = sections
        .filter(s => s.required)
        .every(isSectionDone)

    const activeValue = values[activeSection] ?? ''
    const activeCharCount = activeValue.trim?.().length ?? 0
    const charThreshold = activeSectionConfig?.charThreshold
    const hasCharProgress = typeof charThreshold === 'number' && charThreshold > 0
    const isShort = hasCharProgress && activeCharCount > 0 && activeCharCount < charThreshold
    const progressPct = hasCharProgress
        ? Math.min(100, (activeCharCount / charThreshold) * 100)
        : 0

    const bannerNode = typeof banner === 'function'
        ? banner({ values, activeSection, completedCount, requiredComplete })
        : banner
    const sectionAboveNode = typeof renderSectionAbove === 'function'
        ? renderSectionAbove(activeSection, { values, update, setActiveSection })
        : null

    const activeFieldConfig = fieldConfigs[activeSection] || {}
    const activeRows = activeFieldConfig.rows || 10

    return (
        <div className="space-y-4">
            {/* Header + tab strip */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>{headerIcon}</span> {headerLabel}
                    </p>
                    <div className="flex items-center gap-2">
                        {showCoreCompleteBadge && requiredComplete && (
                            <span className="text-[10px] font-bold text-success-fg flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                Core complete
                            </span>
                        )}
                        <span className="text-[10px] font-bold text-text-disabled">
                            {completedCount}/{sections.length} sections
                        </span>
                    </div>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden mb-3">
                    <motion.div
                        animate={{ width: `${(completedCount / sections.length) * 100}%` }}
                        transition={{ duration: 0.4 }}
                        className={cn('h-full rounded-full', progressColorClass)}
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {sections.map(s => {
                        const isDone = isSectionDone(s)
                        const isActive = activeSection === s.key
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={cn(
                                    'flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all duration-150 min-w-[72px]',
                                    isActive
                                        ? s.activeBg
                                        : isDone
                                            ? 'bg-success-soft border-success-line'
                                            : 'bg-surface-3 border-border-default hover:border-border-strong',
                                )}
                            >
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{s.icon}</span>
                                    {s.required && !isDone && !isActive && <span className="text-danger-fg text-[9px] font-bold">*</span>}
                                    {isDone && !isActive && <span className="text-success-fg text-[9px] font-bold">✓</span>}
                                </div>
                                <span
                                    className={cn(
                                        'text-[9px] font-bold uppercase tracking-wider text-center leading-tight',
                                        isActive ? s.color : isDone ? 'text-success-fg' : 'text-text-disabled',
                                    )}
                                >
                                    {s.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {bannerNode}

            {/* Active section card */}
            <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
            >
                <div className={cn('flex items-center gap-3 px-5 py-4 border-b border-border-default', activeSectionConfig?.activeBg)}>
                    <span className="text-xl">{activeSectionConfig?.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn('text-sm font-bold', activeSectionConfig?.color)}>{activeSectionConfig?.label}</p>
                            {activeSectionConfig?.required && (
                                <span className="text-[9px] font-bold text-danger-fg bg-danger-soft border border-danger-line px-1.5 py-px rounded-full">
                                    Required
                                </span>
                            )}
                            {!activeSectionConfig?.required && nonRequiredBadgeLabel && (
                                <span className="text-[9px] font-bold text-text-disabled bg-surface-3 border border-border-default px-1.5 py-px rounded-full">
                                    {nonRequiredBadgeLabel}
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-disabled">{activeSectionConfig?.sublabel}</p>
                    </div>
                    <span className="text-[10px] text-text-disabled flex-shrink-0">
                        {activeIndex + 1} / {sections.length}
                    </span>
                </div>
                <div className="p-5 space-y-3">
                    {activeFieldConfig.hint && (
                        <p className="text-[11px] text-text-tertiary leading-relaxed bg-surface-2 border border-border-subtle rounded-lg px-3 py-2">
                            💡 {activeFieldConfig.hint}
                        </p>
                    )}
                    {sectionAboveNode}
                    <textarea
                        rows={activeRows}
                        value={activeValue}
                        onChange={e => update(activeSection, e.target.value)}
                        placeholder={activeFieldConfig.placeholder || ''}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        style={{ minHeight: `${activeRows * 24}px` }}
                    />
                    {hasCharProgress && activeCharCount > 0 && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                                <span
                                    className={cn(
                                        'font-semibold',
                                        activeCharCount >= charThreshold
                                            ? 'text-success-fg'
                                            : isShort
                                                ? 'text-warning-fg'
                                                : 'text-text-disabled',
                                    )}
                                >
                                    {activeCharCount >= charThreshold
                                        ? '✓ Good depth'
                                        : isShort
                                            ? `Shallow — aim for ${charThreshold - activeCharCount} more chars`
                                            : 'Keep going...'}
                                </span>
                                <span className="text-text-disabled tabular-nums">
                                    {activeCharCount} / ~{charThreshold}
                                </span>
                            </div>
                            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                                <motion.div
                                    animate={{ width: `${progressPct}%` }}
                                    transition={{ duration: 0.3 }}
                                    className={cn(
                                        'h-full rounded-full',
                                        activeCharCount >= charThreshold ? 'bg-success' : 'bg-warning',
                                    )}
                                />
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-border-default bg-surface-1/50">
                    <button
                        type="button"
                        onClick={() => { if (activeIndex > 0) setActiveSection(sections[activeIndex - 1].key) }}
                        disabled={activeIndex === 0}
                        className="text-xs font-semibold text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        Previous
                    </button>
                    {activeIndex < sections.length - 1 && (
                        <button
                            type="button"
                            onClick={() => setActiveSection(sections[activeIndex + 1].key)}
                            className="text-xs font-semibold text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1"
                        >
                            Next
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    )
}
