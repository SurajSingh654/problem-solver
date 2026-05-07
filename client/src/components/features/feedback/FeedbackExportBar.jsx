// ============================================================================
// ProbSolver v3.0 — Feedback Export Bar (SuperAdmin)
// ============================================================================
//
// Sticky toolbar shown above the feedback list when the viewer is a
// SuperAdmin. Supports exporting either the current selection or all
// reports matching the active filters in one of three formats:
//   - CSV      → spreadsheet-friendly triage
//   - JSON     → machine-readable re-import / tooling
//   - Markdown → AI-ready; paste into any chat with project context
//
// DESIGN DECISIONS:
//
// 1. Single "Export ▾" dropdown instead of three always-visible buttons —
//    keeps the UI calm when nothing is selected and reveals options only
//    when the admin intends to act.
//
// 2. Two explicit export modes:
//      a) "Export selected" — uses the checked row IDs
//      b) "Export all filtered" — uses the active filter params (ignores
//         selection). Clear separation avoids ambiguity about what will
//         end up in the file.
//
// 3. Closes on outside click and Escape — standard menu accessibility.
//
// 4. Disabled states with tooltips explain *why* an action can't run
//    (no selection, no results, export in flight) rather than silently
//    greying out.
//
// 5. Presentational-only. All network I/O lives in the useExportFeedback
//    hook. This component never touches the API directly.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useExportFeedback } from '@hooks/useFeedback'
import { cn } from '@utils/cn'


// ── MenuItem sub-component ──────────────────────────────
// Used inside the dropdown for each format option.
// Renders icon, label, description in a clickable row.
function MenuItem({ icon, label, desc, onClick }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
                'transition-colors hover:bg-surface-2',
                'focus:outline-none focus:bg-surface-2'
            )}
        >
            <span className="text-base flex-shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text-primary leading-tight">
                    {label}
                </p>
                <p className="text-[10px] text-text-tertiary leading-tight mt-0.5">
                    {desc}
                </p>
            </div>
            <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-disabled flex-shrink-0"
            >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
        </button>
    );
}

const FORMATS = [
    {
        id: 'markdown',
        label: 'Markdown (.md)',
        desc: 'AI-ready — paste into any chat',
        icon: '📝',
    },
    {
        id: 'csv',
        label: 'CSV (.csv)',
        desc: 'Open in Excel / Google Sheets',
        icon: '📊',
    },
    {
        id: 'json',
        label: 'JSON (.json)',
        desc: 'Machine-readable / tooling',
        icon: '🧾',
    },
]

export default function FeedbackExportBar({
    selectedIds = [],
    totalCount = 0,
    filters = {},
    onClearSelection,
}) {
    const exportMutation = useExportFeedback()
    const [menuOpen, setMenuOpen] = useState(false)
    const [pendingFormat, setPendingFormat] = useState(null)
    const menuRef = useRef(null)
    const buttonRef = useRef(null)

    const hasSelection = selectedIds.length > 0
    const hasAnyReports = totalCount > 0
    const isExporting = exportMutation.isPending

    // ── Close menu on outside click or Escape ───────────────
    useEffect(() => {
        if (!menuOpen) return

        function handleClickOutside(e) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target)
            ) {
                setMenuOpen(false)
            }
        }

        function handleEscape(e) {
            if (e.key === 'Escape') setMenuOpen(false)
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [menuOpen])

    // ── Export handler ──────────────────────────────────────
    // mode: 'selected' | 'filtered'
    async function handleExport(format, mode) {
        setMenuOpen(false)
        setPendingFormat(format)

        try {
            if (mode === 'selected') {
                await exportMutation.mutateAsync({
                    format,
                    ids: selectedIds,
                })
            } else {
                await exportMutation.mutateAsync({
                    format,
                    filters,
                })
            }
        } catch {
            // Toast is handled inside the hook — nothing to do here
        } finally {
            setPendingFormat(null)
        }
    }

    // ── Nothing to show if there are no reports at all ──────
    if (!hasAnyReports && !hasSelection) {
        return null
    }

    const activeFilterCount = [
        filters.type,
        filters.status,
        filters.severity,
        filters.teamId,
        filters.userId,
        filters.from,
        filters.to,
    ].filter(Boolean).length

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'sticky top-0 z-20 mb-4',
                'bg-surface-1/95 backdrop-blur-md',
                'border border-border-default rounded-2xl',
                'shadow-sm'
            )}
        >
            <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                {/* ── Left: selection summary ──────────────── */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden>📦</span>
                        <div className="min-w-0">
                            {hasSelection ? (
                                <>
                                    <p className="text-sm font-bold text-text-primary leading-tight">
                                        {selectedIds.length} report
                                        {selectedIds.length === 1 ? '' : 's'} selected
                                    </p>
                                    <p className="text-[11px] text-text-tertiary leading-tight">
                                        Export the selection, or export everything matching
                                        the current filters.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm font-bold text-text-primary leading-tight">
                                        Export feedback
                                    </p>
                                    <p className="text-[11px] text-text-tertiary leading-tight">
                                        {totalCount} report{totalCount === 1 ? '' : 's'}
                                        {activeFilterCount > 0
                                            ? ` matching ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`
                                            : ' in view'}
                                        {' — select rows or export all'}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    {hasSelection && (
                        <button
                            type="button"
                            onClick={onClearSelection}
                            disabled={isExporting}
                            className={cn(
                                'text-[11px] font-semibold px-2.5 py-1 rounded-lg',
                                'text-text-tertiary hover:text-text-primary',
                                'hover:bg-surface-2 transition-colors',
                                'disabled:opacity-40 disabled:cursor-not-allowed'
                            )}
                            aria-label="Clear selection"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* ── Right: export menu trigger ─────────────── */}
                <div className="relative">
                    <button
                        ref={buttonRef}
                        type="button"
                        onClick={() => setMenuOpen((v) => !v)}
                        disabled={isExporting || (!hasSelection && !hasAnyReports)}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        className={cn(
                            'inline-flex items-center gap-2 px-4 py-2 rounded-xl',
                            'text-sm font-bold transition-all',
                            'bg-brand-400 text-white hover:bg-brand-400/90',
                            'shadow-sm',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'focus:outline-none focus:ring-2 focus:ring-brand-400/40'
                        )}
                    >
                        {isExporting ? (
                            <>
                                <svg
                                    className="animate-spin"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                Exporting{pendingFormat ? ` ${pendingFormat.toUpperCase()}` : ''}…
                            </>
                        ) : (
                            <>
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Export
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={cn(
                                        'transition-transform',
                                        menuOpen && 'rotate-180'
                                    )}
                                >
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </>
                        )}
                    </button>

                    {/* ── Dropdown menu ─────────────────────── */}
                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                ref={menuRef}
                                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                transition={{ duration: 0.12 }}
                                role="menu"
                                className={cn(
                                    'absolute right-0 top-full mt-2 w-[320px]',
                                    'bg-surface-1 border border-border-strong rounded-2xl',
                                    'shadow-lg overflow-hidden z-30'
                                )}
                            >
                                {/* Selected section */}
                                {hasSelection && (
                                    <div className="p-2 border-b border-border-subtle">
                                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest px-2.5 py-1.5">
                                            Export {selectedIds.length} selected
                                        </p>
                                        {FORMATS.map((fmt) => (
                                            <MenuItem
                                                key={`selected-${fmt.id}`}
                                                icon={fmt.icon}
                                                label={fmt.label}
                                                desc={fmt.desc}
                                                onClick={() =>
                                                    handleExport(fmt.id, 'selected')
                                                }
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* All filtered section */}
                                <div className="p-2">
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest px-2.5 py-1.5">
                                        {activeFilterCount > 0
                                            ? `Export all matching ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} (${totalCount})`
                                            : `Export all (${totalCount})`}
                                    </p>
                                    {FORMATS.map((fmt) => (
                                        <MenuItem
                                            key={`filtered-${fmt.id}`}
                                            icon={fmt.icon}
                                            label={fmt.label}
                                            desc={fmt.desc}
                                            onClick={() =>
                                                handleExport(fmt.id, 'filtered')
                                            }
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}