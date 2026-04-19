import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { useRegister } from '@hooks/useAuth'
import { useAuthStore } from '@store/useAuthStore'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'

// ── Validation schema ──────────────────────────────────
const registerSchema = z.object({
    username: z
        .string()
        .min(2, 'Username must be at least 2 characters')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, - and _ allowed'),
    email: z
        .string()
        .email('Enter a valid email'),
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters'),
    confirmPassword: z
        .string(),
}).refine(
    data => data.password === data.confirmPassword,
    { message: 'Passwords do not match', path: ['confirmPassword'] }
)

// ── Feature list ───────────────────────────────────────
const features = [
    { icon: '🧠', text: 'Intelligence report across 6 dimensions' },
    { icon: '👥', text: "See your team's solutions side by side" },
    { icon: '⏱️', text: 'Interview simulation with timer' },
    { icon: '🔁', text: 'Spaced repetition to fight forgetting' },
    { icon: '🏆', text: 'Leaderboard to stay accountable' },
    { icon: '🤖', text: 'AI coaching coming in Phase 2' },
]

export default function Register() {
    const { isAuthenticated } = useAuthStore()
    const navigate = useNavigate()
    const registerMutation = useRegister()

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
        setError,
    } = useForm({ resolver: zodResolver(registerSchema) })

    const passwordValue = watch('password', '')

    useEffect(() => {
        if (isAuthenticated) {
            const { user } = useAuthStore.getState()
            if (user?.emailVerified === false) {
                // Don't redirect — let the onSuccess handler navigate to /verify-email
                return
            }
            navigate('/', { replace: true })
        }
    }, [isAuthenticated, navigate])

    const onSubmit = async (data) => {
        try {
            await registerMutation.mutateAsync({
                username: data.username,
                email: data.email,
                password: data.password,
            })
        } catch (err) {
            const code = err.response?.data?.code
            const msg = err.response?.data?.error || 'Registration failed'

            if (code === 'USERNAME_TAKEN') {
                setError('username', { message: msg })
            } else if (code === 'EMAIL_TAKEN') {
                setError('email', { message: msg })
            }
        }
    }

    // Password strength indicator
    const getStrength = (pwd) => {
        if (!pwd) return { score: 0, label: '', color: '' }
        let score = 0
        if (pwd.length >= 6) score++
        if (pwd.length >= 10) score++
        if (/[A-Z]/.test(pwd)) score++
        if (/[0-9]/.test(pwd)) score++
        if (/[^A-Za-z0-9]/.test(pwd)) score++
        if (score <= 1) return { score, label: 'Weak', color: 'bg-danger' }
        if (score <= 2) return { score, label: 'Fair', color: 'bg-warning' }
        if (score <= 3) return { score, label: 'Good', color: 'bg-brand-400' }
        return { score, label: 'Strong', color: 'bg-success' }
    }

    const strength = getStrength(passwordValue)

    return (
        <div className="min-h-screen bg-surface-0 flex relative overflow-hidden">

            {/* Left — form */}
            <div className="flex-1 flex items-center justify-center p-6 relative z-10">

                {/* Background glow */}
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-400/5 rounded-full blur-[120px] pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="w-full max-w-[420px]"
                >

                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-blue-500 flex items-center justify-center shadow-glow-sm">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                                stroke="white" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="16 18 22 12 16 6" />
                                <polyline points="8 6 2 12 8 18" />
                            </svg>
                        </div>
                        <span className="text-lg font-extrabold bg-gradient-to-r from-brand-300 to-blue-400 bg-clip-text text-transparent">
                            ProbSolver
                        </span>
                    </div>

                    {/* Title */}
                    <div className="mb-7">
                        <h1 className="text-2xl font-bold text-text-primary mb-1">
                            Join your team
                        </h1>
                        <p className="text-sm text-text-secondary">
                            Create your account and start your journey
                        </p>
                    </div>

                    {/* Form */}
                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        className="flex flex-col gap-4"
                    >

                        <Input
                            label="Username"
                            placeholder="your-username"
                            autoComplete="username"
                            autoFocus
                            hint="Letters, numbers, - and _ only"
                            error={errors.username?.message}
                            leftIcon={
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            }
                            {...register('username')}
                        />

                        <Input
                            label="Email"
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            error={errors.email?.message}
                            leftIcon={
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                            }
                            {...register('email')}
                        />

                        <div className="flex flex-col gap-1.5">
                            <Input
                                label="Password"
                                type="password"
                                placeholder="Minimum 6 characters"
                                autoComplete="new-password"
                                error={errors.password?.message}
                                leftIcon={
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                }
                                {...register('password')}
                            />

                            {/* Password strength bar */}
                            {passwordValue && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="flex items-center gap-2"
                                >
                                    <div className="flex-1 flex gap-1">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <div
                                                key={i}
                                                className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength.score ? strength.color : 'bg-surface-4'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                    <span className={`text-xs font-medium transition-colors ${strength.score <= 1 ? 'text-danger' :
                                        strength.score <= 2 ? 'text-warning' :
                                            strength.score <= 3 ? 'text-brand-300' :
                                                'text-success'
                                        }`}>
                                        {strength.label}
                                    </span>
                                </motion.div>
                            )}
                        </div>

                        <Input
                            label="Confirm Password"
                            type="password"
                            placeholder="Repeat your password"
                            autoComplete="new-password"
                            error={errors.confirmPassword?.message}
                            leftIcon={
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 11l3 3L22 4" />
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                            }
                            {...register('confirmPassword')}
                        />

                        <div className="pt-1">
                            <Button
                                type="submit"
                                size="lg"
                                fullWidth
                                loading={registerMutation.isPending}
                            >
                                Create Account
                                {!registerMutation.isPending && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                        <polyline points="12 5 19 12 12 19" />
                                    </svg>
                                )}
                            </Button>
                        </div>

                        <p className="text-center text-sm text-text-secondary">
                            Already have an account?{' '}
                            <Link
                                to="/login"
                                className="text-brand-300 font-semibold hover:text-brand-200 transition-colors"
                            >
                                Sign in
                            </Link>
                        </p>

                    </form>
                </motion.div>
            </div>

            {/* Right — feature showcase (hidden on mobile) */}
            <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
                className="hidden lg:flex w-[440px] flex-col justify-center px-12 relative overflow-hidden"
                style={{
                    background: 'linear-gradient(160deg, #111118 0%, #0e0a1e 100%)',
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {/* Background orb */}
                <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-brand-400/8 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute bottom-[-100px] left-[-100px] w-[300px] h-[300px] bg-blue-500/6 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative z-10">
                    {/* Heading */}
                    <div className="mb-10">
                        <div className="inline-flex items-center gap-2 bg-brand-400/10 border border-brand-400/20 rounded-full px-4 py-2 mb-5">
                            <div className="w-2 h-2 bg-success rounded-full animate-pulse-dot" />
                            <span className="text-xs font-semibold text-brand-300">
                                Your team is waiting
                            </span>
                        </div>
                        <h2 className="text-3xl font-extrabold text-text-primary mb-3 leading-tight">
                            Practice together.<br />
                            <span className="bg-gradient-to-r from-brand-300 to-blue-400 bg-clip-text text-transparent">
                                Level up faster.
                            </span>
                        </h2>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            ProbSolver is not just a problem tracker. It is a full
                            learning intelligence system built for teams who are
                            serious about cracking top-tier interviews.
                        </p>
                    </div>

                    {/* Feature list */}
                    <div className="flex flex-col gap-3">
                        {features.map((f, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 + i * 0.07 }}
                                className="flex items-center gap-3 bg-surface-2/40 border border-border-subtle rounded-xl px-4 py-3"
                            >
                                <span className="text-xl flex-shrink-0">{f.icon}</span>
                                <span className="text-sm text-text-secondary">{f.text}</span>
                            </motion.div>
                        ))}
                    </div>

                    {/* Social proof */}
                    <div className="mt-8 pt-6 border-t border-border-subtle">
                        <p className="text-xs text-text-tertiary text-center">
                            Built for engineering teams · Self-hosted · Free forever
                        </p>
                    </div>
                </div>
            </motion.div>

        </div>
    )
}