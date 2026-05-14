// ============================================================================
// SuggestedTagsBar — AI tag suggestions with one-click apply
// ============================================================================
import { useSuggestNoteTags } from "@hooks/useNotes";
import { cn } from "@utils/cn";

export default function SuggestedTagsBar({ note, currentTags, onAdoptTag }) {
    const suggest = useSuggestNoteTags();
    const suggested = (note.suggestedTags || []).filter(
        (t) => !currentTags.includes(t),
    );

    function handleSuggest() {
        suggest.mutate(note.id);
    }

    return (
        <div className="flex items-center flex-wrap gap-2">
            <button
                type="button"
                onClick={handleSuggest}
                disabled={suggest.isPending}
                className={cn(
                    "text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors",
                    "bg-brand-soft text-brand-fg-soft border border-brand-line",
                    "hover:bg-brand-soft/80 disabled:opacity-60",
                )}
            >
                {suggest.isPending
                    ? "Suggesting…"
                    : suggested.length > 0
                        ? "✨ Re-suggest"
                        : "✨ Suggest tags"}
            </button>
            {suggested.length > 0 && (
                <>
                    <span className="text-[10px] text-text-disabled">
                        Click to apply:
                    </span>
                    {suggested.map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => onAdoptTag(t)}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md
                                       bg-surface-2 text-text-secondary border border-border-default
                                       hover:border-brand-line hover:bg-brand-soft/40
                                       transition-colors"
                        >
                            + #{t}
                        </button>
                    ))}
                </>
            )}
        </div>
    );
}
