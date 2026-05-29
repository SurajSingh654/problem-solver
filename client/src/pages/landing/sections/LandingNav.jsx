import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'

// Sticky top nav. Adds a subtle border once the user scrolls past 16px so the
// glass-blur backdrop has a defined edge against content. Minimal — wordmark
// on the left, two CTAs on the right. Mobile: stacks the wordmark + collapsed
// CTAs (Sign In disappears under 480px to keep "Start Free" readable).
export default function LandingNav() {
    const [scrolled, setScrolled] = useState(false)

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
                    ? 'bg-surface-1/80 border-b border-border-subtle'
                    : 'bg-transparent border-b border-transparent',
            )}
        >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 group" aria-label="ProbSolver home">
                    <Wordmark />
                </Link>

                <div className="flex items-center gap-2 sm:gap-3">
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
                </div>
            </div>
        </nav>
    )
}

function Wordmark() {
    return (
        <>
            <svg width="28" height="28" viewBox="0 0 32 32" className="rounded-md" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#7c6ff7" />
                <path
                    d="M11 12 L7 16 L11 20"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
                <path
                    d="M21 12 L25 16 L21 20"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </svg>
            <span className="text-lg font-extrabold tracking-tight text-text-primary group-hover:text-brand-fg-soft transition-colors">
                ProbSolver
            </span>
        </>
    )
}
