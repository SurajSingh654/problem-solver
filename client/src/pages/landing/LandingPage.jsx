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
// - Theme: respects user choice from useUIStore. First-time visitors get
//   light mode (a warmer first impression, see index.html boot script).
//   Theme toggle is in LandingNav. Hero radar is wrapped in a fixed-dark
//   island so the data viz reads correctly in both themes.
// - Sections are presentational components in ./sections/. No API calls.
// ============================================================================
import { useEffect } from 'react'
import { useUIStore } from '@store/useUIStore'
import LandingNav from './sections/LandingNav'
import LandingHero from './sections/LandingHero'
import TenDimensionsSection from './sections/TenDimensionsSection'
import PillarsSection from './sections/PillarsSection'
import FinalCTASection from './sections/FinalCTASection'
import LandingFooter from './sections/LandingFooter'

const PAGE_TITLE = 'ProbSolver — Calibrated interview readiness, scored across 10 dimensions'
const PAGE_DESCRIPTION =
    'Stop guessing if you\'re interview-ready. ProbSolver scores your readiness across 10 dimensions, calibrates against research-backed thresholds, and tells you exactly what to fix.'

export default function LandingPage() {
    const setTheme = useUIStore((s) => s.setTheme)

    useEffect(() => {
        const previousTitle = document.title
        document.title = PAGE_TITLE

        // Update meta description for users hitting / via deep link.
        // The static index.html has the correct values, but routing within
        // an SPA means a returning user might see a stale title.
        const metaDesc = document.querySelector('meta[name="description"]')
        const previousDesc = metaDesc?.getAttribute('content') ?? null
        if (metaDesc) metaDesc.setAttribute('content', PAGE_DESCRIPTION)

        // Sync the Zustand theme store with what the index.html boot script
        // already applied to <html>. Without this the toggle button shows the
        // wrong icon on first paint (boot script set 'light' on /, but the
        // store still says 'dark' from its default).
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
                <LandingHero />
                <TenDimensionsSection />
                <PillarsSection />
                <FinalCTASection />
            </main>

            <LandingFooter />
        </div>
    )
}
