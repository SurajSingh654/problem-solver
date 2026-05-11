/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      colors: {
        // Surface layers — now use CSS variables
        "surface-0": "var(--surface-0)",
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        "surface-4": "var(--surface-4)",
        "surface-5": "var(--surface-5)",
        // Text
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-disabled": "var(--text-disabled)",
        // Borders
        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        // Brand — stays fixed (identity)
        "brand-300": "#9d93f9",
        "brand-400": "#7c6ff7",
        "brand-500": "#6358d4",
        "brand-600": "#4e44b0",
        // Semantic — raw saturated hues (identity colors)
        success: "#22c55e",
        warning: "#eab308",
        danger: "#ef4444",
        info: "#3b82f6",
        // Difficulty
        easy: "#22c55e",
        medium: "#eab308",
        hard: "#ef4444",

        // ── Theme-aware semantic utilities ───────────────
        // Use these when you need color that renders correctly
        // in BOTH light and dark mode. The raw `success`/`warning`/
        // etc. tokens above stay saturated and fail WCAG on light
        // surfaces — these variants are tuned per theme.
        //
        // Pattern:
        //   text-*-fg     → readable foreground on app/neutral bg
        //   bg-*-soft     → subtle tinted background (pills, callouts)
        //   border-*-line → subtle tinted border (matching the bg-*-soft)
        //
        // Example (replaces `bg-success/10 text-success border-success/20`):
        //   bg-success-soft text-success-fg border-success-line

        // Link (theme-aware inline link color)
        link: "var(--fg-link)",
        "link-hover": "var(--fg-link-hover)",

        // Brand variants
        "brand-fg": "var(--brand-fg)",
        "brand-fg-soft": "var(--brand-fg-on-subtle)",
        "brand-soft": "var(--brand-bg)",
        "brand-soft-hover": "var(--brand-bg-hover)",
        "brand-line": "var(--brand-border)",

        // Success
        "success-fg": "var(--success-fg)",
        "success-soft": "var(--success-bg)",
        "success-line": "var(--success-border)",

        // Warning
        "warning-fg": "var(--warning-fg)",
        "warning-soft": "var(--warning-bg)",
        "warning-line": "var(--warning-border)",

        // Danger
        "danger-fg": "var(--danger-fg)",
        "danger-soft": "var(--danger-bg)",
        "danger-line": "var(--danger-border)",

        // Info
        "info-fg": "var(--info-fg)",
        "info-soft": "var(--info-bg)",
        "info-line": "var(--info-border)",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
        full: "9999px",
      },
      boxShadow: {
        xs: "0 1px 2px hsl(var(--shadow-color) / calc(var(--shadow-strength) * 0.5))",
        sm: "0 2px 8px hsl(var(--shadow-color) / var(--shadow-strength))",
        md: "0 4px 16px hsl(var(--shadow-color) / var(--shadow-strength))",
        lg: "0 8px 32px hsl(var(--shadow-color) / calc(var(--shadow-strength) * 1.2))",
        xl: "0 16px 48px hsl(var(--shadow-color) / calc(var(--shadow-strength) * 1.4))",
        brand: "0 0 0 3px rgba(124,111,247,0.35)",
        "glow-sm": "0 0 12px rgba(124,111,247,0.3)",
        "glow-md": "0 0 24px rgba(124,111,247,0.35)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% center" },
          to: { backgroundPosition: "200% center" },
        },
        "pulse-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.35)", opacity: "0.6" },
        },
        spin: { to: { transform: "rotate(360deg)" } },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out both",
        "fade-in-up": "fade-in-up 300ms ease-out both",
        "scale-in": "scale-in 250ms cubic-bezier(0.34,1.56,0.64,1) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        spin: "spin 0.75s linear infinite",
        float: "float 3s ease-in-out infinite",
      },
      zIndex: {
        toast: "500",
        modal: "400",
        overlay: "300",
        sticky: "200",
        base: "1",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")({ strategy: "class" })],
};
