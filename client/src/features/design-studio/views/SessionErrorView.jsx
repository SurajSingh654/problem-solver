import { Button } from '@components/ui/Button'
import { extractErrorMessage, extractErrorCode } from '@services/api'

// ══════════════════════════════════════════════════════════════════════════
// SESSION ERROR VIEW
// ══════════════════════════════════════════════════════════════════════════
// Fixes the "infinite spinner on fetch failure" bug: the old workspace
// only checked `isLoading`. When the fetch errored (401 session expired,
// 403 wrong team, 404 deleted session, network offline), the component
// sat on a spinner forever.
//
// We branch on common codes to give the user something actionable.
// Everything else falls through to "try again" + the raw error message
// from the axios interceptor so support can diagnose.
// ══════════════════════════════════════════════════════════════════════════

export default function SessionErrorView({ error, onRetry, onBack }) {
    const code = extractErrorCode(error)
    const status = error?.response?.status
    const message = extractErrorMessage(error) || 'Failed to load session.'

    let title = 'Could not load session'
    let hint = message
    let showRetry = true

    if (status === 404) {
        title = 'Session not found'
        hint = 'This session may have been deleted or moved to a different team.'
        showRetry = false
    } else if (status === 403) {
        title = 'Not authorized'
        hint = "You don't have access to this session in the current team context."
        showRetry = false
    } else if (status === 401) {
        title = 'Session expired'
        hint = 'Your login expired. Signing in again will bring you back here.'
        showRetry = false
    } else if (!error?.response) {
        title = 'Network issue'
        hint = 'Could not reach the server. Check your connection and retry.'
    }

    return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-6 text-center">
            <div className="text-4xl" aria-hidden>⚠️</div>
            <div className="space-y-1 max-w-md">
                <h2 className="text-base font-bold text-text-primary">{title}</h2>
                <p className="text-sm text-text-tertiary leading-relaxed">{hint}</p>
                {code && (
                    <p className="text-[10px] text-text-disabled font-mono mt-2">
                        code: {code}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button variant="secondary" size="md" onClick={onBack}>
                    Back to Sessions
                </Button>
                {showRetry && onRetry && (
                    <Button variant="primary" size="md" onClick={onRetry}>
                        Retry
                    </Button>
                )}
            </div>
        </div>
    )
}
