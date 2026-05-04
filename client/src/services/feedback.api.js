import api from "./api.js";

export const feedbackApi = {
  submit: (data) => api.post("/feedback", data),

  list: (params = {}) => api.get("/feedback", { params }),

  get: (feedbackId) => api.get(`/feedback/${feedbackId}`),

  updateStatus: (feedbackId, data) =>
    api.patch(`/feedback/${feedbackId}/status`, data),

  // NEW: Check for similar open reports before submitting
  getSimilar: (params = {}) => api.get("/feedback/similar", { params }),
};
