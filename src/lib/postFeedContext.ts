'use client';

type PostFeedSourceKind = 'search_photos' | 'profile_posts' | 'camp_marks' | 'profile_marks';

type SearchPostFeedSource = { source: 'search_photos'; qs: string; ids?: number[] };
type ProfilePostsFeedSource = { source: 'profile_posts'; username: string };
type ProfileMarksFeedSource = { source: 'profile_marks'; username: string };
type CampMarksFeedSource = { source: 'camp_marks'; campId: number };

export type PostFeedSource =
  | SearchPostFeedSource
  | ProfilePostsFeedSource
  | CampMarksFeedSource
  | ProfileMarksFeedSource;

export type PostFeedContext = PostFeedSource & { postId: number | string };

type StoredPostFeedContext = {
  source: PostFeedSourceKind;
  postId: string | number;
  qs?: string;
  username?: string;
  campId?: number;
  ids?: number[];
  savedAt: number;
};

const STORAGE_KEY = 'navumi:postFeedContext';
const TTL_MS = 1000 * 60 * 10; // 10 минут достаточно, чтобы не держать старые состояния

const isBrowser = () => typeof window !== 'undefined';
const asId = (value: number | string) => String(value);

const sanitizeIds = (value: unknown, limit = 60): number[] | undefined => {
  if (!Array.isArray(value) || !value.length) return undefined;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
    const n = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Number(raw) : Number.NaN);
    if (!Number.isFinite(n)) continue;
    if (seen.has(n)) continue;
    out.push(n);
    seen.add(n);
    if (out.length >= limit) break;
  }
  return out.length ? out : undefined;
};

const isValidSource = (value: unknown): value is PostFeedSourceKind =>
  value === 'search_photos' || value === 'profile_posts' || value === 'camp_marks' || value === 'profile_marks';

export function clearPostFeedContext() {
  if (!isBrowser()) return;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function setPostFeedContext(context: PostFeedContext) {
  if (!isBrowser()) return;
  try {
    const payload: StoredPostFeedContext = {
      source: context.source,
      postId: asId(context.postId),
      savedAt: Date.now(),
    };
    if (context.source === 'search_photos') {
      payload.qs = context.qs;
      const cachedIds = sanitizeIds(context.ids, 100);
      if (cachedIds) payload.ids = cachedIds;
    }
    if (context.source === 'profile_posts') payload.username = context.username;
    if (context.source === 'profile_marks') payload.username = context.username;
    if (context.source === 'camp_marks') payload.campId = context.campId;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* noop */ }
}

export function setPostFeedSource(postId: number | string, source: PostFeedSource) {
  setPostFeedContext({ ...source, postId });
}

function reviveContext(raw: StoredPostFeedContext | null): PostFeedContext | null {
  if (!raw || !isValidSource(raw.source)) return null;
  const postId = asId(raw.postId);
  switch (raw.source) {
    case 'search_photos':
      if (typeof raw.qs !== 'string') return null;
      {
        const ids = sanitizeIds(raw.ids, 100);
        if (!ids || !ids.length) return null;
        return { source: 'search_photos', qs: raw.qs, postId, ids };
      }
    case 'profile_posts':
      if (typeof raw.username !== 'string' || !raw.username) return null;
      return { source: 'profile_posts', username: raw.username, postId };
    case 'profile_marks':
      if (typeof raw.username !== 'string' || !raw.username) return null;
      return { source: 'profile_marks', username: raw.username, postId };
    case 'camp_marks':
      if (typeof raw.campId !== 'number' || !Number.isFinite(raw.campId)) return null;
      return { source: 'camp_marks', campId: raw.campId, postId };
    default:
      return null;
  }
}

export function readPostFeedContext(expectedPostId?: string | number): PostFeedContext | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPostFeedContext | null;
    const parsed = reviveContext(stored);
    if (!parsed) {
      clearPostFeedContext();
      return null;
    }
    const savedAt = typeof stored?.savedAt === 'number' ? stored.savedAt : null;
    if (!savedAt || Date.now() - savedAt > TTL_MS) {
      clearPostFeedContext();
      return null;
    }
    if (expectedPostId != null && asId(parsed.postId) !== asId(expectedPostId)) {
      return null;
    }
    return parsed;
  } catch {
    clearPostFeedContext();
    return null;
  }
}
