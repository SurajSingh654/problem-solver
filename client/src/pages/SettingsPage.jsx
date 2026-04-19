import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@store/useAuthStore'
import { useUIStore } from '@store/useUIStore'
import { useUpdateProfile, useClaimAdmin, useChangePassword } from '@hooks/useAuth'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { cn } from '@utils/cn'
import { COMPANIES, LEVEL } from '@utils/constants'
import { toast } from '@store/useUIStore'

// ── Avatar color picker ────────────────────────────────
const AVATAR_COLORS = [
    '#7c6ff7', '#22c55e', '#3b82f6', '#ef4444',
    '#eab308', '#ec4899', '#14b8a6', '#f97316',
    '#a855f7', '#06b6d4', '#84cc16', '#f43f5e',
    '#8b5cf6', '#10b981', '#f59e0b', '#6366f1',
]

function ChangeEmailSection() {
    const { user } = useAuthStore()
    const [newEmail, setNewEmail] = useState('')
    const [step, setStep] = useState('email') // 'email' | 'verify'
    const [code, setCode] = useState('')
    const changeEmail = useChangeEmail()
    const confirmChange = useConfirmEmailChange()

    async function handleSendCode() {
        if (!newEmail.trim()) {
            toast.error('Enter a new email address')
            return
        }
        await changeEmail.mutateAsync(newEmail.trim())
        setStep('verify')
    }

    async function handleVerify() {
        if (code.length !== 6) {
            toast.error('Enter the 6-digit code')
            return
        }
        await confirmChange.mutateAsync(code)
        setStep('email')
        setNewEmail('')
        setCode('')
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface-2 border border-border-default
                      rounded-xl">
                <span className="text-xs text-text-tertiary">Current email:</span>
                <span className="text-sm font-semibold text-text-primary">{user?.email}</span>
                {user?.emailVerified && (
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
                            ? 'border-white scale-110 shadow-glow-sm'
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

// ── Company tag input ──────────────────────────────────
function CompanyPicker({ value = [], onChange }) {
    const [search, setSearch] = useState('')

    const filtered = search
        ? COMPANIES.filter(c =>
            c.toLowerCase().includes(search.toLowerCase()) &&
            !value.includes(c)
        ).slice(0, 8)
        : []

    function toggle(company) {
        if (value.includes(company)) {
            onChange(value.filter(c => c !== company))
        } else if (value.length < 5) {
            onChange([...value, company])
        }
    }

    return (
        <div className="space-y-3">
            {/* Selected */}
            <div className="flex flex-wrap gap-2 min-h-[32px]">
                {value.map(c => (
                    <span
                        key={c}
                        onClick={() => toggle(c)}
                        className="flex items-center gap-1.5 text-xs font-semibold
                       text-warning bg-warning/10 border border-warning/25
                       rounded-full px-2.5 py-1 cursor-pointer
                       hover:bg-warning/20 transition-colors"
                    >
                        🏢 {c}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="3"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </span>
                ))}
                {value.length === 0 && (
                    <span className="text-xs text-text-disabled italic">
                        No target companies selected
                    </span>
                )}
            </div>

            {/* Search */}
            {value.length < 5 && (
                <div className="relative">
                    <Input
                        placeholder="Search companies… (max 5)"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        leftIcon={
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        }
                    />
                    {filtered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-dropdown mt-1
                            bg-surface-2 border border-border-strong rounded-xl
                            overflow-hidden shadow-lg">
                            {filtered.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => { toggle(c); setSearch('') }}
                                    className="w-full text-left px-4 py-2.5 text-sm
                             text-text-secondary hover:bg-surface-3
                             hover:text-text-primary transition-colors"
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}
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
    const claimAdmin = useClaimAdmin()

    const [avatarColor, setAvatarColor] = useState(user?.avatarColor || '#7c6ff7')
    const [targetCompanies, setTargetCompanies] = useState(user?.targetCompanies || [])
    const [adminPassword, setAdminPassword] = useState('')
    const [showAdminInput, setShowAdminInput] = useState(false)
    const [saved, setSaved] = useState(false)

    const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = useForm({
        defaultValues: {
            username: user?.username || '',
            targetRole: user?.targetRole || '',
            targetDate: user?.targetDate
                ? new Date(user.targetDate).toISOString().split('T')[0]
                : '',
            currentLevel: user?.currentLevel || 'BEGINNER',
        },
    })

    // Sync form if user changes
    useEffect(() => {
        if (user) {
            reset({
                username: user.username || '',
                targetRole: user.targetRole || '',
                targetDate: user.targetDate
                    ? new Date(user.targetDate).toISOString().split('T')[0]
                    : '',
                currentLevel: user.currentLevel || 'BEGINNER',
            })
            setAvatarColor(user.avatarColor || '#7c6ff7')
            setTargetCompanies(user.targetCompanies || [])
        }
    }, [user?.username])

    async function onSave(data) {
        await updateProfile.mutateAsync({
            username: data.username || undefined,
            avatarColor,
            targetCompanies,
            targetRole: data.targetRole || undefined,
            targetDate: data.targetDate || undefined,
            currentLevel: data.currentLevel || undefined,
        })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
    }

    async function handleClaimAdmin() {
        await claimAdmin.mutateAsync(adminPassword)
        setAdminPassword('')
        setShowAdminInput(false)
    }

    const isAdmin = user?.role === 'ADMIN'

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
                    {/* Avatar preview */}
                    <div className="flex items-center gap-4 mb-5 p-4
                          bg-surface-2 border border-border-default rounded-xl">
                        <Avatar
                            name={user?.username}
                            color={avatarColor}
                            size="lg"
                        />
                        <div>
                            <p className="text-sm font-bold text-text-primary">
                                {user?.username}
                            </p>
                            <p className="text-xs text-text-tertiary mt-0.5">
                                {user?.email}
                            </p>
                            <Badge
                                variant={isAdmin ? 'warning' : 'brand'}
                                size="xs"
                                className="mt-1.5"
                            >
                                {isAdmin ? '⚡ Admin' : 'Member'}
                            </Badge>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input
                            label="Username"
                            placeholder="your-username"
                            error={errors.username?.message}
                            {...register('username', {
                                minLength: { value: 2, message: 'At least 2 characters' },
                                maxLength: { value: 30, message: 'At most 30 characters' },
                                pattern: {
                                    value: /^[a-zA-Z0-9_-]+$/,
                                    message: 'Letters, numbers, - and _ only',
                                },
                            })}
                        />

                        {/* Avatar color */}
                        <div>
                            <label className="block text-sm font-semibold text-text-primary mb-2">
                                Avatar Color
                            </label>
                            <ColorPicker value={avatarColor} onChange={setAvatarColor} />
                        </div>
                    </div>
                </Section>

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
                            placeholder="Minimum 6 characters"
                            error={errors.newPassword?.message}
                            {...register('newPassword', {
                                minLength: { value: 6, message: 'At least 6 characters' },
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
                                    await changePassword.mutateAsync({
                                        currentPassword: data.currentPassword,
                                        newPassword: data.newPassword,
                                    })
                                    setValue('currentPassword', '')
                                    setValue('newPassword', '')
                                    setValue('confirmNewPassword', '')
                                })}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Update Password
                            </Button>
                        )}
                    </div>
                </Section>

                {/* ── Change Email ───────────────────────────── */}
                <Section title="Change Email" icon="📧">
                    <ChangeEmailSection />
                </Section>

                {/* ── Interview Goals ───────────────────────── */}
                {user?.role !== 'ADMIN' && (
                    <Section title="Interview Goals" icon="🎯">
                        <div className="space-y-4">
                            <Input
                                label="Target Role"
                                placeholder="e.g. Senior Software Engineer at Google"
                                {...register('targetRole')}
                            />

                            <Input
                                label="Target Date"
                                type="date"
                                hint="When is your interview?"
                                {...register('targetDate')}
                            />

                            {/* Current Level */}
                            <div>
                                <label className="block text-sm font-semibold text-text-primary mb-2">
                                    Current Level
                                </label>
                                <div className="flex gap-2">
                                    {[
                                        { value: 'BEGINNER', label: '🌱 Beginner' },
                                        { value: 'INTERMEDIATE', label: '📈 Intermediate' },
                                        { value: 'ADVANCED', label: '🔥 Advanced' },
                                    ].map(level => {
                                        const current = watch('currentLevel')
                                        return (
                                            <button
                                                key={level.value}
                                                type="button"
                                                onClick={() => setValue('currentLevel', level.value, { shouldDirty: true })}
                                                className={cn(
                                                    'flex-1 flex items-center justify-center gap-2',
                                                    'py-2.5 px-3 rounded-xl border cursor-pointer',
                                                    'text-xs font-semibold transition-all duration-150',
                                                    current === level.value
                                                        ? 'bg-brand-400/15 border-brand-400/40 text-brand-300'
                                                        : 'bg-surface-3 border-border-default text-text-secondary hover:border-brand-400/30'
                                                )}
                                            >
                                                {level.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-text-primary mb-2">
                                    Target Companies
                                    <span className="ml-1.5 text-xs font-normal text-text-disabled">
                                        up to 5
                                    </span>
                                </label>
                                <CompanyPicker
                                    value={targetCompanies}
                                    onChange={setTargetCompanies}
                                />
                            </div>
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

                {/* ── Admin ────────────────────────────────── */}
                <Section title="Admin Access" icon="⚡">
                    {isAdmin ? (
                        <div className="flex items-center gap-3 p-4
                            bg-warning/8 border border-warning/25 rounded-xl">
                            <span className="text-xl">⚡</span>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-warning">Admin access active</p>
                                <p className="text-xs text-text-tertiary mt-0.5">
                                    You have full admin privileges
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-text-tertiary">
                                Enter the admin password to claim admin access.
                            </p>
                            <AnimatePresence>
                                {showAdminInput && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-3 overflow-hidden"
                                    >
                                        <Input
                                            type="password"
                                            placeholder="Admin password"
                                            value={adminPassword}
                                            onChange={e => setAdminPassword(e.target.value)}
                                            leftIcon={
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                                    stroke="currentColor" strokeWidth="2"
                                                    strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                </svg>
                                            }
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            loading={claimAdmin.isPending}
                                            disabled={!adminPassword}
                                            onClick={handleClaimAdmin}
                                        >
                                            Claim Admin Access
                                        </Button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            {!showAdminInput && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowAdminInput(true)}
                                >
                                    Enter Admin Password
                                </Button>
                            )}
                        </div>
                    )}
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