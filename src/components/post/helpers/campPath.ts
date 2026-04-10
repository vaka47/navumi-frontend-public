// helpers/campPath.ts
export function campPathFrom(
  owner?: string,
  c?: {
    camp_number?: number | string;
    slug?: string;
    public_key?: string | number;
    key?: string | number;
    pk?: string | number;
    url?: string; // ← если API уже дал
  }
): string {
  const logEnabled = shouldLogCampPath();
  // если прислали готовую ссылку — используем её pathname
  if (c?.url) {
    const raw = String(c.url);
    try {
      const u = new URL(raw, 'https://dummy.local');
      if (u.pathname && u.pathname !== '/') {
        if (logEnabled) {
          try {
            // eslint-disable-next-line no-console
            console.log('[campPathFrom] using provided url', { owner, url: raw, pathname: u.pathname });
          } catch {}
        }
        return u.pathname;
      }
    } catch {
      if (raw.startsWith('/')) {
        if (logEnabled) {
          try {
            // eslint-disable-next-line no-console
            console.log('[campPathFrom] using raw path', { owner, url: raw });
          } catch {}
        }
        return raw;
      }
    }
  }

  if (!owner || !c) {
    if (logEnabled) {
      try {
        // eslint-disable-next-line no-console
        console.log('[campPathFrom] missing owner/context', { owner, hasContext: !!c });
      } catch {}
    }
    return '';
  }
  const ownerSan = encodeURIComponent(owner.replace(/^@+/, '').trim());

  const tailRaw =
    c.camp_number ??
    c.slug ??
    c.public_key ??
    c.key ??
    c.pk ??
    undefined;

  const tailStr = tailRaw !== undefined && tailRaw !== null ? String(tailRaw).trim() : '';
  if (!tailStr) {
    if (logEnabled) {
      try {
        // eslint-disable-next-line no-console
        console.log('[campPathFrom] missing identifier', { owner, ctx: c });
      } catch {}
    }
    return '';
  }

  const tailEnc = encodeURIComponent(tailStr);
  const result = `/${ownerSan}/camp/${tailEnc}`;
  if (logEnabled) {
    try {
      // eslint-disable-next-line no-console
      console.log('[campPathFrom] derived path', { owner, ctx: c, result });
    } catch {}
  }
  return result;
}

function shouldLogCampPath() {
  try {
    if (process.env.NODE_ENV !== 'production') return true;
    if (typeof window !== 'undefined') {
      const raw = window.localStorage?.getItem('NAVUMI_CAMP_DEBUG') || '';
      return ['1', 'true', 'on', 'yes'].includes(raw.toLowerCase());
    }
  } catch { /* noop */ }
  return false;
}
