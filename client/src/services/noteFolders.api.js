// ============================================================================
// Note Folders — API client
// ============================================================================
import api from "./api.js";

export const noteFoldersApi = {
    list: () => api.get("/notes/folders"),
    create: (data) => api.post("/notes/folders", data),
    update: (id, data) => api.patch(`/notes/folders/${id}`, data),
    remove: (id) => api.delete(`/notes/folders/${id}`),
}
