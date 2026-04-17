import api from './api.js'

// AI calls can take 30+ seconds for quiz generation
const aiConfig = { timeout: 60000 }  // 60 seconds

export const aiApi = {
  getStatus             : ()     => api.get('/ai/status'),
  reviewSolution        : (data) => api.post('/ai/review-solution', data, aiConfig),
  generateProblemContent: (data) => api.post('/ai/generate-problem-content', data, aiConfig),
  generateHint          : (data) => api.post('/ai/generate-hint', data, aiConfig),
  generateWeeklyPlan    : (data) => api.post('/ai/weekly-plan', data, aiConfig),
}