import { Spinner } from "@components/ui/Spinner";
import { cn } from "@utils/cn";

/**
 * Renders the canonical answer for a problem in a styled card.
 * Used by the Review modal in:
 *   - Recall phase (compact, when user clicks Show Answer)
 *   - Reveal phase (full size, default expanded)
 *
 * Props:
 *   data       — { pattern, keyInsight, timeComplexity, spaceComplexity, editedAt?, alternatives? } | null/undefined
 *                  alternatives is an optional array of { name, pattern, keyInsight, timeComplexity, spaceComplexity }.
 *   isLoading  — boolean (TanStack Query.isLoading)
 *   error      — error object/string or null
 *   compact?   — boolean; tighter spacing for inline use
 */
export function CanonicalAnswerPanel({ data, isLoading, error, compact = false }) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-2 p-4 flex items-center gap-3">
        <Spinner size="sm" />
        <p className="text-xs text-text-tertiary">Generating canonical answer…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-danger-line bg-danger-soft p-4">
        <p className="text-xs text-danger-fg">
          Couldn't load canonical answer. Try again in a moment.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];

  return (
    <div className="space-y-3">
      <div className={cn(
        "rounded-xl border border-brand-line bg-brand-soft space-y-2",
        compact ? "p-3 space-y-1.5" : "p-4 space-y-2",
      )}>
        <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest">
          Canonical Answer
        </p>
        <div>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
          <p className="text-xs font-semibold text-brand-fg-soft">{data.pattern ?? "—"}</p>
        </div>
        <div>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Key Insight</p>
          <p className="text-xs text-text-secondary leading-relaxed">{data.keyInsight ?? "—"}</p>
        </div>
        <div>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Complexity</p>
          <p className="text-xs font-mono text-text-secondary">
            T: {data.timeComplexity ?? "—"} · S: {data.spaceComplexity ?? "—"}
          </p>
        </div>
        {data.editedAt && (
          <p className="text-[9px] text-text-disabled italic">
            Edited by an admin
          </p>
        )}
      </div>

      {alternatives.length > 0 && (
        <details open className="rounded-xl border border-border-default bg-surface-2 overflow-hidden">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-3 transition-colors">
            ▼ Other valid approaches ({alternatives.length})
          </summary>
          <div className="px-3 pb-3 pt-1 space-y-2">
            {alternatives.map((alt, i) => (
              <div
                key={`${alt.name}-${i}`}
                className={cn(
                  "rounded-lg border border-border-default bg-surface-3 space-y-1.5",
                  compact ? "p-2.5" : "p-3",
                )}
              >
                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                  {alt.name}
                </p>
                <div>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
                  <p className="text-xs font-semibold text-text-primary">{alt.pattern}</p>
                </div>
                <div>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Key Insight</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{alt.keyInsight}</p>
                </div>
                <div>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Complexity</p>
                  <p className="text-xs font-mono text-text-secondary">
                    T: {alt.timeComplexity} · S: {alt.spaceComplexity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
