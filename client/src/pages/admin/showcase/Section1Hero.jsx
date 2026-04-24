import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { cn } from '@utils/cn'
import { Section, AnimatedNumber } from './components'

export default function Section1Hero({ stats }) {
    const navigate = useNavigate()

    return (
        <Section id="hero">
            <div className="relative overflow-hidden hero-gradient">
                {/* Background orbs */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-[-200px] right-[-150px] w-[600px] h-[600px]
                          rounded-full bg-brand-400/8 blur-[150px]" />
                    <div className="absolute bottom-[-150px] left-[-100px] w-[500px] h-[500px]
                          rounded-full bg-blue-500/6 blur-[120px]" />
                    <div className="absolute top-[40%] left-[50%] w-[300px] h-[300px]
                          rounded-full bg-success/4 blur-[100px]" />
                </div>

                <div className="relative z-10 max-w-[1000px] mx-auto px-8 py-24 sm:py-32">
                    {/* Eyebrow */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 bg-brand-400/10 border border-brand-400/25
                       rounded-full px-4 py-1.5 mb-8"
                    >
                        <div className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
                        <span className="text-xs font-semibold text-brand-300">
                            AI-Powered Interview Intelligence Platform
                        </span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.5 }}
                        className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white
                       tracking-tight leading-[1.1] mb-6"
                    >
                        Prepare smarter, not harder.
                        <br />
                        <span className="bg-gradient-to-r from-brand-300 via-blue-400 to-success
     bg-clip-text text-transparent">
                            Crack any interview with confidence.
                        </span>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg sm:text-xl text-white/55 max-w-2xl mb-10 leading-relaxed"
                    >
                        The complete interview preparation platform — from coding to system design
                        to behavioral to HR. AI that coaches you personally, teams that learn together,
                        and a 6-dimension intelligence engine that tells you exactly when you're ready.
                    </motion.p>

                    {/* CTA buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col sm:flex-row gap-4 mb-16"
                    >
                        <button
                            onClick={() => navigate('/auth/register')}
                            className="px-8 py-3.5 rounded-xl bg-brand-400 text-white font-bold text-sm
                         hover:bg-brand-400/90 transition-all shadow-glow-sm
                         flex items-center justify-center gap-2"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Start Practicing Free
                        </button>
                        <button
                            onClick={() => {
                                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
                            }}
                            className="px-8 py-3.5 rounded-xl bg-white/5 border border-white/15
                         text-white/80 font-bold text-sm hover:bg-white/10
                         hover:border-white/25 transition-all
                         flex items-center justify-center gap-2"
                        >
                            See What's Inside
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </motion.div>

                    {/* Quick stats bar */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex flex-wrap gap-8 sm:gap-12"
                    >
                        {[
                            { value: '6', label: 'Interview Categories', icon: '📋' },
                            { value: '8', label: 'AI Interview Styles', icon: '🤖' },
                            { value: '6', label: 'Readiness Dimensions', icon: '📊' },
                            { value: stats?.totalProblems || '∞', label: 'AI-Generated Content', icon: '🧠' },
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.label}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 + i * 0.08 }}
                                className="flex items-center gap-3"
                            >
                                <span className="text-lg">{stat.icon}</span>
                                <div>
                                    <div className="text-xl font-extrabold font-mono text-white">
                                        {typeof stat.value === 'number' ? (
                                            <AnimatedNumber value={stat.value} />
                                        ) : stat.value}
                                    </div>
                                    <div className="text-[10px] text-white/35 uppercase tracking-wider">
                                        {stat.label}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </Section>
    )
}