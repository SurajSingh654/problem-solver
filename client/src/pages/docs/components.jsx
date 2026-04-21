import { cn } from '@utils/cn'

// ── Section wrapper ────────────────────────────────────
export function Section({ id, children, className }) {
    return (
        <section
            id={id}
            className={cn('mb-16 scroll-mt-20', className)}
        >
            {children}
        </section>
    )
}

// ── Section title ──────────────────────────────────────
export function SectionTitle({ icon, children }) {
    return (
        <div className="flex items-center gap-3 mb-2">
            {icon && (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'rgba(124,111,247,0.12)' }}>
                    {icon}
                </div>
            )}
            <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                {children}
            </h2>
        </div>
    )
}

// ── Section description ────────────────────────────────
export function SectionDesc({ children }) {
    return (
        <p className="text-sm text-text-tertiary mb-6 leading-relaxed">
            {children}
        </p>
    )
}

// ── Card grid ──────────────────────────────────────────
export function CardGrid({ children, cols = 4 }) {
    const colClass = {
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    }[cols] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'

    return (
        <div className={cn('grid gap-3 mb-6', colClass)}>
            {children}
        </div>
    )
}

// ── Feature card ───────────────────────────────────────
export function FeatureCard({ icon, title, desc }) {
    return (
        <div className="bg-surface-2 border border-border-default rounded-xl p-4
                    hover:border-border-strong hover:-translate-y-0.5
                    transition-all duration-200">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-sm font-bold text-text-primary mb-1">{title}</div>
            <div className="text-xs text-text-tertiary leading-relaxed">{desc}</div>
        </div>
    )
}

// ── Stack item ─────────────────────────────────────────
export function StackItem({ emoji, name, desc }) {
    return (
        <div className="flex items-center gap-3 bg-surface-2 border border-border-default
                    rounded-lg px-3 py-2.5 hover:border-border-strong transition-colors">
            <span className="text-xl flex-shrink-0">{emoji}</span>
            <div>
                <div className="text-sm font-semibold text-text-primary">{name}</div>
                <div className="text-xs text-text-tertiary mt-0.5">{desc}</div>
            </div>
        </div>
    )
}

// ── Table wrapper ──────────────────────────────────────
export function Table({ headers, rows }) {
    return (
        <div className="border border-border-default rounded-xl overflow-hidden mb-5">
            <table className="w-full border-collapse">
                <thead>
                    <tr>
                        {headers.map((h, i) => (
                            <th key={i}
                                className="bg-surface-3 text-text-tertiary text-xs font-bold
                             uppercase tracking-wider px-4 py-2.5 text-left
                             border-b border-border-default">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-surface-3 transition-colors">
                            {row.map((cell, ci) => (
                                <td key={ci}
                                    className="px-4 py-2.5 text-sm text-text-secondary
                               bg-surface-2 border-b border-border-subtle
                               last:border-b-0">
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── Check / cross ──────────────────────────────────────
export const Check = () => <span className="text-success font-bold">✓</span>
export const Cross = () => <span className="text-danger  font-bold">✗</span>

// ── Code block ─────────────────────────────────────────
export function CodeBlock({ label, color = '#22c55e', children, copyText }) {
    const handleCopy = () => {
        const text = copyText || children
        navigator.clipboard.writeText(text).then(() => {
            // quick visual feedback handled inline
        })
    }

    return (
        <div className="bg-surface-0 border border-border-default rounded-lg
                    overflow-hidden my-2.5">
            {label && (
                <div className="flex items-center justify-between px-4 py-2
                        bg-surface-3 border-b border-border-default">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
                            {label}
                        </span>
                    </div>
                    <button
                        onClick={handleCopy}
                        className="text-xs text-text-tertiary hover:text-text-primary
                       border border-border-default hover:border-border-strong
                       rounded px-2 py-0.5 transition-all"
                    >
                        Copy
                    </button>
                </div>
            )}
            <pre className="px-4 py-3.5 font-mono text-[0.78rem] leading-7
                      text-text-secondary overflow-x-auto whitespace-pre">
                {children}
            </pre>
        </div>
    )
}

// ── Callout ────────────────────────────────────────────
export function Callout({ type = 'info', children }) {
    const styles = {
        info: { bg: 'bg-blue-500/8', border: 'border-l-blue-500', icon: 'ℹ️' },
        success: { bg: 'bg-success/8', border: 'border-l-success', icon: '✅' },
        warning: { bg: 'bg-warning/8', border: 'border-l-warning', icon: '⚠️' },
        danger: { bg: 'bg-danger/8', border: 'border-l-danger', icon: '🚨' },
    }
    const s = styles[type]
    return (
        <div className={cn(
            'flex gap-3 p-3.5 rounded-lg border-l-4 my-3.5 text-sm leading-relaxed',
            s.bg, s.border
        )}>
            <span className="flex-shrink-0 mt-0.5">{s.icon}</span>
            <div className="text-text-secondary">{children}</div>
        </div>
    )
}

// ── Arch / mono block ──────────────────────────────────
export function ArchBlock({ children }) {
    return (
        <div className="bg-surface-0 border border-border-default rounded-xl
                    p-5 font-mono text-xs leading-7 text-text-tertiary
                    overflow-x-auto mb-5 whitespace-pre">
            {children}
        </div>
    )
}

// ── File tree ──────────────────────────────────────────
export function FileTree({ children }) {
    return (
        <div className="bg-surface-0 border border-border-default rounded-xl
                    p-5 font-mono text-xs leading-7 overflow-x-auto
                    mb-5 whitespace-pre">
            {children}
        </div>
    )
}

// ── Dim cards grid (6D) ────────────────────────────────
export function DimCard({ num, name, desc, color }) {
    return (
        <div
            className="bg-surface-2 border border-border-default rounded-xl p-4
                 hover:-translate-y-0.5 transition-transform"
            style={{ borderTop: `3px solid ${color}` }}
        >
            <div className="font-mono font-extrabold text-xl mb-1.5"
                style={{ color }}>
                {num}
            </div>
            <div className="text-sm font-bold text-text-primary mb-1">{name}</div>
            <div className="text-xs text-text-tertiary leading-relaxed">{desc}</div>
        </div>
    )
}

// ── Step card ──────────────────────────────────────────
export function StepCard({ num, numColor, numBg, title, sub, children }) {
    return (
        <div className="bg-surface-2 border border-border-default rounded-xl
                    overflow-hidden mb-3 hover:border-border-strong transition-colors">
            <div className="flex items-start gap-4 p-5">
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center
                     text-xs font-extrabold font-mono flex-shrink-0 mt-0.5
                     border"
                    style={{
                        background: numBg, color: numColor,
                        borderColor: numColor + '55'
                    }}
                >
                    {num}
                </div>
                <div>
                    <div className="text-sm font-bold text-text-primary mb-0.5">{title}</div>
                    {sub && <div className="text-xs text-text-tertiary">{sub}</div>}
                </div>
            </div>
            {children && (
                <div className="px-5 pb-5 pt-0 ml-12">
                    {children}
                </div>
            )}
        </div>
    )
}

// ── Trouble item ───────────────────────────────────────
export function TroubleItem({ error, children }) {
    return (
        <div className="bg-surface-2 border border-border-default rounded-xl p-4 mb-2.5">
            <div className="flex items-start gap-2.5 mb-2.5">
                <span className="bg-danger/12 text-danger border border-danger/25
                         rounded px-2 py-0.5 text-[11px] font-extrabold
                         flex-shrink-0 mt-0.5">
                    {error ? 'ERROR' : 'WARN'}
                </span>
                <code className="text-sm font-mono text-text-primary leading-snug">
                    {error}
                </code>
            </div>
            <div className="text-sm text-text-tertiary leading-relaxed pl-16">
                {children}
            </div>
        </div>
    )
}

// ── Role card ──────────────────────────────────────────
export function RoleCard({ title, badge, badgeColor, desc, steps }) {
    return (
        <div className="bg-surface-2 border border-border-default rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-text-primary">{title}</span>
                <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                        background: badgeColor + '15',
                        color: badgeColor,
                        borderColor: badgeColor + '33'
                    }}
                >
                    {badge}
                </span>
            </div>
            <p className="text-xs text-text-tertiary mb-3 leading-relaxed">{desc}</p>
            <ul className="space-y-1.5">
                {steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-tertiary">
                        <span className="text-brand-400 flex-shrink-0 mt-0.5">→</span>
                        <span>{s}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

// ── Script item ────────────────────────────────────────
export function ScriptItem({ cmd, desc, dir }) {
    return (
        <div className="flex items-center gap-4 bg-surface-2 border border-border-default
                    rounded-lg px-4 py-2.5 hover:border-border-strong transition-colors">
            <code className="font-mono text-xs text-success min-w-[180px] flex-shrink-0">
                {cmd}
            </code>
            <span className="text-xs text-text-tertiary flex-1">{desc}</span>
            <span className="font-mono text-[11px] text-text-tertiary bg-surface-3
                       px-2 py-0.5 rounded flex-shrink-0">
                {dir}
            </span>
        </div>
    )
}

// ── Sidebar nav link ───────────────────────────────────
export function SbLink({ href, active, onClick, children }) {
    return (
        <a
            href={href}
            onClick={(e) => { e.preventDefault(); onClick?.(href) }}
            className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'transition-all cursor-pointer',
                active
                    ? 'bg-brand-400/12 text-brand-300 border border-brand-400/22'
                    : 'text-text-tertiary hover:bg-surface-3 hover:text-text-primary'
            )}
        >
            <span className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                active ? 'bg-brand-400' : 'bg-brand-400/40'
            )} />
            {children}
        </a>
    )
}

// ── Docs layout wrapper ────────────────────────────────
export function DocsLayout({ sidebar, children }) {
    return (
        <div className="flex min-h-screen bg-surface-0">
            {/* Sidebar */}
            <aside className="hidden lg:flex flex-col w-64 flex-shrink-0
                        fixed top-0 left-0 h-screen
                        bg-surface-1 border-r border-border-default
                        overflow-y-auto z-10 no-scrollbar">
                {sidebar}
            </aside>

            {/* Main */}
            <main className="flex-1 lg:ml-64 min-w-0">
                {children}
            </main>
        </div>
    )
}

// ── Docs hero ──────────────────────────────────────────
export function DocsHero({ eyebrow, eyebrowColor = '#7c6ff7', title, titleGradient, desc, children }) {
    return (
        <div className="relative border-b border-border-default overflow-hidden hero-gradient">
            {/* Orbs */}
            <div className="absolute top-[-120px] right-[-60px] w-[400px] h-[400px]
                      rounded-full pointer-events-none"
                style={{ background: eyebrowColor + '10', filter: 'blur(80px)' }} />
            <div className="absolute bottom-[-60px] left-[40%] w-[200px] h-[200px]
                      rounded-full pointer-events-none"
                style={{ background: '#60a5fa08', filter: 'blur(80px)' }} />

            <div className="relative z-10 px-10 py-16">
                {/* Eyebrow */}
                <div
                    className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5
                     text-xs font-semibold mb-5 border"
                    style={{
                        background: eyebrowColor + '15',
                        borderColor: eyebrowColor + '30',
                        color: eyebrowColor,
                    }}
                >
                    {eyebrow}
                </div>

                {/* Title */}
                <h1 className="text-4xl font-extrabold text-text-primary tracking-tight
                       leading-tight mb-3">
                    {title}<br />
                    {titleGradient && (
                        <span className="bg-gradient-to-r from-brand-300 to-blue-400
                             bg-clip-text text-transparent">
                            {titleGradient}
                        </span>
                    )}
                </h1>

                {desc && (
                    <p className="text-base text-text-secondary max-w-xl leading-relaxed mb-6">
                        {desc}
                    </p>
                )}

                {children}
            </div>
        </div>
    )
}