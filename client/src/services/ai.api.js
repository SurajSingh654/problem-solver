import api from "./api.js";

export const aiApi = {
  getStatus: () => api.get("/ai/status"),
  reviewSolution: (data) => api.post("/ai/review-solution", data),
  generateProblemContent: (data) =>
    api.post("/ai/generate-problem-content", data),
  generateHint: (data) => api.post("/ai/generate-hint", data),
  generateWeeklyPlan: (data) => api.post("/ai/weekly-plan", data),
};
