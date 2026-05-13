// ============================================================================
// useToastingMutation — TanStack mutation with default toast handlers
// ============================================================================
//
// We were repeatedly writing the same `onError`/`onSuccess` boilerplate
// across every mutation hook in the app:
//
//   onSuccess: () => toast.success('Saved.')
//   onError: (err) => toast.error(err?.response?.data?.error?.message || 'Failed.')
//
// Forgetting either leads to silent failures the user can't diagnose.
// This wrapper makes "show a toast on success/error" the default; opt
// out only when the caller has a more specific error UX (e.g. inline
// validation messages on a form, a banner instead of a toast).
//
// Behaviour:
//   - On success: toasts `successMessage` if provided. Skip when nullish.
//   - On error: toasts the server error envelope's `message` field, or
//     falls back to `errorPrefix` ("Failed to do X — <server msg>").
//   - Caller's own onSuccess / onError still run AFTER the toast — they
//     can do navigation, query invalidation, etc.
//   - Pass `silent: true` to disable toasts entirely (useful for
//     debounced auto-save mutations that have their own retry UX).
//
// Status code helpers:
//   - 401 / 403: skip the generic toast, the API's global 401 redirect
//     handles auth failures.
//   - 409: caller can opt into a custom message via `conflictMessage`.
// ============================================================================

import { useMutation } from '@tanstack/react-query'
import { toast } from '@store/useUIStore'
import { extractErrorMessage, extractErrorCode } from '@services/api'

export function useToastingMutation({
    mutationFn,
    successMessage,
    errorPrefix = 'Failed',
    conflictMessage,
    silent = false,
    onSuccess,
    onError,
    ...rest
} = {}) {
    return useMutation({
        mutationFn,
        ...rest,
        onSuccess: (data, variables, context) => {
            if (!silent && successMessage) {
                toast.success(successMessage)
            }
            return onSuccess?.(data, variables, context)
        },
        onError: (err, variables, context) => {
            if (!silent) {
                const status = err?.response?.status
                // 401 = the axios interceptor in services/api.js already
                // redirects to login; toasting on top is noisy.
                // 403 = hand off to the page's own forbidden-state UI.
                if (status !== 401 && status !== 403) {
                    if (status === 409 && conflictMessage) {
                        toast.error(conflictMessage)
                    } else {
                        const serverMsg = extractErrorMessage(err)
                        toast.error(
                            serverMsg && serverMsg !== 'Network error'
                                ? serverMsg
                                : `${errorPrefix} — ${serverMsg || 'unknown error'}`,
                        )
                    }
                }
            }
            return onError?.(err, variables, context)
        },
    })
}

// Convenience re-exports so callers don't need a second import for the
// status-code lookup that almost always accompanies a toast handler.
export { extractErrorMessage, extractErrorCode }
