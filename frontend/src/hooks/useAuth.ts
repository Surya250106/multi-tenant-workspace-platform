import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthService } from '../services/authService';
import { useAuthStore } from '../store/authStore';

export function useLoginMutation() {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: AuthService.login,
    onSuccess: (data) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken
      });
    }
  });
}

export function useRegisterMutation() {
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: AuthService.register,
    onSuccess: (data) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken
      });
    }
  });
}

export function useLogoutMutation() {
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => AuthService.logout(refreshToken),
    onSettled: () => {
      clearAuth();
      queryClient.clear();
    }
  });
}

export function useProfileQuery() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: ['profile'],
    queryFn: AuthService.getMe,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000 // 10 minutes cache
  });
}

export function useUpdateProfileMutation() {
  const updateUser = useAuthStore((state) => state.updateUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: AuthService.patchMe,
    onSuccess: (data) => {
      updateUser(data.user);
      queryClient.setQueryData(['profile'], data);
    }
  });
}
