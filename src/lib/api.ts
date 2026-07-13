import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/** In-memory access token storage — never persist to localStorage */
let accessToken: string | null = null;

if (typeof window !== 'undefined') {
  const match = document.cookie.match(/(^|;)\s*accessToken\s*=\s*([^;]+)/);
  if (match) {
    try {
      accessToken = decodeURIComponent(match[2]);
    } catch {
      accessToken = match[2];
    }
  }
}

export const getAccessToken = () => accessToken;

/** Clear all GET cache keys from sessionStorage */
export const clearApiCache = () => {
  if (typeof window !== 'undefined') {
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('api-cache:')) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('Failed to clear api cache:', e);
    }
  }
};

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      const isSecure = window.location.protocol === 'https:';
      // Store short-lived session cookie for middleware visibility
      document.cookie = `accessToken=${encodeURIComponent(token)}; path=/; max-age=900; SameSite=Strict${isSecure ? '; Secure' : ''}`; 
    } else {
      // Clear it
      document.cookie = `accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
      clearApiCache();
    }
    window.dispatchEvent(new CustomEvent('accessTokenChanged', { detail: token }));
  }
};

export let apiBaseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
if (apiBaseURL && !apiBaseURL.endsWith('/api') && !apiBaseURL.endsWith('/api/')) {
  apiBaseURL = apiBaseURL.endsWith('/') ? `${apiBaseURL}api` : `${apiBaseURL}/api`;
}

const api: AxiosInstance = axios.create({ 
  baseURL: apiBaseURL, 
  withCredentials: true 
});

// Cache structures for GET requests
const activeRequests = new Map<string, Promise<any>>();

const getCacheKey = (config: AxiosRequestConfig) => {
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  const token = accessToken || '';
  return `${url}?${params}&t=${token}`;
};

const getSessionCache = (key: string, ttlMs: number): any | null => {
  if (typeof window === 'undefined') return null;
  try {
    const cachedItem = sessionStorage.getItem(`api-cache:${key}`);
    if (!cachedItem) return null;
    const parsed = JSON.parse(cachedItem);
    if (Date.now() - parsed.timestamp < ttlMs) {
      return parsed.data;
    } else {
      sessionStorage.removeItem(`api-cache:${key}`);
    }
  } catch (e) {
    console.error('Failed to read session cache:', e);
  }
  return null;
};

const setSessionCache = (key: string, data: any) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`api-cache:${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Failed to write session cache:', e);
  }
};

// Custom caching adapter wrapping the default adapter
const defaultAdapter = axios.getAdapter(api.defaults.adapter || axios.defaults.adapter);
api.defaults.adapter = async (config) => {
  const method = config.method?.toLowerCase();
  
  if (method !== 'get') {
    // If it's a write request, clear cache (both memory and sessionStorage)
    activeRequests.clear();
    clearApiCache();
    return defaultAdapter(config);
  }

  const bypassCache = config.headers?.['x-bypass-cache'] === 'true' || config.headers?.['X-Bypass-Cache'] === 'true';
  const cacheKey = getCacheKey(config);

  if (!bypassCache) {
    // 1. Check in-memory active requests for deduplication
    if (activeRequests.has(cacheKey)) {
      return activeRequests.get(cacheKey)!;
    }

    // 2. Check sessionStorage cache
    const cachedData = getSessionCache(cacheKey, 30000); // 30 seconds TTL
    if (cachedData !== null) {
      return {
        data: cachedData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      };
    }
  }

  // 3. Initiate request if not cached or cache is bypassed
  const requestPromise = (async () => {
    try {
      const response = await defaultAdapter(config);
      setSessionCache(cacheKey, response.data);
      return response;
    } finally {
      activeRequests.delete(cacheKey);
    }
  })();

  if (!bypassCache) {
    activeRequests.set(cacheKey, requestPromise);
  }

  return requestPromise;
};

function getOrCreateMacAddress() {
  if (typeof window === 'undefined') return '';
  let mac = localStorage.getItem('macAddress');
  if (!mac) {
    const hexDigits = '0123456789ABCDEF';
    const macArr = [];
    for (let i = 0; i < 6; i++) {
      let digit1 = hexDigits[Math.floor(Math.random() * 16)];
      let digit2 = hexDigits[Math.floor(Math.random() * 16)];
      if (i === 0) {
        const localUnicastDigits = '26AE';
        digit2 = localUnicastDigits[Math.floor(Math.random() * 4)];
      }
      macArr.push(digit1 + digit2);
    }
    mac = macArr.join(':');
    localStorage.setItem('macAddress', mac);
  }
  return mac;
}

// Attach bearer token from memory if not already set
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && config.headers) {
    const mac = getOrCreateMacAddress();
    if (mac) {
      config.headers['X-Mac-Address'] = mac;
    }
  }
  if (accessToken && config.headers) {
    const hasAuth = config.headers['Authorization'] || config.headers['authorization'];
    if (!hasAuth) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
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
