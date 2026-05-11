import { cn } from '@utils/cn'

// Theme-aware variants — use the semantic *-soft / *-fg / *-line tokens
// so pills render correctly in both light and dark mode.
// (The raw `text-success` / `bg-success/12` pattern fails WCAG in light mode
// because #22c55e only reaches 2.5:1 on white.)
const variants = {
  brand  : 'bg-brand-soft   text-brand-fg-soft border-brand-line',
  success: 'bg-success-soft text-success-fg    border-success-line',
  warning: 'bg-warning-soft text-warning-fg    border-warning-line',
  danger : 'bg-danger-soft  text-danger-fg     border-danger-line',
  info   : 'bg-info-soft    text-info-fg       border-info-line',
  gray   : 'bg-surface-3    text-text-secondary border-border-default',
  easy   : 'bg-success-soft text-success-fg    border-success-line',
  medium : 'bg-warning-soft text-warning-fg    border-warning-line',
  hard   : 'bg-danger-soft  text-danger-fg     border-danger-line',
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