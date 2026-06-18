import { useRef } from "react";
import { cn } from "@utils/cn";

// Trimmed to the four most-used. Side-by-side in a modal grid, even four
// chips can wrap to two rows on narrow screens — that's tolerable.
const SUGGESTIONS = ["1", "log n", "n", "n log n"];

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
 * Shows `O(` + inline text input + `)`. Input value is the inside-the-parens
 * portion; stored (onChange) value is wrapped to `O(...)` or `""` when empty.
 *
 * Props:
 *   label?       — optional inline label (e.g. "Time", "Space")
 *   value        — wrapped string (e.g. "O(n)") or "" / null
 *   onChange     — (string) => void; receives wrapped value or ""
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
      <div className="flex items-center gap-1.5 font-mono text-sm">
        {label && (
          <span className="text-[11px] font-semibold text-text-secondary font-sans w-10 flex-shrink-0">
            {label}
          </span>
        )}
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
            "px-2 py-1 outline-none text-xs",
            "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
          )}
        />
        <span className="text-text-secondary">)</span>
      </div>
      <div className="flex gap-1 mt-1 ml-12 overflow-x-auto pb-0.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSuggestion(s)}
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0",
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
