import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import useAuthStore from '@store/useAuthStore'

export default function FinalCTASection() {
    const reduce = useReducedMotion()
    const { isAuthenticated, user } = useAuthStore()
    const dashboardHref = user?.globalRole === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard'

    const motionProps = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 24 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-100px' },
            transition: { duration: 0.6, ease: 'easeOut' },
        }

    return (
        <section className="py-20 lg:py-32 border-t border-border-subtle">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
                <motion.div
                    className="relative bg-surface-1 border border-brand-line rounded-3xl p-10 sm:p-14 text-center overflow-hidden"
                    style={{ boxShadow: '0 0 80px rgba(124,111,247,0.25)' }}
                    {...motionProps}
                >
                    {/* Soft brand glow underlay */}
                    <div
                        className="absolute inset-0 -z-10 opacity-60"
                        style={{
                            background:
                                'radial-gradient(ellipse 100% 80% at 50% 0%, rgba(124,111,247,0.18), transparent 70%)',
                        }}
                        aria-hidden="true"
                    />

                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary mb-4 leading-tight">
                        Stop measuring problems solved.{' '}
                        <span className="text-brand-fg">Start measuring readiness.</span>
                    </h2>
                    <p className="text-lg text-text-secondary mb-8 max-w-xl mx-auto">
                        Get your first 10D readiness score in under five minutes. Personal mode is free forever.
                    </p>
                    {isAuthenticated && user ? (
                        <Link to={dashboardHref}>
                            <Button variant="primary" size="xl">
                                Go to Dashboard →
                            </Button>
                        </Link>
                    ) : (
                        <>
                            <Link to="/auth/register">
                                <Button variant="primary" size="xl">
                                    Start Free →
                                </Button>
                            </Link>
                            <p className="text-xs text-text-disabled mt-4">
                                No credit card. Personal mode forever free.
                            </p>
                        </>
                    )}
                </motion.div>
            </div>
        </section>
    )
}
