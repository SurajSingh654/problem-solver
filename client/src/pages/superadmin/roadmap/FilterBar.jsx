// ============================================================================
// FilterBar — search + phase/theme multi-select + priority/effort single
// ----------------------------------------------------------------------------
// `searchInputRef` is forwarded so the page-level `/` keyboard shortcut can
// focus the input. `density` toggles compact/comfortable card mode.
// ============================================================================
import { cn } from '@utils/cn'
import { PHASE_CONFIG, THEME_CONFIG, PRIORITY_CONFIG, EFFORT_CONFIG } from './roadmapData'

function TogglePill({ active, onClick, children, className }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                active
                    ? className || 'bg-brand-soft border-brand-line text-brand-fg-soft'
                    : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary',
            )}
        >
            {children}
        </button>
    )
}

export function FilterBar({
    search, onSearch,
    searchInputRef,
    phases, onPhasesChange,
    themes, onThemesChange,
    priority, onPriorityChange,
    effort, onEffortChange,
    showDone, onToggleDone,
    shippedCount,
    onClearAll,
    anyFilterActive,
    density, onDensityChange,
}) {
    function togglePhase(phase) {
        onPhasesChange(phases.includes(phase)
            ? phases.filter(p => p !== phase)
            : [...phases, phase])
    }
    function toggleTheme(theme) {
        onThemesChange(themes.includes(theme)
            ? themes.filter(t => t !== theme)
            : [...themes, theme])
    }

    return (
        <div className="space-y-3 bg-surface-1 border border-border-default rounded-2xl p-4">
            {/* Search + DONE toggle + density + clear */}
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={e => onSearch(e.target.value)}
                    placeholder="Search title, impact, description, notes…  (press /)"
                    className="flex-1 min-w-[200px] bg-surface-3 border border-border-default rounded-xl
                               text-sm text-text-primary placeholder:text-text-disabled
                               px-3.5 py-2 outline-none
                               focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                />
                <button
                    type="button"
                    onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
                    title={density === 'compact' ? 'Switch to comfortable view' : 'Switch to compact view'}
                    className={cn(
                        'text-xs font-semibold px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5',
                        'bg-surface-3 border-border-default text-text-tertiary hover:text-text-primary',
                    )}
                >
                    <span>{density === 'compact' ? '☰' : '≡'}</span>
                    <span className="hidden sm:inline">
                        {density === 'compact' ? 'Compact' : 'Comfortable'}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={onToggleDone}
                    className={cn(
                        'text-xs font-semibold px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5',
                        showDone
                            ? 'bg-purple-400/10 border-purple-400/25 text-purple-300'
                            : 'bg-surface-3 border-border-default text-text-tertiary hover:text-text-primary',
                    )}
                >
                    <span>✅</span>
                    <span>{showDone ? 'Hide' : 'Show'} shipped</span>
                    <span className="text-text-disabled">({shippedCount})</span>
                </button>
                {anyFilterActive && (
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="text-xs font-semibold text-danger-fg hover:text-danger-fg/80 transition-colors px-2"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* Phase multi-select */}
            <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-text-disabled mr-1">Phase:</span>
                {Object.keys(PHASE_CONFIG)
                    .filter(p => p !== 'DONE')
                    .map(phase => {
                        const config = PHASE_CONFIG[phase]
                        const active = phases.includes(phase)
                        return (
                            <TogglePill
                                key={phase}
                                active={active}
                                onClick={() => togglePhase(phase)}
                                className={config.badge}
                            >
                                <span className="mr-1">{config.icon}</span>
                                {config.label}
                            </TogglePill>
                        )
                    })}
            </div>

            {/* Theme multi-select */}
            <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-text-disabled mr-1">Theme:</span>
                {Object.entries(THEME_CONFIG).map(([theme, cfg]) => {
                    const active = themes.includes(theme)
                    return (
                        <TogglePill
                            key={theme}
                            active={active}
                            onClick={() => toggleTheme(theme)}
                            className={cfg.bg + ' ' + cfg.color}
                        >
                            <span className="mr-1">{cfg.icon}</span>
                            {theme}
                        </TogglePill>
                    )
                })}
            </div>

            {/* Priority + Effort single-select */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-text-disabled mr-1">Priority:</span>
                    {['All', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
                        <TogglePill
                            key={p}
                            active={priority === p}
                            onClick={() => onPriorityChange(p)}
                            className={p !== 'All' ? PRIORITY_CONFIG[p].color : undefined}
                        >
                            {p}
                        </TogglePill>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-text-disabled mr-1">Effort:</span>
                    {['All', 'Small', 'Medium', 'Large', 'XLarge'].map(e => (
                        <TogglePill
                            key={e}
                            active={effort === e}
                            onClick={() => onEffortChange(e)}
                            className={e !== 'All' ? EFFORT_CONFIG[e].color : undefined}
                        >
                            {e === 'XLarge' ? 'X-Large' : e}
                        </TogglePill>
                    ))}
                </div>
            </div>
        </div>
    )
}
