// ============================================================================
// EntityLinkPicker — typeahead picker for linking a note to an entity
// ============================================================================
//
// Supports four entity types: Problem, Mock Interview, Design Session,
// Teaching Session. The picker fires a debounced server search per
// keystroke. Selected entity becomes a chip; "x" detaches.
//
// Controlled component. Caller owns:
//   { linkedEntityType, linkedEntityId, linkedEntityTitle }
// onChange receives the next snapshot or null to detach.
// ============================================================================
import { useState, useEffect, useRef } from "react";
import { useLinkSearch } from "@hooks/useNotes";
import { cn } from "@utils/cn";

const TYPE_OPTIONS = [
    { id: "PROBLEM", label: "Problem", icon: "📋" },
    { id: "INTERVIEW_SESSION", label: "Mock Interview", icon: "💬" },
    { id: "DESIGN_SESSION", label: "Design Session", icon: "🏗️" },
    { id: "TEACHING_SESSION", label: "Teaching Session", icon: "📚" },
];

export default function EntityLinkPicker({ value, onChange, disabled }) {
    const [type, setType] = useState(value?.linkedEntityType || "PROBLEM");
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    // Debounce the search query
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query), 250);
        return () => clearTimeout(t);
    }, [query]);

    // Click-outside to close dropdown
    useEffect(() => {
        function onDocClick(e) {
            if (!containerRef.current?.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    const { data: results, isLoading } = useLinkSearch(
        open ? type : null,
        debouncedQuery,
    );

    function handlePick(item) {
        onChange?.({
            linkedEntityType: type,
            linkedEntityId: item.id,
            linkedEntityTitle: item.title,
        });
        setOpen(false);
        setQuery("");
    }

    // Linked-state chip
    if (value?.linkedEntityType && value?.linkedEntityId) {
        const opt = TYPE_OPTIONS.find((o) => o.id === value.linkedEntityType);
        return (
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                    Linked to
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                                 bg-brand-soft border border-brand-line text-xs">
                    <span>{opt?.icon || "🔗"}</span>
                    <span className="font-bold text-brand-fg-soft">
                        {value.linkedEntityTitle || "Linked entity"}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                        ({opt?.label || value.linkedEntityType})
                    </span>
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => onChange?.(null)}
                            className="ml-1 text-text-tertiary hover:text-danger-fg"
                            aria-label="Remove link"
                        >
                            ✕
                        </button>
                    )}
                </span>
            </div>
        );
    }

    if (disabled) return null;

    return (
        <div ref={containerRef} className="relative">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                    Link to
                </span>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-border-default
                               outline-none focus:border-brand-line"
                >
                    {TYPE_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.icon} {o.label}
                        </option>
                    ))}
                </select>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setOpen(true)}
                    placeholder="Search…"
                    className="text-xs px-2.5 py-1 rounded-md bg-surface-1 border border-border-default
                               outline-none focus:border-brand-line w-56"
                />
            </div>

            {open && (
                <div className="absolute left-0 right-0 mt-1.5 max-w-md z-30
                               bg-surface-0 border border-border-default rounded-xl
                               shadow-lg overflow-hidden">
                    {isLoading ? (
                        <p className="px-3 py-3 text-xs text-text-disabled">Searching…</p>
                    ) : (results?.length || 0) === 0 ? (
                        <p className="px-3 py-3 text-xs text-text-disabled italic">
                            {debouncedQuery
                                ? "No matches."
                                : "Start typing to search…"}
                        </p>
                    ) : (
                        <ul className="max-h-72 overflow-y-auto">
                            {results.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => handlePick(r)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 hover:bg-surface-2 transition-colors",
                                            "border-b border-border-subtle last:border-b-0",
                                        )}
                                    >
                                        <p className="text-xs font-bold text-text-primary truncate">
                                            {r.title}
                                        </p>
                                        {r.subtitle && (
                                            <p className="text-[10px] text-text-disabled truncate">
                                                {r.subtitle}
                                            </p>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
