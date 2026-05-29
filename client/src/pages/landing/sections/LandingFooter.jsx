import { Link } from 'react-router-dom'
import { BrandMark } from '@components/ui/BrandMark'

export default function LandingFooter() {
    const year = new Date().getFullYear()

    return (
        <footer className="border-t border-border-subtle py-10 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-text-tertiary">
                    <BrandMark size={20} />
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
