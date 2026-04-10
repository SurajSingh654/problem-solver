import api from "./api.js";

export const simApi = {
  start: (data) => api.post("/sim", data),
  getMy: () => api.get("/sim/my"),
  getById: (id) => api.get(`/sim/${id}`),
  useHint: (id, hintUsedAtSecs) =>
    api.patch(`/sim/${id}/hint`, { hintUsedAtSecs }),
  complete: (id, data) => api.patch(`/sim/${id}/complete`, data),
  abandon: (id, timeUsedSecs) =>
    api.patch(`/sim/${id}/abandon`, { timeUsedSecs }),
};
