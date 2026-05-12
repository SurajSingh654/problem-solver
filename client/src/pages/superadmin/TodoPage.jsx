// ============================================================================
// ProbSolver — Product Roadmap (SUPER_ADMIN)
// ============================================================================
//
// Single filtered view. Phase/theme are multi-select chips; priority and
// effort are single-select. DONE (shipped) items are hidden by default
// behind a "Show shipped" toggle so they don't dilute attention on what's
// still ahead — but every shipped item carries a shippedAt date and is
// counted in the velocity header.
//
// Data + configs live in ./roadmap/roadmapData.js. The page is deliberately
// thin — it's state + layout. Card rendering is in ./roadmap/RoadmapCard;
// filter chips are in ./roadmap/FilterBar.
// ============================================================================
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    ROADMAP_ITEMS,
    PHASE_CONFIG,
    PHASES_ORDER,
} from './roadmap/roadmapData'
import { RoadmapCard } from './roadmap/RoadmapCard'
import { FilterBar } from './roadmap/FilterBar'

// Items shipped within this many days count toward the "shipped recently"
// counter at the top. 30 days is a natural product-velocity horizon.
const VELOCITY_WINDOW_DAYS = 30

function countShippedWithin(items, days) {
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000
    return items.filter(
        i => i.phase === 'DONE' && i.shippedAt && new Date(i.shippedAt).getTime() >= threshold,
    ).length
}

export default function TodoPage() {
    const [phases, setPhases] = useState([])       // multi-select — empty = all
    const [themes, setThemes] = useState([])       // multi-select — empty = all
    const [priority, setPriority] = useState('All')
    const [effort, setEffort] = useState('All')
    const [search, setSearch] = useState('')
    const [showDone, setShowDone] = useState(false)

    // ── Derived ─────────────────────────────────────────────────────────

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

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return ROADMAP_ITEMS.filter(item => {
            // DONE visibility gate
            if (item.phase === 'DONE' && !showDone) return false
            // If user has explicit phase filter and the item isn't in it, drop it
            if (phases.length > 0 && !phases.includes(item.phase)) return false
            if (themes.length > 0 && !themes.includes(item.theme)) return false
            if (priority !== 'All' && item.priority !== priority) return false
            if (effort !== 'All' && item.effort !== effort) return false
            if (q && !item.title.toLowerCase().includes(q) && !item.impact.toLowerCase().includes(q)) return false
            return true
        })
    }, [phases, themes, priority, effort, search, showDone])

    // Group filtered items by phase for the main grid. Include DONE at the
    // end if it's being shown.
    const grouped = useMemo(() => {
        const g = {}
        for (const phase of PHASES_ORDER) g[phase] = []
        g.DONE = []
        for (const item of filtered) {
            if (g[item.phase]) g[item.phase].push(item)
        }
        return g
    }, [filtered])

    return (
        <div className="p-6 max-w-[1400px] mx-auto space-y-6">

            {/* ── Header + velocity strip ───────────────────────────── */}
            <div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Product Roadmap
                </h1>
                <p className="text-sm text-text-tertiary max-w-2xl leading-relaxed">
                    Everything we're building, queued, or considering. Items move left to right
                    through phases as they get prioritized. Every decision is grounded in how engineers
                    actually learn and perform under pressure — items marked 🔬 cite published research.
                </p>

                {/* Velocity strip */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
                    <VelocityTile
                        label={`Shipped (last ${VELOCITY_WINDOW_DAYS}d)`}
                        value={shippedRecentCount}
                        color="text-purple-300"
                        bg="bg-purple-400/10"
                    />
                    <VelocityTile
                        label="Total shipped"
                        value={shippedCount}
                        color="text-purple-300"
                        bg="bg-purple-400/10"
                    />
                    <VelocityTile
                        label="In progress"
                        value={inProgressCount}
                        color="text-success-fg"
                        bg="bg-success-soft"
                    />
                    <VelocityTile
                        label="Planned"
                        value={plannedCount}
                        color="text-brand-fg-soft"
                        bg="bg-brand-soft"
                    />
                    <VelocityTile
                        label="Research-backed"
                        value={researchBacked}
                        color="text-purple-400"
                        bg="bg-purple-400/10"
                    />
                </div>
            </div>

            {/* ── Filter bar ─────────────────────────────────────────── */}
            <FilterBar
                search={search}
                onSearch={setSearch}
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
            />

            {/* ── Results count ──────────────────────────────────────── */}
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
                    return <PhaseGroup key={phase} phase={phase} items={items} />
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

// ── Phase group (heading + card list) ─────────────────────────────────
function PhaseGroup({ phase, items }) {
    const [collapsed, setCollapsed] = useState(phase === 'DONE') // DONE collapses by default when shown
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
                <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                        <h2 className={cn('text-sm font-extrabold', config.textColor)}>
                            {config.label}
                        </h2>
                        <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', config.badge)}>
                            {items.length}
                        </span>
                    </div>
                    <p className="text-[10px] text-text-disabled">
                        {config.sublabel} · {config.description}
                    </p>
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
                                <RoadmapCard key={item.id} item={item} index={i} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
