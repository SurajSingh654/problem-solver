// ============================================================================
// MoveToFolderMenu — popover for moving a note to a folder
// ============================================================================
//
// Shown from a NoteCard hover action or from NoteDetailPage header. The
// menu shows a flat list of folders (indent shows depth) plus an
// "Uncategorized" option. Click a folder → calls `onMove(folderId)`.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useNoteFolders, buildFolderTree } from "@hooks/useNoteFolders";
import { cn } from "@utils/cn";

export default function MoveToFolderMenu({
    currentFolderId,
    onMove,
    onClose,
    align = "right",
}) {
    const { data: folders = [] } = useNoteFolders();
    const [filter, setFilter] = useState("");
    const ref = useRef(null);

    // Click outside / Esc closes.
    useEffect(() => {
        function onDoc(e) {
            if (!ref.current?.contains(e.target)) onClose?.();
        }
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    // Flatten the tree depth-first so nested folders render in order with
    // an indent. We don't need real tree controls here — it's a flat picker.
    const flat = useMemo(() => {
        const out = [];
        function walk(nodes, depth) {
            for (const n of nodes) {
                out.push({ id: n.id, name: n.name, depth });
                if (n.children?.length) walk(n.children, depth + 1);
            }
        }
        walk(buildFolderTree(folders), 0);
        return out;
    }, [folders]);

    const filtered = filter
        ? flat.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase()))
        : flat;

    return (
        <div
            ref={ref}
            className={cn(
                "absolute mt-1 z-modal min-w-[220px] max-h-[320px] overflow-y-auto",
                "bg-surface-1 border border-border-default rounded-lg shadow-lg p-1",
                align === "right" ? "right-0" : "left-0",
            )}
        >
            <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search folders…"
                autoFocus
                className="w-full bg-surface-2 border border-border-subtle rounded px-2 py-1
                           text-xs text-text-primary outline-none mb-1"
            />

            <PickerRow
                label="📭 Uncategorized"
                active={!currentFolderId}
                onClick={() => {
                    onMove?.(null);
                    onClose?.();
                }}
            />
            <div className="my-1 border-t border-border-subtle" />
            {filtered.length === 0 ? (
                <div className="text-[10px] text-text-disabled italic px-2 py-2">
                    No matching folders.
                </div>
            ) : (
                filtered.map((f) => (
                    <PickerRow
                        key={f.id}
                        label={`📁 ${f.name}`}
                        depth={f.depth}
                        active={currentFolderId === f.id}
                        onClick={() => {
                            onMove?.(f.id);
                            onClose?.();
                        }}
                    />
                ))
            )}
        </div>
    );
}

function PickerRow({ label, depth = 0, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full text-left px-2 py-1.5 rounded text-xs truncate",
                active
                    ? "bg-brand-soft text-brand-fg-soft"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
        >
            {label}
            {active && <span className="ml-2 text-[10px]">✓</span>}
        </button>
    );
}
