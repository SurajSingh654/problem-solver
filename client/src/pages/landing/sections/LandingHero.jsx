import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { RadarChart } from '@components/charts/RadarChart'
import useAuthStore from '@store/useAuthStore'

// Mock 10D dimension scores for the hero radar. Numbers chosen to look
// realistic — strong on technical (D1, D2, D4) with mid-tier soft skills
// (D3, D9), reflecting a typical mid-senior IC's profile mid-prep. Values
// are 0–100 to match the live radar's scale.
const MOCK_DIMENSIONS = {
    patternRecognition: 78,
    solutionDepth: 72,
    communication: 64,
    optimization: 81,
    pressurePerformance: 68,
    retention: 70,
    teachingContributions: 55,
    designAptitude: 62,
    behavioralPerformance: 60,
    verificationMetacognition: 74,
}

const MOCK_OVERALL = 68

export default function LandingHero() {
    const reduce = useReducedMotion()
    const { isAuthenticated, user } = useAuthStore()

    const fadeIn = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.5, ease: 'easeOut' },
        }

    const dashboardHref = user?.globalRole === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard'

    return (
        <section className="relative overflow-hidden">
            {/* Hero gradient backdrop — works in both themes via low-opacity
                purple haze. Light surfaces still get the subtle brand glow,
                dark surfaces get a richer wash. */}
            <div
                className="absolute inset-0 -z-10 opacity-80"
                style={{
                    background:
                        'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,111,247,0.18), transparent 70%), radial-gradient(ellipse 60% 50% at 80% 30%, rgba(157,147,249,0.12), transparent 70%)',
                }}
                aria-hidden="true"
            />

            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-32">
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                    {/* Left — copy + CTAs */}
                    <motion.div {...fadeIn}>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-6
                                        rounded-full bg-brand-soft border border-brand-line">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-fg-soft">
                                Calibrated · Research-backed
                            </span>
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] text-text-primary mb-5">
                            Stop guessing if you're{' '}
                            <span className="text-brand-fg">interview-ready</span>.
                        </h1>

                        <p className="text-lg sm:text-xl text-text-secondary leading-relaxed mb-8 max-w-xl">
                            ProbSolver scores your interview readiness across <strong className="text-text-primary">10 dimensions</strong>,
                            calibrates against research-backed thresholds, and tells you exactly what to fix.
                            Built on 50 years of cognitive-science research.
                        </p>

                        <div className="flex flex-wrap gap-3 mb-8">
                            {isAuthenticated && user ? (
                                <Link to={dashboardHref}>
                                    <Button variant="primary" size="lg">
                                        Go to Dashboard →
                                    </Button>
                                </Link>
                            ) : (
                                <Link to="/auth/register">
                                    <Button variant="primary" size="lg">
                                        Start Free
                                    </Button>
                                </Link>
                            )}
                            <a href="#ten-dimensions">
                                <Button variant="secondary" size="lg">
                                    See how it scores you →
                                </Button>
                            </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="brand" size="xs">📊 Multi-modal</Badge>
                            <Badge variant="success" size="xs">🎯 Calibrated</Badge>
                            <Badge variant="info" size="xs">📚 Research-backed</Badge>
                        </div>
                    </motion.div>

                    {/* Right — animated radar in a fixed-dark island so the
                        chart's hardcoded white text stays readable in light
                        mode. Functions as a "data viz card" — same idea as
                        a screenshot held in a frame. */}
                    <motion.div
                        className="relative flex items-center justify-center"
                        {...(reduce
                            ? {}
                            : {
                                initial: { opacity: 0, scale: 0.95 },
                                animate: { opacity: 1, scale: 1 },
                                transition: { duration: 0.7, delay: 0.15, ease: 'easeOut' },
                            })}
                    >
                        {/* Soft brand glow underlay */}
                        <div
                            className="absolute inset-0 -z-10"
                            style={{
                                background:
                                    'radial-gradient(circle at center, rgba(124,111,247,0.25), transparent 60%)',
                                filter: 'blur(40px)',
                            }}
                            aria-hidden="true"
                        />
                        <div
                            className="border border-white/10 rounded-3xl p-8 shadow-2xl"
                            style={{
                                backgroundColor: '#111118',
                                boxShadow: '0 20px 60px -10px rgba(124,111,247,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
                            }}
                        >
                            <RadarChart
                                dimensions={MOCK_DIMENSIONS}
                                overall={MOCK_OVERALL}
                                size={340}
                            />
                            <div className="mt-2 text-center">
                                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'rgba(238,238,245,0.4)' }}>
                                    Sample 10D readiness profile
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}
