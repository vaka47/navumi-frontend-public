'use client';

const PREV_KEY = 'nav.prevFull';
const PREV_PREV_KEY = 'nav.prevFullPrev';
const RETURN_PREFIX = 'nav:return:';
const PROFILE_ENTRY_PREFIX = 'nav:profileEntry:';

export const DEFAULT_BLOCKLIST = [
  /\/edit\b/i,
  /\/create-(camp|post|club|client)/i,
  /\/auth\/create/i,
];

const sanitizePath = (value: string | null) => {
  if (!value) return null;
  try {
    if (value.startsWith('/')) return value;
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'https://navumi.com');
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
};

const isBlocked = (path: string, blocklist: RegExp[]) => blocklist.some((rx) => rx.test(path));

export function getStoredBackPath(options?: { blocklist?: RegExp[] }): string | null {
  if (typeof window === 'undefined') return null;
  const blocklist = options?.blocklist ?? DEFAULT_BLOCKLIST;
  const first = sanitizePath(sessionStorage.getItem(PREV_KEY));
  if (first && !isBlocked(first, blocklist)) return first;
  const second = sanitizePath(sessionStorage.getItem(PREV_PREV_KEY));
  if (second && !isBlocked(second, blocklist)) return second;
  return null;
}

const isSameOrigin = (url: string) => {
  try {
    if (typeof window === 'undefined') return false;
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
};

type ReturnTarget = 'camp' | 'post' | 'profile' | 'search';

const returnKeyOf = (target: ReturnTarget) => `${RETURN_PREFIX}${target}`;

export function rememberReturn(target: ReturnTarget, path?: string) {
  if (typeof window === 'undefined') return;
  try {
    const full = path || (window.location.pathname + window.location.search + window.location.hash);
    sessionStorage.setItem(returnKeyOf(target), JSON.stringify({ path: full, ts: Date.now() }));
  } catch { /* noop */ }
}

export function consumeReturn(target: ReturnTarget, blocklist: RegExp[] = DEFAULT_BLOCKLIST): string | null {
  if (typeof window === 'undefined') return null;
  const key = returnKeyOf(target);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw != null) sessionStorage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string } | null;
    const path = typeof parsed?.path === 'string' ? parsed.path : null;
    if (!path || isBlocked(path, blocklist)) return null;
    return path;
  } catch {
    try { sessionStorage.removeItem(key); } catch { /* noop */ }
    return null;
  }
}

export function rememberHere(target: ReturnTarget, hash = '') {
  if (typeof window === 'undefined') return;
  try {
    const base = window.location.pathname + window.location.search;
    const path = `${base}${hash}`;
    rememberReturn(target, path);
  } catch { /* noop */ }
}

export function peekReturnPath(target: ReturnTarget, options?: { blocklist?: RegExp[] }): string | null {
  if (typeof window === 'undefined') return null;
  const blocklist = options?.blocklist ?? DEFAULT_BLOCKLIST;
  try {
    const raw = sessionStorage.getItem(returnKeyOf(target));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string } | null;
    const path = typeof parsed?.path === 'string' ? sanitizePath(parsed.path) : null;
    if (!path || isBlocked(path, blocklist)) return null;
    return path;
  } catch {
    return null;
  }
}

export function navigateBack(router: { replace: (href: string) => void; back?: () => void }, options?: { fallback?: string; blocklist?: RegExp[] }) {
  const target = getStoredBackPath(options);
  if (target) {
    router.replace(target);
    return;
  }
  try {
    if (typeof window !== 'undefined') {
      const ref = document.referrer;
      if (ref && isSameOrigin(ref) && window.history.length > 1) {
        window.history.back();
        return;
      }
    }
  } catch { /* noop */ }
  const fallback = options?.fallback ?? '/search';
  try {
    router.replace(fallback);
  } catch {
    if (typeof window !== 'undefined') window.location.assign(fallback);
  }
}

const profileEntryKey = (username: string) => `${PROFILE_ENTRY_PREFIX}${(username || '').toLowerCase()}`;

const extractUsernameFromPath = (path: string | null) => {
  if (!path) return null;
  const cleaned = path.split('#')[0]?.split('?')[0] ?? '';
  const parts = cleaned.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === 'm') return (parts[1] || '').toLowerCase() || null;
  return (parts[0] || '').toLowerCase() || null;
};

const readProfileEntry = (username: string) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(profileEntryKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string | null } | null;
    const path = typeof parsed?.path === 'string' ? sanitizePath(parsed.path) : null;
    if (!path) {
      sessionStorage.removeItem(profileEntryKey(username));
      return null;
    }
    return { path };
  } catch {
    try { sessionStorage.removeItem(profileEntryKey(username)); } catch { /* noop */ }
    return null;
  }
};

const sameProfilePath = (path: string | null, username: string) => {
  const target = (username || '').toLowerCase();
  if (!target) return false;
  const via = extractUsernameFromPath(path);
  return !!via && via === target;
};

const sameOriginReferrer = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const ref = document.referrer;
  if (!ref) return null;
  try {
    const url = new URL(ref);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
};

const pickEntrySource = (explicit?: string | null) => {
  const candidates = [explicit, (() => {
    try { return sessionStorage.getItem(PREV_KEY); } catch { return null; }
  })(), sameOriginReferrer()];
  for (const cand of candidates) {
    const sanitized = sanitizePath(cand ?? null);
    if (sanitized) return sanitized;
  }
  return null;
};

export function rememberProfileEntry(username: string, sourcePath?: string | null): string | null {
  if (typeof window === 'undefined') return null;
  const key = profileEntryKey(username);
  const current = window.location.pathname + window.location.search + window.location.hash;
  const resolved = pickEntrySource(sourcePath);
  if (!resolved || resolved === current) {
    try { sessionStorage.removeItem(key); } catch { /* noop */ }
    return null;
  }
  const existing = readProfileEntry(username);
  if (sameProfilePath(resolved, username) && existing?.path) {
    return existing.path;
  }
  try {
    sessionStorage.setItem(key, JSON.stringify({ path: resolved, ts: Date.now() }));
  } catch { /* noop */ }
  return resolved;
}

export function getProfileEntryPath(username: string): string | null {
  return readProfileEntry(username)?.path ?? null;
}

export function clearProfileEntry(username: string) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(profileEntryKey(username)); } catch { /* noop */ }
}
