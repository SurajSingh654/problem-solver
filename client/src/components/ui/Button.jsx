import { cn } from '@utils/cn'

const variants = {
  primary:   'bg-brand-400 hover:bg-brand-500 text-white shadow-glow-sm hover:-translate-y-px active:scale-[0.97]',
  secondary: 'bg-surface-3 hover:bg-surface-4 text-text-primary border border-border-default hover:border-brand-400 active:scale-[0.97]',
  ghost:     'hover:bg-surface-3 text-text-secondary hover:text-text-primary active:scale-[0.97]',
  danger:    'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 hover:border-danger active:scale-[0.97]',
  outline:   'border border-border-strong hover:border-brand-400 text-text-primary hover:text-brand-300 active:scale-[0.97]',
}

const sizes = {
  xs: 'h-7  px-2.5 text-xs  gap-1.5 rounded-md',
  sm: 'h-8  px-3   text-sm  gap-1.5 rounded-md',
  md: 'h-10 px-4   text-sm  gap-2   rounded-lg',
  lg: 'h-11 px-5   text-base gap-2  rounded-lg',
  xl: 'h-12 px-6   text-lg  gap-2.5 rounded-xl',
}

export function Button({
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  disabled  = false,
  fullWidth = false,
  children,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold',
        'transition-all duration-[120ms] cursor-pointer select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        (disabled || loading) && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
