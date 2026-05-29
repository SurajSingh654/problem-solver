// ============================================================================
// BrandMark — single source of truth for the ProbSolver logo
// ============================================================================
//
// Design rationale: a "calibrated viewfinder" — corner brackets + center dot +
// outer ring. Says "calibrated · measured · focused" which is the product's
// core voice. Visually pairs with the RadarChart on the landing page.
//
// Used by:
//   - client/src/pages/landing/sections/LandingNav.jsx
//   - client/src/pages/landing/sections/LandingFooter.jsx
//   - client/src/components/layout/Sidebar.jsx
//
// Sizes through the `size` prop (px, sets both width and height). The
// favicon at /public/favicon.svg is the static stand-alone version — keep
// the two visually identical so OS-level browser tab matches the in-app
// chrome.
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
            {/* Brand square backdrop */}
            <rect width="32" height="32" rx="9" fill="#7c6ff7" />

            {/* Four corner brackets — viewfinder cue */}
            <path
                d="M9 11 L9 9 L11 9 M21 9 L23 9 L23 11 M23 21 L23 23 L21 23 M11 23 L9 23 L9 21"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />

            {/* Outer measurement ring */}
            <circle
                cx="16"
                cy="16"
                r="6"
                stroke="white"
                strokeWidth="1.5"
                strokeOpacity="0.55"
                fill="none"
            />

            {/* Center calibration dot */}
            <circle cx="16" cy="16" r="3" fill="white" />
        </svg>
    )
}

// Wordmark = mark + "ProbSolver" text. Convenience for the most common case.
// Pass `mono={true}` for monochrome contexts (in-app sidebar). Default
// is a brand-tinted gradient text on landing/marketing surfaces.
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
