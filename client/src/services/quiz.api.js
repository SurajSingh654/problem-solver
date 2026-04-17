import api from "./api.js";

export const quizApi = {
  generate: (data) => api.post("/quizzes/generate", data),
  submit: (data) => api.post("/quizzes/submit", data),
  analyze: (id) => api.post(`/quizzes/attempt/${id}/analyze`),
  getMyAttempts: () => api.get("/quizzes/my-attempts"),
  getAttempt: (id) => api.get(`/quizzes/attempt/${id}`),
  getSubjects: () => api.get("/quizzes/subjects"),
};
