const BASE = '/api';

let accessToken = localStorage.getItem('m10_token') || null;
let refreshToken = localStorage.getItem('m10_refresh') || null;
let onAuthFail = null;

export function setTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('m10_token', access);
  else localStorage.removeItem('m10_token');
  if (refresh) localStorage.setItem('m10_refresh', refresh);
  else localStorage.removeItem('m10_refresh');
}

export function getAccessToken() { return accessToken; }
export function onAuthFailure(cb) { onAuthFail = cb; }

async function refreshAccessToken() {
  if (!refreshToken) throw new Error('No refresh token');
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Refresh failed');
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function api(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...opts.headers };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  let res = await fetch(url, { ...opts, headers });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...opts, headers });
    } catch {
      setTokens(null, null);
      onAuthFail?.();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, data: err });
  }

  if (res.status === 204) return null;
  return res.json();
}
