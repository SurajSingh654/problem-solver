// ============================================================================
// FolderTreeNode — recursive sidebar entry for a folder + its descendants
// ============================================================================
//
// Single-component recursion: a node renders itself and recurses into its
// children. Expand/collapse is local state (per node). Selection is
// driven by the parent via `selectedFolderId`.
//
// Hover reveals the inline "+" (create child) and "⋯" (rename / delete)
// actions. Click selects the folder. Cmd/right-click shows the same menu
// as the "⋯" button.
// ============================================================================
import { useState, useRef } from "react";
import { cn } from "@utils/cn";

export default function FolderTreeNode({
    node,
    depth = 0,
    selectedFolderId,
    onSelect,
    onCreateChild,
    onRename,
    onDelete,
    onMove,
}) {
    const [open, setOpen] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draftName, setDraftName] = useState(node.name);
    const renameRef = useRef(null);

    const hasChildren = node.children && node.children.length > 0;
    const selected = selectedFolderId === node.id;

    function startRename() {
        setMenuOpen(false);
        setDraftName(node.name);
        setRenaming(true);
        // focus on next tick so the input mounts first
        setTimeout(() => {
            renameRef.current?.focus();
            renameRef.current?.select();
        }, 0);
    }

    function commitRename() {
        const next = draftName.trim();
        setRenaming(false);
        if (!next || next === node.name) return;
        onRename?.(node.id, next);
    }

    function onKeyDown(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            commitRename();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setRenaming(false);
            setDraftName(node.name);
        }
    }

    function onContext(e) {
        e.preventDefault();
        setMenuOpen((o) => !o);
    }

    function onDragOver(e) {
        // Accept note drops to move them into this folder.
        if (e.dataTransfer.types.includes("application/x-note-id")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        }
    }

    function onDrop(e) {
        const noteId = e.dataTransfer.getData("application/x-note-id");
        if (!noteId) return;
        e.preventDefault();
        onMove?.(noteId, node.id);
    }

    return (
        <div>
            <div
                onContextMenu={onContext}
                onDragOver={onDragOver}
                onDrop={onDrop}
                className={cn(
                    "group flex items-center gap-1 pr-1 rounded-md text-xs transition-colors",
                    "hover:bg-surface-2",
                    selected && "bg-brand-soft text-brand-fg-soft hover:bg-brand-soft",
                )}
                style={{ paddingLeft: 4 + depth * 14 }}
            >
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className={cn(
                        "w-4 h-4 flex items-center justify-center rounded text-text-disabled",
                        "hover:text-text-primary",
                        !hasChildren && "invisible",
                    )}
                    aria-label={open ? "Collapse" : "Expand"}
                >
                    <span className={cn("transition-transform text-[8px]", open && "rotate-90")}>▶</span>
                </button>

                {renaming ? (
                    <input
                        ref={renameRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={onKeyDown}
                        maxLength={80}
                        className="flex-1 bg-surface-1 border border-brand-line rounded px-1.5 py-0.5
                                   text-xs text-text-primary outline-none"
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => onSelect?.(node.id)}
                        onDoubleClick={startRename}
                        className="flex-1 text-left py-1.5 truncate"
                    >
                        <span className="mr-1.5">📁</span>
                        <span className={cn("font-medium", selected && "text-brand-fg-soft")}>
                            {node.name}
                        </span>
                        {typeof node.noteCount === "number" && node.noteCount > 0 && (
                            <span className="ml-1.5 text-[10px] text-text-disabled font-mono">
                                {node.noteCount}
                            </span>
                        )}
                    </button>
                )}

                {!renaming && (
                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCreateChild?.(node.id);
                            }}
                            title="New subfolder"
                            className="w-5 h-5 flex items-center justify-center rounded
                                       text-text-disabled hover:text-text-primary hover:bg-surface-3"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen((o) => !o);
                            }}
                            title="More"
                            className="w-5 h-5 flex items-center justify-center rounded
                                       text-text-disabled hover:text-text-primary hover:bg-surface-3"
                        >
                            ⋯
                        </button>
                    </div>
                )}

                {menuOpen && !renaming && (
                    <div
                        className="absolute right-2 mt-7 z-modal min-w-[140px] bg-surface-1
                                   border border-border-default rounded-lg shadow-lg p-1 text-xs"
                        onMouseLeave={() => setMenuOpen(false)}
                    >
                        <MenuItem onClick={startRename}>Rename</MenuItem>
                        <MenuItem
                            onClick={() => {
                                setMenuOpen(false);
                                onCreateChild?.(node.id);
                            }}
                        >
                            New subfolder
                        </MenuItem>
                        <MenuItem
                            onClick={() => {
                                setMenuOpen(false);
                                onDelete?.(node);
                            }}
                            danger
                        >
                            Delete folder
                        </MenuItem>
                    </div>
                )}
            </div>

            {open && hasChildren && (
                <div>
                    {node.children.map((child) => (
                        <FolderTreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            selectedFolderId={selectedFolderId}
                            onSelect={onSelect}
                            onCreateChild={onCreateChild}
                            onRename={onRename}
                            onDelete={onDelete}
                            onMove={onMove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function MenuItem({ onClick, danger, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full text-left px-2 py-1.5 rounded text-text-secondary",
                "hover:bg-surface-2 hover:text-text-primary",
                danger && "hover:bg-danger-soft hover:!text-danger-fg",
            )}
        >
            {children}
        </button>
    );
}
