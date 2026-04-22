// ============================================================================
// ProbSolver v3.0 — Settings Page
// ============================================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import { useUIStore, toast } from '@store/useUIStore'
import { useUpdateProfile, useChangePassword, useChangeEmail, useConfirmEmailChange } from '@hooks/useAuth'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { cn } from '@utils/cn'

// ── Avatar color picker ────────────────────────────────
const AVATAR_COLORS = [
    '#7c6ff7', '#22c55e', '#3b82f6', '#ef4444',
    '#eab308', '#ec4899', '#14b8a6', '#f97316',
    '#a855f7', '#06b6d4', '#84cc16', '#f43f5e',
    '#8b5cf6', '#10b981', '#f59e0b', '#6366f1',
]

function ColorPicker({ value, onChange }) {
    return (
        <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map(color => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onChange(color)}
                    className={cn(
                        'w-7 h-7 rounded-full border-2 transition-all',
                        value === color
                            ? 'border-white scale-110'
                            : 'border-transparent hover:scale-105'
                    )}
                    style={{ background: color }}
                />
            ))}
        </div>
    )
}

// ── Section wrapper ────────────────────────────────────
function Section({ title, icon, children }) {
    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl p-6">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-5">
                <span>{icon}</span>
                {title}
            </h2>
            {children}
        </div>
    )
}

// ── Change Email Section ───────────────────────────────
function ChangeEmailSection() {
    const { user } = useAuthStore()
    const [newEmail, setNewEmail] = useState('')
    const [step, setStep] = useState('email')
    const [code, setCode] = useState('')
    const changeEmail = useChangeEmail()
    const confirmChange = useConfirmEmailChange()

    async function handleSendCode() {
        if (!newEmail.trim()) {
            toast.error('Enter a new email address')
            return
        }
        try {
            await changeEmail.mutateAsync(newEmail.trim())
            setStep('verify')
        } catch { /* error handled by hook */ }
    }

    async function handleVerify() {
        if (code.length !== 6) {
            toast.error('Enter the 6-digit code')
            return
        }
        try {
            await confirmChange.mutateAsync(code)
            setStep('email')
            setNewEmail('')
            setCode('')
        } catch { /* error handled by hook */ }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface-2 border border-border-default rounded-xl">
                <span className="text-xs text-text-tertiary">Current email:</span>
                <span className="text-sm font-semibold text-text-primary">{user?.email}</span>
                {user?.isVerified && (
                    <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                           bg-success/12 text-success border border-success/25">
                        Verified
                    </span>
                )}
            </div>

            {step === 'email' && (
                <div className="space-y-3">
                    <Input
                        label="New Email Address"
                        type="email"
                        placeholder="new-email@example.com"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={changeEmail.isPending}
                        disabled={!newEmail.trim()}
                        onClick={handleSendCode}
                    >
                        Send Verification Code
                    </Button>
                </div>
            )}

            {step === 'verify' && (
                <div className="space-y-3">
                    <p className="text-xs text-text-tertiary">
                        A 6-digit code was sent to <span className="text-brand-300 font-semibold">{newEmail}</span>
                    </p>
                    <Input
                        label="Verification Code"
                        placeholder="Enter 6-digit code"
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            loading={confirmChange.isPending}
                            disabled={code.length !== 6}
                            onClick={handleVerify}
                        >
                            Confirm Change
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { setStep('email'); setCode('') }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function SettingsPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const { theme, toggleTheme } = useUIStore()
    const updateProfile = useUpdateProfile()
    const changePassword = useChangePassword()

    const [avatarColor, setAvatarColor] = useState(user?.avatarUrl || '#7c6ff7')
    const [saved, setSaved] = useState(false)

    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const isTeamAdmin = user?.teamRole === 'TEAM_ADMIN'
    const isPersonal = user?.currentTeamId === user?.personalTeamId

    const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm({
        defaultValues: {
            name: user?.name || '',
            targetCompany: user?.targetCompany || '',
            interviewDate: user?.interviewDate
                ? new Date(user.interviewDate).toISOString().split('T')[0]
                : '',
            preferredLanguage: user?.preferredLanguage || '',
        },
    })

    useEffect(() => {
        if (user) {
            reset({
                name: user.name || '',
                targetCompany: user.targetCompany || '',
                interviewDate: user.interviewDate
                    ? new Date(user.interviewDate).toISOString().split('T')[0]
                    : '',
                preferredLanguage: user.preferredLanguage || '',
            })
            setAvatarColor(user.avatarUrl || '#7c6ff7')
        }
    }, [user?.name])

    async function onSave(data) {
        try {
            await updateProfile.mutateAsync({
                name: data.name || undefined,
                avatarUrl: avatarColor || undefined,
                targetCompany: data.targetCompany || null,
                interviewDate: data.interviewDate || null,
                preferredLanguage: data.preferredLanguage || null,
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } catch { /* error handled by hook */ }
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">Settings</h1>
                <p className="text-sm text-text-tertiary">
                    Manage your profile, preferences, and account
                </p>
            </div>

            <form onSubmit={handleSubmit(onSave)} className="space-y-5">

                {/* ── Profile ──────────────────────────────── */}
                <Section title="Profile" icon="👤">
                    <div className="flex items-center gap-4 mb-5 p-4
                          bg-surface-2 border border-border-default rounded-xl">
                        <Avatar
                            name={user?.name}
                            color={avatarColor}
                            size="lg"
                        />
                        <div>
                            <p className="text-sm font-bold text-text-primary">
                                {user?.name}
                            </p>
                            <p className="text-xs text-text-tertiary mt-0.5">
                                {user?.email}
                            </p>
                            <Badge
                                variant={isSuperAdmin ? 'danger' : isTeamAdmin ? 'warning' : 'brand'}
                                size="xs"
                                className="mt-1.5"
                            >
                                {isSuperAdmin ? '🛡️ Super Admin'
                                    : isTeamAdmin ? '👑 Team Admin'
                                        : '👤 Member'}
                            </Badge>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input
                            label="Display Name"
                            placeholder="Your name"
                            error={errors.name?.message}
                            {...register('name', {
                                minLength: { value: 2, message: 'At least 2 characters' },
                                maxLength: { value: 100, message: 'At most 100 characters' },
                            })}
                        />
                        <div>
                            <label className="block text-sm font-semibold text-text-primary mb-2">
                                Avatar Color
                            </label>
                            <ColorPicker value={avatarColor} onChange={setAvatarColor} />
                        </div>
                    </div>
                </Section>

                {/* ── Team Info (not for SUPER_ADMIN) ──────── */}
                {!isSuperAdmin && (
                    <Section title="Team" icon="👥">
                        <div className="flex items-center justify-between p-4
                              bg-surface-2 border border-border-default rounded-xl">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">{isPersonal ? '🧠' : '👥'}</span>
                                <div>
                                    <p className="text-sm font-bold text-text-primary">
                                        {isPersonal ? 'Individual Mode' : (user?.currentTeam?.name || 'Team')}
                                    </p>
                                    <p className="text-xs text-text-tertiary mt-0.5">
                                        {isPersonal
                                            ? 'Practicing solo with AI-generated content'
                                            : `Role: ${isTeamAdmin ? 'Team Admin' : 'Member'}`}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate('/team')}
                            >
                                {isPersonal ? 'Join Team' : 'Manage'}
                            </Button>
                        </div>
                    </Section>
                )}

                {/* ── Change Password ───────────────────────── */}
                <Section title="Change Password" icon="🔑">
                    <div className="space-y-4">
                        <Input
                            label="Current Password"
                            type="password"
                            placeholder="Enter current password"
                            {...register('currentPassword')}
                        />
                        <Input
                            label="New Password"
                            type="password"
                            placeholder="Minimum 8 characters"
                            error={errors.newPassword?.message}
                            {...register('newPassword', {
                                minLength: { value: 8, message: 'At least 8 characters' },
                            })}
                        />
                        <Input
                            label="Confirm New Password"
                            type="password"
                            placeholder="Repeat new password"
                            error={errors.confirmNewPassword?.message}
                            {...register('confirmNewPassword')}
                        />
                        {watch('currentPassword') && watch('newPassword') && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="md"
                                loading={changePassword.isPending}
                                onClick={handleSubmit(async (data) => {
                                    if (data.newPassword !== data.confirmNewPassword) {
                                        toast.error('Passwords do not match')
                                        return
                                    }
                                    try {
                                        await changePassword.mutateAsync({
                                            currentPassword: data.currentPassword,
                                            newPassword: data.newPassword,
                                        })
                                        setValue('currentPassword', '')
                                        setValue('newPassword', '')
                                        setValue('confirmNewPassword', '')
                                    } catch { /* error handled by hook */ }
                                })}
                            >
                                Update Password
                            </Button>
                        )}
                    </div>
                </Section>

                {/* ── Change Email ───────────────────────────── */}
                <Section title="Change Email" icon="📧">
                    <ChangeEmailSection />
                </Section>

                {/* ── Interview Goals (not for SUPER_ADMIN) ── */}
                {!isSuperAdmin && (
                    <Section title="Interview Goals" icon="🎯">
                        <div className="space-y-4">
                            <Input
                                label="Target Company"
                                placeholder="e.g. Google, Amazon, Meta"
                                {...register('targetCompany')}
                            />
                            <Input
                                label="Interview Date"
                                type="date"
                                hint="When is your interview?"
                                {...register('interviewDate')}
                            />
                            <Input
                                label="Preferred Language"
                                placeholder="e.g. JavaScript, Python, Java"
                                {...register('preferredLanguage')}
                            />
                        </div>
                    </Section>
                )}

                {/* ── Appearance ───────────────────────────── */}
                <Section title="Appearance" icon="🎨">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-text-primary">Theme</p>
                            <p className="text-xs text-text-tertiary mt-0.5">
                                Currently using {theme} mode
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={cn(
                                'relative w-12 h-6 rounded-full border transition-all duration-300',
                                theme === 'dark'
                                    ? 'bg-brand-400 border-brand-400'
                                    : 'bg-surface-4 border-border-strong'
                            )}
                        >
                            <motion.div
                                animate={{ x: theme === 'dark' ? 24 : 2 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
                            />
                        </button>
                    </div>
                </Section>

                {/* ── Account Info ─────────────────────────── */}
                <Section title="Account" icon="ℹ️">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-text-tertiary">Role</span>
                            <span className="text-text-primary font-semibold">
                                {isSuperAdmin ? 'Super Administrator'
                                    : isTeamAdmin ? 'Team Administrator'
                                        : 'Member'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-text-tertiary">Email Verified</span>
                            <span className={cn(
                                'font-semibold',
                                user?.isVerified ? 'text-success' : 'text-danger'
                            )}>
                                {user?.isVerified ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-text-tertiary">Member Since</span>
                            <span className="text-text-primary font-semibold">
                                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                            </span>
                        </div>
                        {!isSuperAdmin && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-text-tertiary">Current Streak</span>
                                <span className="text-text-primary font-semibold">
                                    {user?.streak || 0} days
                                </span>
                            </div>
                        )}
                    </div>
                </Section>

                {/* Save button */}
                <div className="flex items-center gap-3 pt-2">
                    <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        loading={updateProfile.isPending}
                    >
                        {saved ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Saved!
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                    <polyline points="17 21 17 13 7 13 7 21" />
                                    <polyline points="7 3 7 8 15 8" />
                                </svg>
                                Save Changes
                            </>
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => navigate(-1)}
                    >
                        Cancel
                    </Button>
                </div>
            </form>
        </div>
    )
}