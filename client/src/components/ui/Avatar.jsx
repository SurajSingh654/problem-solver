import { cn } from '@utils/cn'
import { getInitials } from '@utils/formatters'

const sizes = {
    xs: 'w-6  h-6  text-[10px]',
    sm: 'w-8  h-8  text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-20 h-20 text-2xl',
}

export function Avatar({
    name,
    color = '#7c6ff7',
    size = 'md',
    src,
    className,
    online,
}) {
    const initials = getInitials(name)

    return (
        <div className={cn('relative inline-flex flex-shrink-0', className)}>
            <div
                className={cn(
                    'rounded-full flex items-center justify-center',
                    'font-bold text-white select-none',
                    'border-2 border-white/10',
                    'transition-transform duration-200',
                    sizes[size]
                )}
                style={{ background: color }}
                title={name}
            >
                {src ? (
                    <img
                        src={src}
                        alt={name}
                        className="w-full h-full rounded-full object-cover"
                    />
                ) : (
                    <span>{initials}</span>
                )}
            </div>

            {online !== undefined && (
                <span
                    className={cn(
                        'absolute bottom-0 right-0 rounded-full border-2 border-surface-1',
                        size === 'xs' || size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5',
                        online ? 'bg-success' : 'bg-text-disabled'
                    )}
                />
            )}
        </div>
    )
}