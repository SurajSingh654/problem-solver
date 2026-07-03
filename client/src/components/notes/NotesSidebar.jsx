// ============================================================================
// NotesSidebar — left rail for NotesListPage
// ============================================================================
//
// Three sections:
//   1. Views — All notes / Pinned / Archive
//   2. Folders — hierarchical, with "+ New folder" affordance
//   3. Uncategorized pseudo-folder
//
// View state is owned by the parent (URL-driven). This component is a
// pure render of selection + dispatch. Selection model:
//   { kind: "view", id: "all" | "pinned" | "archive" | "uncategorized" }
//   { kind: "folder", id: <cuid> }
//
// `onMoveNote(noteId, folderId | null)` lets the parent run the actual
// mutation + cache invalidation. The sidebar only forwards drag events.
// ============================================================================
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    useNoteFolders,
    buildFolderTree,
    useCreateNoteFolder,
    useUpdateNoteFolder,
    useDeleteNoteFolder,
} from "@hooks/useNoteFolders";
import { useConfirm } from "@hooks/useConfirm";
import FolderTreeNode from "./FolderTreeNode";
import { cn } from "@utils/cn";

const VIEWS = [
    { id: "all", label: "All notes", icon: "📒" },
    { id: "pinned", label: "Pinned", icon: "📌" },
    { id: "archive", label: "Archive", icon: "🗄️" },
];

export default function NotesSidebar({ selection, onSelectionChange, onMoveNote }) {
    const { data: folders = [], isLoading } = useNoteFolders();
    const createFolder = useCreateNoteFolder();
    const updateFolder = useUpdateNoteFolder();
    const deleteFolder = useDeleteNoteFolder();
    const confirm = useConfirm();

    const [creatingRoot, setCreatingRoot] = useState(false);
    const [draftName, setDraftName] = useState("");

    const tree = useMemo(() => buildFolderTree(folders), [folders]);

    function selectView(id) {
        onSelectionChange?.({ kind: "view", id });
    }
    function selectFolder(id) {
        onSelectionChange?.({ kind: "folder", id });
    }

    function createRoot() {
        const name = draftName.trim();
        setCreatingRoot(false);
        setDraftName("");
        if (!name) return;
        createFolder.mutate({ name });
    }

    function createChild(parentId) {
        const name = window.prompt("New folder name:");
        if (!name?.trim()) return;
        createFolder.mutate({ name: name.trim(), parentId });
    }

    function renameFolder(id, name) {
        updateFolder.mutate({ id, name });
    }

    async function confirmDelete(node) {
        const ok = await confirm({
            title: "Delete this folder?",
            description: `"${node.name}" and its subfolders will be removed. Notes inside become Uncategorized.`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            danger: true,
        });
        if (!ok) return;
        deleteFolder.mutate(node.id);
    }

    return (
        <aside
            className="w-full md:w-60 md:shrink-0 border-r border-border-default
                       bg-surface-0/40 px-2 py-3 space-y-4 md:min-h-[calc(100vh-4rem)]"
        >
            <SidebarSection label="Views">
                {VIEWS.map((v) => {
                    const active =
                        selection?.kind === "view" && selection.id === v.id;
                    return (
                        <SidebarRow
                            key={v.id}
                            icon={v.icon}
                            label={v.label}
                            active={active}
                            onClick={() => selectView(v.id)}
                        />
                    );
                })}
            </SidebarSection>

            <SidebarSection
                label="Folders"
                action={
                    <button
                        type="button"
                        onClick={() => setCreatingRoot(true)}
                        title="New folder"
                        className="w-5 h-5 flex items-center justify-center rounded
                                   text-text-disabled hover:text-text-primary hover:bg-surface-3"
                    >
                        +
                    </button>
                }
            >
                {creatingRoot && (
                    <div className="px-1 mb-1">
                        <input
                            autoFocus
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onBlur={createRoot}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    createRoot();
                                } else if (e.key === "Escape") {
                                    setCreatingRoot(false);
                                    setDraftName("");
                                }
                            }}
                            placeholder="Folder name"
                            maxLength={80}
                            className="w-full bg-surface-1 border border-brand-line rounded px-2 py-1
                                       text-xs text-text-primary outline-none"
                        />
                    </div>
                )}

                {isLoading ? (
                    <div className="text-[10px] text-text-disabled px-2 py-1.5">Loading…</div>
                ) : tree.length === 0 && !creatingRoot ? (
                    <div className="text-[10px] text-text-disabled px-2 py-1.5 italic">
                        No folders yet — click + to add one.
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        <motion.div
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {tree.map((node) => (
                                <FolderTreeNode
                                    key={node.id}
                                    node={node}
                                    selectedFolderId={
                                        selection?.kind === "folder" ? selection.id : null
                                    }
                                    onSelect={selectFolder}
                                    onCreateChild={createChild}
                                    onRename={renameFolder}
                                    onDelete={confirmDelete}
                                    onMove={onMoveNote}
                                />
                            ))}
                        </motion.div>
                    </AnimatePresence>
                )}
            </SidebarSection>

            <SidebarSection label="Other">
                <SidebarRow
                    icon="📭"
                    label="Uncategorized"
                    active={
                        selection?.kind === "view" && selection.id === "uncategorized"
                    }
                    onClick={() => selectView("uncategorized")}
                    onDragOver={(e) => {
                        if (e.dataTransfer.types.includes("application/x-note-id")) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                        }
                    }}
                    onDrop={(e) => {
                        const noteId = e.dataTransfer.getData("application/x-note-id");
                        if (!noteId) return;
                        e.preventDefault();
                        onMoveNote?.(noteId, null);
                    }}
                />
            </SidebarSection>
        </aside>
    );
}

function SidebarSection({ label, action, children }) {
    return (
        <div>
            <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[9px] font-bold tracking-widest uppercase text-text-disabled">
                    {label}
                </span>
                {action}
            </div>
            <div className="relative">{children}</div>
        </div>
    );
}

function SidebarRow({ icon, label, active, onClick, onDragOver, onDrop }) {
    return (
        <button
            type="button"
            onClick={onClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs",
                "transition-colors",
                active
                    ? "bg-brand-soft text-brand-fg-soft"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
            )}
        >
            <span>{icon}</span>
            <span className="truncate font-medium">{label}</span>
        </button>
    );
}
