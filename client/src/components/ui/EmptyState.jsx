import { cn }    from '@utils/cn'
import { Button } from './Button'

export function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className,
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center',
      'gap-4 py-20 px-8 text-center',
      className
    )}>
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border-default
                        flex items-center justify-center text-3xl
                        animate-float">
          {icon}
        </div>
      )}

      <div className="space-y-1.5 max-w-sm">
        {title && (
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
        )}
        {description && (
          <p className="text-sm text-text-tertiary leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {(action || onAction) && (
        <Button
          variant="primary"
          size="md"
          onClick={onAction}
        >
          {actionLabel || action}
        </Button>
      )}
    </div>
  )
}