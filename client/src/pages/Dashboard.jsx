// ============================================================================
// ProbSolver v3.0 — Dashboard (Rebuilt)
// ============================================================================
//
// Design philosophy grounded in behavioral science [1]:
//
// The dashboard answers three questions in order of urgency:
//   1. WHAT TO DO RIGHT NOW — spaced repetition urgency, next action
//   2. HOW AM I DOING — 6D readiness snapshot, velocity, difficulty mix
//   3. TEAM PULSE — who solved what, activity feed
//
// Data architecture:
//   - useDashboardData: personal stats + 6D report in parallel (no race condition)
//   - useReviewQueue: spaced repetition urgency (separate cache key)
//   - useRecommendations: next actions (separate cache key)
//   - useTeamActivity: team feed (separate, non-blocking)
//
// Cognitive load principle: most critical information renders first.
// The urgency banner (overdue reviews) renders before anything else
// because forgetting is the most time-sensitive signal on the page.
//
// ============================================================================
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamContext } from '@hooks/useTeamContext'
import { useDashboardData, useTeamActivity } from '@hooks/useReport'
import { useReviewQueue } from '@hooks/useSolutions'
import { useRecommendations } from '@hooks/useRecommendations'
import { ActivityFeed } from '@components/features/ActivityFeed'
import { Recommendations } from '@components/features/Recommendations'
import { ReviewPreview } from '@components/features/ReviewPreview'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES, DIMENSIONS } from '@utils/constants'

// ── Inline mini radar — 6D hexagon ────────────────────
// Renders a compact SVG radar chart of the 6 dimensions.
// Used in the readiness card to give instant visual pattern.
function MiniRadar({ dimensions }) {
  if (!dimensions) return null

  const size = 80
  const cx = size / 2
  const cy = size / 2
  const r = 30

  const keys = ['patternRecognition', 'solutionDepth', 'communication', 'optimization', 'pressurePerformance', 'retention']
  const colors = ['#7c6ff7', '#22c55e', '#3b82f6', '#eab308', '#ef4444', '#a855f7']

  function getPoint(index, value) {
    const angle = (index * Math.PI * 2) / 6 - Math.PI / 2
    const radius = (value / 100) * r
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  }

  function getGridPoint(index, fraction) {
    const angle = (index * Math.PI * 2) / 6 - Math.PI / 2
    return {
      x: cx + r * fraction * Math.cos(angle),
      y: cy + r * fraction * Math.sin(angle),
    }
  }

  const dataPoints = keys.map((k, i) => getPoint(i, dimensions[k] || 0))
  const polygonPoints = dataPoints.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f}
          points={keys.map((_, i) => {
            const p = getGridPoint(i, f)
            return `${p.x},${p.y}`
          }).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-border-default"
        />
      ))}
      {/* Axis lines */}
      {keys.map((_, i) => {
        const outer = getGridPoint(i, 1)
        return (
          <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y}
            stroke="currentColor" strokeWidth="0.5" className="text-border-default" />
        )
      })}
      {/* Data polygon */}
      <polygon points={polygonPoints}
        fill="#7c6ff7" fillOpacity="0.2"
        stroke="#7c6ff7" strokeWidth="1.5" />
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2"
          fill={colors[i]} />
      ))}
    </svg>
  )
}

// ── Readiness tier label ───────────────────────────────
function getReadinessTier(overall) {
  if (overall >= 82) return { label: 'FAANG Ready', color: 'text-success', bg: 'bg-success/10 border-success/25' }
  if (overall >= 70) return { label: 'Onsite Ready', color: 'text-brand-300', bg: 'bg-brand-400/10 border-brand-400/25' }
  if (overall >= 58) return { label: 'Tech Screen Ready', color: 'text-info', bg: 'bg-info/10 border-info/25' }
  if (overall >= 45) return { label: 'Phone Screen Ready', color: 'text-warning', bg: 'bg-warning/10 border-warning/25' }
  return { label: 'Building Foundation', color: 'text-text-disabled', bg: 'bg-surface-3 border-border-default' }
}

// ── Difficulty bar — visual distribution ──────────────
function DifficultyBar({ easy = 0, medium = 0, hard = 0 }) {
  const total = easy + medium + hard
  if (total === 0) return (
    <div className="h-2 bg-surface-3 rounded-full" />
  )
  const easyPct = (easy / total) * 100
  const medPct = (medium / total) * 100
  const hardPct = (hard / total) * 100

  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      {easyPct > 0 && (
        <div className="bg-success rounded-full transition-all" style={{ width: `${easyPct}%` }} />
      )}
      {medPct > 0 && (
        <div className="bg-warning rounded-full transition-all" style={{ width: `${medPct}%` }} />
      )}
      {hardPct > 0 && (
        <div className="bg-danger rounded-full transition-all" style={{ width: `${hardPct}%` }} />
      )}
    </div>
  )
}

// ── Category solved distribution ──────────────────────
function CategoryBreakdown({ solvedByCategory }) {
  if (!solvedByCategory?.length) return null

  const categoryMap = Object.fromEntries(PROBLEM_CATEGORIES.map(c => [c.id, c]))
  const sorted = [...solvedByCategory].sort((a, b) => b.count - a.count).slice(0, 5)

  return (
    <div className="space-y-2">
      {sorted.map(item => {
        const cat = categoryMap[item.category]
        if (!cat) return null
        return (
          <div key={item.category} className="flex items-center gap-2">
            <span className="text-sm flex-shrink-0">{cat.icon}</span>
            <span className="text-[11px] text-text-secondary flex-1 truncate">{cat.label}</span>
            <span className="text-[11px] font-bold font-mono text-text-primary flex-shrink-0">
              {item.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Velocity sparkline — last 4 weeks ─────────────────
function VelocitySparkline({ weekly }) {
  if (!weekly?.length) return null

  const max = Math.max(...weekly, 1)
  const barWidth = 16
  const barGap = 4
  const height = 32
  const svgWidth = weekly.length * (barWidth + barGap) - barGap

  return (
    <div className="flex items-end gap-1">
      {weekly.map((val, i) => {
        const barHeight = Math.max((val / max) * height, 3)
        const isLatest = i === weekly.length - 1
        return (
          <div key={i}
            className={cn(
              'rounded-sm transition-all',
              isLatest ? 'bg-brand-400' : 'bg-brand-400/25'
            )}
            style={{ width: '14px', height: `${barHeight}px` }}
            title={`${val} solved`}
          />
        )
      })}
    </div>
  )
}

// ── Dimension row — compact ────────────────────────────
function DimensionRow({ dim, score, index }) {
  const color = dim.color
  const pct = Math.min(score || 0, 100)

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="space-y-1"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-text-secondary">{dim.short}</span>
        <span className="text-[11px] font-bold font-mono text-text-primary">{pct}</span>
      </div>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.2 + index * 0.05, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </motion.div>
  )
}

// ── Quick action button ────────────────────────────────
function QuickAction({ icon, label, desc, to, color, badge, onClick }) {
  const navigate = useNavigate()

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick || (() => navigate(to))}
      className={cn(
        'relative flex flex-col items-start gap-2 p-4 rounded-xl',
        'bg-surface-1 border border-border-default',
        'hover:border-brand-400/30 hover:bg-surface-2',
        'transition-all duration-150 text-left w-full'
      )}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-xl">{icon}</span>
        {badge && (
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-px rounded-full border',
            color || 'bg-brand-400/10 text-brand-300 border-brand-400/25'
          )}>
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-bold text-text-primary">{label}</p>
        {desc && <p className="text-[10px] text-text-tertiary mt-0.5">{desc}</p>}
      </div>
    </motion.button>
  )
}

// ══════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════
export default function Dashboard() {
  const navigate = useNavigate()
  const { teamName, isPersonalMode, isTeamAdmin } = useTeamContext()

  // Coordinated data fetching — no race conditions
  const { stats, report, isLoading } = useDashboardData()
  const { data: reviewData } = useReviewQueue()
  const { data: activityData } = useTeamActivity()

  // Pending team banner (personal mode waiting for team approval)
  const [pendingTeam, setPendingTeam] = useState(null)
  useEffect(() => {
    if (isPersonalMode) {
      try {
        const stored = localStorage.getItem('pendingTeam')
        if (stored) setPendingTeam(JSON.parse(stored))
      } catch { /* ignore */ }
    } else {
      setPendingTeam(null)
    }
  }, [isPersonalMode])

  // Derived values — computed once, used across sections
  const overallScore = report?.overall || 0
  const dimensions = report?.dimensions
  const readinessTier = useMemo(() => getReadinessTier(overallScore), [overallScore])
  const dueCount = reviewData?.dueCount || 0
  const dueReviews = reviewData?.due?.slice(0, 3) || []

  // Difficulty counts from personal stats
  const difficultyMap = useMemo(() => {
    const map = { EASY: 0, MEDIUM: 0, HARD: 0 }
    if (stats?.solvedByDifficulty) {
      stats.solvedByDifficulty.forEach(item => {
        map[item.difficulty] = (map[item.difficulty] || 0) + Number(item.count || 0)
      })
    }
    return map
  }, [stats?.solvedByDifficulty])

  // Weekly velocity data
  const weeklyData = report?.analytics?.weeklyVelocity?.weekly || []
  const avgWeekly = report?.analytics?.weeklyVelocity?.avg || 0

  // Interview countdown
  const daysToInterview = stats?.interviewDate
    ? Math.max(0, Math.ceil((new Date(stats.interviewDate) - new Date()) / (1000 * 60 * 60 * 24)))
    : null

  // Weeks to next threshold
  const weeksToThresholds = report?.analytics?.weeksToThresholds || {}

  // Pattern coverage
  const patternCoverage = report?.analytics?.patternCoverage || { used: 0, total: 16, missing: [] }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-text-tertiary">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">

      {/* ── Header ──────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
              {isPersonalMode ? 'Dashboard' : `${teamName}`}
            </h1>
            <p className="text-sm text-text-secondary mt-0.5">
              {isPersonalMode
                ? 'Your interview preparation overview'
                : 'Team preparation overview — your progress and team pulse'}
            </p>
          </div>
          {/* Readiness tier badge */}
          {overallScore > 0 && (
            <span className={cn(
              'text-xs font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5',
              readinessTier.bg
            )}>
              <span className={readinessTier.color}>●</span>
              <span className={readinessTier.color}>{readinessTier.label}</span>
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Pending team banner ──────────────────────── */}
      {pendingTeam && isPersonalMode && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-warning/5 border border-warning/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-lg">⏳</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-text-primary">
                Team "{pendingTeam.name}" is pending approval
              </p>
              <p className="text-xs text-text-tertiary">
                Practice individually while waiting. You'll switch automatically once approved.
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full
                                       bg-warning/10 text-warning border border-warning/20 flex-shrink-0">
              PENDING
            </span>
          </div>
        </motion.div>
      )}

      {/* ── URGENCY BANNER — Spaced repetition due ───
                Cognitive load principle: the most time-sensitive signal
                renders first. Overdue reviews degrade retention exponentially.
                This banner is not cosmetic — it is a behavioral intervention. [1]
            ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {dueCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              'rounded-xl border p-4 flex items-center justify-between gap-4',
              dueCount >= 10
                ? 'bg-danger/5 border-danger/25'
                : dueCount >= 5
                  ? 'bg-warning/5 border-warning/25'
                  : 'bg-brand-400/5 border-brand-400/25'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">
                {dueCount >= 10 ? '🔥' : dueCount >= 5 ? '⚠️' : '🧠'}
              </span>
              <div>
                <p className="text-sm font-bold text-text-primary">
                  {dueCount} {dueCount === 1 ? 'review' : 'reviews'} due
                  {dueCount >= 10 ? ' — memory decay accelerating' : dueCount >= 5 ? ' — review today to maintain retention' : ''}
                </p>
                <p className="text-xs text-text-tertiary">
                  Spaced repetition works only when you show up for reviews on schedule
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/review')}
              className={cn(
                'text-xs font-bold px-4 py-2 rounded-lg border flex-shrink-0 transition-all',
                dueCount >= 10
                  ? 'bg-danger/10 text-danger border-danger/25 hover:bg-danger/20'
                  : 'bg-brand-400/10 text-brand-300 border-brand-400/25 hover:bg-brand-400/20'
              )}
            >
              Review Now →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SECTION 1: Key Metrics Grid ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: '📋',
            label: 'Problems Solved',
            value: stats?.totalSolved || 0,
            sub: `${difficultyMap.EASY}E · ${difficultyMap.MEDIUM}M · ${difficultyMap.HARD}H`,
            color: 'brand',
          },
          {
            icon: '🔥',
            label: 'Day Streak',
            value: stats?.streak || 0,
            sub: stats?.streak >= 7 ? 'Keep it up!' : 'Practice daily',
            color: stats?.streak >= 7 ? 'success' : stats?.streak >= 3 ? 'warning' : 'brand',
          },
          {
            icon: '🧩',
            label: 'Quizzes Taken',
            value: stats?.quizCount || 0,
            sub: `${stats?.interviewCount || 0} mock interviews`,
            color: 'info',
          },
          {
            icon: '⭐',
            label: 'Avg Confidence',
            value: `${stats?.avgConfidence || 0}/5`,
            sub: stats?.avgConfidence >= 4 ? 'Strong recall' : stats?.avgConfidence >= 3 ? 'Moderate recall' : 'Needs review',
            color: stats?.avgConfidence >= 4 ? 'success' : stats?.avgConfidence >= 3 ? 'warning' : 'danger',
          },
        ].map((card, i) => {
          const colorMap = {
            brand: { bg: 'bg-brand-400/10', text: 'text-brand-300', bar: 'bg-brand-400' },
            success: { bg: 'bg-success/10', text: 'text-success', bar: 'bg-success' },
            warning: { bg: 'bg-warning/10', text: 'text-warning', bar: 'bg-warning' },
            danger: { bg: 'bg-danger/10', text: 'text-danger', bar: 'bg-danger' },
            info: { bg: 'bg-info/10', text: 'text-info', bar: 'bg-info' },
          }
          const c = colorMap[card.color] || colorMap.brand

          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative bg-surface-1 border border-border-default rounded-xl p-4 overflow-hidden"
            >
              <div className={cn('absolute top-0 left-0 right-0 h-0.5', c.bar)} />
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', c.bg)}>
                <span className={cn('text-base', c.text)}>{card.icon}</span>
              </div>
              <div className="text-2xl font-extrabold text-text-primary font-mono leading-none mb-1">
                {card.value}
              </div>
              <div className="text-xs font-medium text-text-secondary">{card.label}</div>
              {card.sub && (
                <div className="text-[10px] text-text-disabled mt-0.5 font-mono">{card.sub}</div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── SECTION 2: Readiness + 6D Dimensions ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Overall readiness card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                Interview Readiness
              </p>
              <div className="text-5xl font-extrabold font-mono text-text-primary leading-none">
                {overallScore}
                <span className="text-2xl text-text-disabled">/100</span>
              </div>
            </div>
            <MiniRadar dimensions={dimensions} />
          </div>

          {/* Readiness tier */}
          <span className={cn(
            'text-[10px] font-bold px-2 py-1 rounded-full border inline-flex items-center gap-1 w-fit',
            readinessTier.bg
          )}>
            <span className={readinessTier.color}>●</span>
            <span className={readinessTier.color}>{readinessTier.label}</span>
          </span>

          {/* Weeks to next tier */}
          {weeksToThresholds.technical_screen > 0 && (
            <div className="bg-surface-2 border border-border-subtle rounded-xl p-3">
              <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-1">
                Est. weeks to Tech Screen Ready
              </p>
              <p className="text-lg font-extrabold font-mono text-brand-300">
                {weeksToThresholds.technical_screen}w
                <span className="text-xs font-normal text-text-disabled ml-1">
                  at current pace
                </span>
              </p>
            </div>
          )}

          {overallScore === 0 && (
            <p className="text-[11px] text-text-disabled leading-relaxed">
              Submit solutions with AI review to start building your readiness score.
            </p>
          )}

          <button
            onClick={() => navigate('/report')}
            className="text-xs font-bold text-brand-300 hover:text-brand-200 transition-colors
                                   flex items-center gap-1 mt-auto"
          >
            Full Intelligence Report
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </motion.div>

        {/* 6D Dimension breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5 lg:col-span-2"
        >
          <p className="text-xs font-bold text-text-primary mb-4 flex items-center gap-2">
            <span>📊</span> 6D Readiness Dimensions
          </p>

          {dimensions ? (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {DIMENSIONS.map((dim, i) => (
                <DimensionRow
                  key={dim.id}
                  dim={dim}
                  score={dimensions[dim.id] || 0}
                  index={i}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="text-3xl mb-3">📈</span>
              <p className="text-sm font-semibold text-text-primary mb-1">
                No readiness data yet
              </p>
              <p className="text-xs text-text-tertiary max-w-[200px] leading-relaxed">
                Submit solutions and request AI review to build your 6D profile
              </p>
            </div>
          )}

          {/* Weakest dimension callout */}
          {dimensions && (() => {
            const weakest = DIMENSIONS.reduce((min, dim) =>
              (dimensions[dim.id] || 0) < (dimensions[min.id] || 0) ? dim : min
            )
            const weakestScore = dimensions[weakest.id] || 0
            if (weakestScore > 60) return null
            return (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-[11px] text-text-tertiary leading-relaxed">
                  <span className="font-bold text-text-primary">Focus area: </span>
                  {weakest.label} ({weakestScore}/100) — {weakest.desc}
                </p>
              </div>
            )
          })()}
        </motion.div>
      </div>

      {/* ── SECTION 3: Quick Actions ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction
            icon="📋"
            label="Practice Problems"
            desc="Solve and get AI feedback"
            to="/problems"
          />
          <QuickAction
            icon="💬"
            label="Mock Interview"
            desc="GPT-4o, 8 culture styles"
            to="/mock-interview"
          />
          <QuickAction
            icon="🧩"
            label="Take a Quiz"
            desc="Any subject, instant MCQ"
            to="/quizzes"
          />
          <QuickAction
            icon="🧠"
            label="Review Queue"
            desc={dueCount > 0 ? `${dueCount} due now` : 'Spaced repetition'}
            to="/review"
            badge={dueCount > 0 ? `${dueCount} due` : undefined}
            color={dueCount > 0 ? 'bg-danger/10 text-danger border-danger/20' : undefined}
          />
        </div>
      </motion.div>

      {/* ── SECTION 4: Progress Analytics ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Weekly velocity */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
            Weekly Velocity
          </p>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-2xl font-extrabold font-mono text-text-primary">
              {avgWeekly.toFixed(1)}
            </span>
            <span className="text-xs text-text-disabled mb-1">avg / week</span>
          </div>
          <VelocitySparkline weekly={weeklyData} />
          <div className="flex justify-between mt-2">
            {['4w ago', '3w', '2w', 'This week'].map((label, i) => (
              <span key={i} className="text-[9px] text-text-disabled">{label}</span>
            ))}
          </div>
          {avgWeekly < 3 && (
            <p className="text-[10px] text-warning mt-2">
              Aim for 5+ problems/week for meaningful progress
            </p>
          )}
        </motion.div>

        {/* Difficulty distribution */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
            Difficulty Mix
          </p>
          <DifficultyBar
            easy={difficultyMap.EASY}
            medium={difficultyMap.MEDIUM}
            hard={difficultyMap.HARD}
          />
          <div className="flex justify-between mt-2 mb-4">
            {[
              { label: 'Easy', count: difficultyMap.EASY, color: 'text-success' },
              { label: 'Medium', count: difficultyMap.MEDIUM, color: 'text-warning' },
              { label: 'Hard', count: difficultyMap.HARD, color: 'text-danger' },
            ].map(d => (
              <div key={d.label} className="text-center">
                <div className={cn('text-base font-extrabold font-mono', d.color)}>{d.count}</div>
                <div className="text-[9px] text-text-disabled">{d.label}</div>
              </div>
            ))}
          </div>
          {/* Coaching nudge based on difficulty distribution */}
          {stats?.totalSolved > 5 && (() => {
            const total = difficultyMap.EASY + difficultyMap.MEDIUM + difficultyMap.HARD
            const hardPct = total > 0 ? difficultyMap.HARD / total : 0
            const medPct = total > 0 ? difficultyMap.MEDIUM / total : 0
            if (hardPct < 0.1 && total > 10) {
              return <p className="text-[10px] text-warning">Push toward Hard problems — FAANG expects it</p>
            }
            if (medPct < 0.3 && total > 5) {
              return <p className="text-[10px] text-info">Add more Medium problems for balanced prep</p>
            }
            if (hardPct >= 0.25) {
              return <p className="text-[10px] text-success">Strong difficulty distribution ✓</p>
            }
            return null
          })()}
        </motion.div>

        {/* Pattern coverage */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.31 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
            Pattern Coverage
          </p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-2xl font-extrabold font-mono text-text-primary">
              {patternCoverage.used}
            </span>
            <span className="text-base font-bold text-text-disabled">/ {patternCoverage.total}</span>
          </div>
          <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(patternCoverage.used / patternCoverage.total) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="h-full bg-brand-400 rounded-full"
            />
          </div>
          {patternCoverage.missing?.length > 0 && (
            <div>
              <p className="text-[10px] text-text-disabled mb-1">Missing patterns:</p>
              <div className="flex flex-wrap gap-1">
                {patternCoverage.missing.slice(0, 4).map(p => (
                  <span key={p}
                    className="text-[9px] text-danger bg-danger/5 border border-danger/15 rounded px-1.5 py-px">
                    {p}
                  </span>
                ))}
                {patternCoverage.missing.length > 4 && (
                  <span className="text-[9px] text-text-disabled">
                    +{patternCoverage.missing.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── SECTION 5: Review Queue + Recommendations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Review queue — show even when empty to reinforce habit */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-text-primary flex items-center gap-2">
              <span>🧠</span> Review Queue
              {dueCount > 0 && (
                <span className="text-[9px] font-bold text-danger bg-danger/10 border border-danger/20 px-1.5 py-px rounded-full">
                  {dueCount} due
                </span>
              )}
            </p>
            <button onClick={() => navigate('/review')}
              className="text-[10px] font-bold text-brand-300 hover:text-brand-200 transition-colors">
              See all →
            </button>
          </div>
          {dueReviews.length > 0 ? (
            <ReviewPreview reviews={dueReviews} totalDue={dueCount} />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="text-3xl mb-2">✅</span>
              <p className="text-sm font-semibold text-text-primary mb-1">All caught up!</p>
              <p className="text-xs text-text-tertiary">No reviews due right now. Check back tomorrow.</p>
            </div>
          )}
        </motion.div>

        {/* AI Recommendations */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.33 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-text-primary flex items-center gap-2">
              <span>🎯</span> Recommended Next
            </p>
            <button onClick={() => navigate('/problems')}
              className="text-[10px] font-bold text-brand-300 hover:text-brand-200 transition-colors">
              All problems →
            </button>
          </div>
          <Recommendations limit={4} compact />
        </motion.div>
      </div>

      {/* ── SECTION 6: Team Activity (team mode only) ── */}
      {!isPersonalMode && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-text-primary flex items-center gap-2">
                <span>👥</span> Team Activity
                {activityData?.meta?.totalInPeriod > 0 && (
                  <span className="text-[9px] font-bold text-success bg-success/10 border border-success/20 px-1.5 py-px rounded-full">
                    {activityData.meta.totalInPeriod} this week
                  </span>
                )}
              </p>
              {activityData?.meta?.uniqueContributors > 0 && (
                <p className="text-[10px] text-text-disabled mt-0.5">
                  {activityData.meta.uniqueContributors} members active in the last {activityData.meta.periodDays} days
                </p>
              )}
            </div>
            <button onClick={() => navigate('/leaderboard')}
              className="text-[10px] font-bold text-brand-300 hover:text-brand-200 transition-colors">
              Leaderboard →
            </button>
          </div>
          <ActivityFeed
            activities={activityData?.activities || []}
            loading={!activityData}
          />
        </motion.div>
      )}

      {/* ── SECTION 7: Category breakdown (team mode) ── */}
      {!isPersonalMode && stats?.solvedByCategory?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-5"
        >
          <p className="text-xs font-bold text-text-primary flex items-center gap-2 mb-4">
            <span>📚</span> Your Progress by Category
          </p>
          <CategoryBreakdown solvedByCategory={stats.solvedByCategory} />
        </motion.div>
      )}

      {/* ── SECTION 8: Interview countdown ──────────── */}
      {daysToInterview !== null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={cn(
            'border rounded-xl p-5',
            daysToInterview <= 7
              ? 'bg-danger/5 border-danger/25'
              : daysToInterview <= 30
                ? 'bg-warning/5 border-warning/25'
                : 'bg-brand-400/5 border-brand-400/20'
          )}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-1">
                Interview Countdown
              </p>
              <p className="text-sm text-text-primary">
                <span className="font-bold">{stats.targetCompany || 'Your interview'}</span>
                {' '}in{' '}
                <span className={cn(
                  'font-extrabold font-mono text-lg',
                  daysToInterview <= 7 ? 'text-danger'
                    : daysToInterview <= 30 ? 'text-warning'
                      : 'text-brand-300'
                )}>
                  {daysToInterview}
                </span>
                {' '}days
              </p>
              {daysToInterview <= 7 && (
                <p className="text-xs text-danger mt-1">
                  Final stretch — focus on review queue and mock interviews
                </p>
              )}
              {daysToInterview > 7 && daysToInterview <= 30 && (
                <p className="text-xs text-warning mt-1">
                  Under a month — time to accelerate practice velocity
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => navigate('/review')}
                className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-default hover:border-border-strong">
                Reviews
              </button>
              <button onClick={() => navigate('/report')}
                className="text-xs font-bold text-brand-300 hover:text-brand-200 transition-colors px-3 py-1.5 rounded-lg border border-brand-400/25 hover:border-brand-400/40">
                View Readiness →
              </button>
            </div>
          </div>
        </motion.div>
      )}

    </div>
  )
}