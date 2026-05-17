// ============================================================================
// Note Folders — TanStack Query hooks
// ============================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteFoldersApi } from "@services/noteFolders.api";
import { toast } from "@store/useUIStore";

const KEY = ["note-folders"];

function pickError(err, fallback) {
    return (
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        fallback
    );
}

// Build a tree from a flat list. Used by the sidebar.
export function buildFolderTree(folders = []) {
    const byId = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
    const roots = [];
    for (const f of byId.values()) {
        if (f.parentId && byId.has(f.parentId)) {
            byId.get(f.parentId).children.push(f);
        } else {
            roots.push(f);
        }
    }
    const sortRec = (nodes) => {
        nodes.sort((a, b) => a.name.localeCompare(b.name));
        nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
}

export function useNoteFolders() {
    return useQuery({
        queryKey: KEY,
        queryFn: () => noteFoldersApi.list().then((r) => r.data.data.folders),
        staleTime: 1000 * 60,
    });
}

export function useCreateNoteFolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) =>
            noteFoldersApi.create(data).then((r) => r.data.data.folder),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            qc.invalidateQueries({ queryKey: ["notes", "list"] });
            toast.success("Folder created.");
        },
        onError: (err) =>
            toast.error(pickError(err, "Failed to create folder.")),
    });
}

export function useUpdateNoteFolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) =>
            noteFoldersApi.update(id, data).then((r) => r.data.data.folder),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            qc.invalidateQueries({ queryKey: ["notes", "list"] });
        },
        onError: (err) =>
            toast.error(pickError(err, "Failed to update folder.")),
    });
}

export function useDeleteNoteFolder() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => noteFoldersApi.remove(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEY });
            // Notes detached to "uncategorized" — refresh notes lists too.
            qc.invalidateQueries({ queryKey: ["notes"] });
            toast.success("Folder deleted.");
        },
        onError: (err) =>
            toast.error(pickError(err, "Failed to delete folder.")),
    });
}
