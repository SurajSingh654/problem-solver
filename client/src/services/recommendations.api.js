import api from "./api.js";

export const recommendationsApi = {
  get: () => api.get("/recommendations"),
};
