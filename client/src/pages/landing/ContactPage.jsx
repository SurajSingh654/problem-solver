// ============================================================================
// Contact — public marketing page
// ============================================================================
//
// Minimal contact surface. No form yet (deferred — would need server-side
// rate limiting + a destination inbox). Just an email + response-time
// expectation. Authenticated users have an in-app /feedback channel which
// is more useful — link to it from here for signed-in visitors.
// ============================================================================
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useUIStore } from '@store/useUIStore'
import useAuthStore from '@store/useAuthStore'
import LandingNav from './sections/LandingNav'
import LandingFooter from './sections/LandingFooter'
import { Button } from '@components/ui/Button'

const PAGE_TITLE = 'Contact ProbSolver'
const PAGE_DESCRIPTION =
    'Get in touch with the ProbSolver team. Questions, feedback, partnership inquiries, or bug reports — we read everything.'

const CONTACT_EMAIL = 'hello@probsolver.app'

export default function ContactPage() {
    const setTheme = useUIStore((s) => s.setTheme)
    const { isAuthenticated } = useAuthStore()

    useEffect(() => {
        const previousTitle = document.title
        document.title = PAGE_TITLE
        const metaDesc = document.querySelector('meta[name="description"]')
        const previousDesc = metaDesc?.getAttribute('content') ?? null
        if (metaDesc) metaDesc.setAttribute('content', PAGE_DESCRIPTION)

        const htmlIsLight = document.documentElement.classList.contains('light')
        setTheme(htmlIsLight ? 'light' : 'dark')

        return () => {
            document.title = previousTitle
            if (metaDesc && previousDesc !== null) {
                metaDesc.setAttribute('content', previousDesc)
            }
        }
    }, [setTheme])

    const reduce = useReducedMotion()
    const motionProps = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5, ease: 'easeOut' },
        }

    return (
        <div className="min-h-screen bg-surface-0 text-text-primary">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]
                           focus:bg-brand-400 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg
                           focus:font-semibold focus:text-sm"
            >
                Skip to content
            </a>

            <LandingNav />

            <main id="main-content">
                <section className="relative overflow-hidden">
                    <div
                        className="absolute inset-0 -z-10 opacity-60"
                        style={{
                            background:
                                'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,111,247,0.14), transparent 70%)',
                        }}
                        aria-hidden="true"
                    />
                    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
                        <motion.div {...motionProps}>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-fg-soft mb-4">
                                Contact
                            </p>
                            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight text-text-primary mb-5">
                                Get in touch.
                            </h1>
                            <p className="text-lg text-text-secondary leading-relaxed mb-12">
                                Questions, feedback, partnership inquiries, or bug reports — we read everything.
                                Typical response time is under 48 hours.
                            </p>

                            <div className="bg-surface-1 border border-border-default rounded-2xl p-8 mb-6">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled mb-2">
                                    Email
                                </p>
                                <a
                                    href={`mailto:${CONTACT_EMAIL}`}
                                    className="inline-block text-2xl sm:text-3xl font-extrabold text-brand-fg
                                               hover:text-brand-fg-soft transition-colors break-all"
                                >
                                    {CONTACT_EMAIL}
                                </a>
                            </div>

                            {isAuthenticated && (
                                <div className="text-sm text-text-tertiary">
                                    Already signed in?{' '}
                                    <Link
                                        to="/feedback"
                                        className="text-brand-fg-soft hover:text-brand-fg font-semibold underline-offset-2 hover:underline"
                                    >
                                        Use the in-app feedback channel
                                    </Link>
                                    {' '}— it ties your message to your account so we can follow up faster.
                                </div>
                            )}

                            {!isAuthenticated && (
                                <div className="mt-12">
                                    <p className="text-sm text-text-tertiary mb-4">
                                        Curious to try ProbSolver first?
                                    </p>
                                    <Link to="/auth/register">
                                        <Button variant="primary" size="lg">
                                            Start Free →
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </section>
            </main>

            <LandingFooter />
        </div>
    )
}
