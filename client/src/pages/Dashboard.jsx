import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '@store/useAuthStore'
import { useProblems } from '@hooks/useProblems'
import { useMySolutions } from '@hooks/useSolutions'
import { useMyStats, useTeamStats } from '@hooks/useReport'
import { StatCard } from '@components/features/StatCard'
import { ProblemCard } from '@components/features/problems/ProblemCard'
import { ActivityFeed } from '@components/features/ActivityFeed'
import { ReviewPreview } from '@components/features/ReviewPreview'
import { PatternCoverage } from '@components/features/PatternCoverage'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { Avatar } from '@components/ui/Avatar'
import { formatCountdown } from '@utils/formatters'

// ── Greeting ───────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Hero section ───────────────────────────────────────
function DashboardHero({ user, stats }) {
  const navigate = useNavigate()
  const countdown = formatCountdown(user?.targetDate)
  const solved = stats?.totalSolved || 0
  const streak = stats?.streak || 0
  const reviewsDue = stats?.reviewsDue || 0

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-border-default mb-6"
      style={{
        background: 'linear-gradient(135deg, #16162a 0%, #111118 50%, #0e0a1e 100%)',
      }}
    >
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-80px] right-[-80px] w-[320px] h-[320px]
                        rounded-full bg-brand-400/8 blur-[80px]" />
        <div className="absolute bottom-[-60px] left-[30%] w-[200px] h-[200px]
                        rounded-full bg-blue-500/6 blur-[60px]" />
      </div>

      <div className="relative z-10 px-8 py-7 flex items-center
                      justify-between gap-6 flex-wrap">

        {/* Left: greeting + CTAs */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-semibold text-brand-300 uppercase
                       tracking-widest mb-1"
          >
            {getGreeting()}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-2xl font-extrabold text-text-primary
                       tracking-tight mb-1"
          >
            Welcome back,{' '}
            <span className="bg-gradient-to-r from-brand-300 to-blue-400
                             bg-clip-text text-transparent">
              {user?.username || '…'}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-text-tertiary mb-5 max-w-md"
          >
            {solved === 0
              ? 'Start your journey — solve your first problem today.'
              : `You've solved ${solved} problem${solved !== 1 ? 's' : ''}. ${reviewsDue > 0
                ? `${reviewsDue} review${reviewsDue !== 1 ? 's' : ''} due today.`
                : 'Keep the momentum going!'
              }`}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3 flex-wrap"
          >
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/problems')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Browse Problems
            </Button>

            {reviewsDue > 0 && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigate('/review')}
              >
                <span className="text-warning">🧠</span>
                Review Queue
                <span className="bg-warning/15 text-warning border border-warning/25
                                 text-xs font-bold px-1.5 py-px rounded-full">
                  {reviewsDue}
                </span>
              </Button>
            )}

            {countdown && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl
                              bg-warning/8 border border-warning/20 text-warning
                              text-xs font-semibold">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {countdown}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right: avatar + quick stats */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-5"
        >
          {/* Streak */}
          {streak > 0 && (
            <div className="text-center">
              <div className="text-2xl font-extrabold text-warning font-mono">
                {streak}
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">
                🔥 day streak
              </div>
            </div>
          )}

          {/* Avatar */}
          <div className="relative">
            <Avatar
              name={user?.username}
              color={user?.avatarColor}
              size="xl"
            />
            {/* Solved count ring label */}
            <div className="absolute -bottom-1 -right-1
                            bg-surface-3 border border-border-strong
                            rounded-full px-2 py-px
                            text-[11px] font-bold font-mono text-text-primary">
              {solved}
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  )
}


// ── Section header ─────────────────────────────────────
function SectionHeader({ title, icon, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        {title}
      </h2>
      {action && (
        <button
          onClick={onAction}
          className="text-xs text-brand-300 hover:text-brand-200
                     font-medium flex items-center gap-1 transition-colors"
        >
          {action}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
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


// ── Main Dashboard ─────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const currentUser = user

  // Data
  const { data: problemsData, isLoading: problemsLoading } =
    useProblems({ limit: '6' })

  const { data: mySolutions, isLoading: solutionsLoading } =
    useMySolutions()

  const { data: myStats, isLoading: statsLoading } =
    useMyStats()

  const { data: teamStats, isLoading: teamLoading } =
    useTeamStats()

  const problems = problemsData?.problems || []
  const solutions = mySolutions || []

  // Stat card values
  const totalSolved = myStats?.totalSolved || 0
  const solvedToday = myStats?.activity?.[
    new Date().toISOString().split('T')[0]
  ] || 0
  const streak = myStats?.streak || 0
  const reviewsDue = myStats?.reviewsDue || 0

  // This week delta for trend
  const solvedThisWeek = myStats?.solvedThisWeek || 0

  return (
    <div className="p-6 max-w-[1200px] mx-auto">

      {/* Hero */}
      <DashboardHero user={currentUser} stats={myStats} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Solved"
          value={totalSolved}
          sub="All time"
          icon="🎯"
          color="brand"
          trend={solvedThisWeek}
          index={0}
          onClick={() => navigate('/problems')}
        />
        <StatCard
          label="Solved Today"
          value={solvedToday}
          sub={new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          icon="⚡"
          color="success"
          index={1}
        />
        <StatCard
          label="Day Streak"
          value={streak}
          sub={streak > 0 ? 'Keep it going!' : 'Start today'}
          icon="🔥"
          color="warning"
          index={2}
        />
        <StatCard
          label="Reviews Due"
          value={reviewsDue}
          sub="Spaced repetition"
          icon="🧠"
          color={reviewsDue > 0 ? 'danger' : 'success'}
          index={3}
          onClick={reviewsDue > 0 ? () => navigate('/review') : undefined}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Recent problems — 2/3 width */}
        <div className="lg:col-span-2">
          <SectionHeader
            title="Recent Problems"
            icon="📋"
            action="View all"
            onAction={() => navigate('/problems')}
          />

          {problemsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : problems.length === 0 ? (
            <div className="bg-surface-2 border border-border-default
                            rounded-xl p-8 text-center">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-sm font-semibold text-text-primary mb-1">
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

        {/* Team activity — 1/3 width */}
        <div>
          <SectionHeader
            title="Team Activity"
            icon="👥"
            action="Leaderboard"
            onAction={() => navigate('/leaderboard')}
          />
          <div className="bg-surface-2 border border-border-default rounded-xl p-4">
            <ActivityFeed
              activities={teamStats?.recentActivity || []}
              loading={teamLoading}
            />
          </div>
        </div>

      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pattern coverage */}
        <div>
          <SectionHeader
            title="Pattern Coverage"
            icon="🗺️"
            action="View report"
            onAction={() => navigate('/report')}
          />
          <div className="bg-surface-2 border border-border-default rounded-xl p-5">
            {statsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : (
              <PatternCoverage patternMap={myStats?.patternMap || {}} />
            )}
          </div>
        </div>

        {/* Review queue preview */}
        <div>
          <SectionHeader
            title="Review Queue"
            icon="🔁"
            action="Full queue"
            onAction={() => navigate('/review')}
          />
          <div className="bg-surface-2 border border-border-default rounded-xl p-4">
            <ReviewPreview
              solutions={solutions}
              loading={solutionsLoading}
            />
          </div>
        </div>

      </div>

    </div>
  )
}