import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import {
    useSaveFlowSimulation,
    useDeleteFlowSimulation,
} from '@hooks/useDesignStudio'
import { toast } from '@store/useUIStore'
import { useConfirm } from '@hooks/useConfirm'

// ══════════════════════════════════════════════════════════════════════════
// CHUNK 2.5: FLOW SIMULATION UI
// ══════════════════════════════════════════════════════════════════════════
// Users define named request flows (e.g. "Send message", "Fetch feed") as an
// ordered sequence of hops with per-hop latency. Server computes totalLatency
// and bottleneck. Final-eval prompt reads flowSimulation[] to grade scale &
// resilience reasoning.
export default function FlowSimulationView({ session, sessionId, isReadOnly = false }) {
    const confirm = useConfirm()
    const saveFlow = useSaveFlowSimulation()
    const deleteFlow = useDeleteFlowSimulation()
    const existingFlows = session.flowSimulation || []

    const emptyHop = () => ({ from: '', to: '', latencyMs: '', payload: '', failureHandling: '' })
    const [flowName, setFlowName] = useState('')
    const [hops, setHops] = useState([emptyHop()])

    function updateHop(i, field, value) {
        setHops(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: value } : h))
    }
    function addHop() {
        if (hops.length >= 20) { toast.error('Max 20 hops per flow'); return }
        setHops(prev => [...prev, emptyHop()])
    }
    function removeHop(i) {
        if (hops.length <= 1) return
        setHops(prev => prev.filter((_, idx) => idx !== i))
    }

    async function handleSave() {
        const trimmedName = flowName.trim()
        if (!trimmedName) { toast.error('Flow name is required'); return }
        const cleanedHops = hops
            .filter(h => h.from.trim() || h.to.trim())
            .map(h => ({
                from: h.from.trim(),
                to: h.to.trim(),
                latencyMs: h.latencyMs === '' ? 0 : Math.max(0, parseInt(h.latencyMs, 10) || 0),
                payload: h.payload.trim(),
                failureHandling: h.failureHandling.trim(),
            }))
            .filter(h => h.from && h.to)
        if (cleanedHops.length === 0) { toast.error('Add at least one hop with From and To filled in'); return }

        try {
            await saveFlow.mutateAsync({ sessionId, flowName: trimmedName, hops: cleanedHops })
            setFlowName('')
            setHops([emptyHop()])
        } catch { /* toast handled by hook */ }
    }

    return (
        <div className="p-6 max-w-[900px] mx-auto space-y-6 pb-16">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div>
                <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                    <span>🔀</span> Flow Simulation
                </h2>
                <p className="text-xs text-text-tertiary mt-1">
                    Trace a request end-to-end through your architecture. Name the flow, list the hops, and annotate
                    per-hop latency and failure behaviour. The final evaluation uses these to grade scale + resilience reasoning.
                </p>
            </div>

            {/* ── Existing flows ─────────────────────────────────────────── */}
            {existingFlows.length > 0 && (
                <section>
                    <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">
                        Saved Flows ({existingFlows.length})
                    </h3>
                    <div className="space-y-3">
                        {existingFlows.map((flow, i) => (
                            <motion.div
                                key={flow.id || i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="bg-surface-1 border border-border-default rounded-2xl p-4"
                            >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-text-primary truncate">{flow.flowName}</p>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px]">
                                            <span className="text-text-disabled">
                                                {flow.hops?.length || 0} hop{flow.hops?.length === 1 ? '' : 's'}
                                            </span>
                                            <span className="font-mono text-brand-fg-soft font-bold">
                                                {flow.totalLatency ?? 0}ms total
                                            </span>
                                            {flow.bottleneck && (
                                                <span className="text-warning-fg font-semibold">
                                                    Bottleneck: {flow.bottleneck}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {!isReadOnly && flow.id && (
                                        <button
                                            onClick={async () => {
                                                const ok = await confirm({
                                                    title: `Delete flow "${flow.flowName}"?`,
                                                    description: 'This cannot be undone.',
                                                    confirmLabel: 'Delete',
                                                    danger: true,
                                                })
                                                if (ok) {
                                                    deleteFlow.mutate({ sessionId, flowId: flow.id })
                                                }
                                            }}
                                            title="Delete flow"
                                            className="text-text-disabled hover:text-danger-fg transition-colors p-1 flex-shrink-0"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    {(flow.hops || []).map((h, j) => (
                                        <div key={j} className="flex items-center gap-2 text-xs">
                                            <span className="text-text-tertiary font-mono text-[10px] w-4 text-right flex-shrink-0">
                                                {j + 1}.
                                            </span>
                                            <span className="text-text-primary font-semibold truncate">{h.from}</span>
                                            <span className="text-text-disabled flex-shrink-0">→</span>
                                            <span className="text-text-primary font-semibold truncate">{h.to}</span>
                                            {h.latencyMs > 0 && (
                                                <span className="text-[10px] font-mono text-text-tertiary bg-surface-3 border border-border-subtle rounded px-1.5 py-px flex-shrink-0">
                                                    {h.latencyMs}ms
                                                </span>
                                            )}
                                            {h.payload && (
                                                <span className="text-[10px] text-text-tertiary italic truncate hidden md:inline">
                                                    {h.payload}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── New flow builder (hidden when session is terminal) ───── */}
            {isReadOnly ? null : (
            <section className="bg-surface-1 border border-border-default rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <span className="text-base">➕</span>
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-widest">New Flow</h3>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1.5">Flow name</label>
                    <input
                        type="text"
                        value={flowName}
                        onChange={e => setFlowName(e.target.value)}
                        placeholder="e.g. Send message, Fetch feed, Upload video"
                        maxLength={100}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-disabled px-3.5 py-2.5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-text-secondary">
                            Hops ({hops.length}/20)
                        </label>
                        <button
                            type="button"
                            onClick={addHop}
                            disabled={hops.length >= 20}
                            className="text-[10px] font-bold text-brand-fg-soft px-2.5 py-1 bg-brand-soft border border-brand-line rounded-lg hover:bg-brand-soft transition-colors disabled:opacity-40"
                        >
                            + Add Hop
                        </button>
                    </div>
                    <div className="space-y-2">
                        {hops.map((hop, i) => (
                            <div key={i} className="bg-surface-2 border border-border-subtle rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                        Hop {i + 1}
                                    </span>
                                    {hops.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeHop(i)}
                                            className="text-text-disabled hover:text-danger-fg text-[10px] transition-colors"
                                        >
                                            ✕ Remove
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px] gap-2">
                                    <input
                                        type="text"
                                        value={hop.from}
                                        onChange={e => updateHop(i, 'from', e.target.value)}
                                        placeholder="From (e.g. Client)"
                                        maxLength={100}
                                        className="bg-surface-3 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-2.5 py-2 outline-none focus:border-brand-line"
                                    />
                                    <input
                                        type="text"
                                        value={hop.to}
                                        onChange={e => updateHop(i, 'to', e.target.value)}
                                        placeholder="To (e.g. Load Balancer)"
                                        maxLength={100}
                                        className="bg-surface-3 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-2.5 py-2 outline-none focus:border-brand-line"
                                    />
                                    <input
                                        type="number"
                                        min="0"
                                        max="60000"
                                        value={hop.latencyMs}
                                        onChange={e => updateHop(i, 'latencyMs', e.target.value)}
                                        placeholder="ms"
                                        className="bg-surface-3 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-2.5 py-2 outline-none focus:border-brand-line font-mono"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        value={hop.payload}
                                        onChange={e => updateHop(i, 'payload', e.target.value)}
                                        placeholder="Payload (e.g. { userId, messageText })"
                                        maxLength={500}
                                        className="bg-surface-3 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-2.5 py-2 outline-none focus:border-brand-line"
                                    />
                                    <input
                                        type="text"
                                        value={hop.failureHandling}
                                        onChange={e => updateHop(i, 'failureHandling', e.target.value)}
                                        placeholder="Failure handling (e.g. retry w/ backoff, DLQ)"
                                        maxLength={500}
                                        className="bg-surface-3 border border-border-default rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-2.5 py-2 outline-none focus:border-brand-line"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setFlowName(''); setHops([emptyHop()]) }}
                        disabled={saveFlow.isPending || (!flowName && hops.every(h => !h.from && !h.to))}
                    >
                        Clear
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={saveFlow.isPending}
                        onClick={handleSave}
                        disabled={!flowName.trim()}
                    >
                        Save Flow
                    </Button>
                </div>
            </section>
            )}
        </div>
    )
}
