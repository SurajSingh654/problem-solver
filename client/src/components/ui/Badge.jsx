import { cn } from '@utils/cn'

const variants = {
  brand  : 'bg-brand-400/12 text-brand-300 border-brand-400/25',
  success: 'bg-success/12  text-success  border-success/25',
  warning: 'bg-warning/12  text-warning  border-warning/25',
  danger : 'bg-danger/12   text-danger   border-danger/25',
  info   : 'bg-info/12     text-info     border-info/25',
  gray   : 'bg-surface-3   text-text-secondary border-border-default',
  easy   : 'bg-success/12  text-success  border-success/25',
  medium : 'bg-warning/12  text-warning  border-warning/25',
  hard   : 'bg-danger/12   text-danger   border-danger/25',
}

const sizes = {
  xs: 'text-[10px] px-1.5 py-px',
  sm: 'text-xs     px-2   py-0.5',
  md: 'text-xs     px-2.5 py-1',
}

export function Badge({
  variant   = 'brand',
  size      = 'sm',
  dot       = false,
  pulse     = false,
  children,
  className,
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border',
        'font-semibold leading-none whitespace-nowrap',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            variant === 'success' ? 'bg-success' :
            variant === 'warning' ? 'bg-warning' :
            variant === 'danger'  ? 'bg-danger'  :
            variant === 'easy'    ? 'bg-success' :
            variant === 'medium'  ? 'bg-warning' :
            variant === 'hard'    ? 'bg-danger'  :
                                    'bg-brand-400',
            pulse && 'animate-pulse-dot'
          )}
        />
      )}
      {children}
    </span>
  )
}