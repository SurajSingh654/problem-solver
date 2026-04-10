import api from "./api.js";

export const solutionsApi = {
  getMine: () => api.get("/solutions"),

  getForProblem: (problemId) => api.get(`/solutions/problem/${problemId}`),

  create: (data) => api.post("/solutions", data),

  update: (id, data) => api.put(`/solutions/${id}`, data),

  delete: (id) => api.delete(`/solutions/${id}`),

  rateClarity: (id, data) => api.post(`/solutions/${id}/clarity`, data),

  review: (id, confidenceLevel) =>
    api.post(`/solutions/${id}/review`, { confidenceLevel }),
};
