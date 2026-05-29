import { Link } from 'react-router-dom'
import { BrandMark } from '@components/ui/BrandMark'

export default function LandingFooter() {
    const year = new Date().getFullYear()

    return (
        <footer className="border-t border-border-subtle py-12 px-4 sm:px-6 mt-4">
            <div className="max-w-6xl mx-auto">
                {/* Top row — wordmark + nav columns */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
                    <div className="col-span-2 md:col-span-1">
                        <Link to="/" className="inline-flex items-center gap-2 mb-3" aria-label="ProbSolver home">
                            <BrandMark size={24} />
                            <span className="text-base font-extrabold tracking-tight text-text-primary">
                                ProbSolver
                            </span>
                        </Link>
                        <p className="text-xs text-text-tertiary leading-relaxed max-w-[200px]">
                            Calibrated interview readiness, scored across 10 dimensions.
                        </p>
                    </div>

                    <FooterColumn
                        title="Product"
                        links={[
                            { label: 'How it scores you', to: '/about#how-it-works' },
                            { label: 'The research', to: '/about' },
                            { label: 'Sign In', to: '/auth/login' },
                            { label: 'Start Free', to: '/auth/register' },
                        ]}
                    />

                    <FooterColumn
                        title="Company"
                        links={[
                            { label: 'About', to: '/about' },
                            { label: 'Contact', to: '/contact' },
                        ]}
                    />

                    <FooterColumn
                        title="Get in touch"
                        links={[
                            { label: 'hello@probsolver.app', href: 'mailto:hello@probsolver.app' },
                        ]}
                    />
                </div>

                {/* Bottom row — copyright */}
                <div className="pt-6 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-disabled">
                    <span>© {year} ProbSolver. All rights reserved.</span>
                    <span className="text-text-tertiary">
                        Built on cognitive-science research.
                    </span>
                </div>
            </div>
        </footer>
    )
}

function FooterColumn({ title, links }) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled mb-3">
                {title}
            </p>
            <ul className="space-y-2">
                {links.map((link) => (
                    <li key={link.label}>
                        {link.href ? (
                            <a
                                href={link.href}
                                className="text-sm text-text-tertiary hover:text-text-primary transition-colors break-all"
                            >
                                {link.label}
                            </a>
                        ) : (
                            <Link
                                to={link.to}
                                className="text-sm text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                {link.label}
                            </Link>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}
