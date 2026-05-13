// ============================================================================
// useConfirm — imperative confirm dialog hook + context
// ============================================================================
// Hook + context live here (not next to ConfirmModal) so React fast-
// refresh can hot-reload the modal component cleanly. Mixing component
// exports with context/hook exports trips
// `react-refresh/only-export-components`.
//
// See `components/ui/ConfirmModal.jsx` for the provider component and
// the dialog UI.
// ============================================================================

import { createContext, useContext } from 'react'

export const ConfirmContext = createContext(null)

export function useConfirm() {
    const ctx = useContext(ConfirmContext)
    if (!ctx) {
        if (typeof window !== 'undefined') {
            console.warn(
                '[useConfirm] No <ConfirmProvider> in tree — falling back to window.confirm().',
            )
        }
        return ({ description, title } = {}) =>
            Promise.resolve(window.confirm(description || title || 'Are you sure?'))
    }
    return ctx
}
