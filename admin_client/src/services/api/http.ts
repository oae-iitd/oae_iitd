import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';

const useDevProxy =
  import.meta.env.DEV && import.meta.env.VITE_DEV_USE_PROXY === '1';
const API_BASE_URL = useDevProxy ? '' : import.meta.env.VITE_API_URL || '';

const httpClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Client': 'web-admin',
  },
  withCredentials: true,
});

httpClient.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url ?? '';
      const isLoginRequest =
        requestUrl.includes('/auth/login') || requestUrl.endsWith('/login');
      if (isLoginRequest) return Promise.reject(error);
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login?session_expired=1';
    }
    return Promise.reject(error);
  }
);

export default httpClient;
