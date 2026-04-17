import api from "./api.js";

const aiConfig = { timeout: 60000 }; // 60 seconds for AI generation

export const quizApi = {
  generate: (data) => api.post("/quizzes/generate", data, aiConfig),
  submit: (data) => api.post("/quizzes/submit", data),
  analyze: (id) => api.post(`/quizzes/attempt/${id}/analyze`, {}, aiConfig),
  getMyAttempts: () => api.get("/quizzes/my-attempts"),
  getAttempt: (id) => api.get(`/quizzes/attempt/${id}`),
  getSubjects: () => api.get("/quizzes/subjects"),
};
