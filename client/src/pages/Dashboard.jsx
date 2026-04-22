// ============================================================================
// ProbSolver v3.0 — Dashboard (Team-Context-Aware)
// ============================================================================

import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useTeamContext } from '@hooks/useTeamContext'
import { usePersonalStats } from '@hooks/useReport'
import { useReviewQueue } from '@hooks/useSolutions'
import { useRecommendations } from '@hooks/useRecommendations'
import { Spinner } from '@components/ui/Spinner'
import { StatCard } from '@components/features/StatCard'
import { ReviewPreview } from '@components/features/ReviewPreview'
import { Recommendations } from '@components/features/Recommendations'
import { cn } from '@utils/cn'

export default function Dashboard() {
  const navigate = useNavigate()
  const { teamName, isPersonalMode, isTeamAdmin } = useTeamContext()
  const { data: stats, isLoading: statsLoading } = usePersonalStats()
  const { data: reviewData } = useReviewQueue()
  const { data: recsData } = useRecommendations()

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* ── Header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
          {isPersonalMode ? 'Your Dashboard' : `${teamName} Dashboard`}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {isPersonalMode
            ? 'Track your personal interview preparation progress.'
            : 'Your team practice overview and readiness metrics.'}
        </p>
      </motion.div>

      {/* ── Stats Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          icon="📋"
          label="Problems Solved"
          value={stats?.totalSolved || 0}
        />
        <StatCard
          icon="🔥"
          label="Streak"
          value={`${stats?.streak || 0} days`}
        />
        <StatCard
          icon="🧠"
          label="Reviews Due"
          value={reviewData?.dueCount || 0}
          onClick={() => navigate('/review')}
          highlight={reviewData?.dueCount > 0}
        />
        <StatCard
          icon="⭐"
          label="Avg Confidence"
          value={`${stats?.avgConfidence || 0}/5`}
        />
      </div>

      {/* ── Quick actions ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { icon: '📋', label: 'Problems', to: '/problems' },
          { icon: '💬', label: 'Mock Interview', to: '/mock-interview' },
          { icon: '🧩', label: 'Take Quiz', to: '/quizzes' },
          { icon: '📈', label: 'Report', to: '/report' },
        ].map((action) => (
          <motion.button
            key={action.to}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(action.to)}
            className="flex items-center gap-3 p-4 rounded-xl bg-surface-1
                       border border-border-default hover:border-brand-400/30
                       transition-all"
          >
            <span className="text-xl">{action.icon}</span>
            <span className="text-xs font-bold text-text-primary">{action.label}</span>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Review preview ────────────────────────────── */}
        {reviewData?.dueCount > 0 && (
          <ReviewPreview
            reviews={reviewData.due.slice(0, 3)}
            totalDue={reviewData.dueCount}
          />
        )}

        {/* ── Recommendations ───────────────────────────── */}
        {recsData?.recommendations?.length > 0 && (
          <Recommendations
            recommendations={recsData.recommendations.slice(0, 4)}
          />
        )}
      </div>

      {/* ── Interview prep countdown ────────────────────── */}
      {stats?.interviewDate && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 bg-brand-400/5 border border-brand-400/20 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-text-disabled uppercase tracking-widest mb-1">
                Interview Countdown
              </p>
              <p className="text-sm text-text-primary">
                <span className="font-bold">{stats.targetCompany || 'Your interview'}</span>
                {' '}in{' '}
                <span className="font-extrabold text-brand-300 font-mono">
                  {Math.max(0, Math.ceil((new Date(stats.interviewDate) - new Date()) / (1000 * 60 * 60 * 24)))}
                </span>
                {' '}days
              </p>
            </div>
            <button
              onClick={() => navigate('/report')}
              className="text-xs font-bold text-brand-300 hover:text-brand-200 transition-colors"
            >
              View Readiness →
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}