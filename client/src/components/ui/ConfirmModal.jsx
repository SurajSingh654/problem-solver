// ============================================================================
// ConfirmModal + useConfirm — styled replacement for window.confirm()
// ============================================================================
//
// `window.confirm()` works but ships native browser chrome that doesn't
// match the app's visual language, can't be styled, can't be themed, and
// blocks the JS thread. Worse: on mobile WebKit some confirms render
// at the top of the screen with no visual connection to the action.
//
// This module exposes an imperative, promise-returning `confirm()` so
// callers read like the native API:
//
//   const confirm = useConfirm()
//   if (await confirm({
//     title: 'Delete this reference?',
//     description: 'Cannot be undone.',
//     confirmLabel: 'Delete',
//     danger: true,
//   })) {
//     await deleteReference(id)
//   }
//
// One <ConfirmProvider> is mounted at the app root; subsequent calls
// share that single modal instance. Escape closes (resolves false);
// click outside closes; focus is trapped + restored.
// ============================================================================

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './Button'
import { useFocusTrap } from '@hooks/useFocusTrap'
import { ConfirmContext } from '@hooks/useConfirm'
import { cn } from '@utils/cn'

export function ConfirmProvider({ children }) {
    const [state, setState] = useState(null) // { title, description, ... } | null
    // Stash the resolver so the modal-rendering code can call it from
    // its onConfirm / onCancel handlers.
    const resolveRef = useRef(null)

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            resolveRef.current = resolve
            setState({
                title: options?.title || 'Are you sure?',
                description: options?.description || '',
                confirmLabel: options?.confirmLabel || 'Confirm',
                cancelLabel: options?.cancelLabel || 'Cancel',
                danger: !!options?.danger,
            })
        })
    }, [])

    const close = useCallback((value) => {
        resolveRef.current?.(value)
        resolveRef.current = null
        setState(null)
    }, [])

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AnimatePresence>
                {state && (
                    <ConfirmDialog
                        {...state}
                        onConfirm={() => close(true)}
                        onCancel={() => close(false)}
                    />
                )}
            </AnimatePresence>
        </ConfirmContext.Provider>
    )
}

function ConfirmDialog({ title, description, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) {
    const containerRef = useFocusTrap({ active: true, onEscape: onCancel })
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
            onClick={onCancel}
            role="presentation"
        >
            <motion.div
                ref={containerRef}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby={description ? 'confirm-desc' : undefined}
                className={cn(
                    'bg-surface-1 border rounded-2xl w-full max-w-md shadow-2xl',
                    danger ? 'border-danger-line' : 'border-border-default',
                )}
            >
                <div className="p-5 space-y-2">
                    <h2
                        id="confirm-title"
                        className="text-base font-bold text-text-primary"
                    >
                        {title}
                    </h2>
                    {description && (
                        <p
                            id="confirm-desc"
                            className="text-sm text-text-secondary leading-relaxed"
                        >
                            {description}
                        </p>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-border-subtle bg-surface-2/40 flex items-center justify-end gap-2 rounded-b-2xl">
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={danger ? 'danger' : 'primary'}
                        size="sm"
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    )
}
