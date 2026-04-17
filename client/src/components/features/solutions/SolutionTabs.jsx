import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CodeEditor } from '@components/ui/CodeEditor'
import { RichTextEditor } from '@components/ui/RichTextEditor'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'

const SOLUTION_TYPES = [
    { id: 'BRUTE_FORCE', label: 'Brute Force', icon: '🐌', color: 'text-warning' },
    { id: 'OPTIMIZED', label: 'Optimized', icon: '⚡', color: 'text-brand-300' },
    { id: 'ALTERNATIVE', label: 'Alternative', icon: '🔄', color: 'text-info' },
]

const COMPLEXITY_SUGGESTIONS = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)', 'O(2ⁿ)', 'O(n!)']

// ── Complexity chip selector ───────────────────────────
function ComplexityField({ label, icon, value, onChange }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs">{icon}</span>
                <span className="text-xs font-semibold text-text-secondary">{label}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    type="text"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="e.g. O(n)"
                    className="w-24 bg-surface-3 border border-border-strong rounded-lg
                     text-xs font-mono text-text-primary placeholder:text-text-tertiary
                     px-2.5 py-1.5 outline-none
                     focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20
                     transition-all duration-150"
                />
                <div className="flex flex-wrap gap-1">
                    {COMPLEXITY_SUGGESTIONS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onChange(s)}
                            className={cn(
                                'text-[10px] font-mono px-1.5 py-0.5 rounded-md border transition-all',
                                value === s
                                    ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                    : 'bg-surface-3 border-border-subtle text-text-disabled hover:text-text-tertiary hover:border-border-default'
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Single solution tab content ────────────────────────
function SolutionPanel({ solution, index, onChange, onRemove, canRemove }) {

    function update(field, value) {
        onChange(index, { ...solution, [field]: value })
    }

    return (
        <div className="space-y-5">
            {/* Solution type selector */}
            <div>
                <span className="text-xs font-semibold text-text-secondary block mb-2">
                    Solution Type
                </span>
                <div className="flex gap-2">
                    {SOLUTION_TYPES.map(type => (
                        <button
                            key={type.id}
                            type="button"
                            onClick={() => update('type', type.id)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-xl border',
                                'text-xs font-semibold transition-all duration-150',
                                solution.type === type.id
                                    ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                    : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary'
                            )}
                        >
                            <span>{type.icon}</span>
                            {type.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Approach description */}
            <RichTextEditor
                label="Approach"
                hint="Describe your approach — what data structures, what algorithm, what trade-offs?"
                placeholder="Explain your approach step by step..."
                content={solution.approach || ''}
                onChange={val => update('approach', val)}
                minHeight="100px"
            />

            {/* Complexity */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-surface-2 border border-border-default rounded-xl">
                <ComplexityField
                    label="Time Complexity"
                    icon="⏱"
                    value={solution.timeComplexity || ''}
                    onChange={val => update('timeComplexity', val)}
                />
                <ComplexityField
                    label="Space Complexity"
                    icon="💾"
                    value={solution.spaceComplexity || ''}
                    onChange={val => update('spaceComplexity', val)}
                />
            </div>

            {/* Code editor */}
            <CodeEditor
                label="Code"
                optional
                hint="Paste your accepted solution code"
                code={solution.code || ''}
                onChange={val => update('code', val)}
                language={solution.language || 'PYTHON'}
                onLanguageChange={val => update('language', val)}
                height="280px"
            />

            {/* Remove button */}
            {canRemove && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="flex items-center gap-1.5 text-xs text-text-disabled
                       hover:text-danger transition-colors px-2 py-1 rounded-lg
                       hover:bg-danger/8"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                        Remove this solution
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Main SolutionTabs component ────────────────────────
export function SolutionTabs({ solutions = [], onChange, commonNotes, onNotesChange }) {
    const [activeTab, setActiveTab] = useState(0)

    function addSolution() {
        const newSol = {
            type: 'OPTIMIZED',
            approach: '',
            timeComplexity: '',
            spaceComplexity: '',
            code: '',
            language: localStorage.getItem('ps_last_language') || 'PYTHON',
        }
        onChange([...solutions, newSol])
        setActiveTab(solutions.length)
    }

    function removeSolution(index) {
        const updated = solutions.filter((_, i) => i !== index)
        onChange(updated)
        if (activeTab >= updated.length) {
            setActiveTab(Math.max(0, updated.length - 1))
        }
    }

    function updateSolution(index, newSol) {
        const updated = solutions.map((s, i) => i === index ? newSol : s)
        onChange(updated)
    }

    // Ensure at least one solution
    if (solutions.length === 0) {
        const defaultSol = [{
            type: 'BRUTE_FORCE',
            approach: '',
            timeComplexity: '',
            spaceComplexity: '',
            code: '',
            language: localStorage.getItem('ps_last_language') || 'PYTHON',
        }]
        onChange(defaultSol)
        return null
    }

    const typeInfo = SOLUTION_TYPES.find(t => t.id === solutions[activeTab]?.type) || SOLUTION_TYPES[1]

    return (
        <div className="space-y-5">
            {/* Tab bar */}
            <div className="flex items-center gap-2 flex-wrap">
                {solutions.map((sol, i) => {
                    const type = SOLUTION_TYPES.find(t => t.id === sol.type) || SOLUTION_TYPES[1]
                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setActiveTab(i)}
                            className={cn(
                                'flex items-center gap-2 px-3.5 py-2 rounded-xl border',
                                'text-xs font-semibold transition-all duration-150',
                                activeTab === i
                                    ? 'bg-brand-400/12 border-brand-400/35 text-brand-300 shadow-sm'
                                    : 'bg-surface-2 border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary'
                            )}
                        >
                            <span>{type.icon}</span>
                            Solution {i + 1}
                            {sol.type && (
                                <span className={cn(
                                    'text-[10px] px-1.5 py-px rounded-full border',
                                    activeTab === i
                                        ? 'bg-brand-400/15 border-brand-400/25'
                                        : 'bg-surface-3 border-border-subtle'
                                )}>
                                    {type.label}
                                </span>
                            )}
                        </button>
                    )
                })}

                {/* Add solution button */}
                {solutions.length < 5 && (
                    <button
                        type="button"
                        onClick={addSolution}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl
                       border border-dashed border-border-strong
                       text-xs font-semibold text-text-disabled
                       hover:border-brand-400/40 hover:text-brand-300
                       transition-all duration-150"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Solution
                    </button>
                )}
            </div>

            {/* Active solution panel */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                {/* Solution header */}
                <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border-default">
                    <span className="text-xl">{typeInfo.icon}</span>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary">
                            Solution {activeTab + 1}
                        </h3>
                        <p className="text-xs text-text-tertiary">
                            {typeInfo.label} approach
                        </p>
                    </div>
                </div>

                <SolutionPanel
                    solution={solutions[activeTab]}
                    index={activeTab}
                    onChange={updateSolution}
                    onRemove={removeSolution}
                    canRemove={solutions.length > 1}
                />
            </div>

            {/* Common notes */}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
                <RichTextEditor
                    label="Notes"
                    optional
                    hint="General notes, observations, things to remember — shared across all solutions"
                    placeholder="Any additional notes about this problem..."
                    content={commonNotes || ''}
                    onChange={onNotesChange}
                    minHeight="100px"
                />
            </div>
        </div>
    )
}