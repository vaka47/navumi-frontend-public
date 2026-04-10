export type PostEntryOriginType = 'camp_marks';

type PostEntryPersisted = {
  origin: PostEntryOriginType;
  returnPath?: string | null;
  campBackPath?: string | null;
};

const STORAGE_KEY = 'post:entryOrigin';

export function rememberPostEntryOrigin(
  origin: PostEntryOriginType,
  returnPath?: string | null,
  campBackPath?: string | null,
) {
  if (typeof window === 'undefined') return;
  try {
    const payload: PostEntryPersisted = {
      origin,
      returnPath: returnPath ?? null,
      campBackPath: campBackPath ?? null,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

export function consumePostEntryOrigin(): PostEntryPersisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as PostEntryPersisted | null;
    if (!parsed || parsed.origin !== 'camp_marks') return null;
    return {
      origin: 'camp_marks',
      returnPath: typeof parsed.returnPath === 'string' ? parsed.returnPath : null,
      campBackPath: typeof parsed.campBackPath === 'string' ? parsed.campBackPath : null,
    };
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    return null;
  }
}
