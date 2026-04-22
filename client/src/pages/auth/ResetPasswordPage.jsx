import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { cn } from '@utils/cn'
import { toast } from '@store/useUIStore'
import { authApi } from '@services/auth.api'

const schema = z.object({
    newPassword: z.string().min(6, 'At least 6 characters'),
    confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
})

export default function ResetPasswordPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const email = location.state?.email || ''

    const [code, setCode] = useState(['', '', '', '', '', ''])
    const [step, setStep] = useState('code') // 'code' | 'password'
    const [resetting, setResetting] = useState(false)
    const inputRefs = useRef([])

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({ resolver: zodResolver(schema) })

    useEffect(() => {
        if (step === 'code') {
            inputRefs.current[0]?.focus()
        }
    }, [step])

    function handleCodeChange(index, value) {
        if (value.length > 1) {
            const digits = value.replace(/\D/g, '').slice(0, 6).split('')
            const newCode = [...code]
            digits.forEach((d, i) => {
                if (index + i < 6) newCode[index + i] = d
            })
            setCode(newCode)
            const nextIndex = Math.min(index + digits.length, 5)
            inputRefs.current[nextIndex]?.focus()

            if (newCode.every(d => d !== '')) {
                setStep('password')
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
            setStep('password')
        }
    }

    function handleCodeKeyDown(index, e) {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    async function onSubmit(data) {
        const fullCode = code.join('')
        if (fullCode.length !== 6) {
            toast.error('Please enter the complete 6-digit code')
            setStep('code')
            return
        }

        setResetting(true)
        try {
            await authApi.resetPasswordWithCode({
                email,
                code: fullCode,
                newPassword: data.newPassword,
            })

            toast.success('Password reset successfully! Please log in.')
            navigate('/login', { replace: true })
        } catch (err) {
            const errorCode = err.response?.data?.code
            if (errorCode === 'CODE_EXPIRED') {
                toast.error('Code expired. Go back and request a new one.')
            } else if (errorCode === 'INVALID_CODE') {
                toast.error('Invalid code. Please check and try again.')
                setStep('code')
                setCode(['', '', '', '', '', ''])
            } else {
                toast.error(err.response?.data?.error || 'Reset failed')
            }
        } finally {
            setResetting(false)
        }
    }

    if (!email) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
                <div className="text-center">
                    <p className="text-text-secondary mb-4">
                        No email provided. Start the reset process from the beginning.
                    </p>
                    <Link to="/auth/forgot-password"
                        className="text-brand-300 font-semibold hover:text-brand-200">
                        Go to Forgot Password
                    </Link>
                </div>
            </div>
        )
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
                    <div className="px-8 pt-8 pb-4 text-center">
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                            className="w-14 h-14 rounded-2xl bg-danger/15 border border-danger/25
                         flex items-center justify-center text-2xl mx-auto mb-5"
                        >
                            🔑
                        </motion.div>

                        <h1 className="text-xl font-bold text-text-primary mb-1">
                            {step === 'code' ? 'Enter reset code' : 'Set new password'}
                        </h1>
                        <p className="text-sm text-text-secondary">
                            {step === 'code'
                                ? `Enter the 6-digit code sent to ${email}`
                                : 'Choose a strong new password'
                            }
                        </p>
                    </div>

                    <div className="px-8 pb-8">
                        {/* Step 1 — Code input */}
                        {step === 'code' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <div className="flex gap-2 justify-center my-6">
                                    {code.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={el => inputRefs.current[i] = el}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            value={digit}
                                            onChange={e => handleCodeChange(i, e.target.value)}
                                            onKeyDown={e => handleCodeKeyDown(i, e)}
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
                                <p className="text-xs text-text-tertiary text-center">
                                    Code expires in 15 minutes
                                </p>
                            </motion.div>
                        )}

                        {/* Step 2 — New password */}
                        {step === 'password' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {/* Show entered code */}
                                <div className="flex items-center justify-center gap-2 mb-6
                                bg-success/8 border border-success/25 rounded-xl py-3">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                        stroke="#22c55e" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span className="text-xs font-semibold text-success">
                                        Code verified: {code.join('')}
                                    </span>
                                    <button
                                        onClick={() => { setStep('code'); setCode(['', '', '', '', '', '']) }}
                                        className="text-[10px] text-text-disabled hover:text-text-tertiary
                               ml-2 transition-colors"
                                    >
                                        Change
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                    <Input
                                        label="New Password"
                                        type="password"
                                        placeholder="Minimum 6 characters"
                                        autoFocus
                                        error={errors.newPassword?.message}
                                        leftIcon={
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2"
                                                strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                            </svg>
                                        }
                                        {...register('newPassword')}
                                    />

                                    <Input
                                        label="Confirm Password"
                                        type="password"
                                        placeholder="Repeat new password"
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
                                            loading={resetting}
                                        >
                                            Reset Password
                                        </Button>
                                    </div>
                                </form>
                            </motion.div>
                        )}

                        {/* Back to login */}
                        <div className="text-center mt-5">
                            <Link
                                to="/auth/login"
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