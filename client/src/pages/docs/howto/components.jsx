// ============================================================================
// ProbSolver — How-To shared components
// ============================================================================
// Small building blocks used by both the legacy HowToPage.jsx scroll guide
// and the new per-task pages. Keep these presentational and dependency-free
// (react + react-router-dom only).
// ============================================================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

// ── Screenshot base path ────────────────────────────────────────────
// Screenshots go in client/public/docs/how-to/ and are referenced here by
// filename only. The public folder is served at site root, so a file named
// `ds-sd-00-create-session.png` is reachable at
// /docs/how-to/ds-sd-00-create-session.png. If a file is missing the image
// component shows a labeled placeholder with the expected filename so
// contributors know exactly what to drop in.
const SCREENSHOT_BASE = '/docs/how-to'

// ── Image with graceful placeholder + lightbox zoom ─────────────────
export function HowToImage({ file, alt, caption }) {
    const [errored, setErrored] = useState(false)
    const [zoomed, setZoomed] = useState(false)
    const src = `${SCREENSHOT_BASE}/${file}`

    // ESC closes lightbox
    useEffect(() => {
        if (!zoomed) return
        const onKey = (e) => { if (e.key === 'Escape') setZoomed(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [zoomed])

    if (errored) {
        // Placeholder frame — still useful context for the reader while the
        // screenshot is pending. Shows the exact filename contributors need.
        return (
            <figure className="my-3 border-2 border-dashed border-border-default
                               rounded-xl bg-surface-0 overflow-hidden">
                <div className="flex flex-col items-center justify-center p-8 gap-2 min-h-[160px]">
                    <div className="text-2xl opacity-40">🖼️</div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                        Screenshot placeholder
                    </div>
                    {caption && (
                        <div className="text-xs text-text-tertiary text-center max-w-md">
                            {caption}
                        </div>
                    )}
                    <code className="text-[10px] font-mono text-brand-fg-soft bg-brand-soft
                                     border border-brand-line rounded px-2 py-1 mt-1">
                        public/docs/how-to/{file}
                    </code>
                </div>
            </figure>
        )
    }

    return (
        <>
            <figure className="my-3 group">
                <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    className="block w-full rounded-xl overflow-hidden border border-border-default
                               bg-surface-0 hover:border-brand-line transition-colors cursor-zoom-in"
                    title="Click to enlarge"
                >
                    <img
                        src={src}
                        alt={alt}
                        loading="lazy"
                        onError={() => setErrored(true)}
                        className="w-full h-auto block"
                    />
                </button>
                {caption && (
                    <figcaption className="text-[11px] text-text-tertiary text-center mt-1.5 italic">
                        {caption}
                    </figcaption>
                )}
            </figure>
            {zoomed && (
                <div
                    onClick={() => setZoomed(false)}
                    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm
                               flex items-center justify-center p-6 cursor-zoom-out
                               animate-in fade-in duration-150"
                >
                    <img
                        src={src}
                        alt={alt}
                        className="max-w-full max-h-full rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setZoomed(false)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full
                                   bg-surface-2 border border-border-default text-text-primary
                                   hover:bg-surface-3 transition-colors"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    )
}

// Shared styling constants for StepCard
/* eslint-disable react-refresh/only-export-components */
export const BRAND = { numColor: '#7c6ff7', numBg: 'rgba(124,111,247,0.12)' }
export const SUCCESS = { numColor: '#22c55e', numBg: 'rgba(34,197,94,0.12)' }
export const WARN = { numColor: '#eab308', numBg: 'rgba(234,179,8,0.12)' }
export const INFO = { numColor: '#3b82f6', numBg: 'rgba(59,130,246,0.12)' }
/* eslint-enable react-refresh/only-export-components */

// Small inline example block — for pasteable content inside steps.
export function Example({ children }) {
    return (
        <pre className="bg-surface-0 border border-border-default rounded-lg
                        p-3.5 text-[11px] leading-relaxed text-text-secondary
                        font-mono whitespace-pre-wrap overflow-x-auto my-2">
            {children}
        </pre>
    )
}

// A "paste this" block with a small label.
export function PasteBlock({ label, children }) {
    return (
        <div className="my-2">
            {label && (
                <div className="text-[10px] font-bold text-text-disabled uppercase
                                tracking-widest mb-1">{label}</div>
            )}
            <Example>{children}</Example>
        </div>
    )
}

// A small inline shortcut / keyword chip.
export function K({ children }) {
    return (
        <code className="bg-surface-3 border border-border-default rounded
                         px-1.5 py-0.5 text-[11px] font-mono text-brand-fg-soft">
            {children}
        </code>
    )
}

// ── SummaryBlock ────────────────────────────────────────
// Short intro sentence (≤2 lines) at the top of every task page.
export function SummaryBlock({ children }) {
    return (
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
            {children}
        </p>
    )
}

// ── PrereqList ─────────────────────────────────────────
// Bullet list rendered above the first StepCard.
export function PrereqList({ items }) {
    if (!items || items.length === 0) return null
    return (
        <div className="my-4 p-3 rounded-lg border border-border-default bg-surface-2">
            <div className="text-[11px] font-bold text-text-disabled uppercase
                            tracking-widest mb-2">
                Prerequisites
            </div>
            <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                {items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
        </div>
    )
}

// ── IfItFails ──────────────────────────────────────────
// Yellow-tinted error-help callout, rendered after the last step.
export function IfItFails({ children }) {
    return (
        <div className="my-5 p-4 rounded-xl border-l-4 border-yellow-500 bg-yellow-500/5">
            <div className="text-sm font-bold text-yellow-500 mb-2">
                🔧 If something goes wrong
            </div>
            <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-4">
                {children}
            </ul>
        </div>
    )
}

// ── NextUp ─────────────────────────────────────────────
// Footer with related-task links. taskLookup is optional; if omitted,
// renders taskIds as literal slugs.
export function NextUp({ taskIds, taskLookup }) {
    if (!taskIds || taskIds.length === 0) return null
    return (
        <div className="mt-8 mb-4">
            <div className="text-[11px] font-bold text-text-disabled uppercase
                            tracking-widest mb-2">
                Next up
            </div>
            <div className="flex flex-wrap gap-2">
                {taskIds.map(id => {
                    const t = taskLookup?.(id)
                    const label = t ? `${t.icon || '→'} ${t.title}` : id
                    return (
                        <Link key={id} to={`/docs/how-to/task/${id}`}
                              className="text-xs text-brand-fg-soft hover:text-brand-400
                                         border border-brand-line hover:border-brand-500
                                         rounded-full px-3 py-1.5 transition-colors">
                            {label} →
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
