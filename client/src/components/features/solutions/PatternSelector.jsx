import { useState } from "react";
import { cn } from "@utils/cn";
import { PATTERNS } from "@utils/constants";

/**
 * Multi-select pattern picker. Shared by SubmitSolutionPage (full-size,
 * always-expanded) and the Review modal Recall phase (compact, collapsible).
 *
 * Props:
 *   value       — string[] of currently-selected pattern labels.
 *   onChange    — (string[]) => void
 *   suggestions — optional override for the chip list. Defaults to PATTERNS labels.
 *   compact     — render in tight modal-friendly density. Also enables the
 *                 collapsible mode (closed by default, expand to pick).
 */
export function PatternSelector({ value, onChange, suggestions, compact = false }) {
  const [customInput, setCustomInput] = useState("");
  // Collapsed by default in compact mode so the modal isn't dominated by a
  // 25-chip grid. Auto-open when the user has nothing selected yet so first-
  // time users see the options without an extra click.
  const [expanded, setExpanded] = useState(!compact || value.length === 0);

  const items =
    suggestions?.length > 0 ? suggestions : PATTERNS.map((p) => p.label);

  function toggle(s) {
    onChange(value.includes(s) ? value.filter((v) => v !== s) : [...value, s]);
  }

  return (
    <div>
      {/* Selected chips strip — always visible when anything is selected. */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 text-[11px] font-bold bg-brand-soft text-brand-fg-soft border border-brand-line px-2.5 py-1 rounded-full"
            >
              {v}
              <button
                type="button"
                onClick={() => toggle(v)}
                className="hover:text-brand-200 transition-colors leading-none"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Compact mode: show a single-line trigger to expand the grid. */}
      {compact && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] font-semibold text-brand-fg-soft hover:text-brand-200 transition-colors flex items-center gap-1"
        >
          <span className="text-base leading-none">+</span>
          {value.length === 0 ? "Choose pattern(s)" : "Add another"}
        </button>
      )}

      {/* Expanded grid + custom input. */}
      {expanded && (
        <>
          <div
            className={cn(
              "grid gap-1.5 mb-2",
              compact
                ? "grid-cols-2 sm:grid-cols-3 max-h-44 overflow-y-auto pr-1"
                : "grid-cols-2 sm:grid-cols-3",
            )}
          >
            {items.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={cn(
                  "text-left rounded-lg border text-[11px] font-semibold",
                  "transition-all duration-150 flex items-center justify-between gap-2",
                  compact ? "px-2 py-1.5" : "px-3 py-2.5",
                  value.includes(s)
                    ? "bg-brand-soft border-brand-line text-brand-fg-soft"
                    : "bg-surface-3 border-border-default text-text-secondary hover:border-brand-line",
                )}
              >
                <span className="truncate">{s}</span>
                {value.includes(s) && (
                  <span aria-hidden className="flex-shrink-0">✓</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customInput.trim()) {
                  e.preventDefault();
                  const custom = customInput.trim();
                  if (!value.includes(custom)) onChange([...value, custom]);
                  setCustomInput("");
                }
              }}
              placeholder="Or type a custom pattern, press Enter…"
              className={cn(
                "flex-1 bg-surface-3 border border-border-strong rounded-lg outline-none",
                "text-text-primary placeholder:text-text-tertiary",
                compact ? "text-xs px-3 py-1.5" : "text-sm px-3.5 py-2",
                "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
              )}
            />
            {compact && value.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-[11px] font-semibold text-text-tertiary hover:text-text-primary"
              >
                Done
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
