import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

const getApiUrl = () => {
  const envUrl = (import.meta as any).env.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    if (window.location.port === '3000') {
      return 'http://localhost:8080/api/v1';
    }
    return `${window.location.protocol}//${window.location.host}/api/v1`;
  }
  return 'http://localhost/api/v1';
};

const VITE_API_URL = getApiUrl();

export const api = axios.create({
  baseURL: VITE_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Flag to track active token refreshes
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

// Helper to process queued requests once refresh resolves
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
};

// 1. Request Interceptor: Inject active Bearer token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 2. Response Interceptor: Catch TOKEN_EXPIRED and coordinate rotation
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    const { status, data } = error.response as any;
    const serverErrorCode = data?.error?.code;

    // Check if error is due to expired access token (401 or TOKEN_EXPIRED)
    if ((status === 401 || serverErrorCode === 'TOKEN_EXPIRED') && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Enqueue request until refresh is done
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject: (err: any) => {
              reject(err);
            }
          });
        });
      }

      isRefreshing = true;

      try {
        const currentRefreshToken = useAuthStore.getState().refreshToken;
        if (!currentRefreshToken) {
          throw new Error('No refresh token available');
        }

        // Standard token refresh endpoint (avoids interceptors to prevent cycles)
        const refreshResponse = await axios.post(`${VITE_API_URL}/auth/refresh`, {
          refreshToken: currentRefreshToken
        });

        const { accessToken, refreshToken } = refreshResponse.data.data;

        // Update Zustand store
        const user = useAuthStore.getState().user;
        if (user) {
          useAuthStore.getState().setAuth({ user, accessToken, refreshToken });
        }

        isRefreshing = false;
        processQueue(null, accessToken);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        isRefreshing = false;
        processQueue(refreshErr, null);

        // Refresh token failed: Session expired! Purge store and redirect
        useAuthStore.getState().clearAuth();
        
        // Redirect to login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login?expired=true';
        }

        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
