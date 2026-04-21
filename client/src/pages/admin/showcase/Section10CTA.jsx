import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Section } from './components'
import { Button } from '@components/ui/Button'

export default function Section10CTA() {
    const navigate = useNavigate()

    return (
        <Section id="cta">
            <div className="relative overflow-hidden"
                style={{ background: 'linear-gradient(160deg, #0e0a1e 0%, #111118 40%, #16162a 100%)' }}>
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
                        className="mb-8"
                    >
                        <div className="text-5xl mb-6">⚡</div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                            Ready to transform how<br />
                            <span className="bg-gradient-to-r from-brand-300 to-success bg-clip-text text-transparent">
                                your team prepares for interviews?
                            </span>
                        </h2>
                        <p className="text-base text-white/60 max-w-lg mx-auto leading-relaxed mb-8">
                            ProbSolver replaces scattered LeetCode practice, lost Google Docs,
                            and guesswork with one intelligent platform that covers every
                            interview round, tracks every dimension, and coaches with AI.
                        </p>
                    </motion.div>

                    {/* CTA buttons */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10"
                    >
                        <Button variant="primary" size="lg" onClick={() => navigate('/mock-interview')} className="px-8">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            Try AI Mock Interview
                        </Button>
                        <Button variant="secondary" size="lg" onClick={() => navigate('/problems')} className="px-8">
                            Browse Problems
                        </Button>
                    </motion.div>

                    {/* Quick links */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-wrap justify-center gap-3"
                    >
                        {[
                            { label: 'Problems', to: '/problems', icon: '📋' },
                            { label: 'AI Interview', to: '/mock-interview', icon: '💬' },
                            { label: 'Quiz', to: '/quizzes', icon: '🧩' },
                            { label: 'Report', to: '/report', icon: '📊' },
                            { label: 'Leaderboard', to: '/leaderboard', icon: '🏆' },
                            { label: 'Admin', to: '/admin', icon: '👑' },
                            { label: 'Docs', to: '/docs/readme', icon: '📖' },
                        ].map(link => (
                            <button
                                key={link.to}
                                onClick={() => navigate(link.to)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl
                           bg-white/5 border border-white/10
                           text-xs font-semibold text-white/70
                           hover:text-white hover:bg-white/10
                           hover:border-white/20 transition-all"
                            >
                                <span>{link.icon}</span>
                                {link.label}
                            </button>
                        ))}
                    </motion.div>

                    {/* Footer */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="mt-16 pt-8 border-t border-white/6"
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
                            Team Edition · v2.0.0 · Built with React, Express, Prisma, pgvector, GPT-4o & WebSocket
                        </p>
                        <p className="text-[10px] text-white/20 mt-2">
                            Self-hosted · Your data · Your infrastructure · Your team's success
                        </p>
                    </motion.div>
                </div>
            </div>
        </Section>
    )
}