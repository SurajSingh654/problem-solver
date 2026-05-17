// ============================================================================
// NotesListPage — main notes workspace (2-column: folder sidebar + cards)
// ============================================================================
//
// View selection is URL-driven so it survives reload + browser back/forward:
//   /notes                       → All notes (default)
//   /notes?view=pinned           → Pinned only
//   /notes?view=archive          → Archive
//   /notes?view=uncategorized    → Notes not in any folder
//   /notes?folder=<cuid>         → Inside a folder
//
// Selection model passed to the sidebar:
//   { kind: "view", id: "all" | "pinned" | "archive" | "uncategorized" }
//   { kind: "folder", id: <cuid> }
// ============================================================================
import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
    useNotes,
    useNoteTags,
    useTogglePinNote,
    useArchiveNote,
    useRestoreNote,
    useDeleteNotePermanent,
} from "@hooks/useNotes";
import { useQueryClient } from "@tanstack/react-query";
import { notesApi } from "@services/notes.api";
import { toast } from "@store/useUIStore";
import NotesSidebar from "@components/notes/NotesSidebar";
import MoveToFolderMenu from "@components/notes/MoveToFolderMenu";
import NewFromNoteMenu from "@components/notes/NewFromNoteMenu";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { formatRelativeDate } from "@utils/formatters";
import { cn } from "@utils/cn";

const ENTITY_ICON = {
    PROBLEM: "📋",
    INTERVIEW_SESSION: "💬",
    DESIGN_SESSION: "🏗️",
    TEACHING_SESSION: "📚",
    CUSTOM: "🔗",
};

// Map URL → selection model.
function selectionFromSearch(sp) {
    const folder = sp.get("folder");
    if (folder) return { kind: "folder", id: folder };
    const view = sp.get("view") || "all";
    return { kind: "view", id: view };
}

// Map selection → URL search params (stable so React Router doesn't churn).
function searchFromSelection(sel) {
    if (sel.kind === "folder") return { folder: sel.id };
    if (sel.id === "all") return {};
    return { view: sel.id };
}

// Map selection → server-list query params.
function listParamsFromSelection(sel) {
    if (sel.kind === "folder") {
        return { folderId: sel.id, archived: "false" };
    }
    switch (sel.id) {
        case "pinned":
            return { archived: "false", pinned: "true" };
        case "archive":
            return { archived: "true" };
        case "uncategorized":
            return { archived: "false", folderId: "null" };
        case "all":
        default:
            return { archived: "false" };
    }
}

export default function NotesListPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [q, setQ] = useState("");
    const [tagFilter, setTagFilter] = useState(null);
    const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
    const searchRef = useRef(null);

    const selection = useMemo(() => selectionFromSearch(searchParams), [searchParams]);

    function changeSelection(sel) {
        setSearchParams(searchFromSelection(sel), { replace: false });
    }

    // Cmd/Ctrl+K focuses the search input.
    useEffect(() => {
        function onKey(e) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const params = useMemo(
        () => ({
            ...listParamsFromSelection(selection),
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(tagFilter ? { tag: tagFilter } : {}),
        }),
        [selection, q, tagFilter],
    );

    const { data, isLoading, isError, error } = useNotes(params);
    const notes = data?.notes || [];
    const { data: tagList } = useNoteTags();
    const topTags = (tagList || []).slice(0, 12);

    // Move-note mutation owned by this page so all caches invalidate
    // consistently. Sidebar + NoteCard both call into this.
    async function moveNote(noteId, folderId) {
        try {
            await notesApi.update(noteId, { folderId });
            qc.invalidateQueries({ queryKey: ["notes"] });
            qc.invalidateQueries({ queryKey: ["note-folders"] });
            toast.success(folderId ? "Moved to folder." : "Moved to Uncategorized.");
        } catch (err) {
            toast.error(
                err?.response?.data?.error?.message || "Failed to move note.",
            );
        }
    }

    const showFolderBadge = selection.kind === "view" && selection.id === "all";
    const headerLabel = headerLabelFor(selection, data);

    return (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
            <NotesSidebar
                selection={selection}
                onSelectionChange={changeSelection}
                onMoveNote={moveNote}
            />

            <div className="flex-1 min-w-0 p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-extrabold text-text-primary">
                            {headerLabel}
                        </h1>
                        <p className="text-xs text-text-tertiary mt-1">
                            Personal markdown notebook. Capture insights, organize thinking,
                            revisit later.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <Button
                            variant="ghost"
                            onClick={() => setFromTemplateOpen((o) => !o)}
                            title="Create a new note from an existing note's content"
                        >
                            📑 New from template
                        </Button>
                        {fromTemplateOpen && (
                            <NewFromNoteMenu
                                onClose={() => setFromTemplateOpen(false)}
                            />
                        )}
                        <Button onClick={() => navigate("/notes/new")}>+ New note</Button>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <input
                        ref={searchRef}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by title…  (⌘K)"
                        className="text-xs px-3 py-2 rounded-lg bg-surface-1 border border-border-default
                                   outline-none focus:border-brand-line w-64"
                    />
                    {topTags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {tagFilter && (
                                <button
                                    onClick={() => setTagFilter(null)}
                                    className="px-2 py-0.5 rounded-md text-[11px] font-bold
                                               bg-danger-soft text-danger-fg hover:bg-danger-soft/80"
                                >
                                    Clear filter
                                </button>
                            )}
                            {topTags.map(({ tag, count }) => (
                                <button
                                    key={tag}
                                    onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                                    className={cn(
                                        "px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors",
                                        tag === tagFilter
                                            ? "bg-brand-soft text-brand-fg-soft border border-brand-line"
                                            : "bg-surface-2 text-text-secondary hover:bg-surface-3 border border-border-default",
                                    )}
                                >
                                    #{tag} <span className="text-text-disabled">{count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Body */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {[...Array(6)].map((_, i) => (
                            <Skeleton.Card key={i} />
                        ))}
                    </div>
                ) : isError ? (
                    <div className="p-8 rounded-xl bg-danger-soft border border-danger-line text-sm text-danger-fg">
                        {error?.response?.data?.error?.message || "Failed to load notes."}
                    </div>
                ) : notes.length === 0 ? (
                    <EmptyState selection={selection} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {notes.map((n) => (
                            <NoteCard
                                key={n.id}
                                note={n}
                                onMove={moveNote}
                                showFolderBadge={showFolderBadge}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function headerLabelFor(selection, data) {
    if (selection.kind === "folder") {
        // Use the first note's folder name as the title (cheap and avoids
        // an extra fetch for the folder name).
        const folderName = data?.notes?.[0]?.folder?.name;
        return folderName || "Folder";
    }
    switch (selection.id) {
        case "pinned": return "Pinned";
        case "archive": return "Archive";
        case "uncategorized": return "Uncategorized";
        default: return "Notes";
    }
}

function NoteCard({ note, onMove, showFolderBadge }) {
    const togglePin = useTogglePinNote();
    const archive = useArchiveNote();
    const restore = useRestoreNote();
    const deletePermanent = useDeleteNotePermanent();
    const [moveOpen, setMoveOpen] = useState(false);
    const isArchived = Boolean(note.archivedAt);

    const preview = (note.contentMarkdown || "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[#*_`~>]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);

    const hasSummary = !!note.summary && !note.summary._fallback;
    const hasFallbackSummary = !!note.summary?._fallback;
    const charCount = (note.contentMarkdown || "").length;

    function stop(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    function onPin(e) { stop(e); togglePin.mutate(note.id); }
    function onArchive(e) { stop(e); archive.mutate(note.id); }
    function onRestore(e) { stop(e); restore.mutate(note.id); }
    function onDelete(e) {
        stop(e);
        if (
            !window.confirm(
                `Delete "${note.title}" permanently? This cannot be undone.`,
            )
        )
            return;
        deletePermanent.mutate(note.id);
    }
    function onOpenMove(e) {
        stop(e);
        setMoveOpen((o) => !o);
    }

    function onDragStart(e) {
        e.dataTransfer.setData("application/x-note-id", note.id);
        e.dataTransfer.effectAllowed = "move";
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="group relative"
            draggable
            onDragStart={onDragStart}
        >
            <Link
                to={`/notes/${note.id}`}
                className={cn(
                    "block p-4 rounded-xl border transition-colors h-full",
                    "bg-surface-1 hover:border-brand-400/40",
                    note.pinned && !isArchived
                        ? "border-warning-line/60"
                        : "border-border-default",
                    isArchived && "opacity-75",
                )}
            >
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        {note.pinned && !isArchived && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-warning-fg
                                             inline-flex items-center gap-1 mb-1">
                                📌 Pinned
                            </span>
                        )}
                        {isArchived && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-text-disabled
                                             inline-flex items-center gap-1 mb-1">
                                🗄️ Archived
                            </span>
                        )}
                        <h3 className="text-sm font-bold text-text-primary line-clamp-2 leading-tight">
                            {note.title}
                        </h3>
                    </div>
                    {hasSummary && (
                        <span className="text-[9px] text-brand-fg-soft shrink-0" title="AI summary available">
                            ✨
                        </span>
                    )}
                    {hasFallbackSummary && (
                        <span className="text-[9px] text-warning-fg shrink-0" title="AI summary fell back — retry from the note">
                            ⚠️
                        </span>
                    )}
                </div>

                {/* Folder + entity badges */}
                {(showFolderBadge && note.folder) || note.linkedEntityType ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {showFolderBadge && note.folder && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-px rounded
                                             bg-surface-2 border border-border-subtle
                                             text-[10px] text-text-secondary truncate max-w-[12rem]">
                                <span>📁</span>
                                <span className="truncate">{note.folder.name}</span>
                            </span>
                        )}
                        {note.linkedEntityType && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-px rounded
                                             bg-brand-soft/40 border border-brand-line/40
                                             text-[10px] text-brand-fg-soft truncate max-w-[12rem]">
                                <span>{ENTITY_ICON[note.linkedEntityType] || "🔗"}</span>
                                <span className="truncate">
                                    {note.linkedEntityTitle || note.linkedEntityType}
                                </span>
                            </span>
                        )}
                    </div>
                ) : null}

                <p className="text-xs text-text-tertiary line-clamp-3 mb-2 min-h-[2.5em] leading-relaxed">
                    {preview || (
                        <span className="italic text-text-disabled">No content yet.</span>
                    )}
                </p>

                {note.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {note.tags.slice(0, 4).map((t) => (
                            <span key={t}
                                className="text-[9px] font-bold px-1.5 py-px rounded
                                           bg-surface-2 text-text-tertiary border border-border-subtle">
                                #{t}
                            </span>
                        ))}
                        {note.tags.length > 4 && (
                            <span className="text-[9px] text-text-disabled self-center">
                                +{note.tags.length - 4}
                            </span>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-text-disabled gap-2">
                    <span className="truncate">{formatRelativeDate(note.updatedAt)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                        {charCount > 0 && (
                            <span title={`${charCount} characters`}>
                                {charCount > 1000
                                    ? `${(charCount / 1000).toFixed(1)}K`
                                    : charCount}
                                {" chars"}
                            </span>
                        )}
                        {note.flashcardCount > 0 && (
                            <span className="flex items-center gap-0.5">
                                🃏 {note.flashcardCount}
                            </span>
                        )}
                    </div>
                </div>
            </Link>

            {/* Hover-revealed action bar */}
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0
                            group-hover:opacity-100 focus-within:opacity-100 transition-opacity
                            bg-surface-1/95 backdrop-blur-sm border border-border-subtle
                            rounded-lg p-0.5 shadow-sm">
                {!isArchived && (
                    <CardAction
                        onClick={onOpenMove}
                        title="Move to folder"
                        label="📂"
                    />
                )}
                {!isArchived && (
                    <CardAction
                        onClick={onPin}
                        title={note.pinned ? "Unpin" : "Pin"}
                        label={note.pinned ? "📌" : "📍"}
                    />
                )}
                {!isArchived && (
                    <CardAction onClick={onArchive} title="Archive (soft delete)" label="🗄️" />
                )}
                {isArchived && (
                    <CardAction onClick={onRestore} title="Restore from archive" label="↩️" />
                )}
                <CardAction onClick={onDelete} title="Delete permanently" label="🗑️" danger />
            </div>

            {moveOpen && (
                <MoveToFolderMenu
                    currentFolderId={note.folderId}
                    onClose={() => setMoveOpen(false)}
                    onMove={(folderId) => onMove?.(note.id, folderId)}
                />
            )}
        </motion.div>
    );
}

function CardAction({ onClick, title, label, danger }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            className={cn(
                "px-1.5 py-0.5 rounded-md text-xs transition-colors",
                "hover:bg-surface-2",
                danger && "hover:bg-danger-soft",
            )}
        >
            {label}
        </button>
    );
}

function EmptyState({ selection }) {
    const navigate = useNavigate();
    const copy = emptyCopy(selection);
    return (
        <div className="text-center py-16 px-6 rounded-xl bg-surface-1 border border-border-subtle">
            <div className="text-4xl mb-3">{copy.icon}</div>
            <h2 className="text-base font-bold text-text-primary mb-1.5">{copy.title}</h2>
            <p className="text-xs text-text-tertiary max-w-sm mx-auto mb-4">{copy.sub}</p>
            {copy.cta && (
                <Button onClick={() => navigate("/notes/new")}>{copy.cta}</Button>
            )}
        </div>
    );
}

function emptyCopy(selection) {
    if (selection.kind === "folder") {
        return {
            icon: "📁",
            title: "This folder is empty",
            sub: "Drag a note here, or create a new one and move it into this folder.",
            cta: "Create your first note",
        };
    }
    switch (selection.id) {
        case "pinned":
            return {
                icon: "📌",
                title: "No pinned notes",
                sub: "Pin a note from its detail page to keep it at the top of your list.",
                cta: null,
            };
        case "archive":
            return {
                icon: "🗄️",
                title: "No archived notes",
                sub: "Archived notes show up here — they're never deleted, just out of the way.",
                cta: null,
            };
        case "uncategorized":
            return {
                icon: "📭",
                title: "Nothing uncategorized",
                sub: "Every note is tucked into a folder. Nice work staying organized.",
                cta: null,
            };
        default:
            return {
                icon: "📝",
                title: "No notes yet",
                sub: "Capture an insight, a definition, a tradeoff — anything you want to revisit later.",
                cta: "Create your first note",
            };
    }
}
