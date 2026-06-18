import { useRef } from "react";
import { cn } from "@utils/cn";

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
 * Templated O(_) complexity input — single horizontal row.
 *
 * Layout: `[label]  O( [input] )` — label and parens are inline-only.
 * Stored (onChange) value is wrapped to `O(...)`; empty input → "".
 *
 * Props:
 *   label?       — optional short prefix label (e.g. "Time", "Space")
 *   value        — wrapped string (e.g. "O(n)") or "" / null
 *   onChange     — (string) => void; receives wrapped value or ""
 *   placeholder? — placeholder text inside the parens (default "n")
 */
export function OComplexityInput({ label, value, onChange, placeholder = "n" }) {
  const inputRef = useRef(null);
  const inner = unwrap(value);

  function handleChange(e) {
    onChange(wrap(e.target.value));
  }

  return (
    <div className="flex items-center gap-2 font-mono text-sm whitespace-nowrap">
      {label && (
        <span className="text-[11px] font-semibold text-text-secondary font-sans flex-shrink-0">
          {label}
        </span>
      )}
      <span className="text-text-secondary flex-shrink-0">O(</span>
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
      <span className="text-text-secondary flex-shrink-0">)</span>
    </div>
  );
}
