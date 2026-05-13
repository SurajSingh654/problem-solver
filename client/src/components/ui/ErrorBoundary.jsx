// ============================================================================
// ErrorBoundary — top-level render-error catch
// ============================================================================
//
// Catches errors thrown during render of any descendant. Without this, an
// unexpected exception (stale prop access, undefined read, third-party
// component crash) blanks the whole app — the user sees a white screen
// with no way back. With this in place at the route level, the rest of
// the shell (sidebar, topbar) keeps working and the user gets a Reload /
// Back affordance.
//
// Note on functional components: as of React 19 there's still no
// functional equivalent of getDerivedStateFromError + componentDidCatch.
// Keeping this as a class is intentional, not legacy.
//
// Usage:
//   <ErrorBoundary>
//     <SomePage />
//   </ErrorBoundary>
//
// Or pass a custom fallback:
//   <ErrorBoundary fallback={(error, reset) => <MyView ... />}>
// ============================================================================

import { Component } from 'react'
import { Button } from './Button'

export class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, errorInfo) {
        // Surface to console for dev + monitoring tools (Sentry hooks
        // into console.error in most setups). Don't swallow — debugging
        // a silent error boundary is a known anti-pattern.
        console.error('[ErrorBoundary]', error, errorInfo)
    }

    reset = () => {
        this.setState({ error: null })
    }

    render() {
        if (!this.state.error) return this.props.children

        // Custom fallback path — used by callers that want a contextual
        // recovery surface (e.g. the verdict card can fail without
        // taking down the whole report page).
        if (typeof this.props.fallback === 'function') {
            return this.props.fallback(this.state.error, this.reset)
        }

        const message = this.state.error?.message || 'Something went wrong.'
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-6 text-center">
                <div className="text-4xl" aria-hidden>
                    💥
                </div>
                <div className="space-y-1 max-w-md">
                    <h2 className="text-base font-bold text-text-primary">
                        Something broke on this page
                    </h2>
                    <p className="text-sm text-text-tertiary leading-relaxed">
                        We hit an unexpected error. Reload to recover; if it keeps happening, let us know.
                    </p>
                    <p className="text-[10px] text-text-disabled font-mono mt-2">
                        {message}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="md" onClick={() => window.location.reload()}>
                        Reload page
                    </Button>
                    <Button variant="primary" size="md" onClick={this.reset}>
                        Try again
                    </Button>
                </div>
            </div>
        )
    }
}

export default ErrorBoundary
