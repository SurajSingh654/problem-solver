import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { useChangePassword } from '@hooks/useAuth'
import { useAuthStore } from '@store/useAuthStore'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'

const schema = z.object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(6, 'At least 6 characters'),
    confirmPassword: z.string(),
}).refine(
    d => d.newPassword === d.confirmPassword,
    { message: 'Passwords do not match', path: ['confirmPassword'] }
)

export default function ChangePasswordPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const changePassword = useChangePassword()
    const isForced = user?.mustChangePassword

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({ resolver: zodResolver(schema) })

    async function onSubmit(data) {
        try {
            await changePassword.mutateAsync({
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            })
            navigate('/')
        } catch {
            // error handled by hook
        }
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
                        <div className="flex items-center gap-3 mb-8">
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
                        </div>

                        {/* Title */}
                        {isForced ? (
                            <>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-warning/15 border border-warning/30
                                  flex items-center justify-center text-base flex-shrink-0">
                                        🔑
                                    </div>
                                    <h1 className="text-xl font-bold text-text-primary">
                                        Password Reset Required
                                    </h1>
                                </div>
                                <p className="text-sm text-text-secondary mb-1">
                                    Your admin has set a temporary password for you.
                                </p>
                                <p className="text-sm text-warning font-medium mb-0">
                                    You must set a new password before continuing.
                                </p>
                            </>
                        ) : (
                            <>
                                <h1 className="text-2xl font-bold text-text-primary mb-1">
                                    Change Password
                                </h1>
                                <p className="text-sm text-text-secondary">
                                    Choose a strong password for your account
                                </p>
                            </>
                        )}
                    </div>

                    <form
                        onSubmit={handleSubmit(onSubmit)}
                        className="px-8 pb-8 flex flex-col gap-4"
                    >
                        <Input
                            label={isForced ? 'Temporary Password' : 'Current Password'}
                            type="password"
                            placeholder="Enter current password"
                            autoFocus
                            error={errors.currentPassword?.message}
                            leftIcon={
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            }
                            {...register('currentPassword')}
                        />

                        <Input
                            label="New Password"
                            type="password"
                            placeholder="Minimum 6 characters"
                            error={errors.newPassword?.message}
                            leftIcon={
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 11l3 3L22 4" />
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                            }
                            {...register('newPassword')}
                        />

                        <Input
                            label="Confirm New Password"
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
                                loading={changePassword.isPending}
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                {isForced ? 'Set New Password' : 'Change Password'}
                            </Button>
                        </div>

                        {!isForced && (
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="text-center text-sm text-text-tertiary
                           hover:text-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                    </form>
                </div>
            </motion.div>
        </div>
    )
}