// ============================================================================
// ProbSolver v3.0 — Intelligence Report (Enhanced Analytics)
// ============================================================================
import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamContext } from '@hooks/useTeamContext'
import { use6DReport, useReadinessVerdict } from '@hooks/useReport'
import { Skeleton } from '@components/ui/Skeleton'
import { Spinner } from '@components/ui/Spinner'
import { RadarChart } from '@components/charts/RadarChart'
import { cn } from '@utils/cn'
import { useWeeklyPlan } from '@hooks/useAI'
import { PATTERNS } from '@utils/constants'
import { PatternMasteryCard } from '@components/report/PatternMasteryCard'

// Phase 5 flag — when on AND server returns analytics.patternMastery,
// PatternMasteryCard replaces the legacy PatternCoverageCard. Three-place
// declaration per CLAUDE.md: Railway env, client/Dockerfile ARG/ENV, here.
const PATTERN_MASTERY_V2_ENABLED =
    import.meta.env.VITE_FEATURE_PATTERN_MASTERY_V2 === 'true'

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
  {
    // D7 — opt-in dimension. Only appears in the dimensions array
    // returned by /stats/report when the user has hosted ≥1 teaching
    // session. Below the activation threshold (3 peer ratings) the
    // status is 'inactive' and the activation message is shown.
    key: 'teachingContributions',
    label: 'Teaching Contributions',
    color: '#f97316',
    icon: '📚',
    weight: 'MEDIUM',
    interviewRelevance: 'Senior+ roles weigh teaching and mentoring heavily. Hosting peer-teaching sessions and getting positive ratings is a direct signal.',
    actionWhenLow: 'Schedule a teaching session on your strongest topic; aim for ≥3 peer ratings to activate this dimension.',
    actionWhenHigh: 'Mentor more juniors; capture lessons in repeatable docs.',
  },
]

// Icon + label hints keyed on server tier.id. Server's readinessTiers.js
// is the single source of truth for thresholds + requirements.
const TIER_META = {
  faang: { icon: '🏆' },
  tier2: { icon: '🥈' },
  tier3: { icon: '🥉' },
  junior: { icon: '🌱' },
}

// ── Compute verdict and readiness from server-shaped report ──
// `dimByKey` is a map { key → {status, score, n, ci, activationMessage} }.
function computeReadiness(dimByKey, overall, tier) {
  // Find critical gap — lowest scoring HIGH/CRITICAL dimension among
  // ACTIVE dims only. Inactive dims with score=null must not be
  // presented as a "gap" because that would overclaim evidence.
  const sortedByScore = [...DIMENSIONS]
    .filter(d => d.weight === 'CRITICAL' || d.weight === 'HIGH')
    .filter(d => dimByKey[d.key]?.status === 'active')
    .sort((a, b) => (dimByKey[a.key]?.score || 0) - (dimByKey[b.key]?.score || 0))

  const criticalGap = sortedByScore[0] || null
  const criticalScore = criticalGap ? (dimByKey[criticalGap.key]?.score || 0) : 0

  // Tier results come from the server's `tier.tiers` (classifyReadiness output).
  const tierResults = (tier?.tiers || []).map(t => ({
    id: t.id,
    name: t.name,
    companies: t.companies,
    icon: TIER_META[t.id]?.icon || '•',
    ready: t.ready,
    close: t.close,
    failingRequirements: (t.failingDimensions || [])
      .map(f => DIMENSIONS.find(d => d.key === f.dimension)?.label)
      .filter(Boolean),
    threshold: t.threshold,
    overallGap: t.overallGap,
  }))

  const highestReady = tier?.highest ? tierResults.find(t => t.id === tier.highest.id) : null
  const nextTarget = tier?.next ? tierResults.find(t => t.id === tier.next.id) : null

  return {
    criticalGap,
    criticalScore,
    tierResults,
    highestReady,
    nextTarget,
  }
}

// ── Verdict text generator ─────────────────────────────
// Grounded verdict — will NOT claim readiness or "strongest signal" when
// coverage is low. Server decides which dims are active; we never invent
// a strength from an unmeasured dim.
function generateVerdict(dimByKey, overall, analytics, readiness, reportCoverage) {
  const { criticalGap, criticalScore, highestReady, nextTarget } = readiness
  const velocity = analytics?.weeklyVelocity?.avg || 0
  const coveragePct = reportCoverage?.pct ?? 0
  const activeCount = reportCoverage?.active ?? 0

  // Profile-too-small guard — cannot issue tier or strength claims
  // when fewer than 3 dims are active. Plan mandate: "If coverage <
  // 50%, your headline MUST acknowledge the profile is partial."
  if (overall == null || activeCount < 3) {
    return "Your profile is still being built — submit more solutions and request AI reviews to unlock readiness signals. Scores on dimensions with few data points remain intentionally hidden until there's enough evidence."
  }

  const verdictParts = []

  if (coveragePct < 50) {
    verdictParts.push(`Partial profile — ${activeCount} of 6 dimensions measured so far. Treat these as early signals, not confirmed readiness.`)
  } else if (highestReady) {
    verdictParts.push(`You're ready to apply to ${highestReady.name} companies (${highestReady.companies}).`)
  } else {
    verdictParts.push("You're building your foundation — keep consistent.")
  }

  // Biggest strength — only from active dims AND only when n is meaningful.
  const activeDims = [...DIMENSIONS]
    .map(d => ({ d, info: dimByKey[d.key] }))
    .filter(({ info }) => info?.status === 'active' && info.n >= 3)
    .sort((a, b) => (b.info.score || 0) - (a.info.score || 0))
  const topEntry = activeDims[0]
  if (topEntry && topEntry.info.score >= 65 && coveragePct >= 50) {
    const qualifier = topEntry.info.n < 5 ? 'early signal' : 'strong signal'
    verdictParts.push(`Your ${qualifier} is ${topEntry.d.label} (${topEntry.info.score}/100, n=${topEntry.info.n}).`)
  }

  // Critical gap — only from an active dim.
  if (criticalScore > 0 && criticalScore < 50 && criticalGap) {
    verdictParts.push(`Most critical gap: ${criticalGap.label} (${criticalScore}/100). ${criticalGap.interviewRelevance}`)
  }

  // Next milestone — server already keyed weeksToTiers by tier.id, so
  // the client doesn't need to re-map labels.
  if (nextTarget && analytics?.weeksToTiers) {
    const weeks = analytics.weeksToTiers[nextTarget.id]
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
function VerdictCard({ dimByKey, overallObj, analytics, readiness, reportCoverage, tierInfo }) {
  const overall = overallObj?.score ?? null
  const ci = overallObj?.ci ?? null
  const coveragePct = reportCoverage?.pct ?? 0
  const verdict = generateVerdict(dimByKey, overall, analytics, readiness, reportCoverage)

  // Use server tier info for the header badge instead of the old ternary
  // (which disagreed with the tier-readiness card below it).
  const highestName = tierInfo?.highest?.name || (overall == null ? 'Building profile' : 'Not yet tier-ready')
  const isProfilePartial = overall == null || coveragePct < 50

  const scoreColor = overall == null ? 'text-text-disabled'
    : overall >= 75 ? 'text-success-fg'
      : overall >= 55 ? 'text-warning-fg'
        : 'text-danger-fg'

  const badgeColor = overall == null ? 'bg-surface-3 text-text-disabled border-border-default'
    : tierInfo?.highest ? 'bg-success-soft text-success-fg border-success-line'
      : 'bg-warning-soft text-warning-fg border-warning-line'

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
              {overall != null && (
                <motion.circle
                  cx="48" cy="48" r="40" fill="none"
                  stroke={overall >= 75 ? '#22c55e' : overall >= 55 ? '#eab308' : '#ef4444'}
                  strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 40}
                  initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - overall / 100) }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-2xl font-extrabold font-mono', scoreColor)}>
                {overall == null ? '—' : overall}
              </span>
              <span className="text-[9px] text-text-disabled uppercase tracking-wider">
                /100
              </span>
            </div>
          </div>
          <p className="text-[10px] text-text-disabled uppercase tracking-widest">
            Overall
          </p>
          {ci && (
            <p className="text-[9px] text-text-disabled font-mono">
              95% CI {ci[0]}–{ci[1]}
            </p>
          )}
        </div>

        {/* Verdict text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h2 className="text-sm font-bold text-text-primary">
              Interview Readiness Verdict
            </h2>
            <span className={cn('text-[9px] font-bold px-2 py-px rounded-full border', badgeColor)}>
              {isProfilePartial ? `${reportCoverage?.active ?? 0} of 6 dimensions active` : highestName}
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
                    analytics.confidenceTrend === 'improving' ? 'text-success-fg'
                      : analytics.confidenceTrend === 'declining' ? 'text-danger-fg'
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
                    analytics.aiReview.trend === 'improving' ? 'text-success-fg'
                      : analytics.aiReview.trend === 'declining' ? 'text-danger-fg'
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
                <div className="flex items-center gap-1.5 bg-warning-soft border border-warning-line
                                rounded-lg px-2.5 py-1.5">
                  <span className="text-sm">⏰</span>
                  <span className="text-xs font-bold text-warning-fg">
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
              tier.ready ? 'bg-success-soft border-success-line'
                : tier.close ? 'bg-warning-soft border-warning-line'
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
                <p className="text-[11px] text-warning-fg mt-0.5 font-medium">
                  Very close — one focused push away
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              {tier.ready ? (
                <span className="text-[10px] font-bold text-success-fg bg-success-soft
                                 border border-success-line rounded-full px-2 py-px">
                  ✓ Ready
                </span>
              ) : tier.close ? (
                <span className="text-[10px] font-bold text-warning-fg bg-warning-soft
                                 border border-warning-line rounded-full px-2 py-px">
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

      {/* Timeline estimate — keyed on tier.id so client & server agree */}
      {analytics?.weeksToTiers && Object.keys(analytics.weeksToTiers).length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <p className="text-[10px] text-text-disabled uppercase tracking-widest mb-3">
            Estimated time at current practice velocity
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Junior / Startup', key: 'junior', color: 'text-success-fg' },
              { label: 'Mid-tier', key: 'tier3', color: 'text-brand-fg-soft' },
              { label: 'Tier 2 Tech', key: 'tier2', color: 'text-warning-fg' },
              { label: 'FAANG Ready', key: 'faang', color: 'text-danger-fg' },
            ].map(({ label, key, color }) => {
              const weeks = analytics.weeksToTiers[key]
              if (weeks == null) return null
              return (
                <div key={key} className="text-center bg-surface-2 rounded-xl p-3">
                  <p className={cn('text-base font-extrabold font-mono', weeks === 0 ? 'text-success-fg' : color)}>
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
            <p className="text-[11px] text-warning-fg mt-2">
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
      className="bg-danger-soft border border-danger-line rounded-2xl p-5 mb-6"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center
                        justify-center text-xl flex-shrink-0">
          🚨
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="text-sm font-bold text-text-primary">
              Critical Gap: {criticalGap.label}
            </h3>
            <span className="text-lg font-extrabold font-mono text-danger-fg">
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
                <span className="font-extrabold font-mono text-danger-fg">{optimizationRate}%</span>
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
            <span className="text-success-fg flex-shrink-0 mt-0.5 font-bold">→</span>
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
function DimensionCards({ dimByKey, communicationFromProxy }) {
  // teachingContributions (D7) is opt-in — the server only includes it
  // in dimensions[] once the user has hosted ≥1 session. Hide its card
  // until then so non-teachers don't see a mysterious extra dimension.
  const visibleDimensions = DIMENSIONS.filter((d) => {
    if (d.key === 'teachingContributions') return !!dimByKey[d.key]
    return true
  })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {visibleDimensions.map((dim, i) => {
        const info = dimByKey[dim.key]
        const isInactive = !info || info.status !== 'active'
        const score = info?.score ?? 0
        const ci = info?.ci ?? null
        const n = info?.n ?? 0
        const isLow = !isInactive && score < 50
        const isHigh = !isInactive && score >= 75
        const isCommProxy = dim.key === 'communication' && communicationFromProxy

        const scoreColor = isInactive ? 'text-text-disabled'
          : score >= 75 ? 'text-success-fg'
            : score >= 50 ? 'text-warning-fg'
              : 'text-danger-fg'

        return (
          <motion.div
            key={dim.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-surface-1 border border-border-default rounded-xl p-5"
            style={{ borderTop: `3px solid ${isInactive ? 'rgba(128,128,128,0.35)' : dim.color}` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{dim.icon}</span>
                <h3 className="text-xs font-bold text-text-primary">{dim.label}</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {dim.weight === 'CRITICAL' && (
                  <span className="text-[8px] font-bold text-danger-fg bg-danger-soft
                                   border border-danger-line rounded-full px-1.5 py-px">
                    CRITICAL
                  </span>
                )}
                <span className={cn('text-lg font-extrabold font-mono', scoreColor)}>
                  {isInactive ? '—' : score}
                </span>
              </div>
            </div>

            {isInactive ? (
              <>
                <div className="w-full h-1.5 bg-surface-3 rounded-full mb-3" />
                <div className="flex items-start gap-1.5 bg-surface-2 border border-border-subtle rounded-lg p-2.5 mt-1">
                  <span className="text-brand-fg-soft flex-shrink-0 text-xs font-bold mt-px">→</span>
                  <p className="text-[11px] text-text-secondary font-medium leading-relaxed">
                    {info?.activationMessage || 'Need more data to measure this dimension.'}
                  </p>
                </div>
                <p className="text-[10px] text-text-disabled italic mt-2 leading-relaxed">
                  No score shown until enough evidence is collected. Overclaiming here would mislead you about real interview readiness.
                </p>
              </>
            ) : (
              <>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden mb-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: dim.color }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-text-disabled font-mono mb-2">
                  <span>n = {n}</span>
                  {ci && <span>95% CI {ci[0]}–{ci[1]}</span>}
                </div>

                {/* Contextual insight */}
                <p className="text-[11px] text-text-tertiary leading-relaxed mb-2">
                  {isHigh ? dim.actionWhenHigh : dim.interviewRelevance}
                </p>

                {/* Action */}
                {isLow && (
                  <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border-subtle">
                    <span className="text-brand-fg-soft flex-shrink-0 text-xs font-bold mt-px">→</span>
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
              </>
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
          coverageRate >= 75 ? 'text-success-fg' : coverageRate >= 50 ? 'text-warning-fg' : 'text-danger-fg'
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
        color: 'border-warning-line bg-warning-soft',
        labelColor: 'text-warning-fg',
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
        color: 'border-brand-line bg-brand-soft',
        labelColor: 'text-brand-fg-soft',
        label: 'PATTERN GAP',
        title: `Practice ${topMissing}`,
        reason: `You have ${missingCount} untouched patterns. Broad pattern coverage reduces interview surprises.`,
      })
    }

    // D5 Pressure Performance — no simulations
    if ((dims.pressurePerformance || 0) < 60) {
      result.push({
        priority: 3,
        icon: '🎯',
        color: 'border-danger-line bg-danger-soft',
        labelColor: 'text-danger-fg',
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
        color: 'border-info-line bg-info-soft',
        labelColor: 'text-info-fg',
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
        color: 'border-success-line bg-success-soft',
        labelColor: 'text-success-fg',
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

      {/* Stats grid — `Simulations` (legacy SimSession table) removed; the
          live experience is `Mock Interviews` driven by InterviewSession. */}
      <div className="grid grid-cols-3 gap-4 text-center mb-5">
        {[
          { label: 'Solutions', value: report?.totalSolutions || 0, icon: '✅', color: 'text-success-fg' },
          { label: 'Quizzes', value: report?.quizCount || 0, icon: '🧩', color: 'text-brand-fg-soft' },
          { label: 'Mock Interviews', value: report?.interviewCount || 0, icon: '💬', color: 'text-info-fg' },
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

// ── AI Coaching Plan Card ──────────────────────────────
function CoachingPlanCard() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const weeklyPlanMutation = useWeeklyPlan()

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await weeklyPlanMutation.mutateAsync()
      setPlan(res.data.data.plan)
    } catch {
      setError('Failed to generate plan. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const urgencyColors = {
    critical: 'text-danger-fg bg-danger-soft border-danger-line',
    high: 'text-warning-fg bg-warning-soft border-warning-line',
    medium: 'text-brand-fg-soft bg-brand-soft border-brand-line',
    low: 'text-success-fg bg-success-soft border-success-line',
  }

  const focusColors = {
    'Pattern Recognition': '#7c6ff7',
    'Solution Depth': '#22c55e',
    'Communication': '#3b82f6',
    'Optimization': '#eab308',
    'Pressure Performance': '#ef4444',
    'Retention': '#a855f7',
  }

  const priorityConfig = {
    critical: { color: 'text-danger-fg', bg: 'bg-danger-soft border-danger-line' },
    high: { color: 'text-warning-fg', bg: 'bg-warning-soft border-warning-line' },
    medium: { color: 'text-brand-fg-soft', bg: 'bg-brand-soft border-brand-line' },
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <span>🗓️</span> AI Weekly Coaching Plan
          </h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Personalized 7-day plan built from your 6D diagnostic — specific patterns, subjects, and actions.
          </p>
        </div>
        {!plan && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold',
              'bg-brand-400 text-white hover:bg-brand-soft transition-all',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {loading ? (
              <>
                <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Generate My Plan
              </>
            )}
          </button>
        )}
        {plan && (
          <button
            onClick={() => { setPlan(null); setError(null) }}
            className="text-xs text-text-disabled hover:text-text-primary transition-colors"
          >
            Regenerate
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger-fg mb-3">{error}</p>
      )}

      {!plan && !loading && (
        <div className="bg-surface-2 border border-border-default rounded-xl p-4">
          <p className="text-xs text-text-tertiary leading-relaxed">
            Click "Generate My Plan" to get a 7-day study plan built from your actual diagnostic data —
            your missing patterns, weak quiz subjects, SM-2 overdue items, and dimension scores.
            Not a generic plan. Specific to you.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { icon: '🔍', text: 'Missing patterns addressed' },
              { icon: '🧩', text: 'Weak quiz subjects targeted' },
              { icon: '🧠', text: 'SM-2 overdue items scheduled' },
              { icon: '📊', text: 'Lowest 6D dimensions prioritized' },
            ].map(item => (
              <span key={item.text}
                className="flex items-center gap-1.5 text-[10px] text-text-tertiary
                           bg-surface-3 rounded-lg px-2 py-1 border border-border-default">
                <span>{item.icon}</span>{item.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Weekly goal + urgency */}
          <div className={cn(
            'flex items-start gap-3 p-3.5 rounded-xl border',
            urgencyColors[plan.urgencyLevel] || urgencyColors.medium
          )}>
            <span className="text-base flex-shrink-0">🎯</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs font-bold text-text-primary">
                  This Week's Goal
                </span>
                {plan.urgencyLevel && (
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-px rounded-full border uppercase',
                    urgencyColors[plan.urgencyLevel]
                  )}>
                    {plan.urgencyLevel} urgency
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">{plan.weeklyGoal}</p>
            </div>
          </div>

          {/* Key insight */}
          {plan.keyInsight && (
            <div className="bg-brand-soft border border-brand-line rounded-xl p-3.5">
              <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest mb-1">
                Key Insight
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {plan.keyInsight}
              </p>
            </div>
          )}

          {/* Focus areas */}
          {plan.focusAreas?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-text-disabled uppercase tracking-widest">
                Focus:
              </span>
              {plan.focusAreas.map((area) => (
                <span
                  key={area}
                  className="text-[10px] font-bold px-2 py-px rounded-full border"
                  style={{
                    color: focusColors[area] || '#7c6ff7',
                    backgroundColor: `${focusColors[area] || '#7c6ff7'}15`,
                    borderColor: `${focusColors[area] || '#7c6ff7'}30`,
                  }}
                >
                  {area}
                </span>
              ))}
            </div>
          )}

          {/* Daily plan */}
          <div className="space-y-2">
            {plan.days?.map((day, i) => {
              const pc = priorityConfig[day.priority] || priorityConfig.medium
              return (
                <motion.div
                  key={day.day}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'rounded-xl border p-3.5',
                    pc.bg
                  )}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-text-primary w-20">
                        {day.day}
                      </span>
                      <span
                        className="text-[9px] font-bold px-1.5 py-px rounded-full border"
                        style={{
                          color: focusColors[day.focus] || '#7c6ff7',
                          backgroundColor: `${focusColors[day.focus] || '#7c6ff7'}15`,
                          borderColor: `${focusColors[day.focus] || '#7c6ff7'}30`,
                        }}
                      >
                        {day.focus}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-disabled">
                      ⏱ {day.timeEstimate}
                    </span>
                  </div>
                  <div className="space-y-1.5 ml-1">
                    {day.tasks?.map((task, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <span className={cn('flex-shrink-0 mt-0.5 text-xs font-bold', pc.color)}>
                          →
                        </span>
                        <p className="text-[11px] text-text-secondary leading-relaxed">
                          {task}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Diagnostic summary — what drove this plan */}
          {plan.diagnosticSummary && (
            <div className="bg-surface-2 border border-border-default rounded-xl p-3.5">
              <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                Based on your data
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  {
                    label: 'Pattern coverage',
                    value: `${plan.diagnosticSummary.patternCoverage}/${PATTERNS.length}`,
                    alert: plan.diagnosticSummary.patternCoverage < Math.floor(PATTERNS.length / 2),
                  },
                  {
                    label: 'Optimization rate',
                    value: `${plan.diagnosticSummary.optimizationRate}%`,
                    alert: plan.diagnosticSummary.optimizationRate < 50,
                  },
                  {
                    label: 'Overdue reviews',
                    value: plan.diagnosticSummary.overdueReviews,
                    alert: plan.diagnosticSummary.overdueReviews > 3,
                  },
                  plan.diagnosticSummary.avgAiScore && {
                    label: 'AI review avg',
                    value: `${plan.diagnosticSummary.avgAiScore}/10`,
                    alert: plan.diagnosticSummary.avgAiScore < 6,
                  },
                  plan.diagnosticSummary.daysUntilInterview !== null && {
                    label: 'Days to interview',
                    value: plan.diagnosticSummary.daysUntilInterview,
                    alert: plan.diagnosticSummary.daysUntilInterview < 14,
                  },
                ]
                  .filter(Boolean)
                  .map((item) => (
                    <div key={item.label} className="text-center">
                      <p className={cn(
                        'text-sm font-extrabold font-mono',
                        item.alert ? 'text-warning-fg' : 'text-text-primary'
                      )}>
                        {item.value}
                      </p>
                      <p className="text-[9px] text-text-disabled mt-0.5">
                        {item.label}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Interview readiness assessment */}
          {plan.interviewReadinessAssessment && (
            <p className="text-[11px] text-text-disabled italic text-center">
              {plan.interviewReadinessAssessment}
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  )
}

// ── AI Readiness Verdict (grounded) ───────────────────
// Renders the structured verdict returned by GET /stats/verdict.
// Server already ran the 7-rule validator + deterministic fallback,
// so this component treats the payload as trusted — no client-side
// "protection" against overclaim is needed (and adding one would just
// fight the server).
function AIVerdictCard({ verdict, usedFallback, cached, isLoading, isError }) {
  // Progressive loading — render the card SHAPE while the verdict is
  // being generated (3–5s server round-trip on a cold call). Users see
  // the page populated immediately rather than a delayed pop-in. The
  // skeleton matches the real card's dimensions to avoid layout shift
  // when the content arrives.
  if (isLoading) {
    return (
      <div className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-5/6 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton.Card lines={2} />
          </div>
          <div>
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton.Card lines={2} />
          </div>
        </div>
        <p className="text-[10px] text-text-disabled mt-4 italic" aria-live="polite">
          Generating grounded verdict from your evidence…
        </p>
      </div>
    )
  }
  if (isError || !verdict) return null

  const { headline, strengths = [], gaps = [], readinessNote, dataQualityNote } = verdict

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
      // The verdict arrives async (LLM call). aria-live announces the
      // headline + content to screen readers when it lands, instead of
      // silently swapping the skeleton.
      role="region"
      aria-live="polite"
      aria-label="AI Readiness Verdict"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="text-sm font-bold text-text-primary">AI Readiness Verdict</h2>
        {usedFallback && (
          <span className="text-[9px] font-bold px-2 py-px rounded-full border bg-warning-soft text-warning-fg border-warning-line"
            title="LLM output did not clear the anti-hallucination checks, so a deterministic template was used. Still grounded, just more conservative.">
            deterministic fallback
          </span>
        )}
        {cached && (
          <span className="text-[9px] text-text-disabled">cached</span>
        )}
      </div>

      {/* Headline */}
      <p className="text-sm text-text-primary font-semibold leading-relaxed mb-4">
        {headline}
      </p>

      {/* Strengths + Gaps grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Strengths */}
        <div>
          <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
            Strengths
          </p>
          {strengths.length === 0 ? (
            <p className="text-[11px] text-text-disabled italic">
              No strengths meet the evidence threshold yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {strengths.map((s, i) => (
                <li key={i} className="bg-success-soft border border-success-line rounded-lg p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-success-fg flex-shrink-0 text-xs font-bold mt-px">✓</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-xs font-semibold text-text-primary">{s.claim}</p>
                        {s.confidence && (
                          <span className={cn(
                            'text-[8px] font-bold px-1.5 py-px rounded-full border',
                            s.confidence === 'high'
                              ? 'bg-success-soft text-success-fg border-success-line'
                              : 'bg-warning-soft text-warning-fg border-warning-line'
                          )}>
                            {s.confidence}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-text-tertiary font-mono">{s.evidence}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Gaps */}
        <div>
          <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
            Gaps
          </p>
          {gaps.length === 0 ? (
            <p className="text-[11px] text-text-disabled italic">
              No gaps flagged at this coverage level.
            </p>
          ) : (
            <ul className="space-y-2">
              {gaps.map((g, i) => (
                <li key={i} className="bg-warning-soft border border-warning-line rounded-lg p-2.5">
                  <div className="flex items-start gap-2">
                    <span className="text-warning-fg flex-shrink-0 text-xs font-bold mt-px">!</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary mb-0.5">{g.claim}</p>
                      <p className="text-[10px] text-text-tertiary font-mono mb-1.5">{g.evidence}</p>
                      {g.action && (
                        <div className="flex items-start gap-1.5 pt-1.5 border-t border-warning-line">
                          <span className="text-brand-fg-soft flex-shrink-0 text-[10px] font-bold mt-px">→</span>
                          <p className="text-[11px] text-text-secondary font-medium leading-relaxed">
                            {g.action}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Notes */}
      {(readinessNote || dataQualityNote) && (
        <div className="mt-4 pt-4 border-t border-border-subtle space-y-2">
          {readinessNote && (
            <div>
              <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-0.5">
                Readiness
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">{readinessNote}</p>
            </div>
          )}
          {dataQualityNote && (
            <div>
              <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-0.5">
                Data Quality
              </p>
              <p className="text-xs text-text-tertiary leading-relaxed">{dataQualityNote}</p>
            </div>
          )}
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
  // Verdict loads progressively — never blocks the scores above. When
  // the server returns the cached VerdictLog it's ~instant; first call
  // on fresh evidence takes ~1–3s.
  const {
    data: verdictResponse,
    isLoading: verdictLoading,
    isError: verdictError,
  } = useReadinessVerdict()

  // New server shape: report.dimensions is an array of DimScore, overall
  // is an object {score, ci} (or null if not computable). Derive legacy
  // object-shaped `dims` for components that still read by-key. Hooks
  // must be declared before any early return to satisfy rules-of-hooks.
  const dimByKey = useMemo(() => {
    const arr = Array.isArray(report?.dimensions) ? report.dimensions : []
    const map = {}
    for (const d of arr) map[d.key] = d
    return map
  }, [report?.dimensions])
  const dims = useMemo(() => {
    const arr = Array.isArray(report?.dimensions) ? report.dimensions : []
    const map = {}
    for (const d of arr) {
      map[d.key] = d.status === 'active' ? (d.score ?? 0) : 0
    }
    return map
  }, [report?.dimensions])

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

  const overallObj = report?.overall ?? null
  const overall = overallObj?.score ?? 0
  const analytics = report?.analytics || null
  const reportCoverage = report?.reportCoverage || { active: 0, total: 6, pct: 0, overallComputable: false }
  const tierInfo = report?.tier || null
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
                       hover:bg-brand-soft transition-all"
          >
            Go to Problems →
          </button>
        </motion.div>
      </div>
    )
  }

  // Compute readiness — tier data comes from server; client only picks
  // icons and sorts. Critical-gap selection is limited to active dims.
  const readiness = computeReadiness(dimByKey, overall, tierInfo)

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

      {/* ── Section 1a: AI Grounded Verdict ─────────────── */}
      <AIVerdictCard
        verdict={verdictResponse?.verdict}
        usedFallback={verdictResponse?.usedFallback}
        cached={verdictResponse?.cached}
        isLoading={verdictLoading}
        isError={verdictError}
      />

      {/* ── Section 1b: Deterministic Verdict Summary ──── */}
      <VerdictCard
        dimByKey={dimByKey}
        overallObj={overallObj}
        analytics={analytics}
        readiness={readiness}
        reportCoverage={reportCoverage}
        tierInfo={tierInfo}
      />

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

      {/* ── Section 4b: AI Coaching Plan ───────────────── */}
      <CoachingPlanCard />

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

      <DimensionCards dimByKey={dimByKey} communicationFromProxy={report?.communicationFromProxy} />

      {/* ── Section 6: Pattern Coverage / Mastery ────────
          Mastery v2 supersedes the legacy "X of 25" card when both the
          flag is on AND the server returned patternMastery. Otherwise
          fall through to PatternCoverageCard so flag-off users see no
          regression. */}
      {PATTERN_MASTERY_V2_ENABLED && analytics?.patternMastery
        ? <PatternMasteryCard patternMastery={analytics.patternMastery} />
        : <PatternCoverageCard analytics={analytics} />}

      {/* ── Section 7: Activity Summary + Velocity ──────── */}
      <ActivitySummary report={report} analytics={analytics} />
    </div>
  )
}