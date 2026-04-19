import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { cn } from '@utils/cn'
import { toast } from '@store/useUIStore'
import { authApi } from '@services/auth.api'

export default function ForgotPasswordPage() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        if (!email.trim()) {
            toast.error('Please enter your email')
            return
        }

        setSending(true)
        try {
            await authApi.forgotPassword(email.trim())
            setSent(true)
            toast.success('Reset code sent! Check your email.')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to send reset code')
        } finally {
            setSending(false)
        }
    }

    if (sent) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                    className="w-full max-w-[420px]"
                >
                    <div className="bg-surface-1 border border-border-default rounded-2xl
                          overflow-hidden shadow-xl">
                        <div className="px-8 pt-8 pb-4 text-center">
                            <motion.div
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                                className="w-14 h-14 rounded-2xl bg-success/15 border border-success/25
                           flex items-center justify-center text-2xl mx-auto mb-5"
                            >
                                📧
                            </motion.div>
                            <h1 className="text-xl font-bold text-text-primary mb-1">
                                Check your email
                            </h1>
                            <p className="text-sm text-text-secondary mb-1">
                                We sent a 6-digit reset code to
                            </p>
                            <p className="text-sm font-semibold text-brand-300">
                                {email}
                            </p>
                        </div>

                        <div className="px-8 pb-8">
                            <Button
                                variant="primary"
                                size="lg"
                                fullWidth
                                onClick={() => navigate('/reset-password', { state: { email } })}
                                className="mt-4"
                            >
                                Enter Reset Code
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                    <polyline points="12 5 19 12 12 19" />
                                </svg>
                            </Button>

                            <div className="text-center mt-5">
                                <button
                                    onClick={() => setSent(false)}
                                    className="text-xs text-text-tertiary hover:text-text-secondary
                             transition-colors"
                                >
                                    Didn't receive it? Try again
                                </button>
                            </div>

                            <div className="text-center mt-3">
                                <Link
                                    to="/login"
                                    className="text-xs text-brand-300 font-semibold
                             hover:text-brand-200 transition-colors"
                                >
                                    ← Back to Login
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                className="w-full max-w-[420px]"
            >
                <div className="bg-surface-1 border border-border-default rounded-2xl
                        overflow-hidden shadow-xl">
                    <div className="px-8 pt-8 pb-6">
                        {/* Logo */}
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                            className="flex items-center gap-3 mb-8"
                        >
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400
                              to-blue-500 flex items-center justify-center shadow-glow-sm">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                                    stroke="white" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="16 18 22 12 16 6" />
                                    <polyline points="8 6 2 12 8 18" />
                                </svg>
                            </div>
                            <span className="text-lg font-extrabold bg-gradient-to-r from-brand-300
                               to-blue-400 bg-clip-text text-transparent">
                                ProbSolver
                            </span>
                        </motion.div>

                        <h1 className="text-2xl font-bold text-text-primary mb-1">
                            Reset your password
                        </h1>
                        <p className="text-sm text-text-secondary">
                            Enter your email and we'll send you a reset code
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="px-8 pb-8 flex flex-col gap-4">
                        <Input
                            label="Email"
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            autoFocus
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            leftIcon={
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                            }
                        />

                        <div className="pt-1">
                            <Button
                                type="submit"
                                size="lg"
                                fullWidth
                                loading={sending}
                            >
                                Send Reset Code
                            </Button>
                        </div>

                        <p className="text-center text-sm text-text-secondary">
                            Remember your password?{' '}
                            <Link
                                to="/login"
                                className="text-brand-300 font-semibold hover:text-brand-200
                           transition-colors"
                            >
                                Sign in
                            </Link>
                        </p>
                    </form>
                </div>
            </motion.div>
        </div>
    )
}