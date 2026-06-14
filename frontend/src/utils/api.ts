export function getApiBase(): string {
  const s = window.FWM_API_SCHEME || 'http';
  const h = window.FWM_API_HOST || 'localhost';
  const p = window.FWM_API_PORT || '10002';
  return `${s}://${h}:${p}`;
}

function shouldUseProxy(): boolean {
  const base = getApiBase();
  return base.includes('localhost:10002') || base.includes('127.0.0.1:10002');
}

async function request<T = unknown>(path: string, opts?: RequestInit): Promise<{ code: number; msg: string; data: T }> {
  let url: string;
  if (shouldUseProxy()) {
    url = path;
  } else {
    const base = getApiBase();
    url = `${base}${path}`;
  }
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    return { code: res.status, msg: res.statusText, data: null as T };
  }
  return res.json();
}

export async function apiGet<T = unknown>(path: string): Promise<{ code: number; msg: string; data: T }> {
  return request<T>(path);
}

export async function apiPost<T = unknown>(path: string, body: Record<string, string | number | boolean | null | undefined> | FormData): Promise<{ code: number; msg: string; data: T }> {
  const opts: RequestInit = { method: 'POST' };
  if (body instanceof FormData) {
    opts.body = body;
  } else {
    opts.body = new URLSearchParams(
      Object.entries(body).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value == null ? '' : String(value);
        return acc;
      }, {})
    ).toString();
  }
  return request<T>(path, opts);
}

export function fwDisplayName(): string {
  const platform = window.currentPlatform || 'linux';
  if (platform === 'macos') return 'pfctl';
  if (platform === 'windows') return 'NetSecurity';
  return 'iptables';
}
