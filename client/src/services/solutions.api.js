import api from "./api.js";

export const solutionsApi = {
  getMine: () => api.get("/solutions"),

  getForProblem: (problemId) => api.get(`/solutions/problem/${problemId}`),

  create: (data) => api.post("/solutions", data),

  update: (id, data) => api.put(`/solutions/${id}`, data),

  delete: (id) => api.delete(`/solutions/${id}`),

  rateClarity: (id, data) => api.post(`/solutions/${id}/clarity`, data),

  // NOTE: live review submission is in hooks/useSolutions.js::useSubmitReview;
  // this wrapper is kept for ad-hoc callers. Send `confidence` (1-5) and an
  // optional `recallText`; the server's submitReviewSchema requires those keys.
  review: (id, { confidence, recallText } = {}) =>
    api.post(`/solutions/${id}/review`, { confidence, recallText }),
};
