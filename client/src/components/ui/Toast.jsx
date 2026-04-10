import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@store/useUIStore'
import { cn } from '@utils/cn'

const icons = {
    success: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    error: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
    ),
    warning: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    info: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
}

const styles = {
    success: { bar: 'bg-success', icon: 'bg-success/15 text-success' },
    error: { bar: 'bg-danger', icon: 'bg-danger/15  text-danger' },
    warning: { bar: 'bg-warning', icon: 'bg-warning/15 text-warning' },
    info: { bar: 'bg-brand-400', icon: 'bg-brand-400/15 text-brand-300' },
}

function ToastItem({ toast }) {
    const { removeToast } = useUIStore()

    useEffect(() => {
        const timer = setTimeout(() => {
            removeToast(toast.id)
        }, toast.duration || 4000)
        return () => clearTimeout(timer)
    }, [toast.id, toast.duration, removeToast])

    const s = styles[toast.type] || styles.info

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cn(
                'relative flex items-start gap-3 overflow-hidden',
                'bg-surface-3 border border-border-strong rounded-xl',
                'px-4 py-3 shadow-lg min-w-[280px] max-w-[380px]',
                'pointer-events-all'
            )}
        >
            {/* Left accent bar */}
            <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', s.bar)} />

            {/* Icon */}
            <div className={cn('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5', s.icon)}>
                {icons[toast.type]}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0 pl-0.5">
                {toast.title && (
                    <p className="text-sm font-semibold text-text-primary leading-tight mb-0.5">
                        {toast.title}
                    </p>
                )}
                {toast.message && (
                    <p className="text-xs text-text-secondary leading-normal">
                        {toast.message}
                    </p>
                )}
            </div>

            {/* Close */}
            <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 text-text-tertiary hover:text-text-primary transition-colors mt-0.5"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </motion.div>
    )
}

export function ToastContainer() {
    const { toasts } = useUIStore()

    return (
        <div className="fixed bottom-6 right-6 z-toast flex flex-col gap-2 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} />
                ))}
            </AnimatePresence>
        </div>
    )
}