import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }
const DIFF_COLORS = {
    EASY: 'bg-success/12  border-success/30  text-success',
    MEDIUM: 'bg-warning/12  border-warning/30  text-warning',
    HARD: 'bg-danger/12   border-danger/30   text-danger',
}

function FollowUpRow({ fq, index, total, onChange, onRemove, onMove }) {
    const [expanded, setExpanded] = useState(true)

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="bg-surface-2 border border-border-default rounded-xl overflow-hidden"
        >
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-1/50">
                {/* Drag handle / order */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onMove(index, index - 1)}
                        className="text-text-disabled hover:text-text-primary
                       disabled:opacity-30 transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="18 15 12 9 6 15" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        disabled={index === total - 1}
                        onClick={() => onMove(index, index + 1)}
                        className="text-text-disabled hover:text-text-primary
                       disabled:opacity-30 transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>

                <span className="w-5 h-5 rounded-full bg-surface-3 border border-border-default
                         flex items-center justify-center text-[11px] font-bold
                         text-text-disabled flex-shrink-0">
                    {index + 1}
                </span>

                <p className="flex-1 text-sm font-medium text-text-primary truncate">
                    {fq.question || (
                        <span className="text-text-disabled italic">Untitled question</span>
                    )}
                </p>

                {/* Difficulty pill */}
                <span className={cn(
                    'text-[10px] font-bold px-2 py-px rounded-full border flex-shrink-0',
                    DIFF_COLORS[fq.difficulty] || DIFF_COLORS.MEDIUM
                )}>
                    {fq.difficulty}
                </span>

                {/* Expand toggle */}
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                >
                    <motion.div
                        animate={{ rotate: expanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </motion.div>
                </button>

                {/* Remove */}
                <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="text-text-disabled hover:text-danger transition-colors flex-shrink-0"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                </button>
            </div>

            {/* Expanded fields */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-3 space-y-3">
                            {/* Question */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                    Question
                                </label>
                                <textarea
                                    rows={2}
                                    value={fq.question}
                                    onChange={e => onChange(index, 'question', e.target.value)}
                                    placeholder="e.g. What if the array is sorted? Can you improve to O(log n)?"
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                             text-sm text-text-primary placeholder:text-text-tertiary
                             px-3 py-2 outline-none resize-none
                             focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>

                            {/* Difficulty */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                    Difficulty
                                </label>
                                <div className="flex gap-2">
                                    {['EASY', 'MEDIUM', 'HARD'].map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => onChange(index, 'difficulty', d)}
                                            className={cn(
                                                'px-3 py-1.5 rounded-lg border text-xs font-bold transition-all',
                                                fq.difficulty === d
                                                    ? DIFF_COLORS[d]
                                                    : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                            )}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Hint */}
                            <div>
                                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                                    Hint
                                    <span className="ml-1.5 font-normal text-text-disabled">optional</span>
                                </label>
                                <input
                                    type="text"
                                    value={fq.hint || ''}
                                    onChange={e => onChange(index, 'hint', e.target.value)}
                                    placeholder="A nudge in the right direction…"
                                    className="w-full bg-surface-3 border border-border-strong rounded-xl
                             text-sm text-text-primary placeholder:text-text-tertiary
                             px-3 py-2 outline-none
                             focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export function FollowUpBuilder({ value = [], onChange }) {
    function add() {
        onChange([...value, { question: '', difficulty: 'MEDIUM', hint: '' }])
    }

    function remove(index) {
        onChange(value.filter((_, i) => i !== index))
    }

    function update(index, field, val) {
        const updated = value.map((fq, i) =>
            i === index ? { ...fq, [field]: val } : fq
        )
        onChange(updated)
    }

    function move(from, to) {
        const arr = [...value]
        const [item] = arr.splice(from, 1)
        arr.splice(to, 0, item)
        onChange(arr)
    }

    return (
        <div className="space-y-2">
            <AnimatePresence mode="popLayout">
                {value.map((fq, i) => (
                    <FollowUpRow
                        key={i}
                        fq={fq}
                        index={i}
                        total={value.length}
                        onChange={update}
                        onRemove={remove}
                        onMove={move}
                    />
                ))}
            </AnimatePresence>

            <button
                type="button"
                onClick={add}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                   border border-dashed border-border-strong text-text-tertiary
                   hover:border-brand-400/50 hover:text-brand-300
                   text-sm font-semibold transition-all duration-150"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Follow-up Question
            </button>
        </div>
    )
}