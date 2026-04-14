import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
const api = axios.create({ baseURL });

// Toast integration — ToastContext calls setApiToastHandler on mount so the
// interceptor can surface user-friendly messages for common status codes.
let toastHandler = null;
export function setApiToastHandler(fn) { toastHandler = fn; }
function toast(msg, type = 'error') {
  try { toastHandler?.(msg, type); } catch { /* toast unavailable */ }
}

// De-duplicate 429/503 toasts so a burst of in-flight requests hitting the
// same ceiling doesn't spam the user with N identical toasts.
const recentToasts = new Map();
function throttledToast(key, msg, type) {
  const now = Date.now();
  const last = recentToasts.get(key);
  if (last && now - last < 3000) return;
  recentToasts.set(key, now);
  toast(msg, type);
}

api.interceptors.request.use(config => {
  const token = localStorage.getItem('tc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    const status = err.response?.status;
    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('tc_token');
      window.location.href = '/login?session=expired';
    } else if (status === 429) {
      const retryAfter = err.response?.headers?.['retry-after'];
      const suffix = retryAfter ? ` Please wait ${retryAfter}s and try again.` : ' Please wait a moment and try again.';
      throttledToast('429', 'Too many requests.' + suffix, 'warning');
    } else if (status === 503 || status === 502 || status === 504) {
      throttledToast('5xx', 'Service temporarily unavailable. Please try again shortly.', 'warning');
    } else if (!err.response && err.code === 'ERR_NETWORK') {
      // No response at all — network dropped or server unreachable.
      // Skip if the app is offline; OfflineBanner handles that case.
      if (navigator.onLine !== false) {
        throttledToast('network', 'Network error. Please check your connection and try again.', 'error');
      }
    }
    return Promise.reject(err);
  }
);

export default api;
