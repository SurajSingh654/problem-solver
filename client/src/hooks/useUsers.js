import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@services/users.api.js";
import { QUERY_KEYS } from "@utils/constants.js";
import { toast } from "@store/useUIStore.js";

export function useUsers() {
  return useQuery({
    queryKey: QUERY_KEYS.USERS,
    queryFn: async () => {
      const res = await usersApi.getAll();
      return res.data.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useUser(userId) {
  return useQuery({
    queryKey: QUERY_KEYS.USER(userId),
    queryFn: async () => {
      const res = await usersApi.getById(userId);
      return res.data.data.user;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => usersApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Member removed')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error?.message || 'Failed to remove member')
    },
  })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }) => usersApi.updateRole(id, role),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USERS })
      toast.success(res.data.data.message || 'Role updated')
    },
    onError: (err) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update role')
    },
  })
}