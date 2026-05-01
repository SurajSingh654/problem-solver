// ============================================================================
// ProbSolver v3.0 — Intelligence Report (Team-Scoped)
// ============================================================================
import { motion } from 'framer-motion'
import { useTeamContext } from '@hooks/useTeamContext'
import { use6DReport } from '@hooks/useReport'
import { Spinner } from '@components/ui/Spinner'
import { RadarChart } from '@components/charts/RadarChart'
import { cn } from '@utils/cn'

const DIMENSIONS = [
  { key: 'patternRecognition', label: 'Pattern Recognition', color: '#7c6ff7', icon: '🔍' },
  { key: 'solutionDepth', label: 'Solution Depth', color: '#22c55e', icon: '🧠' },
  { key: 'communication', label: 'Communication', color: '#3b82f6', icon: '💬' },
  { key: 'optimization', label: 'Optimization', color: '#eab308', icon: '⚡' },
  // Bug 6 fix: label was 'Pressure', should be 'Pressure Performance'
  { key: 'pressurePerformance', label: 'Pressure Performance', color: '#ef4444', icon: '🎯' },
  { key: 'knowledgeRetention', label: 'Knowledge Retention', color: '#a855f7', icon: '📚' },
]

export default function ReportPage() {
  const { teamName, isPersonalMode } = useTeamContext()
  // Bug 8 fix: destructure isFetching to show background refresh indicator
  const { data: report, isLoading, isFetching } = use6DReport()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  const dims = report?.dimensions || {}
  const overall = report?.overall || 0
  const hasData = (report?.totalSolutions || 0) > 0

  // Bug 4 fix: when no data, show only the empty state — not zeros
  if (!hasData) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
            Intelligence Report
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {isPersonalMode
              ? 'Your personal 6-dimension readiness profile.'
              : `Your readiness profile within ${teamName}.`}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-1 border border-border-default rounded-2xl p-16 text-center"
        >
          <span className="text-5xl mb-4 block">📊</span>
          <h2 className="text-base font-bold text-text-primary mb-2">
            No data yet
          </h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            {report?.message || 'Submit solutions to build your intelligence profile. Each solution feeds your 6-dimension readiness score.'}
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
              Intelligence Report
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {isPersonalMode
                ? 'Your personal 6-dimension readiness profile.'
                : `Your readiness profile within ${teamName}.`}
            </p>
          </div>
          {/* Bug 8 fix: subtle indicator when background refresh is happening */}
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-xs text-text-disabled">
              <div className="w-3 h-3 rounded-full border-2 border-brand-400
                             border-t-transparent animate-spin" />
              Updating...
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Overall Score ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-1 border border-border-default rounded-2xl p-8 mb-8 text-center"
      >
        <p className="text-xs text-text-disabled uppercase tracking-widest mb-3">
          Overall Readiness
        </p>
        <div className="text-6xl font-extrabold font-mono text-text-primary mb-2">
          {overall}
          <span className="text-2xl text-text-disabled">/100</span>
        </div>
        <p className="text-sm text-text-secondary">
          {overall < 30 ? 'Just getting started. Keep practicing!' :
            overall < 60 ? 'Building a solid foundation. Focus on weak areas.' :
              overall < 80 ? 'Strong preparation. Polish the edges.' :
                'Interview ready. Go ace it!'}
        </p>
      </motion.div>

      {/* ── Radar Chart ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-8"
      >
        <h2 className="text-sm font-bold text-text-primary mb-4">6D Radar</h2>
        <div className="h-72">
          <RadarChart
            data={DIMENSIONS.map((d) => ({
              dimension: d.label,
              score: dims[d.key] || 0,
            }))}
          />
        </div>
      </motion.div>

      {/* ── Dimension Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {DIMENSIONS.map((dim, i) => {
          const score = dims[dim.key] || 0
          // Bug 1 fix client side: show proxy note on Communication
          // when communicationFromProxy is true
          const isCommProxy = dim.key === 'communication' && report?.communicationFromProxy

          return (
            <motion.div
              key={dim.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-surface-1 border border-border-default rounded-xl p-5"
              style={{ borderTop: `3px solid ${dim.color}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{dim.icon}</span>
                  <h3 className="text-xs font-bold text-text-primary">{dim.label}</h3>
                </div>
                <span className="text-lg font-extrabold font-mono" style={{ color: dim.color }}>
                  {score}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.8, delay: i * 0.05 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: dim.color }}
                />
              </div>
              {/* Bug 1 fix: show proxy note when no peer ratings */}
              {isCommProxy && (
                <p className="text-[10px] text-text-disabled mt-2 leading-relaxed">
                  Based on your written explanations. Get peer ratings for a more accurate score.
                </p>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── Activity summary ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-surface-1 border border-border-default rounded-xl p-5"
      >
        <h2 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
          Activity Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { label: 'Solutions', value: report?.totalSolutions || 0, icon: '✅' },
            // Bug 3 fix client side: quizCount is now personal (not team-scoped)
            { label: 'Quizzes', value: report?.quizCount || 0, icon: '🧩' },
            { label: 'Interviews', value: report?.interviewCount || 0, icon: '💬' },
            { label: 'Simulations', value: report?.simCount || 0, icon: '⏱' },
          ].map((s) => (
            <div key={s.label}>
              <span className="text-xl">{s.icon}</span>
              <p className="text-xl font-extrabold font-mono text-text-primary mt-1">{s.value}</p>
              <p className="text-[10px] text-text-disabled uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}