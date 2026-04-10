import api from './api.js'

export const usersApi = {

  getAll: () =>
    api.get('/users'),

  getByUsername: (username) =>
    api.get(`/users/${username}`),

}