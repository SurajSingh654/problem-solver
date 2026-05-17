// ============================================================================
// NewFromNoteMenu — pick any existing note as the starting point for a new one
// ============================================================================
//
// There is no "template" concept on the server. The user keeps their
// scaffolds in a folder of their choosing (commonly named "Templates")
// and this picker lets them instantiate a new note pre-filled with any
// source note's content.
//
// Behavior:
//   - Loads the user's active (non-archived) notes
//   - Optional folder filter dropdown (default: All folders)
//   - Search-as-you-type filter on title
//   - Click a row → server `/notes/:id/duplicate` → navigate to new note
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes, useDuplicateNote } from "@hooks/useNotes";
import { useNoteFolders } from "@hooks/useNoteFolders";
import { useNavigate } from "react-router-dom";
import { cn } from "@utils/cn";

export default function NewFromNoteMenu({ onClose, align = "right" }) {
    const navigate = useNavigate();
    const ref = useRef(null);
    const [filter, setFilter] = useState("");
    const [folderId, setFolderId] = useState("__all__");

    const { data: foldersData = [] } = useNoteFolders();
    const folders = foldersData;

    // Pre-select the user's "Templates" folder if they have one — that's
    // the most likely intent. Match by case-insensitive name; never
    // hard-code a folder concept on the server.
    useEffect(() => {
        if (folders.length === 0) return;
        const templatesFolder = folders.find(
            (f) => f.name.trim().toLowerCase() === "templates",
        );
        if (templatesFolder) setFolderId(templatesFolder.id);
    }, [folders]);

    const listParams = useMemo(() => {
        const p = { archived: "false", limit: "100" };
        if (folderId !== "__all__") p.folderId = folderId;
        return p;
    }, [folderId]);

    const { data, isLoading } = useNotes(listParams);

    const filtered = useMemo(() => {
        const all = data?.notes || [];
        if (!filter.trim()) return all;
        const q = filter.toLowerCase();
        return all.filter((n) => n.title.toLowerCase().includes(q));
    }, [data?.notes, filter]);

    const duplicate = useDuplicateNote();

    function pick(noteId) {
        duplicate.mutate(noteId, {
            onSuccess: (newNote) => {
                onClose?.();
                navigate(`/notes/${newNote.id}`);
            },
        });
    }

    // Click-outside / Esc to close
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

    return (
        <div
            ref={ref}
            className={cn(
                "absolute mt-1 z-modal w-[340px] max-h-[440px] flex flex-col",
                "bg-surface-1 border border-border-default rounded-xl shadow-xl p-2",
                align === "right" ? "right-0" : "left-0",
            )}
        >
            <div className="px-2 pt-1 pb-2 border-b border-border-subtle">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled mb-1.5">
                    New note from…
                </p>
                <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full bg-surface-2 border border-border-subtle rounded
                               px-2 py-1.5 text-xs text-text-primary outline-none mb-1.5"
                >
                    <option value="__all__">All folders</option>
                    {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                            📁 {f.name}
                        </option>
                    ))}
                </select>
                <input
                    autoFocus
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search by title…"
                    className="w-full bg-surface-2 border border-border-subtle rounded
                               px-2 py-1.5 text-xs text-text-primary outline-none"
                />
            </div>

            <div className="flex-1 overflow-y-auto py-1">
                {isLoading ? (
                    <div className="px-3 py-3 text-[11px] text-text-disabled">
                        Loading notes…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-text-disabled italic">
                        No notes match. Try clearing the folder filter or your search term.
                    </div>
                ) : (
                    filtered.map((n) => (
                        <PickerRow
                            key={n.id}
                            note={n}
                            disabled={duplicate.isPending}
                            onClick={() => pick(n.id)}
                        />
                    ))
                )}
            </div>

            <div className="px-2 py-1.5 border-t border-border-subtle">
                <p className="text-[10px] text-text-disabled leading-relaxed">
                    Picks copy the source's content + tags + folder. Title is prefixed
                    "Copy of …" — rename after creation.
                </p>
            </div>
        </div>
    );
}

function PickerRow({ note, disabled, onClick }) {
    const folderName = note.folder?.name;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-full text-left px-2 py-1.5 rounded-md transition-colors",
                "hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed",
                "flex flex-col gap-0.5",
            )}
        >
            <span className="text-xs font-medium text-text-primary truncate">
                {note.title}
            </span>
            <span className="text-[10px] text-text-disabled flex items-center gap-2">
                {folderName ? (
                    <span className="flex items-center gap-1">
                        <span>📁</span>
                        <span className="truncate max-w-[10rem]">{folderName}</span>
                    </span>
                ) : (
                    <span>📭 Uncategorized</span>
                )}
                {note.tags?.length > 0 && (
                    <span className="truncate">· {note.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}</span>
                )}
            </span>
        </button>
    );
}
