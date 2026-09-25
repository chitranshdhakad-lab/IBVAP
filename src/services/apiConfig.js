/**
 * IBVAP Enterprise Cloud & Edge Hybrid API Configuration
 * Supports seamless deployment across:
 * 1. Local development (Vite proxy -> localhost:8000)
 * 2. Cloud production (Vercel frontend -> Render/Railway/Docker backend)
 * 3. Runtime user override via browser settings without rebuilding
 */

export function getApiBase() {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('ibvap_backend_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

export function setCustomBackendUrl(url) {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('ibvap_backend_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('ibvap_backend_url');
    }
  }
}

export function resolveMediaUrl(path) {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  const base = getApiBase();
  if (base) {
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }
  return path;
}

export function getWsUrl(cameraId = 'CAM-01') {
  // 1. Explicit VITE_WS_URL environment variable
  const envWsUrl = import.meta.env.VITE_WS_URL;
  if (envWsUrl && envWsUrl.trim()) {
    const clean = envWsUrl.trim().replace(/\/+$/, '');
    return clean.endsWith('/ws/live') ? `${clean}/${cameraId}` : `${clean}/ws/live/${cameraId}`;
  }

  // 2. Derive from API Base (env or localStorage)
  const apiBase = getApiBase();
  if (apiBase) {
    const wsBase = apiBase
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');
    return `${wsBase}/ws/live/${cameraId}`;
  }

  // 3. Fallback for Localhost or Same-Origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname || 'localhost';

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8000/ws/live/${cameraId}`;
  }

  return `${protocol}//${window.location.host}/ws/live/${cameraId}`;
}

/**
 * Automatically hook window.fetch so all relative API/storage requests
 * transparently point to the target backend when a remote API base is set.
 */
if (typeof window !== 'undefined' && !window.__ibvap_fetch_hooked) {
  window.__ibvap_fetch_hooked = true;
  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    const base = getApiBase();
    if (base) {
      if (typeof input === 'string') {
        if (
          input.startsWith('/api') ||
          input.startsWith('/storage') ||
          input.startsWith('/evidence') ||
          input.startsWith('/videos')
        ) {
          input = `${base}${input}`;
        }
      } else if (input instanceof Request) {
        try {
          const url = new URL(input.url);
          if (
            url.origin === window.location.origin &&
            (url.pathname.startsWith('/api') ||
              url.pathname.startsWith('/storage') ||
              url.pathname.startsWith('/evidence') ||
              url.pathname.startsWith('/videos'))
          ) {
            const targetUrl = `${base}${url.pathname}${url.search}`;
            input = new Request(targetUrl, input);
          }
        } catch (_) {}
      }
    }
    return originalFetch.call(this, input, init);
  };
}
