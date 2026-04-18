import api from "./api.js";

const aiConfig = { timeout: 120000 };

export const aiApi = {
  getStatus: () => api.get("/ai/status"),
  reviewSolution: (data) => api.post("/ai/review-solution", data, aiConfig),
  generateProblemContent: (data) =>
    api.post("/ai/generate-problem-content", data, aiConfig),
  generateHint: (data) => api.post("/ai/generate-hint", data, aiConfig),
  generateWeeklyPlan: (data) => api.post("/ai/weekly-plan", data, aiConfig),
  getSimilarProblems: (id) => api.get(`/ai/similar-problems/${id}`),
  getSimilarSolutions: (id) => api.get(`/ai/similar-solutions/${id}`),
};
