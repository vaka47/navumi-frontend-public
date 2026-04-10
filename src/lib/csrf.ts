'use client';

const CSRF_COOKIE = 'csrftoken';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    if (decodeURIComponent(key) === name) {
      const val = eq === -1 ? '' : part.slice(eq + 1);
      try { return decodeURIComponent(val); } catch { return val; }
    }
  }
  return '';
}

function getCsrf(): string {
  return readCookie(CSRF_COOKIE);
}

export async function ensureCsrfUpToDate(apiBase: string): Promise<string> {
  let t = getCsrf();
  if (!t || t.length < 32) {
    try {
      await fetch(`${apiBase}/api/csrf/`, { credentials: 'include', cache: 'no-store' });
    } catch { /* ignore */ }
    t = getCsrf();
  }
  return t || '';
}

