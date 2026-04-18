import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '@store/useAuthStore'
import { useProblems } from '@hooks/useProblems'
import { useMySolutions } from '@hooks/useSolutions'
import { useMyStats, useTeamStats } from '@hooks/useReport'
import { ProblemCard } from '@components/features/problems/ProblemCard'
import { ActivityFeed } from '@components/features/ActivityFeed'
import { Recommendations } from '@components/features/Recommendations'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { cn } from '@utils/cn'
import { formatCountdown } from '@utils/formatters'

// ── Greeting ───────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Stat pill — compact inline stat ────────────────────
function StatPill({ icon, value, label, color, onClick }) {
  return (
    <motion.button
      whileHover={onClick ? { scale: 1.02 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-4 py-3 rounded-xl border',
        'transition-all duration-150',
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'cursor-default',
        'bg-surface-1 border-border-default'
      )}
    >
      <span className="text-lg">{icon}</span>
      <div className="text-left">
        <div className={cn('text-lg font-extrabold font-mono leading-none', color)}>
          {value}
        </div>
        <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
          {label}
        </div>
      </div>
    </motion.button>
  )
}

// ── Next action card — the single most important CTA ───
function NextActionCard({ stats, navigate }) {
  const reviewsDue = stats?.reviewsDue || 0
  const totalSolved = stats?.totalSolved || 0
  const simCount = stats?.simCount || 0
  const streak = stats?.streak || 0

  // Priority: reviews > first problem > sim > keep going
  let action = null

  if (reviewsDue > 0) {
    action = {
      icon: '🧠',
      title: `Clear ${reviewsDue} overdue review${reviewsDue !== 1 ? 's' : ''}`,
      desc: 'Spaced repetition keeps knowledge sharp — review before solving new problems.',
      btnLabel: 'Start Review',
      btnAction: () => navigate('/review'),
      color: 'border-warning/30 bg-warning/5',
      btnVariant: 'primary',
    }
  } else if (totalSolved === 0) {
    action = {
      icon: '🚀',
      title: 'Solve your first problem',
      desc: 'Start your interview prep journey. Pick any problem and submit your solution.',
      btnLabel: 'Browse Problems',
      btnAction: () => navigate('/problems'),
      color: 'border-brand-400/30 bg-brand-400/5',
      btnVariant: 'primary',
    }
  } else if (simCount === 0 && totalSolved >= 3) {
    action = {
      icon: '⏱',
      title: 'Try your first interview simulation',
      desc: 'You\'ve solved enough problems — test yourself under timed conditions.',
      btnLabel: 'Start Simulation',
      btnAction: () => navigate('/interview'),
      color: 'border-info/30 bg-info/5',
      btnVariant: 'primary',
    }
  } else if (streak === 0 && totalSolved > 0) {
    action = {
      icon: '🔥',
      title: 'Restart your streak',
      desc: 'Your streak broke — solve one problem today to start building momentum again.',
      btnLabel: 'Solve a Problem',
      btnAction: () => navigate('/problems'),
      color: 'border-warning/30 bg-warning/5',
      btnVariant: 'primary',
    }
  } else {
    action = {
      icon: '💪',
      title: 'Keep the momentum going',
      desc: `You're on a ${streak}-day streak. Solve another problem to keep growing.`,
      btnLabel: 'Continue',
      btnAction: () => navigate('/problems'),
      color: 'border-success/30 bg-success/5',
      btnVariant: 'primary',
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={cn(
        'flex items-center gap-4 p-5 rounded-2xl border',
        'transition-all duration-200',
        action.color
      )}
    >
      <div className="w-12 h-12 rounded-xl bg-surface-1 border border-border-default
                      flex items-center justify-center text-2xl flex-shrink-0">
        {action.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-text-primary mb-0.5">
          {action.title}
        </h3>
        <p className="text-xs text-text-tertiary leading-relaxed">
          {action.desc}
        </p>
      </div>
      <Button
        variant={action.btnVariant}
        size="sm"
        onClick={action.btnAction}
        className="flex-shrink-0"
      >
        {action.btnLabel}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Button>
    </motion.div>
  )
}

// ── Section header ─────────────────────────────────────
function SectionHeader({ title, icon, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h2>
      {action && (
        <button
          onClick={onAction}
          className="text-xs text-brand-300 hover:text-brand-200
                     font-semibold flex items-center gap-1 transition-colors"
        >
          {action}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════
export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const { data: problemsData, isLoading: problemsLoading } =
    useProblems({ limit: '4' })

  const { data: myStats, isLoading: statsLoading } =
    useMyStats()

  const { data: teamStats, isLoading: teamLoading } =
    useTeamStats()

  const problems = problemsData?.problems || []
  const totalSolved = myStats?.totalSolved || 0
  const streak = myStats?.streak || 0
  const reviewsDue = myStats?.reviewsDue || 0
  const solvedThisWeek = myStats?.solvedThisWeek || 0
  const countdown = formatCountdown(user?.targetDate)

  return (
    <div className="p-6 max-w-[1100px] mx-auto">

      {/* ── Hero — compact greeting with stats ──────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Left — greeting */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar
                name={user?.username}
                color={user?.avatarColor}
                size="lg"
              />
              {streak > 0 && (
                <div className="absolute -bottom-1 -right-1
                                bg-surface-3 border border-border-strong
                                rounded-full px-1.5 py-px
                                text-[10px] font-bold text-warning">
                  🔥{streak}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-text-tertiary">
                {getGreeting()}
              </p>
              <h1 className="text-xl font-extrabold text-text-primary tracking-tight">
                {user?.username || '...'}
              </h1>
              {countdown && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse-dot" />
                  <span className="text-xs font-semibold text-warning">
                    {countdown}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right — quick stat pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatPill
              icon="🎯"
              value={totalSolved}
              label="Solved"
              color="text-brand-300"
              onClick={() => navigate('/problems')}
            />
            <StatPill
              icon="⚡"
              value={solvedThisWeek}
              label="This week"
              color="text-success"
            />
            <StatPill
              icon="🧠"
              value={reviewsDue}
              label={reviewsDue > 0 ? 'Due now' : 'Reviews'}
              color={reviewsDue > 0 ? 'text-warning' : 'text-success'}
              onClick={reviewsDue > 0 ? () => navigate('/review') : undefined}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Next action — ONE clear CTA ─────────────── */}
      <NextActionCard stats={myStats} navigate={navigate} />

      {/* ── Two-column layout ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">

        {/* Left column — 3/5 width */}
        <div className="lg:col-span-3 space-y-6">

          {/* Recommended problems */}
          <div>
            <SectionHeader
              title="Recommended For You"
              icon="🎯"
              action="All problems"
              onAction={() => navigate('/problems')}
            />
            <div className="bg-surface-1 border border-border-default rounded-xl p-4">
              <Recommendations limit={3} compact />
            </div>
          </div>

          {/* Recent problems */}
          <div>
            <SectionHeader
              title="Recent Problems"
              icon="📋"
              action="View all"
              onAction={() => navigate('/problems')}
            />
            {problemsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : problems.length === 0 ? (
              <div className="bg-surface-1 border border-border-default
                              rounded-xl p-6 text-center">
                <div className="text-2xl mb-2">📭</div>
                <p className="text-sm font-semibold text-text-primary mb-0.5">
                  No problems yet
                </p>
                <p className="text-xs text-text-tertiary">
                  Admin hasn't added any problems. Check back soon!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {problems.map((problem, i) => (
                  <ProblemCard
                    key={problem.id}
                    problem={problem}
                    index={i}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — 2/5 width */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                icon: '⏱', label: 'Interview Sim',
                to: '/interview',
                color: 'hover:border-warning/40 hover:bg-warning/5',
              },
              {
                icon: '🧠', label: 'Quiz',
                to: '/quizzes',
                color: 'hover:border-brand-400/40 hover:bg-brand-400/5',
              },
              {
                icon: '📊', label: 'My Report',
                to: '/report',
                color: 'hover:border-info/40 hover:bg-info/5',
              },
              {
                icon: '🏆', label: 'Leaderboard',
                to: '/leaderboard',
                color: 'hover:border-success/40 hover:bg-success/5',
              },
            ].map((link, i) => (
              <motion.button
                key={link.to}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                onClick={() => navigate(link.to)}
                className={cn(
                  'flex items-center gap-2.5 p-3.5 rounded-xl border',
                  'bg-surface-1 border-border-default',
                  'transition-all duration-150 text-left',
                  'hover:-translate-y-0.5 hover:shadow-sm',
                  link.color
                )}
              >
                <span className="text-lg">{link.icon}</span>
                <span className="text-xs font-semibold text-text-primary">
                  {link.label}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Team activity */}
          <div>
            <SectionHeader
              title="Team Activity"
              icon="👥"
              action="Leaderboard"
              onAction={() => navigate('/leaderboard')}
            />
            <div className="bg-surface-1 border border-border-default rounded-xl p-4">
              <ActivityFeed
                activities={teamStats?.recentActivity || []}
                loading={teamLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}