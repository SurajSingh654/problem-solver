import api from "./api.js";

export const usersApi = {
  getAll: () => api.get("/users"),

  getByUsername: (username) => api.get(`/users/${username}`),
  deleteUser: (id) => api.delete(`/users/${id}`),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role }),
};
