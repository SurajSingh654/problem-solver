import { forwardRef, useState } from 'react'
import { cn } from '@utils/cn'

export const Input = forwardRef(function Input({
    label,
    hint,
    error,
    required,
    type = 'text',
    className,
    wrapClass,
    leftIcon,
    rightElement,
    ...props
}, ref) {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type

    return (
        <div className={cn('flex flex-col gap-1.5', wrapClass)}>

            {/* Label */}
            {label && (
                <label className="text-sm font-semibold text-text-primary flex items-center gap-1">
                    {label}
                    {required && <span className="text-danger text-xs">*</span>}
                </label>
            )}

            {/* Input wrap */}
            <div className="relative flex items-center">

                {/* Left icon */}
                {leftIcon && (
                    <div className="absolute left-3 text-text-tertiary pointer-events-none">
                        {leftIcon}
                    </div>
                )}

                <input
                    ref={ref}
                    type={inputType}
                    className={cn(
                        // Base
                        'w-full bg-surface-3 border border-border-strong rounded-lg',
                        'text-sm text-text-primary placeholder:text-text-tertiary',
                        'px-3 py-2.5 outline-none',
                        'transition-all duration-fast',
                        // Focus
                        'focus:border-brand-400 focus:bg-surface-4',
                        'focus:ring-2 focus:ring-brand-400/20',
                        // Error
                        error && 'border-danger focus:border-danger focus:ring-danger/20',
                        // Icon padding
                        leftIcon && 'pl-10',
                        (isPassword || rightElement) && 'pr-10',
                        className
                    )}
                    {...props}
                />

                {/* Password toggle */}
                {isPassword && (
                    <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3 text-text-tertiary hover:text-text-primary transition-colors"
                        onClick={() => setShowPassword(v => !v)}
                    >
                        {showPassword ? (
                            // Eye-off icon
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        ) : (
                            // Eye icon
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        )}
                    </button>
                )}

                {/* Custom right element */}
                {rightElement && !isPassword && (
                    <div className="absolute right-3">{rightElement}</div>
                )}

            </div>

            {/* Hint */}
            {hint && !error && (
                <p className="text-xs text-text-tertiary">{hint}</p>
            )}

            {/* Error */}
            {error && (
                <p className="text-xs text-danger flex items-center gap-1 animate-fade-in-up">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                </p>
            )}

        </div>
    )
})