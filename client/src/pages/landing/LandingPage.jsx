// ============================================================================
// ProbSolver — Public Landing Page
// ============================================================================
//
// Cold visitors land here. Authenticated users are redirected to /dashboard
// by PublicOrAuthRedirect (sibling concern, not this file's job).
//
// CONTENT PRINCIPLES:
// - Research-backed analytical voice — every claim should be defensible.
// - Show only what's actually shipped + flag-ON in production. The 10D
//   readiness section assumes all FEATURE_*_V2 flags are ON; if they aren't,
//   flip them before deploying landing-page changes.
// - Notes (FEATURE_NOTES_ENABLED) and Teaching (FEATURE_TEACHING_SESSIONS)
//   are NOT advertised — both still half-built. Mention SM-2 spaced
//   repetition only as a feature footnote, never as a section.
//
// ARCHITECTURE:
// - Eager-loaded (no React.lazy). Spinner-fallback on a landing page is bad
//   UX. Cost: small bundle delta, acceptable.
// - Force dark theme via the `force-dark-theme` utility on the root wrapper.
//   Brand glow + hero gradient read better dark.
// - Sections are presentational components in ./sections/. No API calls.
// ============================================================================
import { useEffect } from 'react'
import LandingNav from './sections/LandingNav'
import LandingHero from './sections/LandingHero'
import PainHookSection from './sections/PainHookSection'
import TenDimensionsSection from './sections/TenDimensionsSection'
import PillarsSection from './sections/PillarsSection'
import HowItWorksSection from './sections/HowItWorksSection'
import ResearchSection from './sections/ResearchSection'
import ComparisonSection from './sections/ComparisonSection'
import FinalCTASection from './sections/FinalCTASection'
import LandingFooter from './sections/LandingFooter'

const PAGE_TITLE = 'ProbSolver — Calibrated interview readiness, scored across 10 dimensions'
const PAGE_DESCRIPTION =
    'Stop guessing if you\'re interview-ready. ProbSolver scores your readiness across 10 dimensions, calibrates against research-backed thresholds, and tells you exactly what to fix.'

export default function LandingPage() {
    useEffect(() => {
        const previousTitle = document.title
        document.title = PAGE_TITLE

        // Update meta description for users hitting / via deep link.
        // The static index.html has the correct values, but routing within
        // an SPA means a returning user might see a stale title.
        const metaDesc = document.querySelector('meta[name="description"]')
        const previousDesc = metaDesc?.getAttribute('content') ?? null
        if (metaDesc) metaDesc.setAttribute('content', PAGE_DESCRIPTION)

        return () => {
            document.title = previousTitle
            if (metaDesc && previousDesc !== null) {
                metaDesc.setAttribute('content', previousDesc)
            }
        }
    }, [])

    return (
        <div className="force-dark-theme min-h-screen bg-surface-0 text-text-primary">
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
                <LandingHero />
                <PainHookSection />
                <TenDimensionsSection />
                <PillarsSection />
                <HowItWorksSection />
                <ResearchSection />
                <ComparisonSection />
                <FinalCTASection />
            </main>

            <LandingFooter />
        </div>
    )
}
