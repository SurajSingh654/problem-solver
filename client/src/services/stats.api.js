import api from './api.js'

export const statsApi = {

  getMyStats: () =>
    api.get('/stats/me'),

  getTeamStats: () =>
    api.get('/stats/team'),

  getLeaderboard: () =>
    api.get('/stats/leaderboard'),

}