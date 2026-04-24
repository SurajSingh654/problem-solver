import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Section } from './components'

export default function Section8CTA() {
    const navigate = useNavigate()

    return (
        <Section id="cta">
            <div className="relative overflow-hidden hero-gradient">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-[-100px] left-[20%] w-[400px] h-[400px]
                          rounded-full bg-brand-400/8 blur-[120px]" />
                    <div className="absolute bottom-[-100px] right-[10%] w-[300px] h-[300px]
                          rounded-full bg-success/5 blur-[100px]" />
                </div>

                <div className="relative z-10 max-w-[800px] mx-auto px-8 py-24 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                    >
                        <div className="text-5xl mb-6">⚡</div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                            Ready to actually prepare<br />
                            <span className="bg-gradient-to-r from-brand-300 to-success bg-clip-text text-transparent">
                                for your next interview?
                            </span>
                        </h2>
                        <p className="text-base text-white/55 max-w-lg mx-auto leading-relaxed mb-10">
                            Stop grinding random problems with no feedback.
                            Start practicing with AI that coaches you, teammates that challenge you,
                            and data that tells you when you're actually ready.
                        </p>
                    </motion.div>

                    {/* CTA buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
                    >
                        <button
                            onClick={() => navigate('/auth/register')}
                            className="px-10 py-4 rounded-xl bg-brand-400 text-white font-bold text-base
                         hover:bg-brand-400/90 transition-all shadow-glow-sm
                         flex items-center gap-2"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Start Practicing Free
                        </button>
                        <button
                            onClick={() => navigate('/auth/login')}
                            className="px-10 py-4 rounded-xl bg-white/5 border border-white/15
                         text-white/80 font-bold text-base hover:bg-white/10
                         hover:border-white/25 transition-all"
                        >
                            Sign In
                        </button>
                    </motion.div>

                    {/* Quick feature links */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-wrap justify-center gap-3 mb-16"
                    >
                        {[
                            { label: 'Problems', icon: '📋' },
                            { label: 'AI Interview', icon: '💬' },
                            { label: 'Quizzes', icon: '🧩' },
                            { label: '6D Report', icon: '📊' },
                            { label: 'Leaderboard', icon: '🏆' },
                            { label: 'Review Queue', icon: '🧠' },
                        ].map(link => (
                            <span
                                key={link.label}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl
                           bg-white/5 border border-white/10
                           text-xs font-semibold text-white/50"
                            >
                                <span>{link.icon}</span>
                                {link.label}
                            </span>
                        ))}
                    </motion.div>

                    {/* Footer */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="pt-8 border-t border-white/6"
                    >
                        <div className="flex items-center justify-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-blue-500
                              flex items-center justify-center">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                    stroke="white" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="16 18 22 12 16 6" />
                                    <polyline points="8 6 2 12 8 18" />
                                </svg>
                            </div>
                            <span className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                               to-blue-400 bg-clip-text text-transparent">
                                ProbSolver
                            </span>
                        </div>
                        <p className="text-xs text-white/30">
                            v3.0 · Built with React, Express, Prisma, pgvector, GPT-4o & WebSocket
                        </p>
                        <p className="text-[10px] text-white/20 mt-2">
                            AI-Powered Interview Intelligence Platform
                        </p>
                    </motion.div>
                </div>
            </div>
        </Section>
    )
}