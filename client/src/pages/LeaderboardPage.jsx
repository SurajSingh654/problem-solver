// ============================================================================
// ProbSolver v3.0 — Leaderboard (Team-Only, Composite Score)
// ============================================================================
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamContext } from '@hooks/useTeamContext'
import { useLeaderboard } from '@hooks/useReport'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'

// ── Score component label config ──────────────────────
const BREAKDOWN_CONFIG = [
  {
    key: 'solutionQuality',
    label: 'Solution Quality',
    weight: '40%',
    color: 'bg-brand-400',
    textColor: 'text-brand-300',
    icon: '🤖',
    tooltip: 'AI review scores + peer ratings + confidence calibration. The most important signal.',
  },
  {
    key: 'difficultyDistribution',
    label: 'Difficulty Mix',
    weight: '25%',
    color: 'bg-warning',
    textColor: 'text-warning',
    icon: '⚡',
    tooltip: 'Weighted problem difficulty (Hard×6, Medium×3, Easy×1). Halved if quality is low.',
  },
  {
    key: 'consistency',
    label: 'Consistency',
    weight: '20%',
    color: 'bg-success',
    textColor: 'text-success',
    icon: '📅',
    tooltip: 'Streak (40%) + weekly velocity (40%) + total volume (20%).',
  },
  {
    key: 'retention',
    label: 'Retention',
    weight: '10%',
    color: 'bg-purple-400',
    textColor: 'text-purple-400',
    icon: '🧠',
    tooltip: 'SM-2 spaced repetition health — how well you retain what you learn.',
  },
  {
    key: 'patternBreadth',
    label: 'Pattern Breadth',
    weight: '5%',
    color: 'bg-info',
    textColor: 'text-info',
    icon: '🗺️',
    tooltip: 'Coverage of the 16 canonical interview patterns. Breadth bonus at >8 patterns.',
  },
]

// ── Score bar — visual breakdown ───────────────────────
function ScoreBar({ breakdown }) {
  const total = breakdown
    ? BREAKDOWN_CONFIG.reduce((sum, c) => sum + (breakdown[c.key] || 0) * parseFloat(c.weight) / 100, 0)
    : 0

  return (
    <div className="h-1.5 w-full bg-surface-3 rounded-full overflow-hidden flex">
      {BREAKDOWN_CONFIG.map((c) => {
        const value = breakdown?.[c.key] || 0
        const weight = parseFloat(c.weight) / 100
        const pct = value * weight // contribution to 0-100 overall
        return (
          <div
            key={c.key}
            className={cn('h-full transition-all', c.color)}
            style={{ width: `${pct}%` }}
            title={`${c.label}: ${value}/100 (${c.weight} weight)`}
          />
        )
      })}
    </div>
  )
}

// ── Score breakdown popover ────────────────────────────
function ScoreBreakdown({ breakdown, compositeScore }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
          Score Breakdown
        </span>
        <span className="text-sm font-extrabold font-mono text-brand-300">
          {compositeScore}/100
        </span>
      </div>
      {BREAKDOWN_CONFIG.map((c) => {
        const value = breakdown?.[c.key] ?? 0
        const contribution = Math.round(value * parseFloat(c.weight) / 100)
        return (
          <div key={c.key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{c.icon}</span>
                <span className="text-[11px] font-semibold text-text-secondary">
                  {c.label}
                </span>
                <span className="text-[9px] text-text-disabled">
                  {c.weight}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-[11px] font-bold font-mono', c.textColor)}>
                  {value}
                </span>
                <span className="text-[10px] text-text-disabled">
                  +{contribution}pts
                </span>
              </div>
            </div>
            <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', c.color)}
                style={{ width: `${value}%` }}
              />
            </div>
            <p className="text-[9px] text-text-disabled mt-0.5 leading-tight">
              {c.tooltip}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── Podium card ────────────────────────────────────────
function PodiumCard({ entry, position, isCurrentUser }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const navigate = useNavigate()

  const config = {
    0: {
      medal: '🥇',
      height: 'h-36',
      bg: 'bg-gradient-to-b from-brand-400/25 to-brand-400/10',
      border: 'border-brand-400/40',
      scoreColor: 'text-brand-300',
      scale: 'scale-105',
    },
    1: {
      medal: '🥈',
      height: 'h-28',
      bg: 'bg-surface-2',
      border: 'border-border-default',
      scoreColor: 'text-text-secondary',
      scale: 'scale-100',
    },
    2: {
      medal: '🥉',
      height: 'h-24',
      bg: 'bg-surface-2',
      border: 'border-border-default',
      scoreColor: 'text-text-secondary',
      scale: 'scale-100',
    },
  }

  const c = config[position]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: position * 0.1 }}
      className={cn('flex flex-col items-center', c.scale)}
    >
      {/* Avatar + name */}
      <div
        className="cursor-pointer"
        onClick={() => navigate(`/profile/${entry.id}`)}
      >
        <Avatar name={entry.name} url={entry.avatarUrl} size="md" />
      </div>
      <p className={cn(
        'text-xs font-bold mt-2 text-center truncate max-w-[90px]',
        isCurrentUser ? 'text-brand-300' : 'text-text-primary'
      )}>
        {entry.name}
        {isCurrentUser && <span className="block text-[9px] text-brand-300/70">(you)</span>}
      </p>
      <span className="text-lg my-0.5">{c.medal}</span>

      {/* Podium block */}
      <div
        className={cn(
          'w-28 rounded-t-xl border flex flex-col items-center justify-center gap-1 px-2 cursor-pointer',
          c.height, c.bg, c.border,
          'hover:opacity-90 transition-opacity'
        )}
        onClick={() => setShowBreakdown(true)}
      >
        <div className="text-center">
          <p className={cn('text-2xl font-extrabold font-mono', c.scoreColor)}>
            {entry.compositeScore}
          </p>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider">
            score
          </p>
        </div>
        <ScoreBar breakdown={entry.scoreBreakdown} />
        <p className="text-[9px] text-text-disabled">
          {entry.totalSolved} solved
        </p>
      </div>

      {/* Breakdown modal */}
      <AnimatePresence>
        {showBreakdown && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm"
              onClick={() => setShowBreakdown(false)}
            />
            <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm bg-surface-1 border border-border-strong rounded-2xl p-5"
              >
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border-default">
                  <Avatar name={entry.name} url={entry.avatarUrl} size="sm" />
                  <div>
                    <p className="text-sm font-bold text-text-primary">{entry.name}</p>
                    <p className="text-[10px] text-text-disabled">Rank #{entry.rank}</p>
                  </div>
                </div>
                <ScoreBreakdown
                  breakdown={entry.scoreBreakdown}
                  compositeScore={entry.compositeScore}
                />
                <button
                  onClick={() => setShowBreakdown(false)}
                  className="w-full mt-4 pt-3 border-t border-border-default text-xs
                             text-text-disabled hover:text-text-primary transition-colors"
                >
                  Close
                </button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Table row ──────────────────────────────────────────
function LeaderboardRow({ entry, isCurrentUser, index }) {
  const navigate = useNavigate()
  const [showBreakdown, setShowBreakdown] = useState(false)

  const topComponent = entry.scoreBreakdown
    ? BREAKDOWN_CONFIG.reduce((best, c) =>
      (entry.scoreBreakdown[c.key] || 0) > (entry.scoreBreakdown[best.key] || 0) ? c : best,
      BREAKDOWN_CONFIG[0]
    )
    : null

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className={cn(
          'hover:bg-surface-2/50 transition-colors group',
          isCurrentUser && 'bg-brand-400/5'
        )}
      >
        {/* Rank */}
        <td className="py-3 px-4 w-12">
          <span className="text-xs font-extrabold font-mono text-text-primary">
            #{entry.rank}
          </span>
        </td>

        {/* Member */}
        <td className="py-3 px-4">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => navigate(`/profile/${entry.id}`)}
          >
            <Avatar name={entry.name} url={entry.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary truncate">
                {entry.name}
                {isCurrentUser && (
                  <span className="text-[9px] text-brand-300 ml-1.5">(you)</span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {entry.teamRole === 'TEAM_ADMIN' && (
                  <span className="text-[9px] text-warning font-bold">Admin</span>
                )}
                {entry.activityStatus === 'INACTIVE' && (
                  <span className="text-[9px] text-text-disabled">Inactive</span>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Composite score */}
        <td className="py-3 px-4 w-32">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full text-left group/score"
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-sm font-extrabold font-mono',
                entry.compositeScore >= 70 ? 'text-success'
                  : entry.compositeScore >= 45 ? 'text-warning'
                    : 'text-text-secondary'
              )}>
                {entry.compositeScore}
              </span>
              <span className="text-[9px] text-text-disabled group-hover/score:text-brand-300 transition-colors">
                {showBreakdown ? '▲' : '▼'}
              </span>
            </div>
            <div className="mt-1 w-20">
              <ScoreBar breakdown={entry.scoreBreakdown} />
            </div>
          </button>
        </td>

        {/* Solved */}
        <td className="py-3 px-4 text-xs font-mono text-text-secondary">
          <span className="font-bold text-text-primary">{entry.totalSolved}</span>
          <span className="text-text-disabled ml-1 text-[10px]">
            ({entry.hardSolved}H/{entry.mediumSolved}M/{entry.easySolved}E)
          </span>
        </td>

        {/* Streak */}
        <td className="py-3 px-4 text-xs font-mono text-text-secondary">
          <span className={cn(
            'font-bold',
            entry.streak >= 7 ? 'text-success'
              : entry.streak >= 3 ? 'text-warning'
                : 'text-text-disabled'
          )}>
            {entry.streak}d
          </span>
        </td>

        {/* Patterns */}
        <td className="py-3 px-4 text-xs font-mono text-text-secondary">
          {entry.uniquePatterns}
          <span className="text-text-disabled text-[10px]">/16</span>
        </td>

        {/* Top strength */}
        <td className="py-3 px-4">
          {topComponent && (
            <span className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded-full border',
              topComponent.textColor,
              'bg-surface-3 border-border-default'
            )}>
              {topComponent.icon} {topComponent.label}
            </span>
          )}
        </td>
      </motion.tr>

      {/* Expandable breakdown row */}
      <AnimatePresence>
        {showBreakdown && (
          <tr>
            <td colSpan={7} className="px-4 pb-4 bg-surface-1/50">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 pb-2 px-2 border-t border-border-subtle">
                  <ScoreBreakdown
                    breakdown={entry.scoreBreakdown}
                    compositeScore={entry.compositeScore}
                  />
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { teamName, isPersonalMode, user } = useTeamContext()
  const { data: leaderboard, isLoading } = useLeaderboard()
  const [showFormula, setShowFormula] = useState(false)

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
  const currentUserEntry = leaderboard?.find((e) => e.id === user?.id)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary mb-1">
            Leaderboard
          </h1>
          <p className="text-sm text-text-secondary">
            {teamName} · Ranked by interview readiness, not grinding
          </p>
        </div>
        <button
          onClick={() => setShowFormula(!showFormula)}
          className={cn(
            'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
            showFormula
              ? 'bg-brand-400/15 border-brand-400/30 text-brand-300'
              : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary'
          )}
        >
          {showFormula ? '✕ Hide Formula' : '📐 How scores work'}
        </button>
      </div>

      {/* Formula explanation */}
      <AnimatePresence>
        {showFormula && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-surface-1 border border-border-default rounded-2xl p-5">
              <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                <span>📐</span> Composite Score Formula
              </h3>
              <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
                Rankings measure interview readiness, not grinding. Submitting empty solutions to hard problems
                does not help your rank. AI review scores and peer ratings are the dominant signals.
              </p>
              <div className="space-y-2">
                {BREAKDOWN_CONFIG.map((c) => (
                  <div key={c.key} className="flex items-start gap-3">
                    <span className="text-base flex-shrink-0">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-xs font-bold', c.textColor)}>
                          {c.label}
                        </span>
                        <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                         rounded-full px-1.5 py-px border border-border-default">
                          {c.weight}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        {c.tooltip}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-[11px] text-text-disabled">
                  <span className="font-bold text-warning">Anti-gaming:</span> Difficulty score is halved if solution quality is below 40/100.
                  AI review scores cannot be self-reported — they require actual AI analysis.
                  Confidence self-ratings have a maximum 10% influence on quality score.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Your rank banner */}
      {currentUserEntry && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-center gap-4 p-4 rounded-xl border mb-6 flex-wrap',
            'bg-brand-400/5 border-brand-400/20'
          )}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-xl font-extrabold font-mono text-brand-300">
              #{currentUserEntry.rank}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary">Your rank</p>
              <p className="text-[10px] text-text-disabled">
                Score: {currentUserEntry.compositeScore}/100
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {BREAKDOWN_CONFIG.map((c) => {
              const val = currentUserEntry.scoreBreakdown?.[c.key] ?? 0
              return (
                <div key={c.key} className="text-center">
                  <span className="text-xs">{c.icon}</span>
                  <p className={cn('text-xs font-bold font-mono', c.textColor)}>
                    {val}
                  </p>
                  <p className="text-[9px] text-text-disabled">{c.weight}</p>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Podium */}
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-3 mb-10">
          {/* Render order: 2nd, 1st, 3rd */}
          {[1, 0, 2].map((idx) => {
            const entry = podium[idx]
            if (!entry) return <div key={idx} className="w-28" />
            return (
              <PodiumCard
                key={entry.id}
                entry={entry}
                position={idx}
                isCurrentUser={entry.id === user?.id}
              />
            )
          })}
        </div>
      )}

      {/* Full rankings table */}
      <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border-default">
                {[
                  { label: 'Rank', w: 'w-12' },
                  { label: 'Member', w: 'min-w-[160px]' },
                  { label: 'Score ▾', w: 'w-32' },
                  { label: 'Solved', w: 'w-32' },
                  { label: 'Streak', w: 'w-20' },
                  { label: 'Patterns', w: 'w-20' },
                  { label: 'Strength', w: 'w-32' },
                ].map((h) => (
                  <th
                    key={h.label}
                    className={cn(
                      'py-3 px-4 text-left text-[10px] font-bold',
                      'text-text-disabled uppercase tracking-widest',
                      h.w
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {(leaderboard || []).map((entry, index) => (
                <LeaderboardRow
                  key={entry.id}
                  entry={entry}
                  isCurrentUser={entry.id === user?.id}
                  index={index}
                />
              ))}
            </tbody>
          </table>
        </div>

        {(!leaderboard || leaderboard.length === 0) && (
          <div className="py-16 text-center">
            <span className="text-4xl mb-3 block">🏆</span>
            <p className="text-sm font-semibold text-text-primary mb-1">
              No rankings yet
            </p>
            <p className="text-xs text-text-tertiary">
              Start solving problems to appear on the leaderboard.
            </p>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-text-disabled text-center mt-4">
        Scores update on page refresh. Click any score to see the breakdown.
        Rankings reflect interview readiness across quality, difficulty, consistency, retention, and pattern coverage.
      </p>
    </div>
  )
}