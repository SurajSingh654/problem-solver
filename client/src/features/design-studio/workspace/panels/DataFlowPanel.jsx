import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'

// ══════════════════════════════════════════════════════════════════════════
// DATA FLOW DESCRIPTION PANEL
// ══════════════════════════════════════════════════════════════════════════
// AI cannot see the visual diagram. It reads componentAnnotations + this
// dataFlowDescription to understand architecture. Without a value here, every
// AI prompt loses that context.
export default function DataFlowPanel({ value, onChange, isCollapsed, onToggle, isReadOnly = false }) {
    const preview = (value || '').trim().slice(0, 60)
    return (
        <div className="border-t border-border-default">
            <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-2/50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">🔀</span>
                    <span className="text-xs font-bold text-text-primary">Data Flow</span>
                    {!!preview && (
                        <span className="text-[10px] text-text-disabled truncate max-w-[280px]">
                            — {preview}{(value || '').length > 60 ? '…' : ''}
                        </span>
                    )}
                    {!preview && (
                        <span className="text-[10px] text-text-disabled italic">empty · AI can&apos;t trace your architecture without this</span>
                    )}
                </div>
                <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </motion.div>
            </button>
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 space-y-2">
                            <p className="text-[10px] text-text-disabled">
                                Describe how data flows through your architecture. Example: &ldquo;Client → LB → Chat Service → Kafka → Worker → Cassandra. Reads go Client → LB → Chat Service → Redis (hit) or Cassandra (miss).&rdquo;
                            </p>
                            <textarea
                                rows={4}
                                value={value || ''}
                                onChange={e => onChange(e.target.value)}
                                readOnly={isReadOnly}
                                placeholder={isReadOnly ? '(no data flow described)' : 'Walk a request through your components, step by step. Mention where caching, async queues, and failure handling kick in.'}
                                className={cn(
                                    'w-full bg-surface-3 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-3 py-2 outline-none resize-y leading-relaxed focus:border-brand-line focus:ring-2 focus:ring-brand-400/20',
                                    isReadOnly && 'cursor-default opacity-80'
                                )}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
