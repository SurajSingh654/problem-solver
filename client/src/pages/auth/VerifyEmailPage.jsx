// ============================================================================
// ProbSolver v3.0 — Email Verification Page
// ============================================================================
import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { cn } from '@utils/cn'
import { toast } from '@store/useUIStore'
import api from '@services/api'
import useAuthStore from '@store/useAuthStore'

export default function VerifyEmailPage() {
    const navigate = useNavigate()
    const location = useLocation()

    const [email, setEmail] = useState(location.state?.email || '')
    const [code, setCode] = useState(['', '', '', '', '', ''])
    const [verifying, setVerifying] = useState(false)
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(0)

    // Wrong email fix state
    const [showEmailEdit, setShowEmailEdit] = useState(false)
    const [newEmail, setNewEmail] = useState('')
    const [emailUpdating, setEmailUpdating] = useState(false)

    const inputRefs = useRef([])

    // Cooldown timer for resend
    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    // Auto-focus first input
    useEffect(() => {
        inputRefs.current[0]?.focus()
    }, [])

    function handleChange(index, value) {
        if (value.length > 1) {
            // Handle paste — distribute digits across inputs
            const digits = value.replace(/\D/g, '').slice(0, 6).split('')
            const newCode = [...code]
            digits.forEach((d, i) => {
                if (index + i < 6) newCode[index + i] = d
            })
            setCode(newCode)
            const nextIndex = Math.min(index + digits.length, 5)
            inputRefs.current[nextIndex]?.focus()
            if (newCode.every(d => d !== '')) {
                handleVerify(newCode.join(''))
            }
            return
        }

        const digit = value.replace(/\D/g, '')
        const newCode = [...code]
        newCode[index] = digit
        setCode(newCode)

        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }

        if (newCode.every(d => d !== '')) {
            handleVerify(newCode.join(''))
        }
    }

    function handleKeyDown(index, e) {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    async function handleVerify(codeStr) {
        const fullCode = codeStr || code.join('')
        if (fullCode.length !== 6) {
            toast.error('Please enter the complete 6-digit code')
            return
        }

        setVerifying(true)
        try {
            const res = await api.post('/auth/verify-email', {
                email,
                code: fullCode,
            })

            // v3.0: verify returns token + user — auto-login
            const { token, user: verifiedUser } = res.data

            if (token && verifiedUser) {
                // Auto-login: store token and redirect to onboarding
                const { setAuth } = useAuthStore.getState()
                setAuth(token, verifiedUser)
                toast.success('Email verified! Welcome to ProbSolver 🎉')

                if (!verifiedUser.onboardingComplete) {
                    navigate('/onboarding', { replace: true })
                } else {
                    navigate('/', { replace: true })
                }
            } else {
                toast.success('Email verified! Please log in.')
                navigate('/auth/login', { replace: true })
            }
        } catch (err) {
            const msg = err.response?.data?.error || 'Verification failed'
            toast.error(msg)
            setCode(['', '', '', '', '', ''])
            inputRefs.current[0]?.focus()
        } finally {
            setVerifying(false)
        }
    }

    async function handleResend() {
        if (cooldown > 0 || !email) return

        setResending(true)
        try {
            await api.post('/auth/resend-verify', { email })
            toast.success('New code sent! Check your email.')
            setCooldown(60)
            setCode(['', '', '', '', '', ''])
            inputRefs.current[0]?.focus()
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to resend code.')
        } finally {
            setResending(false)
        }
    }

    async function handleUpdateEmail() {
        if (!newEmail.trim() || !email) return

        setEmailUpdating(true)
        try {
            const res = await api.post('/auth/update-unverified-email', {
                currentEmail: email,
                newEmail: newEmail.trim(),
            })
            setEmail(res.data.email)
            setNewEmail('')
            setShowEmailEdit(false)
            setCooldown(60)
            setCode(['', '', '', '', '', ''])
            inputRefs.current[0]?.focus()
            toast.success('Email updated! Check your new inbox for the code.')
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update email')
        } finally {
            setEmailUpdating(false)
        }
    }

    return (
        <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                className="w-full max-w-[440px]"
            >
                <div className="bg-surface-1 border border-border-default rounded-2xl
                        overflow-hidden shadow-xl">

                    {/* Header */}
                    <div className="px-8 pt-8 pb-4 text-center">
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                            className="w-14 h-14 rounded-2xl bg-brand-400/15 border border-brand-400/25
                         flex items-center justify-center text-2xl mx-auto mb-5"
                        >
                            📧
                        </motion.div>
                        <h1 className="text-xl font-bold text-text-primary mb-1">
                            Check your email
                        </h1>
                        <p className="text-sm text-text-secondary">
                            We sent a 6-digit code to
                        </p>
                        <p className="text-sm font-semibold text-brand-300 mt-0.5">
                            {email || 'your email'}
                        </p>
                    </div>

                    {/* Code input */}
                    <div className="px-8 pb-8">
                        <div className="flex gap-2 justify-center my-6">
                            {code.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => inputRefs.current[i] = el}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={digit}
                                    onChange={e => handleChange(i, e.target.value)}
                                    onKeyDown={e => handleKeyDown(i, e)}
                                    onFocus={e => e.target.select()}
                                    className={cn(
                                        'w-12 h-14 text-center text-xl font-extrabold font-mono',
                                        'bg-surface-3 border-2 rounded-xl outline-none',
                                        'transition-all duration-150',
                                        digit
                                            ? 'border-brand-400 text-brand-300'
                                            : 'border-border-strong text-text-primary',
                                        'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20'
                                    )}
                                />
                            ))}
                        </div>

                        {/* Verify button */}
                        <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            loading={verifying}
                            disabled={code.some(d => !d)}
                            onClick={() => handleVerify()}
                        >
                            {verifying ? 'Verifying...' : 'Verify Email'}
                        </Button>

                        {/* Resend */}
                        <div className="text-center mt-5">
                            <p className="text-xs text-text-tertiary mb-2">
                                Didn't receive the code?
                            </p>
                            <button
                                onClick={handleResend}
                                disabled={resending || cooldown > 0}
                                className={cn(
                                    'text-xs font-semibold transition-colors',
                                    cooldown > 0
                                        ? 'text-text-disabled cursor-not-allowed'
                                        : 'text-brand-300 hover:text-brand-200 cursor-pointer'
                                )}
                            >
                                {resending
                                    ? 'Sending...'
                                    : cooldown > 0
                                        ? `Resend in ${cooldown}s`
                                        : 'Resend Code'
                                }
                            </button>
                        </div>

                        {/* Wrong email — update it */}
                        <div className="text-center mt-4 pt-4 border-t border-border-subtle">
                            <button
                                onClick={() => setShowEmailEdit(!showEmailEdit)}
                                className="text-xs text-text-disabled hover:text-text-tertiary
                                           transition-colors"
                            >
                                {showEmailEdit ? 'Cancel' : 'Wrong email? Update it'}
                            </button>

                            <AnimatePresence>
                                {showEmailEdit && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mt-3 space-y-3 text-left">
                                            <Input
                                                label="Correct Email"
                                                type="email"
                                                placeholder="your-correct@email.com"
                                                value={newEmail}
                                                onChange={(e) => setNewEmail(e.target.value)}
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                fullWidth
                                                loading={emailUpdating}
                                                disabled={!newEmail.trim()}
                                                onClick={handleUpdateEmail}
                                            >
                                                Update Email & Resend Code
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Back to login */}
                        <div className="text-center mt-3">
                            <button
                                onClick={() => navigate('/auth/login')}
                                className="text-xs text-text-disabled hover:text-text-tertiary
                                           transition-colors"
                            >
                                ← Back to login
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}