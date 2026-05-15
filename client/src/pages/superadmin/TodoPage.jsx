// ============================================================================
// ProbSolver — Product Roadmap (SUPER_ADMIN)
// ============================================================================
//
// Layout: Focus strip (NOW items) → Filter bar → Phase groups → Footer.
// DONE items are hidden by default behind a "Show shipped" toggle.
//
// Power-user features:
//   • #item-<id> URL hash auto-expands and scrolls to a single card.
//   • Keyboard shortcuts: j/k navigate, e expand/collapse, / focus search,
//     Esc clear/blur. Active when no input is focused.
//   • Search matches title + impact + description + why + technicalNotes
//     + theme; matches highlight inline on the card.
//   • Phases with >8 visible items default-collapsed to reduce overwhelm.
//   • Density toggle (compact / comfortable) persisted to localStorage.
// ============================================================================
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    ROADMAP_ITEMS,
    PHASE_CONFIG,
    PHASES_ORDER,
    PRIORITY_CONFIG,
    EFFORT_CONFIG,
} from './roadmap/roadmapData'
import { RoadmapCard } from './roadmap/RoadmapCard'
import { FilterBar } from './roadmap/FilterBar'

const VELOCITY_WINDOW_DAYS = 30
const AUTO_COLLAPSE_THRESHOLD = 8
const DENSITY_KEY = 'probsolver:roadmap:density'

function countShippedWithin(items, days) {
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000
    return items.filter(
        i => i.phase === 'DONE' && i.shippedAt && new Date(i.shippedAt).getTime() >= threshold,
    ).length
}

// Phase-level summary: counts by priority and research-backed flag.
function computePhaseStats(items) {
    let hi = 0, med = 0, lo = 0, research = 0
    for (const item of items) {
        if (item.priority === 'HIGH') hi++
        else if (item.priority === 'MEDIUM') med++
        else if (item.priority === 'LOW') lo++
        if (item.researchBasis) research++
    }
    return { count: items.length, hi, med, lo, research }
}

export default function TodoPage() {
    const [phases, setPhases] = useState([])
    const [themes, setThemes] = useState([])
    const [priority, setPriority] = useState('All')
    const [effort, setEffort] = useState('All')
    const [search, setSearch] = useState('')
    const [showDone, setShowDone] = useState(false)

    // Density persists across reloads; default to comfortable.
    const [density, setDensity] = useState(() => {
        if (typeof window === 'undefined') return 'comfortable'
        return window.localStorage.getItem(DENSITY_KEY) || 'comfortable'
    })
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(DENSITY_KEY, density)
        }
    }, [density])

    // Item-level expansion state lifted into the page so deep-link / keyboard
    // can drive it. Map: itemId → boolean.
    const [expandedItems, setExpandedItems] = useState({})
    const toggleExpanded = useCallback((id) => {
        setExpandedItems(prev => {
            const next = { ...prev, [id]: !prev[id] }
            // Mirror to URL hash when expanding (clear on collapse).
            if (typeof window !== 'undefined') {
                if (next[id]) {
                    window.history.replaceState(null, '', `#item-${id}`)
                } else if (window.location.hash === `#item-${id}`) {
                    window.history.replaceState(null, '', window.location.pathname)
                }
            }
            return next
        })
    }, [])

    // Focused-card index for keyboard nav.
    const [focusedId, setFocusedId] = useState(null)
    const searchInputRef = useRef(null)

    // ── Derived stats ───────────────────────────────────────────────────

    const shippedCount = useMemo(
        () => ROADMAP_ITEMS.filter(i => i.phase === 'DONE').length,
        [],
    )
    const shippedRecentCount = useMemo(
        () => countShippedWithin(ROADMAP_ITEMS, VELOCITY_WINDOW_DAYS),
        [],
    )
    const inProgressCount = useMemo(
        () => ROADMAP_ITEMS.filter(i => i.phase === 'NOW').length,
        [],
    )
    const plannedCount = useMemo(
        () => ROADMAP_ITEMS.filter(i => ['NEXT', 'LATER'].includes(i.phase)).length,
        [],
    )
    const researchBacked = useMemo(
        () => ROADMAP_ITEMS.filter(i => i.researchBasis).length,
        [],
    )

    // ── Focus strip: NOW phase items, sorted by priority then effort ────

    const focusItems = useMemo(() => {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
        const effortOrder = { Small: 0, Medium: 1, Large: 2, XLarge: 3 }
        return ROADMAP_ITEMS
            .filter(i => i.phase === 'NOW')
            .sort((a, b) => {
                const p = order[a.priority] - order[b.priority]
                if (p !== 0) return p
                return effortOrder[a.effort] - effortOrder[b.effort]
            })
    }, [])

    const anyFilterActive =
        phases.length > 0 ||
        themes.length > 0 ||
        priority !== 'All' ||
        effort !== 'All' ||
        search.trim().length > 0

    function clearAll() {
        setPhases([])
        setThemes([])
        setPriority('All')
        setEffort('All')
        setSearch('')
    }

    // ── Filter pipeline (search now matches all long-form fields) ──────

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return ROADMAP_ITEMS.filter(item => {
            if (item.phase === 'DONE' && !showDone) return false
            if (phases.length > 0 && !phases.includes(item.phase)) return false
            if (themes.length > 0 && !themes.includes(item.theme)) return false
            if (priority !== 'All' && item.priority !== priority) return false
            if (effort !== 'All' && item.effort !== effort) return false
            if (q) {
                const haystack = [
                    item.title,
                    item.impact,
                    item.description,
                    item.why,
                    item.technicalNotes,
                    item.researchBasis,
                    item.theme,
                ].filter(Boolean).join(' ').toLowerCase()
                if (!haystack.includes(q)) return false
            }
            return true
        })
    }, [phases, themes, priority, effort, search, showDone])

    // Group filtered items by phase for the main grid.
    const grouped = useMemo(() => {
        const g = {}
        for (const phase of PHASES_ORDER) g[phase] = []
        g.DONE = []
        for (const item of filtered) {
            if (g[item.phase]) g[item.phase].push(item)
        }
        return g
    }, [filtered])

    // Per-phase stats for header badges.
    const phaseStats = useMemo(() => {
        const s = {}
        for (const phase of [...PHASES_ORDER, 'DONE']) {
            s[phase] = computePhaseStats(grouped[phase] || [])
        }
        return s
    }, [grouped])

    // Linear list of currently visible (filtered) items, in render order.
    // Drives keyboard navigation.
    const visibleList = useMemo(() => {
        const list = []
        for (const phase of [...PHASES_ORDER, 'DONE']) {
            for (const item of (grouped[phase] || [])) list.push(item)
        }
        return list
    }, [grouped])

    // ── Deep-link: read URL hash on mount, expand + scroll to that item ─

    useEffect(() => {
        if (typeof window === 'undefined') return
        const applyHash = () => {
            const hash = window.location.hash
            if (!hash.startsWith('#item-')) return
            const id = hash.slice(6)
            const target = ROADMAP_ITEMS.find(i => i.id === id)
            if (!target) return
            // If the target is DONE and showDone is false, flip it on.
            if (target.phase === 'DONE') setShowDone(true)
            setExpandedItems(prev => ({ ...prev, [id]: true }))
            setFocusedId(id)
            // Defer scroll until after render.
            setTimeout(() => {
                const el = document.getElementById(`item-${id}`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 100)
        }
        applyHash()
        window.addEventListener('hashchange', applyHash)
        return () => window.removeEventListener('hashchange', applyHash)
    }, [])

    // ── Keyboard shortcuts: j/k navigate, e expand, / focus search, Esc ─

    useEffect(() => {
        if (typeof window === 'undefined') return
        function onKey(e) {
            const target = e.target
            const isTyping = target?.tagName === 'INPUT' ||
                target?.tagName === 'TEXTAREA' ||
                target?.isContentEditable
            // Esc always works — even from inside the search input.
            if (e.key === 'Escape') {
                if (search) {
                    setSearch('')
                    e.preventDefault()
                    return
                }
                if (target?.blur) target.blur()
                return
            }
            // / focuses search regardless of where focus is (unless typing).
            if (e.key === '/' && !isTyping) {
                e.preventDefault()
                searchInputRef.current?.focus()
                searchInputRef.current?.select()
                return
            }
            if (isTyping) return
            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault()
                setFocusedId(prev => {
                    const idx = visibleList.findIndex(i => i.id === prev)
                    const next = visibleList[Math.min(idx + 1, visibleList.length - 1)]
                    if (next) {
                        setTimeout(() => {
                            document.getElementById(`item-${next.id}`)?.scrollIntoView({
                                behavior: 'smooth', block: 'nearest',
                            })
                        }, 0)
                        return next.id
                    }
                    return prev
                })
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault()
                setFocusedId(prev => {
                    const idx = visibleList.findIndex(i => i.id === prev)
                    const next = visibleList[Math.max(idx - 1, 0)]
                    if (next) {
                        setTimeout(() => {
                            document.getElementById(`item-${next.id}`)?.scrollIntoView({
                                behavior: 'smooth', block: 'nearest',
                            })
                        }, 0)
                        return next.id
                    }
                    return prev
                })
            } else if (e.key === 'e' && focusedId) {
                e.preventDefault()
                toggleExpanded(focusedId)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [visibleList, focusedId, search, toggleExpanded])

    return (
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">

            {/* ── Header + velocity strip ───────────────────────────── */}
            <div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Product Roadmap
                </h1>
                <p className="text-sm text-text-tertiary max-w-2xl leading-relaxed">
                    Everything we&rsquo;re building, queued, or considering. Items move left to right
                    through phases as they get prioritized. Items marked 🔬 cite published research.
                    {' '}<KeyHints />
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
                    <VelocityTile label={`Shipped (last ${VELOCITY_WINDOW_DAYS}d)`} value={shippedRecentCount} color="text-purple-300" bg="bg-purple-400/10" />
                    <VelocityTile label="Total shipped" value={shippedCount} color="text-purple-300" bg="bg-purple-400/10" />
                    <VelocityTile label="In progress" value={inProgressCount} color="text-success-fg" bg="bg-success-soft" />
                    <VelocityTile label="Planned" value={plannedCount} color="text-brand-fg-soft" bg="bg-brand-soft" />
                    <VelocityTile label="Research-backed" value={researchBacked} color="text-purple-400" bg="bg-purple-400/10" />
                </div>
            </div>

            {/* ── Focus this week — NOW phase highlight ─────────────── */}
            <FocusStrip
                items={focusItems}
                onJump={(id) => {
                    setFocusedId(id)
                    setExpandedItems(prev => ({ ...prev, [id]: true }))
                    if (typeof window !== 'undefined') {
                        window.history.replaceState(null, '', `#item-${id}`)
                        setTimeout(() => {
                            document.getElementById(`item-${id}`)?.scrollIntoView({
                                behavior: 'smooth', block: 'center',
                            })
                        }, 50)
                    }
                }}
            />

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <FilterBar
                search={search}
                onSearch={setSearch}
                searchInputRef={searchInputRef}
                phases={phases}
                onPhasesChange={setPhases}
                themes={themes}
                onThemesChange={setThemes}
                priority={priority}
                onPriorityChange={setPriority}
                effort={effort}
                onEffortChange={setEffort}
                showDone={showDone}
                onToggleDone={() => setShowDone(v => !v)}
                shippedCount={shippedCount}
                onClearAll={clearAll}
                anyFilterActive={anyFilterActive}
                density={density}
                onDensityChange={setDensity}
            />

            {anyFilterActive && (
                <p className="text-xs text-text-disabled">
                    Showing {filtered.length} of {ROADMAP_ITEMS.length} items
                </p>
            )}

            {/* ── Grouped by phase ──────────────────────────────────── */}
            <div className="space-y-8">
                {[...PHASES_ORDER, 'DONE'].map(phase => {
                    const items = grouped[phase]
                    if (!items || items.length === 0) return null
                    return (
                        <PhaseGroup
                            key={phase}
                            phase={phase}
                            items={items}
                            stats={phaseStats[phase]}
                            density={density}
                            searchQuery={search.trim()}
                            expandedItems={expandedItems}
                            onToggleExpanded={toggleExpanded}
                            focusedId={focusedId}
                        />
                    )
                })}

                {filtered.length === 0 && (
                    <div className="bg-surface-1 border border-border-default rounded-xl p-10 text-center">
                        <p className="text-text-disabled text-sm">
                            No items match the current filters.
                        </p>
                    </div>
                )}
            </div>

            {/* ── Footer ────────────────────────────────────────────── */}
            <div className="p-4 bg-surface-1 border border-border-default rounded-xl">
                <p className="text-xs text-text-tertiary leading-relaxed">
                    <span className="font-bold text-text-secondary">How this roadmap works: </span>
                    Items move through phases as they get prioritized. When an item ships, its
                    <code className="text-brand-fg-soft bg-brand-soft px-1 rounded text-[11px] mx-1">phase</code>
                    flips to <code className="text-purple-300 bg-purple-400/10 px-1 rounded text-[11px]">DONE</code>
                    and a <code className="text-brand-fg-soft bg-brand-soft px-1 rounded text-[11px] mx-1">shippedAt</code>
                    date is added — nothing is deleted. Edit
                    <code className="text-brand-fg-soft bg-brand-soft px-1 rounded text-[11px] mx-1">ROADMAP_ITEMS</code>
                    in <code className="text-brand-fg-soft bg-brand-soft px-1 rounded text-[11px]">roadmap/roadmapData.js</code>.
                </p>
            </div>
        </div>
    )
}

// ── Velocity tile (top strip) ─────────────────────────────────────────
function VelocityTile({ label, value, color, bg }) {
    return (
        <div className={cn('rounded-xl border p-3 text-center', bg)}>
            <div className={cn('text-2xl font-extrabold font-mono leading-none', color)}>
                {value}
            </div>
            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-1">
                {label}
            </div>
        </div>
    )
}

// ── Keyboard-shortcut hints ───────────────────────────────────────────
function KeyHints() {
    return (
        <span className="inline-flex flex-wrap items-center gap-1 text-text-disabled">
            <Kbd>/</Kbd> search
            <span>·</span>
            <Kbd>j</Kbd>/<Kbd>k</Kbd> nav
            <span>·</span>
            <Kbd>e</Kbd> expand
            <span>·</span>
            <Kbd>Esc</Kbd> clear
        </span>
    )
}
function Kbd({ children }) {
    return (
        <kbd className="font-mono text-[10px] px-1.5 py-px rounded border border-border-default bg-surface-3 text-text-tertiary">
            {children}
        </kbd>
    )
}

// ── Focus strip — NOW phase items as a "what to do this week" list ────
function FocusStrip({ items, onJump }) {
    if (items.length === 0) return null
    const totalEffortLabel = items.length === 1 ? '1 item' : `${items.length} items`
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-success-soft/40 border border-success-line rounded-2xl p-4"
        >
            <div className="flex items-center gap-2 mb-3">
                <span className="text-base">⚡</span>
                <h2 className="text-xs font-extrabold text-success-fg uppercase tracking-widest">
                    Focus this week
                </h2>
                <span className="text-[10px] text-text-disabled">· {totalEffortLabel}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onJump(item.id)}
                        className="text-left flex items-start gap-2 px-3 py-2 rounded-lg
                                   bg-surface-1 border border-border-default
                                   hover:border-success-line hover:bg-success-soft/20
                                   transition-colors"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', PRIORITY_CONFIG[item.priority]?.color)}>
                                    {item.priority}
                                </span>
                                <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', EFFORT_CONFIG[item.effort]?.color)}>
                                    {EFFORT_CONFIG[item.effort]?.label}
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-text-primary truncate">
                                {item.title}
                            </p>
                        </div>
                        <span className="text-text-disabled text-xs mt-0.5">→</span>
                    </button>
                ))}
            </div>
        </motion.div>
    )
}

// ── Phase group (heading + card list) ─────────────────────────────────
function PhaseGroup({ phase, items, stats, density, searchQuery, expandedItems, onToggleExpanded, focusedId }) {
    // Collapsed by default for: DONE OR groups with > AUTO_COLLAPSE_THRESHOLD items.
    const [collapsed, setCollapsed] = useState(
        phase === 'DONE' || items.length > AUTO_COLLAPSE_THRESHOLD,
    )
    const config = PHASE_CONFIG[phase]

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'border border-l-2 border-border-default rounded-xl overflow-hidden',
                config.borderLeft,
            )}
        >
            <button
                type="button"
                onClick={() => setCollapsed(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 transition-colors"
            >
                <span className="text-lg">{config.icon}</span>
                <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className={cn('text-sm font-extrabold', config.textColor)}>
                            {config.label}
                        </h2>
                        <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', config.badge)}>
                            {stats.count}
                        </span>
                        <span className="text-[10px] text-text-disabled">·</span>
                        <span className="text-[10px] text-text-disabled">{config.sublabel}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {stats.hi > 0 && (
                            <span className="text-[10px] font-semibold text-danger-fg">
                                {stats.hi} HIGH
                            </span>
                        )}
                        {stats.med > 0 && (
                            <span className="text-[10px] font-semibold text-warning-fg">
                                · {stats.med} MED
                            </span>
                        )}
                        {stats.lo > 0 && (
                            <span className="text-[10px] font-semibold text-info-fg">
                                · {stats.lo} LOW
                            </span>
                        )}
                        {stats.research > 0 && (
                            <span className="text-[10px] font-semibold text-purple-400">
                                · {stats.research} 🔬
                            </span>
                        )}
                        <span className="text-[10px] text-text-disabled hidden sm:inline">
                            · {config.description}
                        </span>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: collapsed ? 0 : 180 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-disabled"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>

            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0 space-y-2">
                            {items.map((item, i) => (
                                <RoadmapCard
                                    key={item.id}
                                    item={item}
                                    index={i}
                                    density={density}
                                    searchQuery={searchQuery}
                                    expanded={!!expandedItems[item.id]}
                                    onToggle={() => onToggleExpanded(item.id)}
                                    focused={focusedId === item.id}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
