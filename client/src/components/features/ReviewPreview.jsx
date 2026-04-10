import { useNavigate }      from 'react-router-dom'
import { motion }           from 'framer-motion'
import { Badge }            from '@components/ui/Badge'
import { Button }           from '@components/ui/Button'
import { cn }               from '@utils/cn'

function getDueLabel(reviewDates) {
  if (!reviewDates?.length) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const next = reviewDates
    .map(d => new Date(d))
    .sort((a, b) => a - b)
    .find(d => {
      const nd = new Date(d)
      nd.setHours(0, 0, 0, 0)
      return nd <= today
    })

  if (!next) return null

  const nd = new Date(next)
  nd.setHours(0, 0, 0, 0)
  const diff = Math.round((today - nd) / 86400000)

  if (diff === 0) return { label: 'Due today',    urgent: true  }
  if (diff > 0)  return { label: `${diff}d overdue`, urgent: true  }
  return null
}

const DIFF_VARIANT = {
  EASY  : 'easy',
  MEDIUM: 'medium',
  HARD  : 'hard',
}

export function ReviewPreview({ solutions = [], loading }) {
  const navigate = useNavigate()

  // Filter to solutions that have reviews due
  const due = solutions
    .filter(s => getDueLabel(s.reviewDates))
    .slice(0, 4)

  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3].map(i => (
          <div key={i} className="h-14 rounded-xl bg-surface-2 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!due.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-success/10 border border-success/25
                        flex items-center justify-center text-xl">
          ✅
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">All caught up!</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            No reviews due today
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {due.map((solution, i) => {
        const dueInfo = getDueLabel(solution.reviewDates)

        return (
          <motion.div
            key={solution.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            onClick={() => navigate('/review')}
            className="flex items-center gap-3 p-3 rounded-xl
                       bg-surface-2 border border-border-default
                       hover:border-warning/40 hover:bg-surface-3
                       cursor-pointer transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-warning/10 border border-warning/25
                            flex items-center justify-center flex-shrink-0 text-sm">
              🧠
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">
                {solution.problem?.title || 'Unknown'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge
                  variant={DIFF_VARIANT[solution.problem?.difficulty] || 'brand'}
                  size="xs"
                >
                  {solution.problem?.difficulty?.charAt(0) +
                   solution.problem?.difficulty?.slice(1).toLowerCase() || '—'}
                </Badge>
                {dueInfo && (
                  <span className={cn(
                    'text-[11px] font-semibold font-mono',
                    dueInfo.urgent ? 'text-warning' : 'text-text-tertiary'
                  )}>
                    {dueInfo.label}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )
      })}

      {due.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          onClick={() => navigate('/review')}
          className="mt-2 text-warning hover:bg-warning/8"
        >
          Start Review Session →
        </Button>
      )}
    </div>
  )
}