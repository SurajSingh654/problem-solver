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
    { id: "CUSTOM", label: "Custom / URL", icon: "🔗" },
];

export default function EntityLinkPicker({ value, onChange, disabled }) {
    const [type, setType] = useState(value?.linkedEntityType || "PROBLEM");
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [customTitle, setCustomTitle] = useState("");
    const [customUrl, setCustomUrl] = useState("");
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
        open && type !== "CUSTOM" ? type : null,
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

    function handleCustomSubmit() {
        const title = customTitle.trim();
        if (!title) return;
        // Use the URL as the id when provided so the chip can link to it.
        // Falls back to a stable opaque marker so the row still persists.
        const id = customUrl.trim() || `custom:${Date.now()}`;
        onChange?.({
            linkedEntityType: "CUSTOM",
            linkedEntityId: id,
            linkedEntityTitle: title,
        });
        setOpen(false);
        setCustomTitle("");
        setCustomUrl("");
    }

    // Linked-state chip
    if (value?.linkedEntityType && value?.linkedEntityId) {
        const opt = TYPE_OPTIONS.find((o) => o.id === value.linkedEntityType);
        const isCustomUrl =
            value.linkedEntityType === "CUSTOM" &&
            /^https?:\/\//i.test(value.linkedEntityId || "");
        const titleNode = (
            <span className="font-bold text-brand-fg-soft">
                {value.linkedEntityTitle || "Linked entity"}
            </span>
        );
        return (
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                    Linked to
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                                 bg-brand-soft border border-brand-line text-xs">
                    <span>{opt?.icon || "🔗"}</span>
                    {isCustomUrl ? (
                        <a
                            href={value.linkedEntityId}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                        >
                            {titleNode}
                        </a>
                    ) : (
                        titleNode
                    )}
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
                {type !== "CUSTOM" && (
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setOpen(true)}
                        placeholder="Search…"
                        className="text-xs px-2.5 py-1 rounded-md bg-surface-1 border border-border-default
                                   outline-none focus:border-brand-line w-56"
                    />
                )}
                {type === "CUSTOM" && (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-md
                                   bg-surface-1 border border-border-default
                                   hover:border-brand-line text-text-secondary"
                    >
                        {open ? "Cancel" : "Enter title + URL"}
                    </button>
                )}
            </div>

            {open && type === "CUSTOM" && (
                <div className="absolute left-0 mt-1.5 max-w-md z-30 w-[28rem]
                               bg-surface-0 border border-border-default rounded-xl
                               shadow-lg p-3 space-y-2">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                            Title (required)
                        </label>
                        <input
                            value={customTitle}
                            onChange={(e) => setCustomTitle(e.target.value)}
                            placeholder="Two Sum (LeetCode), RFC 9111, Designing Data-Intensive Applications…"
                            maxLength={200}
                            autoFocus
                            className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-1
                                       border border-border-default outline-none
                                       focus:border-brand-line"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                            URL (optional)
                        </label>
                        <input
                            value={customUrl}
                            onChange={(e) => setCustomUrl(e.target.value)}
                            placeholder="https://leetcode.com/problems/two-sum"
                            className="w-full text-xs px-2.5 py-1.5 rounded-md bg-surface-1
                                       border border-border-default outline-none
                                       focus:border-brand-line"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                setCustomTitle("");
                                setCustomUrl("");
                            }}
                            className="text-[11px] text-text-tertiary hover:text-text-primary px-2 py-1"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleCustomSubmit}
                            disabled={!customTitle.trim()}
                            className="text-[11px] font-bold px-3 py-1 rounded-md
                                       bg-brand-soft text-brand-fg-soft border border-brand-line
                                       disabled:opacity-50"
                        >
                            Link
                        </button>
                    </div>
                </div>
            )}

            {open && type !== "CUSTOM" && (
                <div className="absolute left-0 right-0 mt-1.5 max-w-md z-30
                               bg-surface-0 border border-border-default rounded-xl
                               shadow-lg overflow-hidden">
                    {isLoading ? (
                        <p className="px-3 py-3 text-xs text-text-disabled">Searching…</p>
                    ) : (results?.length || 0) === 0 ? (
                        <p className="px-3 py-3 text-xs text-text-disabled italic">
                            {debouncedQuery
                                ? "No matches. Switch to 'Custom / URL' to link to a free-text reference."
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
