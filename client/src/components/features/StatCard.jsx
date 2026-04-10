import { motion }  from 'framer-motion'
import { cn }      from '@utils/cn'

export function StatCard({
  label,
  value,
  sub,
  icon,
  color   = 'brand',
  trend,
  index   = 0,
  onClick,
}) {
  const colors = {
    brand  : { bg: 'bg-brand-400/10',  text: 'text-brand-300',  bar: 'bg-brand-400'  },
    success: { bg: 'bg-success/10',    text: 'text-success',    bar: 'bg-success'    },
    warning: { bg: 'bg-warning/10',    text: 'text-warning',    bar: 'bg-warning'    },
    danger : { bg: 'bg-danger/10',     text: 'text-danger',     bar: 'bg-danger'     },
    info   : { bg: 'bg-info/10',       text: 'text-info',       bar: 'bg-info'       },
  }

  const c = colors[color] || colors.brand

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.2, delay: index * 0.06 }}
      onClick={onClick}
      className={cn(
        'relative bg-surface-2 border border-border-default rounded-xl p-5',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md'
      )}
    >
      {/* Top accent line */}
      <div className={cn('absolute top-0 left-0 right-0 h-[2px] rounded-t-xl', c.bar)} />

      {/* Icon + trend */}
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center',
          c.bg
        )}>
          <span className={cn('text-lg', c.text)}>{icon}</span>
        </div>

        {trend !== undefined && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
            trend > 0 ? 'bg-success/10 text-success' :
            trend < 0 ? 'bg-danger/10  text-danger'  :
                        'bg-surface-3  text-text-tertiary'
          )}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '—'}
            {trend !== 0 && Math.abs(trend)}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="text-3xl font-extrabold text-text-primary font-mono
                      leading-none mb-1">
        {value ?? '—'}
      </div>

      {/* Label */}
      <div className="text-sm font-medium text-text-secondary">{label}</div>

      {/* Sub */}
      {sub && (
        <div className="text-xs text-text-tertiary mt-1 font-mono">{sub}</div>
      )}
    </motion.div>
  )
}