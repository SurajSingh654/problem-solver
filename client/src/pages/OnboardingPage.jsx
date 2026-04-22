// ============================================================================
// ProbSolver v3.0 — Onboarding Page
// ============================================================================
//
// Post-registration flow. User chooses:
// 1. Join a team (enter join code)
// 2. Create a team (enters name, goes to PENDING)
// 3. Practice individually (auto-creates personal space)
//
// ============================================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { cn } from '@utils/cn'

const MODES = [
  {
    id: 'join',
    icon: '👥',
    title: 'Join a Team',
    desc: 'Enter a join code from your team admin to start practicing with your team.',
    color: 'border-brand-400/30 hover:border-brand-400/60',
    glow: 'bg-brand-400/5',
  },
  {
    id: 'create',
    icon: '🚀',
    title: 'Create a Team',
    desc: 'Start a new team and invite your colleagues. Requires admin approval.',
    color: 'border-success/30 hover:border-success/60',
    glow: 'bg-success/5',
  },
  {
    id: 'individual',
    icon: '🧠',
    title: 'Practice Solo',
    desc: 'Get AI-generated problems tailored to your goals. No team needed.',
    color: 'border-warning/30 hover:border-warning/60',
    glow: 'bg-warning/5',
  },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, completeOnboarding } = useAuthStore()

  const [selectedMode, setSelectedMode] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setError] = useState('')
  const [successMsg, setSuccess] = useState('')

  // Already onboarded — redirect
  if (user?.onboardingComplete) {
    navigate('/', { replace: true })
    return null
  }

  async function handleSubmit() {
    setError('')
    setSuccess('')
    setLoading(true)

    let data = {}

    if (selectedMode === 'join') {
      if (!joinCode.trim()) {
        setError('Please enter a join code.')
        setLoading(false)
        return
      }
      data = { mode: 'team', joinCode: joinCode.trim() }
    } else if (selectedMode === 'create') {
      if (!teamName.trim()) {
        setError('Please enter a team name.')
        setLoading(false)
        return
      }
      data = { mode: 'team', teamName: teamName.trim(), teamDescription: teamDesc.trim() }
    } else if (selectedMode === 'individual') {
      data = { mode: 'individual' }
    }

    const result = await completeOnboarding(data)

    if (result.success) {
      setSuccess(result.message)
      setTimeout(() => navigate('/', { replace: true }), 1000)
    } else {
      setError(result.error)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-blue-500
                         flex items-center justify-center mx-auto mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight mb-2">
            Welcome, {user?.name}!
          </h1>
          <p className="text-sm text-text-secondary">
            How would you like to use ProbSolver?
          </p>
        </div>

        {/* Mode selection cards */}
        <div className="space-y-3 mb-8">
          {MODES.map((mode) => (
            <motion.button
              key={mode.id}
              onClick={() => { setSelectedMode(mode.id); setError('') }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'w-full text-left p-5 rounded-2xl border-2 transition-all duration-200',
                'bg-surface-1',
                selectedMode === mode.id
                  ? `${mode.color} ${mode.glow} ring-1 ring-brand-400/20`
                  : 'border-border-default hover:border-border-strong'
              )}
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl mt-0.5">{mode.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary mb-1">{mode.title}</h3>
                  <p className="text-xs text-text-tertiary leading-relaxed">{mode.desc}</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Conditional forms */}
        <AnimatePresence mode="wait">
          {selectedMode === 'join' && (
            <motion.div
              key="join"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <Input
                label="Join Code"
                placeholder="e.g. PROB-X7K2"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={12}
                className="font-mono tracking-widest text-center text-lg"
              />
            </motion.div>
          )}

          {selectedMode === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 mb-6 overflow-hidden"
            >
              <Input
                label="Team Name"
                placeholder="e.g. Google Prep Squad"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={100}
              />
              <Input
                label="Description (optional)"
                placeholder="What's your team preparing for?"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                maxLength={500}
              />
              <p className="text-xs text-text-disabled">
                Your team will be reviewed by a platform admin before it goes live.
                You can practice individually while waiting.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error / success */}
        {errorMsg && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-xs text-danger mb-4 text-center">{errorMsg}</motion.p>
        )}
        {successMsg && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-xs text-success mb-4 text-center">{successMsg}</motion.p>
        )}

        {/* Submit button */}
        {selectedMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Setting up...' :
                selectedMode === 'join' ? 'Join Team' :
                selectedMode === 'create' ? 'Create Team' :
                'Start Practicing'}
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}