// ============================================================================
// ProbSolver v3.0 — Intelligence Report (Enhanced Analytics)
// ============================================================================
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamContext } from '@hooks/useTeamContext'
import { use6DReport } from '@hooks/useReport'
import { Spinner } from '@components/ui/Spinner'
import { RadarChart } from '@components/charts/RadarChart'
import { cn } from '@utils/cn'

// ── Dimension config — single source of truth for this page ──
const DIMENSIONS = [
  {
    key: 'patternRecognition',
    label: 'Pattern Recognition',
    color: '#7c6ff7',
    icon: '🔍',
    weight: 'HIGH',
    interviewRelevance: 'Tested in every coding round. Interviewers specifically watch for how quickly you identify the right approach.',
    actionWhenLow: 'Practice identifying patterns before writing code. For each problem, name the pattern first.',
    actionWhenHigh: 'Expand to less common patterns — Tries, Segment Trees, Bit Manipulation.',
  },
  {
    key: 'solutionDepth',
    label: 'Solution Depth',
    color: '#22c55e',
    icon: '🧠',
    weight: 'HIGH',
    interviewRelevance: 'Interviewers assess whether you understand WHY a solution works, not just that it does.',
    actionWhenLow: 'Write a key insight and Feynman explanation for every solution. This is what separates good candidates from great ones.',
    actionWhenHigh: 'Focus on connecting solutions to real systems — show you think beyond the algorithm.',
  },
  {
    key: 'communication',
    label: 'Communication',
    color: '#3b82f6',
    icon: '💬',
    weight: 'HIGH',
    interviewRelevance: 'You can solve the problem but fail the interview if you can\'t explain your thinking. Thinking aloud is evaluated.',
    actionWhenLow: 'For every solution, write a Feynman explanation as if teaching someone with no CS background.',
    actionWhenHigh: 'Get peer clarity ratings from teammates to validate your communication quality.',
  },
  {
    key: 'optimization',
    label: 'Optimization',
    color: '#eab308',
    icon: '⚡',
    weight: 'CRITICAL',
    interviewRelevance: 'Every technical screen tests this. Interviewers want brute force → optimal progression, with complexity analysis.',
    actionWhenLow: 'Start every solution with a brute force approach, then optimize. Document both with time/space complexity.',
    actionWhenHigh: 'Practice explaining WHY the optimized solution is better — trade-off reasoning is a senior-level signal.',
  },
  {
    key: 'pressurePerformance',
    label: 'Pressure Performance',
    color: '#ef4444',
    icon: '🎯',
    weight: 'HIGH',
    interviewRelevance: 'Real interviews are 45 minutes. Your performance under time pressure is the most direct measure of readiness.',
    actionWhenLow: 'Do timed simulations and quizzes regularly. Performance under pressure is a trainable skill.',
    actionWhenHigh: 'Maintain by taking at least one timed quiz per week to keep the mental sharpness.',
  },
  {
    key: 'retention',
    label: 'Knowledge Retention',
    color: '#a855f7',
    icon: '📚',
    weight: 'MEDIUM',
    interviewRelevance: 'Long interview processes mean you need to retain knowledge for weeks. Spaced repetition fights the forgetting curve.',
    actionWhenLow: 'Review your overdue solutions — the Ebbinghaus curve means unreviewed knowledge fades by 70% in a week.',
    actionWhenHigh: 'Stay consistent with the review queue. Even 10 minutes per day compounds significantly.',
  },
]

// Company tier thresholds — based on what interviewers actually evaluate
const COMPANY_TIERS = [
  {
    id: 'faang',
    name: 'FAANG / Top Tier',
    companies: 'Google, Meta, Apple, Netflix',
    minOverall: 80,
    requirements: { patternRecognition: 75, optimization: 70, pressurePerformance: 70, solutionDepth: 65 },
    icon: '🏆',
  },
  {
    id: 'tier2',
    name: 'Tier 2 Tech',
    companies: 'Amazon, Microsoft, Uber, Airbnb',
    minOverall: 65,
    requirements: { patternRecognition: 60, optimization: 50, pressurePerformance: 55, solutionDepth: 50 },
    icon: '🥈',
  },
  {
    id: 'tier3',
    name: 'Mid-tier / Growth',
    companies: 'Series B-D startups, mid-size tech',
    minOverall: 50,
    requirements: { patternRecognition: 45, optimization: 35, pressurePerformance: 40 },
    icon: '🥉',
  },
  {
    id: 'junior',
    name: 'Junior / Startup',
    companies: 'Early startups, junior roles',
    minOverall: 35,
    requirements: { patternRecognition: 30, optimization: 20 },
    icon: '🌱',
  },
]

// ── Compute verdict and readiness ─────────────────────
function computeReadiness(dims, overall, analytics) {
  // Find critical gap — lowest scoring HIGH/CRITICAL weight dimension
  const sortedByScore = [...DIMENSIONS]
    .filter(d => d.weight === 'CRITICAL' || d.weight === 'HIGH')
    .sort((a, b) => (dims[a.key] || 0) - (dims[b.key] || 0))

  const criticalGap = sortedByScore[0]
  const criticalScore = dims[criticalGap?.key] || 0

  // Company tier assessment
  const tierResults = COMPANY_TIERS.map(tier => {
    const meetsOverall = overall >= tier.minOverall
    const failingRequirements = Object.entries(tier.requirements)
      .filter(([key, minScore]) => (dims[key] || 0) < minScore)
      .map(([key]) => DIMENSIONS.find(d => d.key === key)?.label)
      .filter(Boolean)

    const ready = meetsOverall && failingRequirements.length === 0
    const close = !ready && overall >= tier.minOverall - 10 && failingRequirements.length <= 1

    return { ...tier, ready, close, failingRequirements }
  })

  // Current stage
  const highestReady = tierResults.find(t => t.ready)
  const nextTarget = tierResults.find(t => !t.ready)

  // Velocity-based weeks estimate
  const weeksToNext = analytics?.weeksToThresholds

  return {
    criticalGap,
    criticalScore,
    tierResults,
    highestReady,
    nextTarget,
    weeksToNext,
  }
}

// ── Verdict text generator ─────────────────────────────
function generateVerdict(dims, overall, analytics, readiness) {
  const { criticalGap, criticalScore, highestReady, nextTarget } = readiness
  const velocity = analytics?.weeklyVelocity?.avg || 0

  let verdictParts = []

  // What you can do now
  if (highestReady) {
    verdictParts.push(`You're ready to apply to ${highestReady.name} companies (${highestReady.companies}).`)
  } else {
    verdictParts.push("You're building your foundation — keep consistent.")
  }

  // Biggest strength
  const topDim = [...DIMENSIONS].sort((a, b) => (dims[b.key] || 0) - (dims[a.key] || 0))[0]
  if ((dims[topDim?.key] || 0) > 60) {
    verdictParts.push(`Your strongest signal is ${topDim.label} (${dims[topDim.key]}/100) — this is what gets you through phone screens.`)
  }

  // Critical gap
  if (criticalScore < 50 && criticalGap) {
    verdictParts.push(`Your most critical gap is ${criticalGap.label} (${criticalScore}/100). ${criticalGap.interviewRelevance}`)
  }

  // Next milestone
  if (nextTarget && analytics?.weeksToThresholds) {
    const tierKey = nextTarget.id === 'faang' ? 'faang'
      : nextTarget.id === 'tier2' ? 'onsite'
        : nextTarget.id === 'tier3' ? 'technical_screen'
          : 'phone_screen'
    const weeks = analytics.weeksToThresholds[tierKey]
    if (weeks && weeks > 0 && velocity > 0) {
      verdictParts.push(`At your current pace (${velocity} solutions/week), you could reach ${nextTarget.name} readiness in approximately ${weeks} week${weeks !== 1 ? 's' : ''}.`)
    }
  }

  return verdictParts.join(' ')
}

// ══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════

// ── Verdict card ───────────────────────────────────────
function VerdictCard({ dims, overall, analytics, readiness }) {
  const verdict = generateVerdict(dims, overall, analytics, readiness)

  const scoreColor = overall >= 75 ? 'text-success'
    : overall >= 55 ? 'text-warning'
      : 'text-danger'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
    >
      <div className="flex items-start gap-5 flex-wrap">
        {/* Score ring */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="relative w-24 h-24">
            <svg width="96" height="96" className="-rotate-90">
              <circle cx="48" cy="48" r="40" fill="none"
                stroke="rgba(128,128,128,0.15)" strokeWidth="7" />
              <motion.circle
                cx="48" cy="48" r="40" fill="none"
                stroke={overall >= 75 ? '#22c55e' : overall >= 55 ? '#eab308' : '#ef4444'}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - overall / 100) }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-2xl font-extrabold font-mono', scoreColor)}>
                {overall}
              </span>
              <span className="text-[9px] text-text-disabled uppercase tracking-wider">
                /100
              </span>
            </div>
          </div>
          <p className="text-[10px] text-text-disabled uppercase tracking-widest">
            Overall
          </p>
        </div>

        {/* Verdict text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h2 className="text-sm font-bold text-text-primary">
              Interview Readiness Verdict
            </h2>
            <span className={cn(
              'text-[9px] font-bold px-2 py-px rounded-full border',
              overall >= 75 ? 'bg-success/10 text-success border-success/25'
                : overall >= 55 ? 'bg-warning/10 text-warning border-warning/25'
                  : 'bg-danger/10 text-danger border-danger/25'
            )}>
              {overall >= 75 ? 'Onsite Ready' : overall >= 55 ? 'Phone Screen Ready' : overall >= 35 ? 'Building Foundation' : 'Getting Started'}
            </span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            {verdict}
          </p>

          {/* Velocity indicator */}
          {analytics?.weeklyVelocity?.avg !== undefined && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border-subtle flex-wrap">
              <div className="text-center">
                <p className="text-base font-extrabold font-mono text-text-primary">
                  {analytics.weeklyVelocity.avg}
                </p>
                <p className="text-[9px] text-text-disabled uppercase tracking-wider">
                  Solutions/week
                </p>
              </div>
              {analytics.confidenceTrend && (
                <div className="text-center">
                  <p className={cn(
                    'text-base font-extrabold',
                    analytics.confidenceTrend === 'improving' ? 'text-success'
                      : analytics.confidenceTrend === 'declining' ? 'text-danger'
                        : 'text-text-secondary'
                  )}>
                    {analytics.confidenceTrend === 'improving' ? '↑' : analytics.confidenceTrend === 'declining' ? '↓' : '→'}
                  </p>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider">
                    Confidence
                  </p>
                </div>
              )}
              {analytics.aiReview?.trend && analytics.aiReview.avgScore !== null && (
                <div className="text-center">
                  <p className={cn(
                    'text-base font-extrabold font-mono',
                    analytics.aiReview.trend === 'improving' ? 'text-success'
                      : analytics.aiReview.trend === 'declining' ? 'text-danger'
                        : 'text-text-secondary'
                  )}>
                    {analytics.aiReview.avgScore}/100
                  </p>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider">
                    AI Review Avg
                  </p>
                </div>
              )}
              {analytics.overdueReviews > 0 && (
                <div className="flex items-center gap-1.5 bg-warning/8 border border-warning/20
                                rounded-lg px-2.5 py-1.5">
                  <span className="text-sm">⏰</span>
                  <span className="text-xs font-bold text-warning">
                    {analytics.overdueReviews} overdue review{analytics.overdueReviews !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Company tier readiness grid ────────────────────────
function CompanyReadinessGrid({ tierResults, analytics }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
    >
      <h2 className="text-sm font-bold text-text-primary mb-1">
        Company Tier Readiness
      </h2>
      <p className="text-xs text-text-tertiary mb-4">
        Based on what interviewers at each tier actually evaluate — pattern speed, optimization depth, pressure performance.
      </p>
      <div className="space-y-3">
        {tierResults.map((tier, i) => (
          <motion.div
            key={tier.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              'flex items-start gap-3 p-3.5 rounded-xl border',
              tier.ready ? 'bg-success/5 border-success/20'
                : tier.close ? 'bg-warning/5 border-warning/20'
                  : 'bg-surface-2 border-border-default'
            )}
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{tier.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-text-primary">
                  {tier.name}
                </span>
                <span className="text-[10px] text-text-disabled">
                  {tier.companies}
                </span>
              </div>
              {!tier.ready && tier.failingRequirements.length > 0 && (
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Needs stronger: {tier.failingRequirements.join(', ')}
                </p>
              )}
              {!tier.ready && tier.close && (
                <p className="text-[11px] text-warning mt-0.5 font-medium">
                  Very close — one focused push away
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              {tier.ready ? (
                <span className="text-[10px] font-bold text-success bg-success/12
                                 border border-success/25 rounded-full px-2 py-px">
                  ✓ Ready
                </span>
              ) : tier.close ? (
                <span className="text-[10px] font-bold text-warning bg-warning/12
                                 border border-warning/25 rounded-full px-2 py-px">
                  Almost
                </span>
              ) : (
                <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                 border border-border-default rounded-full px-2 py-px">
                  Not yet
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Timeline estimate */}
      {analytics?.weeksToThresholds && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-3">
            Estimated time at current practice velocity
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Phone Screen Ready', key: 'phone_screen', color: 'text-success' },
              { label: 'Technical Screen', key: 'technical_screen', color: 'text-brand-300' },
              { label: 'Onsite Ready', key: 'onsite', color: 'text-warning' },
              { label: 'FAANG Ready', key: 'faang', color: 'text-danger' },
            ].map(({ label, key, color }) => {
              const weeks = analytics.weeksToThresholds[key]
              return (
                <div key={key} className="text-center bg-surface-2 rounded-xl p-3">
                  <p className={cn('text-base font-extrabold font-mono', weeks === 0 ? 'text-success' : color)}>
                    {weeks === 0 ? '✓' : `${weeks}w`}
                  </p>
                  <p className="text-[9px] text-text-disabled mt-0.5 leading-tight">
                    {label}
                  </p>
                </div>
              )
            })}
          </div>
          {analytics.weeklyVelocity?.avg < 1 && (
            <p className="text-[11px] text-warning mt-2">
              ⚠️ At less than 1 solution/week, these estimates assume you increase practice velocity.
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ── Critical gap card ──────────────────────────────────
function CriticalGapCard({ criticalGap, criticalScore, analytics }) {
  if (!criticalGap || criticalScore >= 70) return null

  const optimizationRate = analytics?.optimizationRate || 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className="bg-danger/5 border border-danger/20 rounded-2xl p-5 mb-6"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-danger/15 flex items-center
                        justify-center text-xl flex-shrink-0">
          🚨
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="text-sm font-bold text-text-primary">
              Critical Gap: {criticalGap.label}
            </h3>
            <span className="text-lg font-extrabold font-mono text-danger">
              {criticalScore}/100
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            {criticalGap.interviewRelevance}
          </p>

          {/* Specific data point for optimization */}
          {criticalGap.key === 'optimization' && (
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-text-tertiary">Solutions with both approaches documented</span>
                <span className="font-extrabold font-mono text-danger">{optimizationRate}%</span>
              </div>
              <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${optimizationRate}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-danger"
                />
              </div>
              <p className="text-[10px] text-text-disabled mt-1.5">
                Target: 80%+ to pass technical screens consistently
              </p>
            </div>
          )}

          <div className="flex items-start gap-2">
            <span className="text-success flex-shrink-0 mt-0.5 font-bold">→</span>
            <p className="text-xs font-semibold text-text-primary">
              {criticalGap.actionWhenLow}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Dimension cards (contextual) ───────────────────────
function DimensionCards({ dims, communicationFromProxy }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {DIMENSIONS.map((dim, i) => {
        const score = dims[dim.key] || 0
        const isLow = score < 50
        const isHigh = score >= 75
        const isCommProxy = dim.key === 'communication' && communicationFromProxy

        const scoreColor = score >= 75 ? 'text-success'
          : score >= 50 ? 'text-warning'
            : 'text-danger'

        return (
          <motion.div
            key={dim.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-surface-1 border border-border-default rounded-xl p-5"
            style={{ borderTop: `3px solid ${dim.color}` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{dim.icon}</span>
                <h3 className="text-xs font-bold text-text-primary">{dim.label}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {dim.weight === 'CRITICAL' && (
                  <span className="text-[8px] font-bold text-danger bg-danger/10
                                   border border-danger/20 rounded-full px-1.5 py-px">
                    CRITICAL
                  </span>
                )}
                <span className={cn('text-lg font-extrabold font-mono', scoreColor)}>
                  {score}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mb-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.8, delay: i * 0.05 }}
                className="h-full rounded-full"
                style={{ backgroundColor: dim.color }}
              />
            </div>

            {/* Contextual insight */}
            <p className="text-[11px] text-text-tertiary leading-relaxed mb-2">
              {isHigh ? dim.actionWhenHigh : isLow ? dim.interviewRelevance : dim.interviewRelevance}
            </p>

            {/* Action */}
            {isLow && (
              <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border-subtle">
                <span className="text-brand-300 flex-shrink-0 text-xs font-bold mt-px">→</span>
                <p className="text-[11px] text-text-secondary font-medium leading-relaxed">
                  {dim.actionWhenLow}
                </p>
              </div>
            )}

            {isCommProxy && (
              <p className="text-[10px] text-text-disabled mt-1 italic">
                Estimated from written explanations. Peer ratings give a stronger signal.
              </p>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Pattern coverage card ──────────────────────────────
function PatternCoverageCard({ analytics }) {
  const patternData = analytics?.patternCoverage
  if (!patternData) return null

  const coverageRate = Math.round((patternData.used / patternData.total) * 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Pattern Coverage</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            You've practiced {patternData.used} of {patternData.total} canonical interview patterns
          </p>
        </div>
        <span className={cn(
          'text-xl font-extrabold font-mono',
          coverageRate >= 75 ? 'text-success' : coverageRate >= 50 ? 'text-warning' : 'text-danger'
        )}>
          {coverageRate}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${coverageRate}%` }}
          transition={{ duration: 0.8 }}
          className={cn(
            'h-full rounded-full',
            coverageRate >= 75 ? 'bg-success' : coverageRate >= 50 ? 'bg-warning' : 'bg-danger'
          )}
        />
      </div>

      {/* Missing patterns */}
      {patternData.missing.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
            Not yet practiced ({patternData.missing.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {patternData.missing.map(p => (
              <span key={p}
                className="text-[11px] text-text-tertiary bg-surface-2 border border-border-default
                           rounded-lg px-2 py-1 font-medium">
                {p}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-text-disabled mt-2">
            Google and Meta interviewers often test less common patterns in final rounds. Broad coverage reduces surprise factor.
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ── This week's actions ────────────────────────────────
function WeeklyActionsCard({ dims, analytics, totalSolutions }) {
  const actions = useMemo(() => {
    const result = []

    // D4 Optimization — most common critical gap
    const optimizationScore = dims.optimization || 0
    if (optimizationScore < 60) {
      const rate = analytics?.optimizationRate || 0
      result.push({
        priority: 1,
        icon: '⚡',
        color: 'border-warning/30 bg-warning/5',
        labelColor: 'text-warning',
        label: 'HIGH IMPACT',
        title: `Document brute force → optimized in your next 3 solutions`,
        reason: `Only ${rate}% of your solutions have both approaches. This is what onsites test.`,
      })
    }

    // D1 Pattern Recognition — missing patterns
    const missingCount = analytics?.patternCoverage?.missing?.length || 0
    if (missingCount > 3) {
      const topMissing = (analytics?.patternCoverage?.missing || []).slice(0, 2).join(' and ')
      result.push({
        priority: 2,
        icon: '🔍',
        color: 'border-brand-400/30 bg-brand-400/5',
        labelColor: 'text-brand-300',
        label: 'PATTERN GAP',
        title: `Practice ${topMissing}`,
        reason: `You have ${missingCount} untouched patterns. Broad pattern coverage reduces interview surprises.`,
      })
    }

    // D5 Pressure Performance — no simulations
    const simCount = analytics ? 0 : 0
    if ((dims.pressurePerformance || 0) < 60) {
      result.push({
        priority: 3,
        icon: '🎯',
        color: 'border-danger/30 bg-danger/5',
        labelColor: 'text-danger',
        label: 'PRESSURE TRAINING',
        title: 'Take 2 timed quizzes this week',
        reason: 'Timed practice is the most direct way to build interview pressure performance.',
      })
    }

    // D6 Retention — overdue reviews
    const overdue = analytics?.overdueReviews || 0
    if (overdue > 2) {
      result.push({
        priority: 4,
        icon: '📚',
        color: 'border-info/30 bg-info/5',
        labelColor: 'text-info',
        label: 'RETENTION RISK',
        title: `Review ${Math.min(overdue, 5)} overdue solutions`,
        reason: `Ebbinghaus forgetting curve: unreviewed knowledge fades ~70% in a week. ${overdue} solutions at risk.`,
      })
    }

    // Weak quiz subjects
    if (analytics?.weakQuizSubjects?.length > 0) {
      const weakest = analytics.weakQuizSubjects[0]
      result.push({
        priority: 5,
        icon: '🧩',
        color: 'border-purple-400/30 bg-purple-400/5',
        labelColor: 'text-purple-400',
        label: 'KNOWLEDGE GAP',
        title: `Retake ${weakest.subject} quiz (avg ${weakest.avg}%)`,
        reason: `Your lowest quiz subject. Quiz knowledge maps to CS fundamentals interviewers test implicitly.`,
      })
    }

    // Velocity — if too slow
    const velocity = analytics?.weeklyVelocity?.avg || 0
    if (velocity < 2 && totalSolutions < 20) {
      result.push({
        priority: 6,
        icon: '🚀',
        color: 'border-success/30 bg-success/5',
        labelColor: 'text-success',
        label: 'VELOCITY',
        title: 'Aim for 3 solutions this week',
        reason: `At ${velocity} solutions/week, readiness builds slowly. Consistent volume is what compounds.`,
      })
    }

    return result.slice(0, 3) // Show top 3 most important
  }, [dims, analytics, totalSolutions])

  if (!actions.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
    >
      <h3 className="text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
        <span>📅</span> This Week's Priority Actions
      </h3>
      <p className="text-xs text-text-tertiary mb-4">
        Derived from your weakest dimensions. Do these before anything else.
      </p>
      <div className="space-y-3">
        {actions.map((action, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={cn('flex items-start gap-3 p-3.5 rounded-xl border', action.color)}
          >
            <span className="text-lg flex-shrink-0">{action.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={cn('text-[9px] font-bold uppercase tracking-widest', action.labelColor)}>
                  {action.label}
                </span>
              </div>
              <p className="text-xs font-bold text-text-primary mb-0.5">
                {action.title}
              </p>
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                {action.reason}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Activity summary ───────────────────────────────────
function ActivitySummary({ report, analytics }) {
  const weeklyData = analytics?.weeklyVelocity?.weekly || []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
    >
      <h2 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
        Activity Summary
      </h2>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center mb-5">
        {[
          { label: 'Solutions', value: report?.totalSolutions || 0, icon: '✅', color: 'text-success' },
          { label: 'Quizzes', value: report?.quizCount || 0, icon: '🧩', color: 'text-brand-300' },
          { label: 'Interviews', value: report?.interviewCount || 0, icon: '💬', color: 'text-info' },
          { label: 'Simulations', value: report?.simCount || 0, icon: '⏱', color: 'text-warning' },
        ].map((s) => (
          <div key={s.label}>
            <span className="text-xl">{s.icon}</span>
            <p className={cn('text-xl font-extrabold font-mono mt-1', s.color)}>{s.value}</p>
            <p className="text-[10px] text-text-disabled uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Weekly velocity mini chart */}
      {weeklyData.length === 4 && (
        <div>
          <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-2">
            Solutions per week (last 4 weeks)
          </p>
          <div className="flex items-end gap-2 h-12">
            {weeklyData.map((count, i) => {
              const maxVal = Math.max(...weeklyData, 1)
              const heightPct = Math.max((count / maxVal) * 100, 8)
              const isThisWeek = i === 3
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-full rounded-sm transition-all',
                      isThisWeek ? 'bg-brand-400' : 'bg-surface-3'
                    )}
                    style={{ height: `${heightPct}%`, minHeight: '3px' }}
                  />
                  <span className="text-[9px] text-text-disabled font-mono">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-[9px] text-text-disabled mt-1">
            <span>4 weeks ago</span>
            <span>This week</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ReportPage() {
  const navigate = useNavigate()
  const { teamName, isPersonalMode } = useTeamContext()
  const { data: report, isLoading, isFetching } = use6DReport()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs text-text-tertiary">Computing your intelligence profile...</p>
        </div>
      </div>
    )
  }

  const dims = report?.dimensions || {}
  const overall = report?.overall || 0
  const analytics = report?.analytics || null
  const hasData = (report?.totalSolutions || 0) > 0

  // No data state
  if (!hasData) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
            Intelligence Report
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {isPersonalMode ? 'Your personal 6-dimension readiness profile.' : `Your readiness profile within ${teamName}.`}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-16 text-center"
        >
          <span className="text-5xl mb-4 block">📊</span>
          <h2 className="text-base font-bold text-text-primary mb-2">No data yet</h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-6">
            Submit solutions to build your intelligence profile. Each solution feeds your 6-dimension readiness score.
          </p>
          <button
            onClick={() => navigate('/problems')}
            className="px-6 py-2.5 rounded-xl bg-brand-400 text-white text-sm font-bold
                       hover:bg-brand-400/90 transition-all"
          >
            Go to Problems →
          </button>
        </motion.div>
      </div>
    )
  }

  // Compute readiness (pure client-side analytics)
  const readiness = computeReadiness(dims, overall, analytics)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Header ─────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
              Intelligence Report
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {isPersonalMode ? 'Your personal 6-dimension readiness profile.' : `Your readiness profile within ${teamName}.`}
            </p>
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-xs text-text-disabled">
              <div className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
              Updating...
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Section 1: Verdict ─────────────────────────── */}
      <VerdictCard dims={dims} overall={overall} analytics={analytics} readiness={readiness} />

      {/* ── Section 2: Company Tier Readiness ──────────── */}
      <CompanyReadinessGrid tierResults={readiness.tierResults} analytics={analytics} />

      {/* ── Section 3: Critical Gap ─────────────────────── */}
      <CriticalGapCard
        criticalGap={readiness.criticalGap}
        criticalScore={readiness.criticalScore}
        analytics={analytics}
      />

      {/* ── Section 4: This Week's Actions ─────────────── */}
      <WeeklyActionsCard
        dims={dims}
        analytics={analytics}
        totalSolutions={report?.totalSolutions || 0}
      />

      {/* ── Section 5: 6D Radar + Dimension Cards ──────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
      >
        <h2 className="text-sm font-bold text-text-primary mb-1">6D Intelligence Breakdown</h2>
        <p className="text-xs text-text-tertiary mb-4">
          Each dimension is computed from your actual behavior — not self-reported. Click dimension cards for specific actions.
        </p>
        <div className="flex justify-center mb-6">
          <RadarChart dimensions={dims} overall={overall} />
        </div>
      </motion.div>

      <DimensionCards dims={dims} communicationFromProxy={report?.communicationFromProxy} />

      {/* ── Section 6: Pattern Coverage ─────────────────── */}
      <PatternCoverageCard analytics={analytics} />

      {/* ── Section 7: Activity Summary + Velocity ──────── */}
      <ActivitySummary report={report} analytics={analytics} />
    </div>
  )
}