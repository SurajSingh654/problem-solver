import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'

export function ChipInput({
    label,
    hint,
    value = [],
    onChange,
    placeholder = 'Type and press Enter…',
    suggestions = [],
    max,
    className,
}) {
    const [input, setInput] = useState('')
    const [focused, setFocused] = useState(false)
    const inputRef = useRef(null)

    const filtered = input.trim() && suggestions.length
        ? suggestions
            .filter(s =>
                s.toLowerCase().includes(input.toLowerCase()) &&
                !value.includes(s)
            )
            .slice(0, 8)
        : []

    function add(val) {
        const trimmed = val.trim()
        if (!trimmed) return
        if (value.includes(trimmed)) return
        if (max && value.length >= max) return
        onChange([...value, trimmed])
        setInput('')
    }

    function remove(chip) {
        onChange(value.filter(v => v !== chip))
    }

    function onKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault()
            add(input)
        } else if (e.key === 'Backspace' && !input && value.length) {
            remove(value[value.length - 1])
        }
    }

    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-semibold text-text-primary mb-1.5">
                    {label}
                    {max && (
                        <span className="ml-1.5 text-xs font-normal text-text-disabled">
                            max {max}
                        </span>
                    )}
                </label>
            )}
            {hint && <p className="text-xs text-text-tertiary mb-2">{hint}</p>}

            <div
                onClick={() => inputRef.current?.focus()}
                className={cn(
                    'min-h-[44px] w-full bg-surface-3 border rounded-xl',
                    'px-3 py-2 flex flex-wrap gap-1.5 cursor-text',
                    'transition-all duration-150',
                    focused
                        ? 'border-brand-400 ring-2 ring-brand-400/20'
                        : 'border-border-strong'
                )}
            >
                {/* Chips */}
                <AnimatePresence initial={false}>
                    {value.map(chip => (
                        <motion.span
                            key={chip}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.12 }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg
                         bg-brand-400/15 border border-brand-400/30
                         text-xs font-semibold text-brand-300"
                        >
                            {chip}
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); remove(chip) }}
                                className="hover:text-danger transition-colors ml-0.5"
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="3"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </motion.span>
                    ))}
                </AnimatePresence>

                {/* Input */}
                {(!max || value.length < max) && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={() => setFocused(true)}
                        onBlur={() => { setFocused(false); setInput('') }}
                        placeholder={value.length === 0 ? placeholder : ''}
                        className="flex-1 min-w-[120px] bg-transparent outline-none
                       text-sm text-text-primary placeholder:text-text-tertiary"
                    />
                )}
            </div>

            {/* Suggestions dropdown */}
            <AnimatePresence>
                {focused && filtered.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="mt-1 bg-surface-2 border border-border-strong rounded-xl
                       overflow-hidden shadow-lg z-dropdown relative"
                    >
                        {filtered.map(s => (
                            <button
                                key={s}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); add(s) }}
                                className="w-full text-left px-4 py-2.5 text-sm
                           text-text-secondary hover:bg-surface-3
                           hover:text-text-primary transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}