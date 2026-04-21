import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'

// ── Animated counter — counts up from 0 to value ───────
export function AnimatedNumber({ value, duration = 1500 }) {
    const [display, setDisplay] = useState(0)

    useEffect(() => {
        if (!value && value !== 0) return
        let start = 0
        const target = typeof value === 'number' ? value : parseInt(value) || 0
        if (target === 0) { setDisplay(0); return }

        const increment = target / (duration / 16)
        const timer = setInterval(() => {
            start += increment
            if (start >= target) {
                setDisplay(target)
                clearInterval(timer)
            } else {
                setDisplay(Math.round(start))
            }
        }, 16)
        return () => clearInterval(timer)
    }, [value, duration])

    return <span>{display.toLocaleString()}</span>
}

// ── Section wrapper with scroll anchor ─────────────────
export function Section({ id, children, className }) {
    return (
        <section id={id} className={cn('scroll-mt-20', className)}>
            {children}
        </section>
    )
}

// ── Section eyebrow badge ──────────────────────────────
export function SectionBadge({ label, color = 'brand' }) {
    const colors = {
        brand: 'bg-brand-400/10 border-brand-400/25 text-brand-300',
        success: 'bg-success/10 border-success/25 text-success',
        warning: 'bg-warning/10 border-warning/25 text-warning',
        danger: 'bg-danger/10 border-danger/25 text-danger',
        info: 'bg-info/10 border-info/25 text-info',
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 border',
                colors[color] || colors.brand
            )}
        >
            <span className="text-xs font-semibold">{label}</span>
        </motion.div>
    )
}

// ── Section title with gradient ────────────────────────
export function SectionTitle({ line1, line2, gradient = 'from-brand-300 to-blue-400' }) {
    return (
        <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight mb-4"
        >
            {line1}<br />
            <span className={cn('bg-gradient-to-r bg-clip-text text-transparent', gradient)}>
                {line2}
            </span>
        </motion.h2>
    )
}

// ── Section description ────────────────────────────────
export function SectionDesc({ children, delay = 0.1 }) {
    return (
        <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className="text-base text-text-secondary max-w-2xl mb-10 leading-relaxed"
        >
            {children}
        </motion.p>
    )
}

// ── Feature card — clickable with icon, title, desc ────
export function FeatureCard({ icon, title, desc, tag, color, delay = 0, onClick }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.4 }}
            onClick={onClick}
            className={cn(
                'group relative bg-surface-1 border border-border-default rounded-2xl p-6',
                'transition-all duration-300',
                'hover:-translate-y-1 hover:shadow-lg hover:border-brand-400/30',
                onClick && 'cursor-pointer'
            )}
        >
            <div className="flex items-start gap-4">
                <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                    'flex-shrink-0 border transition-colors',
                    color || 'bg-brand-400/10 border-brand-400/25'
                )}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-bold text-text-primary">{title}</h3>
                        {tag && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                               bg-brand-400/15 text-brand-300 border border-brand-400/25">
                                {tag}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-text-tertiary leading-relaxed">{desc}</p>
                </div>
                {onClick && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        className="text-text-disabled group-hover:text-brand-300
                          transition-colors flex-shrink-0 mt-1">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                )}
            </div>
        </motion.div>
    )
}

// ── Pain point card — red themed ───────────────────────
export function PainPoint({ icon, title, desc, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.4 }}
            className="flex items-start gap-4 p-4 rounded-xl bg-danger/5 border border-danger/15"
        >
            <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
            <div>
                <h4 className="text-sm font-bold text-text-primary mb-0.5">{title}</h4>
                <p className="text-xs text-text-tertiary leading-relaxed">{desc}</p>
            </div>
        </motion.div>
    )
}

// ── Category pill — shows problem category with count ──
export function CategoryPill({ cat, count, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.3 }}
            className={cn('flex items-center gap-2.5 px-4 py-3 rounded-xl border', cat.bg)}
        >
            <span className="text-xl">{cat.icon}</span>
            <div>
                <span className={cn('text-xs font-bold block', cat.color)}>{cat.label}</span>
                <span className="text-[10px] text-text-disabled">
                    {count > 0 ? `${count} problems` : 'Ready'}
                </span>
            </div>
        </motion.div>
    )
}

// ── Feature group header ───────────────────────────────
export function FeatureGroupHeader({ label }) {
    return (
        <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
            {label}
        </h3>
    )
}

// ── Stat card for metrics sections ─────────────────────
export function StatCard({ icon, value, label, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className="text-center"
        >
            <span className="text-2xl">{icon}</span>
            <div className="text-2xl font-extrabold font-mono text-text-primary mt-1">
                <AnimatedNumber value={value} />
            </div>
            <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                {label}
            </div>
        </motion.div>
    )
}

// ── Timeline phase for roadmap ─────────────────────────
export function TimelinePhase({ phase, index }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.08 }}
            className={cn('relative pl-8 pb-8 border-l-2', phase.color)}
        >
            <div className={cn(
                'absolute left-[-7px] top-1 w-3 h-3 rounded-full border-2 border-surface-0',
                phase.dotColor
            )} />
            <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="text-xs font-extrabold font-mono text-text-primary">
                    {phase.phase}
                </span>
                <span className={cn(
                    'text-[9px] font-bold px-2 py-0.5 rounded-full border',
                    phase.badge.color
                )}>
                    {phase.badge.text}
                </span>
            </div>
            <h3 className="text-base font-bold text-text-primary mb-3">{phase.title}</h3>
            <div className="space-y-1.5">
                {phase.items.map((item, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs text-text-tertiary">
                        <span className="text-brand-400 flex-shrink-0 mt-0.5">→</span>
                        <span className="leading-relaxed">{item}</span>
                    </div>
                ))}
            </div>
        </motion.div>
    )
}

// ── Tech stack item ────────────────────────────────────
export function TechItem({ name, desc, badge, badgeColor = 'brand', delay = 0, direction = 'left' }) {
    const badgeColors = {
        brand: 'bg-brand-400/10 text-brand-300 border-brand-400/20',
        success: 'bg-success/10 text-success border-success/20',
        warning: 'bg-warning/10 text-warning border-warning/20',
        info: 'bg-info/10 text-info border-info/20',
        danger: 'bg-danger/10 text-danger border-danger/20',
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: direction === 'left' ? -8 : 8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle"
        >
            <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-text-primary">{name}</span>
                <span className="text-[10px] text-text-disabled ml-2">{desc}</span>
            </div>
            <span className={cn(
                'text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0',
                badgeColors[badgeColor] || badgeColors.brand
            )}>
                {badge}
            </span>
        </motion.div>
    )
}

// ── Code/architecture diagram block ────────────────────
export function DiagramBlock({ children, border = 'border-border-default' }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={cn(
                'bg-surface-0 border rounded-2xl p-6 mb-8',
                'font-mono text-xs leading-7 text-text-tertiary',
                'overflow-x-auto whitespace-pre',
                border
            )}
        >
            {children}
        </motion.div>
    )
}

// ── Comparison table check/cross ───────────────────────
export function Check() {
    return <span className="text-success font-bold text-sm">✓</span>
}

export function Cross() {
    return <span className="text-text-disabled text-sm">✗</span>
}

// ── Data flow step ─────────────────────────────────────
export function FlowStep({ step, label, desc, color, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className="flex items-start gap-4"
        >
            <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center',
                'text-[11px] font-extrabold text-white flex-shrink-0 mt-0.5',
                color
            )}>
                {step}
            </div>
            <div>
                <span className="text-xs font-bold text-text-primary">{label}</span>
                <p className="text-xs text-text-tertiary leading-relaxed mt-0.5">{desc}</p>
            </div>
        </motion.div>
    )
}

// ── Dimension card for 6D intelligence ─────────────────
export function DimensionCard({ num, name, color, desc, signals, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className="bg-surface-1 border border-border-default rounded-2xl p-5"
            style={{ borderTop: `3px solid ${color}` }}
        >
            <div className="font-mono font-extrabold text-xl mb-2" style={{ color }}>
                {num}
            </div>
            <h4 className="text-sm font-bold text-text-primary mb-1">{name}</h4>
            <p className="text-xs text-text-tertiary leading-relaxed mb-3">{desc}</p>
            <div className="border-t border-border-subtle pt-2">
                <p className="text-[10px] text-text-disabled">
                    <span className="font-bold">Signals:</span> {signals}
                </p>
            </div>
        </motion.div>
    )
}

// ── AI feature status item ─────────────────────────────
export function AIFeatureItem({ icon, name, desc, status = 'Live', delay = 0 }) {
    const statusColors = {
        'Live': 'bg-success/10 text-success border-success/20',
        'Beta': 'bg-warning/10 text-warning border-warning/20',
        'Planned': 'bg-info/10 text-info border-info/20',
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            className="flex items-center gap-3 p-3.5 rounded-xl border bg-surface-1 border-border-default"
        >
            <span className="text-xl flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary">{name}</span>
                    <span className={cn(
                        'text-[9px] font-bold px-1.5 py-px rounded-full border',
                        statusColors[status] || statusColors['Live']
                    )}>
                        {status}
                    </span>
                </div>
                <p className="text-[10px] text-text-tertiary mt-0.5">{desc}</p>
            </div>
        </motion.div>
    )
}

// ── Spec item with dot indicator ───────────────────────
export function SpecItem({ label, desc, dotColor = 'bg-info' }) {
    return (
        <div className="flex items-start gap-3">
            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5', dotColor)} />
            <div>
                <span className="text-xs font-bold text-text-primary">{label}</span>
                <p className="text-[11px] text-text-tertiary leading-relaxed">{desc}</p>
            </div>
        </div>
    )
}