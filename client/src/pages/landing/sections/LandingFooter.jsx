import { Link } from 'react-router-dom'

export default function LandingFooter() {
    const year = new Date().getFullYear()

    return (
        <footer className="border-t border-border-subtle py-10 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-text-tertiary">
                    <svg width="20" height="20" viewBox="0 0 32 32" className="rounded" aria-hidden="true">
                        <rect width="32" height="32" rx="8" fill="#7c6ff7" />
                        <path d="M11 12 L7 16 L11 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <path d="M21 12 L25 16 L21 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    <span className="font-bold text-text-primary">ProbSolver</span>
                    <span className="text-text-disabled">© {year}</span>
                </div>

                <div className="flex items-center gap-5 text-sm text-text-tertiary">
                    <Link to="/auth/login" className="hover:text-text-primary transition-colors">
                        Sign In
                    </Link>
                    <Link to="/auth/register" className="hover:text-text-primary transition-colors">
                        Start Free
                    </Link>
                    <a
                        href="mailto:hello@probsolver.app"
                        className="hover:text-text-primary transition-colors"
                    >
                        Contact
                    </a>
                </div>
            </div>
        </footer>
    )
}
