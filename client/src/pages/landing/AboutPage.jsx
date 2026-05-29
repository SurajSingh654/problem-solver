// ============================================================================
// About — public marketing page
// ============================================================================
//
// Reuses LandingNav + LandingFooter (same chrome as the landing page) so
// visitors don't feel like they've left the brand. Composes the deeper
// content sections that used to live on the landing page itself.
// ============================================================================
import { useEffect } from 'react'
import { useUIStore } from '@store/useUIStore'
import { motion, useReducedMotion } from 'framer-motion'
import LandingNav from './sections/LandingNav'
import PainHookSection from './sections/PainHookSection'
import HowItWorksSection from './sections/HowItWorksSection'
import ResearchSection from './sections/ResearchSection'
import ComparisonSection from './sections/ComparisonSection'
import FinalCTASection from './sections/FinalCTASection'
import LandingFooter from './sections/LandingFooter'

const PAGE_TITLE = 'About ProbSolver — How calibrated readiness scoring works'
const PAGE_DESCRIPTION =
    'The why behind ProbSolver — the gap in interview prep we set out to fix, the cognitive-science research behind every scoring formula, and how the loop works end-to-end.'

export default function AboutPage() {
    const setTheme = useUIStore((s) => s.setTheme)

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
                <AboutHero />
                <PainHookSection />
                <HowItWorksSection />
                <ResearchSection />
                <ComparisonSection />
                <FinalCTASection />
            </main>

            <LandingFooter />
        </div>
    )
}

function AboutHero() {
    const reduce = useReducedMotion()
    const motionProps = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5, ease: 'easeOut' },
        }

    return (
        <section className="relative overflow-hidden border-b border-border-subtle">
            <div
                className="absolute inset-0 -z-10 opacity-60"
                style={{
                    background:
                        'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(124,111,247,0.14), transparent 70%)',
                }}
                aria-hidden="true"
            />
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
                <motion.div {...motionProps}>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-brand-fg-soft mb-4">
                        About
                    </p>
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-text-primary mb-5">
                        Why we built ProbSolver.
                    </h1>
                    <p className="text-lg sm:text-xl text-text-secondary leading-relaxed">
                        Most interview prep tools count what you do.
                        ProbSolver measures whether what you're doing is actually moving you toward an offer —
                        and tells you what to fix when it isn't.
                    </p>
                </motion.div>
            </div>
        </section>
    )
}
