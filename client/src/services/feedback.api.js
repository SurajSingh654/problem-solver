import api from "./api.js";

export const feedbackApi = {
  submit: (data) => api.post("/feedback", data),
  list: (params = {}) => api.get("/feedback", { params }),
  get: (feedbackId) => api.get(`/feedback/${feedbackId}`),
  updateStatus: (feedbackId, data) =>
    api.patch(`/feedback/${feedbackId}/status`, data),
  getSimilar: (params = {}) => api.get("/feedback/similar", { params }),

  // ── Export ────────────────────────────────────────
  // Returns a Blob. Callers handle the download themselves so we keep
  // a single code path for filename resolution from Content-Disposition.
  export: ({ format, ids, filters = {} } = {}) => {
    const params = { format };
    if (ids && ids.length > 0) params.ids = ids.join(",");
    if (filters.type) params.type = filters.type;
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    if (filters.teamId) params.teamId = filters.teamId;
    if (filters.userId) params.userId = filters.userId;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;

    return api.get("/feedback/export", {
      params,
      responseType: "blob",
    });
  },
};
