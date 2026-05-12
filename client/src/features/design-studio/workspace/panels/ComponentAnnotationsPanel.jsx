import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT ANNOTATIONS PANEL
// ══════════════════════════════════════════════════════════════════════════
export default function ComponentAnnotationsPanel({ annotations, onChange, isCollapsed, onToggle, isReadOnly = false }) {
    const [newName, setNewName] = useState('')

    function addComponent() {
        if (!newName.trim() || isReadOnly) return
        onChange([...(annotations || []), { componentName: newName.trim(), purpose: '', technology: '', notes: '' }])
        setNewName('')
    }
    function updateComponent(i, field, value) {
        if (isReadOnly) return
        const updated = [...(annotations || [])]; updated[i] = { ...updated[i], [field]: value }; onChange(updated)
    }
    function removeComponent(i) { if (!isReadOnly) onChange((annotations || []).filter((_, idx) => idx !== i)) }

    return (
        <div className="border-t border-border-default">
            <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-2/50 transition-colors">
                <div className="flex items-center gap-2">
                    <span className="text-sm">🧩</span>
                    <span className="text-xs font-bold text-text-primary">Component Annotations</span>
                    <span className="text-[10px] text-text-disabled">({(annotations || []).length})</span>
                </div>
                <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </motion.div>
            </button>
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 space-y-2">
                            <p className="text-[10px] text-text-disabled">Annotate components so AI understands your architecture</p>
                            {(annotations || []).map((comp, i) => (
                                <div key={i} className="bg-surface-2 border border-border-subtle rounded-lg p-2.5 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-text-primary">{comp.componentName}</span>
                                        {!isReadOnly && (
                                            <button onClick={() => removeComponent(i)} className="text-text-disabled hover:text-danger-fg text-[10px]">✕</button>
                                        )}
                                    </div>
                                    <input type="text" value={comp.purpose} onChange={e => updateComponent(i, 'purpose', e.target.value)} readOnly={isReadOnly} placeholder="Purpose..."
                                        className={cn('w-full bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-line', isReadOnly && 'cursor-default opacity-80')} />
                                    <div className="flex gap-1.5">
                                        <input type="text" value={comp.technology} onChange={e => updateComponent(i, 'technology', e.target.value)} readOnly={isReadOnly} placeholder="Technology..."
                                            className={cn('flex-1 bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-line', isReadOnly && 'cursor-default opacity-80')} />
                                        <input type="text" value={comp.notes} onChange={e => updateComponent(i, 'notes', e.target.value)} readOnly={isReadOnly} placeholder="Notes..."
                                            className={cn('flex-1 bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-line', isReadOnly && 'cursor-default opacity-80')} />
                                    </div>
                                </div>
                            ))}
                            {!isReadOnly && (
                                <div className="flex gap-2">
                                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') addComponent() }} placeholder="Add component..."
                                        className="flex-1 bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-line" />
                                    <button onClick={addComponent} disabled={!newName.trim()}
                                        className="text-[10px] font-bold text-brand-fg-soft px-2.5 py-1.5 bg-brand-soft border border-brand-line rounded-lg hover:bg-brand-soft transition-colors disabled:opacity-40">+ Add</button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
