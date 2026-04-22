// ============================================================================
// ProbSolver v3.0 — Teams API Service
// ============================================================================

import api from './api'

export const teamsApi = {
  // ── Team CRUD ──────────────────────────────────────────
  create: (data) => api.post('/teams', data),
  getCurrent: () => api.get('/teams/current'),
  updateCurrent: (data) => api.put('/teams/current', data),

  // ── Members ────────────────────────────────────────────
  getMembers: () => api.get('/teams/current/members'),
  inviteMembers: (emails) => api.post('/teams/current/invite', { emails }),
  changeMemberRole: (memberId, role) =>
    api.put(`/teams/current/members/${memberId}/role`, { role }),
  removeMember: (memberId) =>
    api.delete(`/teams/current/members/${memberId}`),

  // ── Join / Leave ───────────────────────────────────────
  join: (joinCode) => api.post('/teams/join', { joinCode }),
  leave: () => api.post('/teams/leave'),

  // ── Admin operations ───────────────────────────────────
  regenerateCode: () => api.post('/teams/current/regenerate-code'),

  // ── Super Admin ────────────────────────────────────────
  listPending: () => api.get('/teams/pending'),
  listAll: (params) => api.get('/teams/all', { params }),
  review: (teamId, data) => api.post(`/teams/${teamId}/review`, data),
}