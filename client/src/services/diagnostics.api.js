// ============================================================================
// SuperAdmin Diagnostics — API client
// ============================================================================
import api from "./api.js";

export const diagnosticsApi = {
    get: () => api.get("/platform/diagnostics"),
};
