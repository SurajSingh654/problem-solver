import { useRef } from "react";
import { cn } from "@utils/cn";

const SUGGESTIONS = ["1", "log n", "n", "n log n", "n²", "2ⁿ"];

const O_NOTATION_RE = /^O\((.*)\)$/;

function unwrap(value) {
  if (!value) return "";
  const m = O_NOTATION_RE.exec(value.trim());
  return m ? m[1] : value;
}

function wrap(inner) {
  const t = (inner ?? "").trim();
  if (t === "") return "";
  return `O(${t})`;
}

/**
 * Templated O(_) complexity input.
 *
 * The user sees `O(` + an inline input + `)`. The input value represents
 * what's *inside* the parens. The component normalizes outward: stored
 * value is always either "" (empty) or "O(...)" (wrapped).
 *
 * Props:
 *   label?       — optional label shown above the input
 *   value        — the wrapped string (e.g. "O(n)") or ""
 *   onChange     — (string) => void; receives the wrapped value or ""
 *   placeholder? — placeholder for the inner input (default "n")
 */
export function OComplexityInput({ label, value, onChange, placeholder = "n" }) {
  const inputRef = useRef(null);
  const inner = unwrap(value);

  function handleChange(e) {
    onChange(wrap(e.target.value));
  }

  function handleSuggestion(s) {
    onChange(wrap(s));
    inputRef.current?.focus();
  }

  return (
    <div>
      {label && (
        <label className="text-xs font-semibold text-text-secondary mb-1.5 block">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1 font-mono text-sm">
        <span className="text-text-secondary">O(</span>
        <input
          ref={inputRef}
          type="text"
          value={inner}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            "flex-1 min-w-0 bg-surface-3 border border-border-strong rounded-md",
            "text-text-primary placeholder:text-text-disabled",
            "px-2 py-1 outline-none",
            "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
          )}
        />
        <span className="text-text-secondary">)</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSuggestion(s)}
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded-md border",
              inner === s
                ? "bg-brand-400/15 border-brand-400/40 text-brand-300"
                : "bg-surface-3 border-border-subtle text-text-disabled hover:text-text-tertiary hover:border-border-default",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
