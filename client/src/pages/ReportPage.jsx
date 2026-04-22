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
  { key: 'pressurePerformance', label: 'Pressure', color: '#ef4444', icon: '🎯' },
  { key: 'knowledgeRetention', label: 'Retention', color: '#a855f7', icon: '📚' },
]

export default function ReportPage() {
  const { teamName, isPersonalMode } = useTeamContext()
  const { data: report, isLoading } = use6DReport()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  const dims = report?.dimensions || {}
  const overall = report?.overall || 0

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Header ──────────────────────────────────────── */}
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
      {report?.totalSolutions > 0 && (
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
      )}

      {/* ── Dimension Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {DIMENSIONS.map((dim, i) => {
          const score = dims[dim.key] || 0
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

      {/* ── No data state ───────────────────────────────── */}
      {report?.totalSolutions === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <span className="text-4xl mb-4 block">📊</span>
          <p className="text-sm text-text-secondary">
            {report?.message || 'Submit solutions to build your intelligence profile.'}
          </p>
        </motion.div>
      )}
    </div>
  )
}