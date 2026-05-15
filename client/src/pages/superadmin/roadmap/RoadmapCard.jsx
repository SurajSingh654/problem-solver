// ============================================================================
// RoadmapCard — single roadmap item, expandable detail
// ----------------------------------------------------------------------------
// Controlled component: expansion is owned by TodoPage so deep-link / keyboard
// can drive it. The DOM id `item-<id>` is the deep-link anchor.
//
// Search highlighting wraps matches in <mark>; compact density hides the
// impact line in the collapsed view (titles-only mode).
// ============================================================================
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    PHASE_CONFIG,
    THEME_CONFIG,
    PRIORITY_CONFIG,
    EFFORT_CONFIG,
} from './roadmapData'

function ThemeBadge({ theme }) {
    const config = THEME_CONFIG[theme] || THEME_CONFIG['Infrastructure']
    return (
        <span className={cn(
            'text-[9px] font-bold px-1.5 py-px rounded-full border flex items-center gap-1 flex-shrink-0',
            config.bg,
        )}>
            <span>{config.icon}</span>
            <span className={config.color}>{theme}</span>
        </span>
    )
}

function formatShipped(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Highlighted text — wraps each query match in <mark> ───────────────
// Single-pass split + render. Case-insensitive, regex-safe.
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function HighlightedText({ text, query }) {
    if (!text) return null
    if (!query) return text
    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'))
    return parts.map((part, i) =>
        i % 2 === 1
            ? <mark key={i} className="bg-warning-soft text-warning-fg rounded px-0.5">{part}</mark>
            : <span key={i}>{part}</span>
    )
}

export function RoadmapCard({
    item,
    index,
    density = 'comfortable',
    searchQuery = '',
    expanded,
    onToggle,
    focused = false,
}) {
    const phaseConfig = PHASE_CONFIG[item.phase]
    const priorityConfig = PRIORITY_CONFIG[item.priority]
    const effortConfig = EFFORT_CONFIG[item.effort]
    const isCompact = density === 'compact'

    return (
        <motion.div
            id={`item-${item.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.3) }}
            className={cn(
                'bg-surface-1 border border-border-default rounded-xl overflow-hidden',
                'border-l-2 transition-all scroll-mt-24',
                phaseConfig?.borderLeft,
                focused && 'ring-2 ring-brand-400/60 ring-offset-2 ring-offset-surface-0',
            )}
        >
            <button
                onClick={onToggle}
                className={cn(
                    'w-full flex items-start gap-3 text-left hover:bg-surface-2/50 transition-colors',
                    isCompact ? 'p-2.5' : 'p-4',
                )}
            >
                <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className={cn(
                        'flex items-center gap-1.5 flex-wrap',
                        isCompact ? 'mb-1' : 'mb-1.5',
                    )}>
                        <ThemeBadge theme={item.theme} />
                        <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', priorityConfig.color)}>
                            {item.priority}
                        </span>
                        <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', effortConfig.color)}>
                            {effortConfig.label}
                        </span>
                        {item.researchBasis && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full border bg-purple-400/10 text-purple-400 border-purple-400/25">
                                🔬 Research-backed
                            </span>
                        )}
                        {item.phase === 'DONE' && item.shippedAt && (
                            <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', phaseConfig.badge)}>
                                ✅ Shipped {formatShipped(item.shippedAt)}
                            </span>
                        )}
                    </div>

                    {/* Title */}
                    <h4 className={cn(
                        'text-sm font-bold',
                        item.phase === 'DONE' ? 'text-text-secondary' : 'text-text-primary',
                        isCompact ? '' : 'mb-1',
                    )}>
                        <HighlightedText text={item.title} query={searchQuery} />
                    </h4>

                    {/* Impact (hidden in compact view to mimic title-only mode) */}
                    {!isCompact && (
                        <p className="text-xs text-text-secondary leading-relaxed">
                            <HighlightedText text={item.impact} query={searchQuery} />
                        </p>
                    )}
                </div>

                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-disabled flex-shrink-0 mt-1"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>

            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle pt-3">
                            {/* In compact mode, the impact line is hidden in the collapsed view —
                                show it in the expanded view so the reader still gets the value statement. */}
                            {isCompact && item.impact && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                        Impact
                                    </p>
                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        <HighlightedText text={item.impact} query={searchQuery} />
                                    </p>
                                </div>
                            )}

                            {item.description && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                        Description
                                    </p>
                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        <HighlightedText text={item.description} query={searchQuery} />
                                    </p>
                                </div>
                            )}

                            {item.why && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                        Why
                                    </p>
                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        <HighlightedText text={item.why} query={searchQuery} />
                                    </p>
                                </div>
                            )}

                            {item.researchBasis && (
                                <div className="bg-purple-400/10 border border-purple-400/25 rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">
                                        🔬 Research basis
                                    </p>
                                    <p className="text-xs text-text-secondary leading-relaxed">
                                        <HighlightedText text={item.researchBasis} query={searchQuery} />
                                    </p>
                                </div>
                            )}

                            {item.technicalNotes && (
                                <div className="bg-surface-2 border border-border-subtle rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                        Technical notes
                                    </p>
                                    <pre className="text-[11px] text-text-tertiary font-mono whitespace-pre-wrap leading-relaxed">
                                        <HighlightedText text={item.technicalNotes} query={searchQuery} />
                                    </pre>
                                </div>
                            )}

                            {/* Permalink */}
                            <div className="pt-1">
                                <a
                                    href={`#item-${item.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] font-mono text-text-disabled hover:text-brand-fg-soft transition-colors"
                                    title="Copy link to this item"
                                >
                                    #{item.id}
                                </a>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
