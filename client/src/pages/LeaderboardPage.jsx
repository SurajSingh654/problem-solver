// ============================================================================
// ProbSolver v3.0 — Leaderboard (Team-Only)
// ============================================================================
//
// Only shown in team mode. Individual-mode users never see this page
// (the sidebar hides the link, and the route redirects).
//
// ============================================================================

import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamContext } from '@hooks/useTeamContext'
import { useLeaderboard } from '@hooks/useReport'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { teamName, isPersonalMode, user } = useTeamContext()
  const { data: leaderboard, isLoading } = useLeaderboard()

  // ── Redirect SUPER_ADMIN (no leaderboard for platform admins) ──
  if (user?.globalRole === 'SUPER_ADMIN') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <span className="text-4xl mb-4 block">🛡️</span>
        <h1 className="text-xl font-bold text-text-primary mb-2">
          Leaderboard is a team feature
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          Platform administrators don't participate in team rankings.
        </p>
        <button
          onClick={() => navigate('/super-admin')}
          className="text-sm font-bold text-brand-300 hover:text-brand-200"
        >
          Back to Dashboard →
        </button>
      </div>
    )
  }

  // ── Redirect individual-mode users ───────────────────
  if (isPersonalMode) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <span className="text-4xl mb-4 block">🧠</span>
        <h1 className="text-xl font-bold text-text-primary mb-2">
          Leaderboard is a team feature
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          Join a team to compete with teammates and track rankings.
        </p>
        <button
          onClick={() => navigate('/team')}
          className="text-sm font-bold text-brand-300 hover:text-brand-200"
        >
          Manage Teams →
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  const podium = leaderboard?.slice(0, 3) || []
  const rest = leaderboard?.slice(3) || []

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-extrabold text-text-primary mb-1">Leaderboard</h1>
      <p className="text-sm text-text-secondary mb-8">{teamName} rankings</p>

      {/* ── Podium (top 3) ──────────────────────────────── */}
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-4 mb-10">
          {[1, 0, 2].map((idx) => {
            const entry = podium[idx]
            if (!entry) return <div key={idx} className="w-28" />

            const heights = { 0: 'h-32', 1: 'h-24', 2: 'h-20' }
            const medals = { 0: '🥇', 1: '🥈', 2: '🥉' }

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="flex flex-col items-center"
              >
                <Avatar name={entry.name} url={entry.avatarUrl} size="md" />
                <p className="text-xs font-bold text-text-primary mt-2 text-center truncate max-w-[100px]">
                  {entry.name}
                </p>
                <p className="text-lg">{medals[idx]}</p>
                <div className={cn(
                  'w-28 rounded-t-xl flex items-center justify-center',
                  heights[idx],
                  idx === 0 ? 'bg-brand-400/20' : 'bg-surface-2',
                  'border border-border-default'
                )}>
                  <div className="text-center">
                    <p className="text-xl font-extrabold font-mono text-text-primary">
                      {entry.totalSolved}
                    </p>
                    <p className="text-[9px] text-text-disabled uppercase">solved</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── Rankings table ───────────────────────────────── */}
      <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-default">
              {['Rank', 'Member', 'Solved', 'Hard', 'Streak', 'Confidence'].map((h) => (
                <th key={h} className="py-3 px-4 text-left text-[10px] font-bold
                                       text-text-disabled uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {(leaderboard || []).map((entry) => (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  'hover:bg-surface-2/50 transition-colors cursor-pointer',
                  entry.id === user?.id && 'bg-brand-400/5'
                )}
                onClick={() => navigate(`/profile/${entry.id}`)}
              >
                <td className="py-3 px-4">
                  <span className="text-xs font-extrabold font-mono text-text-primary">
                    #{entry.rank}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={entry.name} url={entry.avatarUrl} size="sm" />
                    <div>
                      <p className="text-xs font-bold text-text-primary">
                        {entry.name}
                        {entry.id === user?.id && (
                          <span className="text-[9px] text-brand-300 ml-1.5">(you)</span>
                        )}
                      </p>
                      {entry.teamRole === 'TEAM_ADMIN' && (
                        <span className="text-[9px] text-warning">Admin</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-xs font-mono font-bold text-text-primary">
                  {entry.totalSolved}
                </td>
                <td className="py-3 px-4 text-xs font-mono text-danger font-bold">
                  {entry.hardSolved}
                </td>
                <td className="py-3 px-4 text-xs font-mono text-text-secondary">
                  {entry.streak}d
                </td>
                <td className="py-3 px-4 text-xs font-mono text-text-secondary">
                  {entry.avgConfidence}/5
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}