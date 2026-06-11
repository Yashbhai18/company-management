import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/** In-memory access token storage — never persist to localStorage */
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      // Store short-lived session cookie for middleware visibility
      document.cookie = `accessToken=${token}; path=/; max-age=900; SameSite=Strict`; 
    } else {
      // Clear it
      document.cookie = `accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
    window.dispatchEvent(new CustomEvent('accessTokenChanged', { detail: token }));
  }
};

let apiBaseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
if (apiBaseURL && !apiBaseURL.endsWith('/api') && !apiBaseURL.endsWith('/api/')) {
  apiBaseURL = apiBaseURL.endsWith('/') ? `${apiBaseURL}api` : `${apiBaseURL}/api`;
}

const api: AxiosInstance = axios.create({ 
  baseURL: apiBaseURL, 
  withCredentials: true 
});

// Attach bearer token from memory
api.interceptors.request.use((config) => {
  if (accessToken && config.headers) {
    config.headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return config;
});

// On 401 attempt refresh once using httpOnly refresh cookie
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response && error.response.status === 401) {
      if (original.url?.includes('/auth/refresh')) {
        setAccessToken(null);
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
        throw error;
      }

      if (!original._retry) {
        original._retry = true;
        try {
          const resp = await api.post('/auth/refresh');
          const newAccess = resp.data.accessToken;
          setAccessToken(newAccess);
          original.headers['Authorization'] = `Bearer ${newAccess}`;
          return api(original);
        } catch (err) {
          setAccessToken(null);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
            window.location.href = '/login';
          }
          throw err;
        }
      }
    }
    throw error;
  }
);

export default api;
