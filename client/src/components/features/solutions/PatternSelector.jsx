import { useState } from 'react'
import { cn } from '@utils/cn'
import { PATTERNS } from '@utils/constants'

/**
 * Multi-select pattern picker. Used by both SubmitSolutionPage (full-size)
 * and the Review modal Recall phase (compact).
 *
 * Props:
 *   value       — string[] of currently-selected pattern labels
 *   onChange    — (string[]) => void
 *   suggestions — optional array of label strings to display as chips.
 *                 Defaults to PATTERNS.map(p => p.label).
 *   compact     — boolean. When true, tighter padding for use inside a modal.
 */
export function PatternSelector({ value, onChange, suggestions, compact = false }) {
    const [customInput, setCustomInput] = useState('')

    const items = suggestions?.length > 0
        ? suggestions
        : PATTERNS.map(p => p.label)

    function toggle(s) {
        onChange(value.includes(s)
            ? value.filter(v => v !== s)
            : [...value, s]
        )
    }

    return (
        <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {items.map(s => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => toggle(s)}
                        className={cn(
                            'text-left rounded-xl border text-xs font-semibold',
                            'transition-all duration-150 flex items-center justify-between gap-2',
                            compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
                            value.includes(s)
                                ? 'bg-brand-soft border-brand-line text-brand-fg-soft'
                                : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-line'
                        )}
                    >
                        <span>{s}</span>
                        {value.includes(s) && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="3"
                                strokeLinecap="round" strokeLinejoin="round"
                                className="flex-shrink-0">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                    </button>
                ))}
            </div>

            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {value.map(v => (
                        <span key={v}
                            className="flex items-center gap-1 text-[10px] font-bold
                                       bg-brand-soft text-brand-fg-soft border border-brand-line
                                       px-2 py-px rounded-full">
                            {v}
                            <button
                                type="button"
                                onClick={() => toggle(v)}
                                className="hover:text-brand-200 transition-colors leading-none"
                                aria-label={`Remove ${v}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && customInput.trim()) {
                        e.preventDefault()
                        const custom = customInput.trim()
                        if (!value.includes(custom)) onChange([...value, custom])
                        setCustomInput('')
                    }
                }}
                placeholder="Or type custom and press Enter..."
                className="w-full bg-surface-3 border border-border-strong rounded-xl
                           text-sm text-text-primary placeholder:text-text-tertiary
                           px-3.5 py-2 outline-none
                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
            />

            {!compact && value.length > 1 && (
                <p className="text-[10px] text-text-disabled mt-1">
                    {value.length} patterns selected
                </p>
            )}
        </div>
    )
}
