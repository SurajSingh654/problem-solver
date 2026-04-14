import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { useLogin } from '@hooks/useAuth'
import { useAuthStore } from '@store/useAuthStore'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'

// ── Validation schema ──────────────────────────────────
const loginSchema = z.object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(1, 'Password is required'),
})

// ── Floating particle component ────────────────────────
function Particle({ style }) {
    return (
        <motion.div
            className="absolute rounded-full bg-brand-400/10 pointer-events-none"
            animate={{
                y: [0, -30, 0],
                opacity: [0.3, 0.7, 0.3],
                scale: [1, 1.2, 1],
            }}
            transition={{
                duration: style.duration,
                repeat: Infinity,
                delay: style.delay,
                ease: 'easeInOut',
            }}
            style={{
                width: style.size,
                height: style.size,
                left: style.left,
                top: style.top,
            }}
        />
    )
}

const particles = [
    { size: '80px', left: '10%', top: '15%', duration: 6, delay: 0 },
    { size: '120px', left: '80%', top: '10%', duration: 8, delay: 1 },
    { size: '60px', left: '60%', top: '70%', duration: 7, delay: 0.5 },
    { size: '100px', left: '25%', top: '75%', duration: 9, delay: 1.5 },
    { size: '40px', left: '90%', top: '50%', duration: 5, delay: 2 },
]

export default function Login() {
    const { isAuthenticated } = useAuthStore()
    const navigate = useNavigate()
    const loginMutation = useLogin()

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setError,
    } = useForm({ resolver: zodResolver(loginSchema) })

    // Already logged in → redirect
    useEffect(() => {
        if (isAuthenticated) navigate('/', { replace: true })
    }, [isAuthenticated, navigate])

    const onSubmit = async (data) => {
        try {
            await loginMutation.mutateAsync(data)
        } catch (err) {
            const msg = err.response?.data?.error || 'Login failed'
            const code = err.response?.data?.code

            if (code === 'UNAUTHORIZED') {
                // Show error inline rather than just toast
                setError('password', { message: msg })
            }
        }
    }

    return (
        <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4 relative overflow-hidden">

            {/* Background orb */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] rounded-full bg-brand-400/5 blur-[120px]" />
                <div className="absolute bottom-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px]" />
            </div>

            {/* Floating particles */}
            {particles.map((p, i) => <Particle key={i} style={p} />)}

            {/* Card */}
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                className="relative w-full max-w-[420px] z-10"
            >

                {/* Glow effect behind card */}
                <div className="absolute inset-0 bg-brand-400/10 rounded-2xl blur-2xl scale-95 -z-10" />

                <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden shadow-xl">

                    {/* Header */}
                    <div className="px-8 pt-8 pb-6">

                        {/* Logo */}
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                            className="flex items-center gap-3 mb-8"
                        >
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
                        </motion.div>

                        {/* Title */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                        >
                            <h1 className="text-2xl font-bold text-text-primary mb-1">
                                Welcome back
                            </h1>
                            <p className="text-sm text-text-secondary">
                                Sign in to your team's workspace
                            </p>
                        </motion.div>

                    </div>

                    {/* Form */}
                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        className="px-8 pb-8 flex flex-col gap-4"
                    >

                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <Input
                                label="Email"
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                autoFocus
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
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                        >
                            <Input
                                label="Password"
                                type="password"
                                placeholder="Enter your password"
                                autoComplete="current-password"
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
                        </motion.div>

                        {/* Submit */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="pt-1"
                        >
                            <Button
                                type="submit"
                                size="lg"
                                fullWidth
                                loading={loginMutation.isPending}
                            >
                                Sign In
                                {!loginMutation.isPending && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                        <polyline points="12 5 19 12 12 19" />
                                    </svg>
                                )}
                            </Button>
                        </motion.div>

                        {/* Divider */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.35 }}
                            className="flex items-center gap-3 py-1"
                        >
                            <div className="flex-1 h-px bg-border-subtle" />
                            <span className="text-xs text-text-tertiary">or</span>
                            <div className="flex-1 h-px bg-border-subtle" />
                        </motion.div>

                        {/* Register link */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-center text-sm text-text-secondary"
                        >
                            Don't have an account?{' '}
                            <Link
                                to="/register"
                                className="text-brand-300 font-semibold hover:text-brand-200 transition-colors"
                            >
                                Create one
                            </Link>
                        </motion.p>

                    </form>

                </div>
                {/* Forgot password hint */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center text-xs text-text-tertiary mt-4"
                >
                    Forgot your password?{' '}
                    <span className="text-brand-300 font-semibold">
                        Contact your admin to reset it.
                    </span>
                </motion.p>
            </motion.div>
        </div>
    )
}