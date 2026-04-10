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
        // Surface layers
        "surface-0": "#09090f",
        "surface-1": "#111118",
        "surface-2": "#18181f",
        "surface-3": "#202028",
        "surface-4": "#282832",
        "surface-5": "#2f2f3a",

        // Text
        "text-primary": "#eeeef5",
        "text-secondary": "#9999bb",
        "text-tertiary": "#55556e",
        "text-disabled": "#35354a",

        // Borders
        "border-subtle": "rgba(255,255,255,0.05)",
        "border-default": "rgba(255,255,255,0.09)",
        "border-strong": "rgba(255,255,255,0.15)",

        // Brand
        "brand-300": "#9d93f9",
        "brand-400": "#7c6ff7",
        "brand-500": "#6358d4",
        "brand-600": "#4e44b0",

        // Semantic
        success: "#22c55e",
        warning: "#eab308",
        danger: "#ef4444",
        info: "#3b82f6",

        // Difficulty
        easy: "#22c55e",
        medium: "#eab308",
        hard: "#ef4444",
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
        xs: "0 1px 2px rgba(0,0,0,0.4)",
        sm: "0 2px 8px rgba(0,0,0,0.45)",
        md: "0 4px 16px rgba(0,0,0,0.5)",
        lg: "0 8px 32px rgba(0,0,0,0.55)",
        xl: "0 16px 48px rgba(0,0,0,0.6)",
        brand: "0 0 0 3px rgba(124,111,247,0.35)",
        "glow-sm": "0 0 12px rgba(124,111,247,0.3)",
        "glow-md": "0 0 24px rgba(124,111,247,0.35)",
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
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
        spin: {
          to: { transform: "rotate(360deg)" },
        },
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
        'float': 'float 3s ease-in-out infinite',
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
