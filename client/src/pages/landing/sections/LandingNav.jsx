import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '@components/ui/Button'
import { BrandMark } from '@components/ui/BrandMark'
import { cn } from '@utils/cn'
import useAuthStore from '@store/useAuthStore'
import { useUIStore } from '@store/useUIStore'

// Sticky top nav. Adds a subtle border once the user scrolls past 16px so the
// glass-blur backdrop has a defined edge. Authed users see "Go to Dashboard"
// instead of "Sign In + Start Free" (the marketing CTAs would be confusing).
// Theme toggle on the right lets visitors flip light/dark; choice persists
// via useUIStore → localStorage and carries into the authed app.
export default function LandingNav() {
    const [scrolled, setScrolled] = useState(false)
    const { isAuthenticated, user } = useAuthStore()
    const { theme, toggleTheme } = useUIStore()

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 16)
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <nav
            className={cn(
                'sticky top-0 z-50 backdrop-blur-md transition-colors duration-200',
                scrolled
                    ? 'bg-surface-1/85 border-b border-border-subtle'
                    : 'bg-transparent border-b border-transparent',
            )}
        >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 group" aria-label="ProbSolver home">
                    <BrandMark size={28} />
                    <span className="text-lg font-extrabold tracking-tight text-text-primary group-hover:text-brand-fg-soft transition-colors">
                        ProbSolver
                    </span>
                </Link>

                <div className="flex items-center gap-2 sm:gap-3">
                    <ThemeToggleButton theme={theme} onToggle={toggleTheme} />

                    {isAuthenticated && user ? (
                        <Link to={user.globalRole === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard'}>
                            <Button variant="primary" size="md">
                                Go to Dashboard →
                            </Button>
                        </Link>
                    ) : (
                        <>
                            <Link
                                to="/auth/login"
                                className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm font-semibold
                                           text-text-secondary hover:text-text-primary transition-colors"
                            >
                                Sign In
                            </Link>
                            <Link to="/auth/register">
                                <Button variant="primary" size="md">
                                    Start Free
                                </Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    )
}

function ThemeToggleButton({ theme, onToggle }) {
    const isDark = theme === 'dark'
    return (
        <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                       text-text-secondary hover:text-text-primary
                       hover:bg-surface-2 transition-colors duration-150
                       focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-surface-0"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {isDark ? (
                // Sun icon — currently dark, click to go light
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
            ) : (
                // Moon icon — currently light, click to go dark
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            )}
        </button>
    )
}
