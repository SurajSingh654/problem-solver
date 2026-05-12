import { cn } from '@utils/cn'

// ══════════════════════════════════════════════════════════════════════════
// BULLET CARD — reusable strength/gap/improvement list card for the
// evaluation results view.
// ══════════════════════════════════════════════════════════════════════════
export default function BulletCard({ title, items, color, icon }) {
    const colorMap = {
        success: { text: 'text-success-fg', bg: 'bg-success-soft', border: 'border-success-line', dot: 'text-success-fg' },
        danger: { text: 'text-danger-fg', bg: 'bg-danger-soft', border: 'border-danger-line', dot: 'text-danger-fg' },
        brand: { text: 'text-brand-fg-soft', bg: 'bg-brand-soft', border: 'border-brand-line', dot: 'text-brand-fg-soft' },
    }
    const c = colorMap[color] || colorMap.brand
    const list = Array.isArray(items) ? items : []
    return (
        <div className={cn('border rounded-2xl p-4', c.bg, c.border)}>
            <div className="flex items-center gap-2 mb-3">
                <span className="text-base">{icon}</span>
                <h3 className={cn('text-xs font-bold uppercase tracking-widest', c.text)}>{title}</h3>
                <span className="text-[10px] text-text-disabled ml-auto">{list.length}</span>
            </div>
            {list.length === 0 ? (
                <p className="text-xs text-text-disabled italic">None identified.</p>
            ) : (
                <ul className="space-y-2">
                    {list.map((item, i) => (
                        <li key={i} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                            <span className={cn('flex-shrink-0 mt-0.5', c.dot)}>•</span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
