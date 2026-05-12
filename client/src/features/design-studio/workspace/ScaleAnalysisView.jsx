import { useState } from 'react'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import { useSaveScaleAnalysis } from '@hooks/useDesignStudio'

// ══════════════════════════════════════════════════════════════════════════
// CHUNK 2: SCALE ANALYSIS UI
// ══════════════════════════════════════════════════════════════════════════
export default function ScaleAnalysisView({ session, sessionId, isReadOnly = false }) {
    const saveScale = useSaveScaleAnalysis()
    const [scaleData, setScaleData] = useState({
        current: session.scaleAnalysis?.current || '',
        tenX: session.scaleAnalysis?.tenX || '',
        hundredX: session.scaleAnalysis?.hundredX || '',
        failureAtScale: session.scaleAnalysis?.failureAtScale || '',
    })

    function handleSave() {
        saveScale.mutate({ sessionId, ...scaleData })
    }

    const scales = [
        {
            id: 'current',
            label: '1x — Current Scale',
            icon: '📊',
            color: 'text-success-fg',
            bg: 'bg-success-soft border-success-line',
            hint: 'Does your design work at the scale you stated in capacity estimation? Walk through a normal request.',
            placeholder: 'At 23K messages/sec, my system handles this because...\n\nRequest path: Client → LB → Chat Service → Message Queue → DB\nEach component handles: [explain capacity]',
        },
        {
            id: 'tenX',
            label: '10x — Growth Scale',
            icon: '📈',
            color: 'text-warning-fg',
            bg: 'bg-warning-soft border-warning-line',
            hint: 'What breaks first at 10x traffic? What component hits its limit? How do you scale it?',
            placeholder: 'At 230K messages/sec:\n\n• First bottleneck: [component] because [reason]\n• Solution: [horizontal scaling / sharding / caching]\n• New components needed: [what and why]',
        },
        {
            id: 'hundredX',
            label: '100x — Extreme Scale',
            icon: '🚀',
            color: 'text-danger-fg',
            bg: 'bg-danger-soft border-danger-line',
            hint: 'At 100x, your architecture likely needs fundamental changes. What would you redesign?',
            placeholder: 'At 2.3M messages/sec:\n\n• Architecture changes needed: [what]\n• Database can no longer be: [current choice] → switch to: [new choice]\n• New patterns required: [e.g., event sourcing, CQRS, geo-sharding]',
        },
        {
            id: 'failureAtScale',
            label: '🔥 Failure at Scale',
            icon: '💥',
            color: 'text-danger-fg',
            bg: 'bg-danger-soft border-danger-line',
            hint: 'At 10x traffic, your cache goes cold (restart). What happens to your database? How do you recover?',
            placeholder: 'If Redis restarts at 10x traffic:\n\n• Thundering herd: all 230K req/sec hit the database directly\n• Database max capacity: [X] req/sec → overloaded by [Y]x\n• Mitigation: [circuit breaker / request coalescing / gradual warmup]\n• Recovery time: [estimate]',
        },
    ]

    return (
        <div className="p-6 max-w-[800px] mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                        <span>📐</span> Scale Analysis
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1">
                        Stress-test your design at different traffic levels. What breaks and when?
                    </p>
                </div>
                {!isReadOnly && (
                    <Button variant="secondary" size="sm" loading={saveScale.isPending} onClick={handleSave}>
                        Save Analysis
                    </Button>
                )}
            </div>

            <div className="space-y-4">
                {scales.map(scale => (
                    <div key={scale.id} className={cn('border rounded-2xl overflow-hidden', scale.bg)}>
                        <div className="px-5 py-4">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-base">{scale.icon}</span>
                                <h3 className={cn('text-sm font-bold', scale.color)}>{scale.label}</h3>
                            </div>
                            <p className="text-[11px] text-text-tertiary mb-3">{scale.hint}</p>
                            <textarea
                                rows={5}
                                value={scaleData[scale.id]}
                                onChange={e => setScaleData(prev => ({ ...prev, [scale.id]: e.target.value }))}
                                readOnly={isReadOnly}
                                placeholder={isReadOnly ? '(not filled in)' : scale.placeholder}
                                className={cn(
                                    'w-full bg-surface-0/80 border border-border-default rounded-xl text-sm text-text-primary',
                                    'placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed',
                                    'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20',
                                    isReadOnly && 'cursor-default opacity-80'
                                )}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
