import { motion }           from 'framer-motion'
import { Avatar }           from '@components/ui/Avatar'
import { Badge }            from '@components/ui/Badge'
import { cn }               from '@utils/cn'
import { formatRelativeDate } from '@utils/formatters'
import { useNavigate }      from 'react-router-dom'

const DIFF_VARIANT = {
  EASY  : 'easy',
  MEDIUM: 'medium',
  HARD  : 'hard',
}

export function ActivityFeed({ activities = [], loading }) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="space-y-3">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex gap-3 p-3 rounded-xl bg-surface-2 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-surface-3 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-surface-3 rounded w-3/4" />
              <div className="h-3 bg-surface-3 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!activities.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="text-3xl">👥</div>
        <p className="text-sm text-text-tertiary">
          No team activity yet.<br/>Start solving problems!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map((activity, i) => (
        <motion.div
          key={`${activity.username}-${activity.solvedAt}-${i}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0  }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
          onClick={() => navigate(`/problems/${activity.problemId}`)}
          className="flex items-center gap-3 p-3 rounded-xl
                     bg-surface-2 border border-border-default
                     hover:border-border-strong hover:bg-surface-3
                     cursor-pointer transition-all"
        >
          <Avatar
            name={activity.username}
            color={activity.avatarColor}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-secondary leading-snug">
              <span className="font-semibold text-text-primary">
                {activity.username}
              </span>
              {' '}solved{' '}
              <span className="font-semibold text-brand-300 truncate">
                {activity.problemTitle}
              </span>
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Badge
                variant={DIFF_VARIANT[activity.difficulty] || 'brand'}
                size="xs"
              >
                {activity.difficulty.charAt(0) +
                 activity.difficulty.slice(1).toLowerCase()}
              </Badge>
              <span className="text-[11px] text-text-tertiary font-mono">
                {formatRelativeDate(activity.solvedAt)}
              </span>
            </div>
          </div>

          {/* Confidence dots */}
          <div className="flex gap-0.5 flex-shrink-0">
            {[1,2,3,4,5].map(n => (
              <div
                key={n}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  n <= activity.confidence
                    ? 'bg-brand-400'
                    : 'bg-surface-4'
                )}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  )
}