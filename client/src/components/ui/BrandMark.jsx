// ============================================================================
// BrandMark — single source of truth for the ProbSolver logo
// ============================================================================
//
// The original chevron mark — kept as the brand identity. Purple rounded
// square + two opposing chevrons (looks like `< >`). Reads as "code · two-way"
// and is recognizable at favicon size.
//
// Used by:
//   - client/src/pages/landing/sections/LandingNav.jsx
//   - client/src/pages/landing/sections/LandingFooter.jsx
//   - client/src/components/layout/Sidebar.jsx
//
// Sizes through the `size` prop (px, sets both width and height). The
// favicon at /public/favicon.svg is the static stand-alone version — keep
// the two visually identical so the OS browser tab matches in-app chrome.
// ============================================================================
export function BrandMark({ size = 28, className = '' }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            className={className}
            aria-hidden="true"
        >
            <rect width="32" height="32" rx="8" fill="#7c6ff7" />
            <polyline
                points="20 22 26 16 20 10"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
            <polyline
                points="12 10 6 16 12 22"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    )
}

// Wordmark = mark + "ProbSolver" text. Convenience for the most common case.
export function BrandWordmark({ size = 28, mono = false, className = '' }) {
    return (
        <span className={`inline-flex items-center gap-2 ${className}`}>
            <BrandMark size={size} />
            <span
                className={
                    mono
                        ? 'text-base font-extrabold tracking-tight text-text-primary'
                        : 'text-lg font-extrabold tracking-tight text-text-primary'
                }
            >
                ProbSolver
            </span>
        </span>
    )
}
