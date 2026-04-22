// ============================================================================
// ProbSolver v3.0 — Team Pending Approval Page
// ============================================================================
//
// Shown when a user creates a team and it's awaiting SUPER_ADMIN
// approval. Polls the team status every 30 seconds to auto-detect
// when the team is approved.
//
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import useAuthStore from '@store/useAuthStore'
import api from '@services/api'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'

export default function TeamPendingPage() {
  const navigate = useNavigate()
  const { user, switchTeam } = useAuthStore()

  const [pendingTeams, setPendingTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    loadPendingTeams()

    // Poll every 30 seconds for status changes
    pollRef.current = setInterval(checkForApproval, 30000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function loadPendingTeams() {
    try {
      // Get teams created by this user that are pending
      const res = await api.get('/teams/all', {
        params: { status: 'PENDING' },
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })

      // Filter to user's own teams (for non-super-admins, the API
      // only returns their own pending teams anyway — but let's
      // be safe on the client side)
      const mine = (res.data.teams || []).filter(
        (t) => t.createdBy?.id === user?.id
      )
      setPendingTeams(mine)
    } catch {
      // If the user isn't super admin, they can't access /teams/all
      // Try to get pending teams from their profile instead
      try {
        const profileRes = await api.get('/auth/me')
        // Check if user has a pending team by looking at created teams
        // For now, just show empty state
        setPendingTeams([])
      } catch {
        setPendingTeams([])
      }
    } finally {
      setLoading(false)
    }
  }

  async function checkForApproval() {
    setChecking(true)
    try {
      // Refresh user data — if team was approved, user's context changed
      const res = await api.get('/auth/me')
      const updatedUser = res.data.user

      // Check if any pending team is now active
      // (The SUPER_ADMIN switches the creator to the team on approval)
      if (updatedUser.currentTeamId &&
          updatedUser.currentTeamId !== updatedUser.personalTeamId) {
        // Team was approved — update store and redirect
        useAuthStore.getState().updateUser(updatedUser)
        clearInterval(pollRef.current)
        navigate('/', { replace: true })
      }
    } catch {
      // Silently continue polling
    } finally {
      setChecking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-16 text-center">
      {/* ── Animated waiting icon ──────────────────────── */}
      <motion.div
        animate={{
          rotate: [0, 10, -10, 10, 0],
          scale: [1, 1.05, 1, 1.05, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="text-6xl mb-6 inline-block"
      >
        ⏳
      </motion.div>

      <h1 className="text-2xl font-extrabold text-text-primary mb-3">
        Team Pending Approval
      </h1>

      {pendingTeams.length > 0 ? (
        <div className="space-y-4 mb-8">
          {pendingTeams.map((team) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-surface-1 border border-warning/20 rounded-xl p-5 text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg">🚀</span>
                <h3 className="text-sm font-bold text-text-primary">{team.name}</h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full
                                 bg-warning/10 text-warning border border-warning/20">
                  PENDING
                </span>
              </div>
              {team.description && (
                <p className="text-xs text-text-tertiary mb-2">{team.description}</p>
              )}
              <p className="text-[10px] text-text-disabled">
                Created {new Date(team.createdAt).toLocaleDateString()}
                {' · '}Max {team.maxMembers} members
              </p>
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-secondary mb-8">
          Your team request is being reviewed by the platform admin.
          You'll be notified once it's approved.
        </p>
      )}

      {/* ── Status indicator ──────────────────────────── */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className={cn(
          'w-2 h-2 rounded-full',
          checking ? 'bg-warning animate-pulse' : 'bg-success/50'
        )} />
        <p className="text-xs text-text-disabled">
          {checking ? 'Checking status...' : 'Auto-checking every 30 seconds'}
        </p>
      </div>

      {/* ── Manual check button ───────────────────────── */}
      <div className="space-y-3">
        <Button
          variant="secondary"
          onClick={checkForApproval}
          disabled={checking}
          className="mx-auto"
        >
          {checking ? 'Checking...' : 'Check Status Now'}
        </Button>

        <p className="text-xs text-text-disabled">
          While waiting, you can practice individually.
        </p>

        <Button
          variant="primary"
          onClick={() => navigate('/')}
          className="mx-auto"
        >
          Go to Dashboard
        </Button>
      </div>

      {/* ── Rejection handling ────────────────────────── */}
      {pendingTeams.some((t) => t.status === 'REJECTED') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 bg-danger/5 border border-danger/20 rounded-xl p-5 text-left"
        >
          <h3 className="text-sm font-bold text-danger mb-2">Team Request Rejected</h3>
          {pendingTeams
            .filter((t) => t.status === 'REJECTED')
            .map((t) => (
              <div key={t.id} className="mb-3">
                <p className="text-xs text-text-primary font-bold">{t.name}</p>
                <p className="text-xs text-text-tertiary mt-1">
                  Reason: {t.rejectionReason || 'No reason provided.'}
                </p>
              </div>
            ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/team')}
            className="mt-2"
          >
            Create New Team Request
          </Button>
        </motion.div>
      )}
    </div>
  )
}