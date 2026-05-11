import api from "./api.js";

export const designStudioApi = {
  // ── Session CRUD ────────────────────────────────────────
  create: (data) => api.post("/design-studio", data),
  list: (params = {}) => api.get("/design-studio", { params }),
  get: (sessionId) => api.get(`/design-studio/${sessionId}`),
  delete: (sessionId) => api.delete(`/design-studio/${sessionId}`),

  // ── Phase data saves ────────────────────────────────────
  savePhase: (sessionId, data) =>
    api.patch(`/design-studio/${sessionId}/phases`, data),

  saveDiagram: (sessionId, data) =>
    api.patch(`/design-studio/${sessionId}/diagram`, data),

  // ── Session metadata ────────────────────────────────────
  updateTiming: (sessionId, data) =>
    api.patch(`/design-studio/${sessionId}/timing`, data),

  updateStatus: (sessionId, data) =>
    api.patch(`/design-studio/${sessionId}/status`, data),

  // ── AI coaching ─────────────────────────────────────────
  askCoach: (sessionId, data) =>
    api.post(`/design-studio/${sessionId}/ai/coach`, data),

  // ── Scenario validation ─────────────────────────────────
  generateScenarios: (sessionId) =>
    api.post(`/design-studio/${sessionId}/ai/scenarios`),

  submitScenarioResponse: (sessionId, scenarioId, data) =>
    api.post(
      `/design-studio/${sessionId}/scenarios/${scenarioId}/respond`,
      data,
    ),

  evaluateScenario: (sessionId, scenarioId) =>
    api.post(`/design-studio/${sessionId}/scenarios/${scenarioId}/evaluate`),

  // ── Flow simulation ─────────────────────────────────────
  saveFlow: (sessionId, data) =>
    api.post(`/design-studio/${sessionId}/flows`, data),

  deleteFlow: (sessionId, flowId) =>
    api.delete(`/design-studio/${sessionId}/flows/${flowId}`),

  // ── Scale analysis ──────────────────────────────────────
  saveScaleAnalysis: (sessionId, data) =>
    api.patch(`/design-studio/${sessionId}/scale`, data),

  // ── Final evaluation ────────────────────────────────────
  requestEvaluation: (sessionId) =>
    api.post(`/design-studio/${sessionId}/ai/evaluate`),
};
