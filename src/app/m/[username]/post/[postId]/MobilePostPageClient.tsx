'use client';

import React from 'react';
import SmartImage from '@/components/SmartImage';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import PostActionSheet from '@/components/post/mobile/PostActionSheet';
import PostTextInline from '@/components/post/mobile/PostTextInline';
import PostTagsRow from '@/components/post/mobile/PostTagsRow';
import ReportModal from '@/components/common/ReportModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import SwipeCarousel from '@/components/ui/SwipeCarousel';
import { type TaggedProfile } from '@/components/post/mobile/TaggedProfilesOverlay';
import { useAuth } from '@/context/AuthContext';
import { consumeReturn, navigateBack, rememberReturn } from '@/lib/navBack';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { readPostFeedContext, setPostFeedContext, type PostFeedContext } from '@/lib/postFeedContext';
import { consumePostEntryOrigin } from '@/lib/postEntryOrigin';
import { buildPhotoSearchUrl, normalizePhotoSearchUrlFromServer } from '@/lib/photoSearchParams';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { acquireHideHeader, releaseHideHeader } from '@/lib/headerVisibility';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useProfileOverlay } from '@/hooks/useProfileOverlay';
import { useCommentsModal } from '@/hooks/useCommentsModal';
import { useLikersModal } from '@/hooks/useLikersModal';
import { useTaggedProfilesModal } from '@/hooks/useTaggedProfilesModal';
import { useCreatePostProfileOverlay } from '@/hooks/useCreatePostProfileOverlay';
import { useCampOverlay } from '@/hooks/useCampOverlay';
import { useLayerStack } from '@/context/LayerStackContext';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
//import { CollapsibleText } from '@/components/comments/shared';
import { getBrowserApiBase } from '@/lib/apiBase';

type Author = { username: string; avatar_url?: string | null } | null;
type ProfileMini = { id: number; username: string; avatar_url?: string | null };

const dbg = (...args: unknown[]) => {
  try { if (typeof window !== 'undefined') console.log('[PostMobilePreview]', ...args); } catch { }
};



type RootComment = {
  id: number;
  author: { username: string; avatar_url?: string | null } | null;
  text: string;
  likes_count: number;
  created_at: string;
  parent_id?: number | null;
  is_root?: boolean;
};



function pickStr(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

const STRIP_TAGS_RE = /<[^>]*>/g;
// Декодер HTML-сущностей + агрессивная нормализация пробелов/невидимых символов (Safari safe)
const decodeEntities = (() => {
  let textarea: HTMLTextAreaElement | null = null;
  return (s: string) => {
    if (typeof window === 'undefined') return s;
    if (!textarea) textarea = document.createElement('textarea');
    textarea.innerHTML = s;
    const t = textarea.value;
    textarea.innerHTML = '';
    return t;
  };
})();
const stripHtml = (s: string) =>
  decodeEntities(s)
    .replace(STRIP_TAGS_RE, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')                // неразрывный пробел -> обычный
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // zero-width chars
    .replace(/\s+/g, ' ')
    .trim();

// — Debug summary без `any`, чтобы не падал линт —
type DebugSummary = {
  id?: number | string;
  keys: string[];
  text?: string;
  content?: string;
  body?: string;
  alt?: string;
};
const summarizeDebug = (x: unknown): DebugSummary => {
  if (!x || typeof x !== 'object') return { keys: [] };
  const o = x as Record<string, unknown>;
  const pick = (k: string): string | undefined =>
    typeof o[k] === 'string' ? (o[k] as string) : undefined;
  const idVal = o['id'];
  const id =
    typeof idVal === 'number' || typeof idVal === 'string' ? idVal : undefined;
  return {
    id,
    keys: Object.keys(o),
    text: pick('text'),
    content: pick('content'),
    body: pick('body'),
    alt: pick('comment') ?? pick('message') ?? pick('value') ?? pick('content_text'),
  };
};

/** Универсальная нормализация текста комментария */
function getCommentText(a: ApiCommentLoose): string {
  const fromKnown = (a as Record<string, unknown>)?.text
    ?? (a as Record<string, unknown>)?.content
    ?? (a as Record<string, unknown>)?.body
    ?? null;
  if (typeof fromKnown === 'string') return stripHtml(fromKnown);
  if (typeof fromKnown === 'number' || typeof fromKnown === 'boolean') return String(fromKnown);
  if (Array.isArray(fromKnown)) return stripHtml(fromKnown.join(' '));
  // возможные альтернативные поля на других эндпоинтах
  const alt =
    pickStr(a, 'comment') ??
    pickStr(a, 'message') ??
    pickStr(a, 'value') ??
    pickStr(a, 'content_text') ??
    pickStr(a, 'text_plain') ??
    pickStr(a, 'text_html') ??
    pickStr(a, 'content_html') ??
    pickStr(a, 'html') ??
    pickStr(a, 'text_plain') ??
    pickStr(a, 'plaintext') ??
    pickStr(a, 'rendered') ??
    pickStr(a, 'rendered_text') ??
    pickStr(a, 'markdown') ??
    pickStr(a, 'md') ??
    pickStr(a, 'raw') ??
    pickStr(a, 'body_text') ??
    pickStr(a, 'body_html') ?? '';
  if (alt) return stripHtml(alt);
  // 2) эвристика: возьмём «первую адекватную строку» из объекта
  if (a && typeof a === 'object') {
    for (const [k, v] of Object.entries(a)) {
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (Array.isArray(v)) {
        const j = v.filter(x => typeof x === 'string').join(' ');
        if (j) return stripHtml(j);
        continue;
      }
      if (typeof v !== 'string') continue;
      const key = k.toLowerCase();
      if (/^(id|author|owner|username|avatar|created|timestamp|likes?|parent|reply|can_|is_|deleted)/.test(key)) continue;
      const cleaned = stripHtml(v);
      if (cleaned) return cleaned;
    }
  }
  return '';
}


type ApiComment = {
  id?: number | string;
  author?: { username?: string; avatar_url?: string | null } | null;
  author_username?: string;
  text?: string;
  content?: string;
  body?: string;
  likes_count?: number;
  like_count?: number;
  likes?: number;
  created_at?: string;
  created?: string;
  timestamp?: string;
  parent_id?: number | null;
  parent?: number | null;
  is_root?: boolean;
  is_deleted?: boolean | null;
};

type ApiCommentLoose = ApiComment & {
  author?: string | { username?: string; avatar_url?: string | null } | null;
  owner?: string;
  author_avatar_url?: string | null;
  root_id?: number | null;
  reply_to?: number | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function isApiCommentArray(v: unknown): v is ApiComment[] {
  return Array.isArray(v);
}
function hasResultsArray(v: unknown): v is { results: ApiComment[] } {
  return isRecord(v) && Array.isArray((v as Record<string, unknown>).results);
}

function hasCommentsArray(v: unknown): v is { comments: ApiComment[] } {
  return isRecord(v) && Array.isArray((v as Record<string, unknown>).comments);
}

const numFrom = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const pickNum = (o: Record<string, unknown> | null | undefined, keys: readonly string[]): number | null => {
  if (!o) return null;
  for (const k of keys) {
    const cand = numFrom(o[k]);
    if (cand != null) return cand;
  }
  return null;
};

const extractTotalFromRoot = (root: Record<string, unknown>): number | null => {
  // пробуем все популярные поля тоталов
  return (
    pickNum(root, ['total_comments', 'comments_total', 'comments_count', 'comments', 'total', 'count'] as const) ?? null
  );
};

const countFromArrayPossiblyNested = (arr: unknown): number | null => {
  if (!Array.isArray(arr)) return null;
  // Если бэкенд возвращает плоский список (включая ответы) — просто длина
  let flat = arr.length;
  // Если структура корневая с вложенными ответами, считаем replies/replies_count
  for (const it of arr) {
    if (isRecord(it)) {
      const replies = (it as Record<string, unknown>)['replies'];
      if (Array.isArray(replies)) flat += replies.length;
      const rc = numFrom((it as Record<string, unknown>)['replies_count']);
      if (rc && !Array.isArray(replies)) flat += rc;
    }
  }
  return flat;
};

const commentTotalsPreferredKeys = [
  'total_comments',
  'comments_total',
  'total_comments_with_replies',
  'total_comments_including_replies',
  'comments_with_replies',
  'comments_all',
  'comments_sum',
  'comments_total_count',
] as const;

const commentTotalsNestedKeys = ['stats', 'engagement', 'meta', 'counters'] as const;
const commentCollectionsKeys = ['comments', 'comments_preview', 'latest_comments', 'comment_list', 'root_comments'] as const;
const commentPostLikeKeys = ['post', 'entry', 'item'] as const;

const extractCommentTotalPreferReplies = (rec: Record<string, unknown> | null | undefined): number | null => {
  if (!rec) return null;
  const readFrom = (source: Record<string, unknown> | null | undefined): number | null => {
    if (!source) return null;
    for (const key of commentTotalsPreferredKeys) {
      const cand = numFrom(source[key]);
      if (cand != null) return cand;
    }
    return null;
  };
  const direct = readFrom(rec);
  if (direct != null) return direct;
  for (const nestedKey of commentTotalsNestedKeys) {
    const nested = rec[nestedKey];
    if (isRecord(nested)) {
      const val = readFrom(nested);
      if (val != null) return val;
    }
  }
  for (const arrayKey of commentCollectionsKeys) {
    const arr = rec[arrayKey];
    const total = countFromArrayPossiblyNested(arr);
    if (total != null) return total;
  }
  for (const postKey of commentPostLikeKeys) {
    const nested = rec[postKey];
    if (isRecord(nested)) {
      const val = extractCommentTotalPreferReplies(nested as Record<string, unknown>);
      if (val != null) return val;
    }
  }
  return null;
};

const totalCommentsFromPost = (post?: PostFull | null): number | null => {
  if (!post) return null;
  return extractCommentTotalPreferReplies(post as unknown as Record<string, unknown>);
};

const fetchCommentsTotalStrict = async (apiBase: string, id: number | string, signal?: AbortSignal): Promise<number | null> => {
  if (!apiBase || id == null) return null;
  const fetchOnce = async (url: string) =>
    (await tryFetchJsonWithApiToggle(url, 'include', signal, 'comments-total')) ??
    (await tryFetchJsonWithApiToggle(url, 'omit', signal, 'comments-total'));

  const tryFromEngagement = async () => {
    const data = await fetchOnce(apiJoin(apiBase, `api/posts/${id}/engagement/`));
    if (data && typeof data === 'object') {
      const root = data as Record<string, unknown>;
      const postField = root['post'];
      const total =
        extractCommentTotalPreferReplies(root) ||
        (isRecord(postField) ? extractCommentTotalPreferReplies(postField as Record<string, unknown>) : null);
      if (total != null) return total;
    }
    return null;
  };

  const tryFromList = async (perPage: number) => {
    const data = await fetchOnce(apiJoin(apiBase, `api/posts/${id}/comments/list/?with_replies=1&per_page=${perPage}`));
    if (data && typeof data === 'object') {
      const root = data as Record<string, unknown>;
      const meta = extractCommentTotalPreferReplies(root);
      if (meta != null) return meta;
      if (hasResultsArray(root)) {
        const cnt = countFromArrayPossiblyNested(root.results);
        if (cnt != null) return cnt;
      }
      if (hasCommentsArray(root)) {
        const cnt = countFromArrayPossiblyNested(root.comments);
        if (cnt != null) return cnt;
      }
    }
    return null;
  };

  return (await tryFromEngagement()) ?? (await tryFromList(1)) ?? (await tryFromList(300));
};

const tryFetchJson = async (url: string, creds: RequestCredentials, signal?: AbortSignal): Promise<unknown | null> => {
  try {
    const r = await fetch(url, { credentials: creds, cache: 'no-store', headers: { Accept: 'application/json' }, signal });
    const ct = r.headers.get('content-type') || '';
    feedLog('tryFetchJson response', { url, creds, status: r.status, ok: r.ok, ct });
    if (!r.ok) {
      try { console.warn('[MobilePostFeed] http not ok', { url, status: r.status }); } catch { /* noop */ }
      return null;
    }
    if (!ct.includes('application/json')) {
      try { console.warn('[MobilePostFeed] unexpected content-type', { url, ct }); } catch { /* noop */ }
      return null;
    }
    return (await r.json()) as unknown;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const name = (e && typeof e === 'object' && 'name' in e) ? (e as { name?: string }).name : undefined;
    feedLog('tryFetchJson error', { url, creds, name, msg });
    // AbortError — тихо, остальные — предупреждение
    if (name !== 'AbortError') {
      try { console.warn('[MobilePostFeed] fetch failed', { url, error: msg }); } catch { /* noop */ }
    }
    return null;
  }
};

function normalizeAuthor(c: ApiCommentLoose): { username: string; avatar_url?: string | null } | null {
  const a = c;
  const uname =
    (typeof a.author === 'object' && a.author?.username) ||
    (typeof a.author === 'string' && a.author) ||
    a.author_username ||
    a.owner ||
    '';
  if (!uname) return null;
  const avatar =
    (typeof a.author === 'object' && a.author ? (a.author.avatar_url ?? null) : null) ??
    (typeof a.author_avatar_url === 'string' ? a.author_avatar_url : null) ??
    null;
  return { username: uname, avatar_url: avatar };
}

export type PostFull = {
  id: number;
  author: Author;
  text?: string | null;
  images?: string[];
  created_at?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  camp_latitude?: number | null;
  camp_longitude?: number | null;
  location_search_url?: string | null;
  likes_count?: number;
  liked?: boolean;
  comments_count?: number;
  camp_id?: number | null;
  camp_title?: string | null;
  camp_slug?: string | null;
  camp_owner_username?: string | null;
  camp_public_key?: string | null;
  camp_url?: string | null;
  profiles_count?: number | null;
  profiles?: ProfileMini[];
  camp_starts_at?: string | null;
  camp_ends_at?: string | null;
  activities?: Array<{ id: number; name?: string } | string | number> | null;
  hashtags?: Array<{ id: number; name?: string } | string | number> | null;
};

type MobilePostPageClientProps = {
  username: string;
  postId: string;
  initialPost?: PostFull | null;
};

const dateOnly = (s?: string | null, locale = 'ru-RU') => (s ? new Date(s).toLocaleDateString(locale) : '');

const time = (s?: string | null): number => {
  if (!s) return 0;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const norm = s
    .replace(/(\.\d{3})\d+/, '$1') // .123456 -> .123
    .replace(/\+00:00$/, 'Z');     // UTC tz normalize
  const t2 = Date.parse(norm);
  return Number.isNaN(t2) ? 0 : t2;
};

function formatCampRange(start?: string | null, end?: string | null) {
  if (!start && !end) return '';
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  const fmtDM = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
  const fmtD = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dm = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  if (s && e) {
    const sameDay = s.toDateString() === e.toDateString();
    const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
    if (sameDay) return fmtDM.format(s);
    if (sameMonth) return `${fmtD.format(s)}–${fmtDM.format(e)}`;
    return `${dm(s)} - ${dm(e)}`;
  }
  if (s && !e) return 'с ' + fmtDM.format(s);
  if (!s && e) return 'до ' + fmtDM.format(e);
  return '';
}

const cap99 = (n?: number | null) =>
  (typeof n === 'number' && Number.isFinite(n) ? (n >= 100 ? '99+' : String(n)) : '0');

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Простые иконки как в CampMobileInfo
function IconHeart({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s-6.716-4.35-9.333-7.2C.778 11.87 1.2 8.8 3.6 7.2 6 5.6 8.4 6.4 12 9.2c3.6-2.8 6-3.6 8.4-2 2.4 1.6 2.822 4.67.933 6.6C18.716 16.65 12 21 12 21z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M20.84 4.61c-1.54-1.28-3.77-1.28-5.31 0L12 7.09 8.47 4.61c-1.54-1.28-3.77-1.28-5.31 0-1.73 1.44-1.9 4.02-.39 5.64C5.12 13 12 19 12 19s6.88-6 9.23-8.75c1.51-1.62 1.34-4.2-.39-5.64z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconComment() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M21 12a8 8 0 1 1-3.3-6.5L21 6v6z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="15" cy="11.5" r="0.8" fill="currentColor" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

// --- helpers для токенов активностей/хэштегов ---
type IdName = { id: number; name: string };
const needsLookup = (arr: unknown): boolean =>
  Array.isArray(arr) &&
  arr.some((it) => {
    if (typeof it === 'number') return true;
    if (typeof it === 'object' && it !== null) {
      const rec = it as Record<string, unknown>;
      const hasId = typeof rec.id === 'number';
      const hasNm = typeof rec.name === 'string' && rec.name.trim() !== '';
      return hasId && !hasNm;
    }
    return false;
  });
// name normalization now handled in-place where needed

const MAX_FEED_POSTS = 10;

const recordArrayFrom = (root: unknown): Record<string, unknown>[] => {
  // 1) Прямо массив
  if (Array.isArray(root)) return root.filter(isRecord) as Record<string, unknown>[];
  if (!isRecord(root)) return [];

  const container = root as Record<string, unknown>;
  // Ключи, под которыми может лежать список постов
  const keys = ['results', 'posts', 'items', 'entries', 'photoposts', 'photo_posts', 'photos', 'list', 'payload'] as const;

  // 2) Первый уровень
  for (const key of [...keys, 'data'] as const) {
    const val = (container as Record<string, unknown>)[key as keyof typeof container];
    if (Array.isArray(val)) {
      const out = (val as unknown[]).filter(isRecord) as Record<string, unknown>[];
      feedLog('recordArrayFrom match', { level: 'root', key, count: out.length });
      return out;
    }
    // 3) Второй уровень под data.* (и похожими контейнерами)
    if (key === 'data' && val && isRecord(val)) {
      const dataObj = val as Record<string, unknown>;
      for (const nestedKey of keys) {
        const nestedVal = dataObj[nestedKey];
        if (Array.isArray(nestedVal)) {
          const out = (nestedVal as unknown[]).filter(isRecord) as Record<string, unknown>[];
          feedLog('recordArrayFrom match', { level: 'data', key: `data.${nestedKey}`, count: out.length });
          return out;
        }
      }
      // Иногда бывает data: { payload: [...] } или data: { data: { results: [...] } }
      const maybePayload = dataObj['payload'];
      if (Array.isArray(maybePayload)) {
        const out = (maybePayload as unknown[]).filter(isRecord) as Record<string, unknown>[];
        feedLog('recordArrayFrom match', { level: 'data', key: `data.payload`, count: out.length });
        return out;
      }
      // Иногда бывает data: { data: { results: [...] } }
      const maybeDataData = dataObj['data'];
      if (maybeDataData && isRecord(maybeDataData)) {
        const dd = maybeDataData as Record<string, unknown>;
        for (const nestedKey of keys) {
          const nestedVal = dd[nestedKey];
          if (Array.isArray(nestedVal)) {
            const out = (nestedVal as unknown[]).filter(isRecord) as Record<string, unknown>[];
            feedLog('recordArrayFrom match', { level: 'data.data', key: `data.data.${nestedKey}`, count: out.length });
            return out;
          }
        }
      }
    }
  }

  // 4) Поиск по всем полям первого уровня: берём первую подходящую коллекцию записей
  for (const [k, v] of Object.entries(container)) {
    if (Array.isArray(v) && v.length && v.every((x) => isRecord(x))) {
      const out = (v as unknown[]).filter(isRecord) as Record<string, unknown>[];
      feedLog('recordArrayFrom fallback-any-array', { key: k, count: out.length });
      return out;
    }
  }

  // 5) Глубокий поиск по объекту: первая коллекция записей (без жёсткого ограничения глубины)
  try {
    type Node = { value: unknown; path: string; depth: number };
    const queue: Node[] = [{ value: container, path: 'root', depth: 0 }];
    const seen = new Set<unknown>([container]);
    const MAX_NODES = 800;
    let processed = 0;
    const toRecordArray = (val: unknown): Record<string, unknown>[] | null => {
      if (!Array.isArray(val) || !val.length) return null;
      const out = (val as unknown[]).filter(isRecord) as Record<string, unknown>[];
      return out.length ? out : null;
    };
    while (queue.length && processed < MAX_NODES) {
      const { value, path, depth } = queue.shift()!;
      processed += 1;
      if (Array.isArray(value)) {
        const out = toRecordArray(value);
        if (out) {
          feedLog('recordArrayFrom deep-match', { path, count: out.length, depth });
          return out;
        }
        continue;
      }
      if (!isRecord(value)) continue;
      const obj = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        const nextPath = path === 'root' ? k : `${path}.${k}`;
        const asArray = toRecordArray(v);
        if (asArray) {
          feedLog('recordArrayFrom deep-match', { path: nextPath, count: asArray.length, depth: depth + 1 });
          return asArray;
        }
        if (isRecord(v) && !seen.has(v)) {
          seen.add(v);
          queue.push({ value: v, path: nextPath, depth: depth + 1 });
        }
      }
    }
    if (processed >= MAX_NODES) {
      feedLog('recordArrayFrom deep-limit-hit', { processed: MAX_NODES });
    }
  } catch { /* noop */ }

  // 6) Не нашли — логируем форму ответа (ключи и типы), чтобы понять структуру
  try {
    const shape = Object.fromEntries(
      Object.entries(container).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : typeof v])
    );
    feedLog('recordArrayFrom empty', { keys: Object.keys(container), shape });
  } catch { /* noop */ }
  return [];
};

const hasImageLikeValue = (value: unknown): boolean => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (isRecord(value)) {
    const rec = value as Record<string, unknown>;
    const candidate = rec['url'] ?? rec['image'] ?? rec['src'] ?? rec['thumb'];
    return typeof candidate === 'string' && candidate.trim().length > 0;
  }
  return false;
};

const recordHasImages = (rec: Record<string, unknown>): boolean => {
  const hasImagesInObject = (obj: Record<string, unknown>): boolean => {
    const fields = ['images', 'photos', 'media', 'attachments'] as const;
    for (const key of fields) {
      const val = obj[key];
      if (Array.isArray(val) && val.some(hasImageLikeValue)) return true;
      if (!Array.isArray(val) && hasImageLikeValue(val)) return true;
    }
    const single =
      obj['image'] ??
      obj['photo'] ??
      obj['thumbnail'] ??
      obj['thumbnail_url'] ??
      obj['first_image_url'] ??
      obj['first_image'] ??
      obj['cover'] ??
      obj['preview'] ??
      obj['picture'] ??
      obj['thumb_url'];
    return hasImageLikeValue(single);
  };

  if (hasImagesInObject(rec)) return true;
  const nestedPost = rec['post'];
  if (isRecord(nestedPost) && hasImagesInObject(nestedPost as Record<string, unknown>)) return true;
  return false;
};

const extractPostId = (rec: Record<string, unknown>): number | null => {
  const direct = pickNum(rec, ['post_id', 'postId', 'post', 'id', 'pk', 'object_id', 'post_pk'] as const);
  if (direct != null) return direct;
  const nested = rec['post'];
  if (isRecord(nested)) return pickNum(nested as Record<string, unknown>, ['id', 'post_id', 'pk', 'object_id', 'post_pk'] as const);
  // Пытаемся вытащить id из URL-подобных полей
  const urlishKeys = ['url', 'post_url', 'detail_url', 'absolute_url', 'share_url', 'href', 'permalink', 'path', 'link'] as const;
  const parseFromUrl = (s: unknown): number | null => {
    if (typeof s !== 'string' || !s) return null;
    const str = s.trim();
    // популярные варианты путей: /<user>/post/123 или /post/123 или /posts/123
    const patterns = [
      /\bpost\/(\d+)(?:\D|$)/i,
      /\bposts\/(\d+)(?:\D|$)/i,
      /\b\/p\/(\d+)(?:\D|$)/i,
    ];
    for (const re of patterns) {
      const m = str.match(re);
      if (m && m[1]) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };
  for (const k of urlishKeys) {
    const n = parseFromUrl(rec[k]);
    if (n != null) return n;
  }
  // иногда бывает вложено под links: { detail: "/u/post/123" }
  const links = rec['links'];
  if (isRecord(links)) {
    for (const v of Object.values(links)) {
      const n = parseFromUrl(v);
      if (n != null) return n;
    }
  }
  return null;
};

const apiJoin = (base: string, path: string) => {
  if (!base) return path;
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  // Без эвристик: всегда просто склеиваем base + path.
  // Прокси сам корректно перепишет https://api.navumi.com → /api/navumi/...
  return `${normalizedBase}/${normalizedPath}`;
};

// --- API path toggle helpers (handle proxy rewriting issues) ---
const isOnNavumiDomain = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname || '';
    // e.g. www.navumi.com, m.navumi.com — but not api.navumi.com
    return /\.navumi\.com$/.test(h) && h !== 'api.navumi.com';
  } catch { return false; }
};

const canToggleApiSegment = (url: string): boolean => {
  // Absolute to api.navumi.com or proxied path /api/navumi/...
  return /^(https?:\/\/api\.navumi\.com\b|\/api\/navumi\b)/.test(url);
};

const toggleApiInPath = (path: string): string => {
  // Works for absolute pathnames ("/api/navumi/..." or "/...")
  const applyToggle = (pfx: string, rest: string) => {
    const hasApi = rest.startsWith('api/');
    const restToggled = hasApi ? rest.replace(/^api\//, '') : `api/${rest}`;
    // Avoid double slashes
    return `${pfx}${restToggled}`.replace(/\/+$/, '/');
  };
  if (path.startsWith('/api/navumi/')) {
    const prefix = '/api/navumi/';
    const rest = path.slice(prefix.length);
    return applyToggle(prefix, rest);
  }
  // Generic absolute path
  if (path.startsWith('/')) {
    const rest = path.slice(1);
    const hasApi = rest.startsWith('api/');
    const restToggled = hasApi ? rest.replace(/^api\//, '') : `api/${rest}`;
    return `/${restToggled}`.replace(/\/+$/, '/');
  }
  // Fallback: relative (with or without query) — toggle at start
  const qIdx = path.indexOf('?');
  const hashIdx = path.indexOf('#');
  const cut = (idx: number) => (idx >= 0 ? idx : path.length);
  const stop = Math.min(cut(qIdx), cut(hashIdx));
  const base = path.slice(0, stop);
  const tail = path.slice(stop);
  const hasApi = base.replace(/^\/+/, '').startsWith('api/');
  const baseNorm = base.replace(/^\/+/, '');
  const toggled = hasApi ? baseNorm.replace(/^api\//, '') : `api/${baseNorm}`;
  return `/${toggled}${tail}`;
};

const toggleApiSegmentInUrl = (rawUrl: string): string => {
  try {
    if (/^https?:\/\//i.test(rawUrl)) {
      const u = new URL(rawUrl);
      u.pathname = toggleApiInPath(u.pathname);
      return u.toString();
    }
  } catch { /* noop */ }
  // likely a relative path
  // Preserve query/hash when present
  const idxQ = rawUrl.indexOf('?');
  const idxH = rawUrl.indexOf('#');
  const cut = (idx: number) => (idx >= 0 ? idx : rawUrl.length);
  const stop = Math.min(cut(idxQ), cut(idxH));
  const path = rawUrl.slice(0, stop);
  const tail = rawUrl.slice(stop);
  const toggledPath = toggleApiInPath(path);
  return `${toggledPath}${tail}`;
};

const tryFetchJsonWithApiToggle = async (
  url: string,
  creds: RequestCredentials,
  signal?: AbortSignal,
  ctx?: string,
): Promise<unknown | null> => {
  // First attempt
  try {
    const r1 = await fetch(url, { credentials: creds, cache: 'no-store', headers: { Accept: 'application/json' }, signal });
    const ct1 = r1.headers.get('content-type') || '';
    feedLog('tryFetchJsonWithApiToggle response', { url, creds, status: r1.status, ok: r1.ok, ct: ct1, ctx });
    if (r1.ok && ct1.includes('application/json')) {
      return (await r1.json()) as unknown;
    }
    // Toggle also when content-type is not JSON (proxy served HTML) or 404
    if ((r1.status === 404 || !ct1.includes('application/json')) && (isOnNavumiDomain() || canToggleApiSegment(url))) {
      const toggled = toggleApiSegmentInUrl(url);
      if (toggled !== url) {
        feedLog('api-segment toggle retry', { from: url, to: toggled, ctx });
        const r2 = await fetch(toggled, { credentials: creds, cache: 'no-store', headers: { Accept: 'application/json' }, signal });
        const ct2 = r2.headers.get('content-type') || '';
        feedLog('api-segment toggle response', { to: toggled, status: r2.status, ok: r2.ok, ct: ct2, ctx });
        if (r2.ok && ct2.includes('application/json')) {
          return (await r2.json()) as unknown;
        }
      }
    }
    try { console.warn('[MobilePostFeed] http not ok', { url, status: r1.status }); } catch { /* noop */ }
    return null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const name = (e && typeof e === 'object' && 'name' in e) ? (e as { name?: string }).name : undefined;
    feedLog('tryFetchJsonWithApiToggle error', { url, creds, name, msg, ctx });
    if (name !== 'AbortError') {
      try { console.warn('[MobilePostFeed] fetch failed', { url, error: msg }); } catch { /* noop */ }
    }
    return null;
  }
};

const buildSearchPhotosUrl = (apiBase: string, qs: string) => {
  const trimmed = (qs || '').replace(/^\?/, '').trim();
  const basePath = apiJoin(apiBase, 'api/search/photoposts/');
  const out = trimmed ? `${basePath}?${trimmed}` : basePath;
  feedLog('buildSearchPhotosUrl', { out, qs: trimmed });
  return out;
};

const FEED_STAMP_PARAM = 'feed_related';
const stampFeedUrl = (raw: string): string => {
  if (!raw) return raw;
  try {
    const hashIndex = raw.indexOf('#');
    const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
    if (new RegExp(`([?&])${FEED_STAMP_PARAM}=`, 'i').test(base)) return raw;
    const needsJoiner = base.includes('?')
      ? (base.endsWith('?') || base.endsWith('&') ? '' : '&')
      : '?';
    return `${base}${needsJoiner}${FEED_STAMP_PARAM}=1${hash}`;
  } catch {
    return raw.includes('?') ? `${raw}&${FEED_STAMP_PARAM}=1` : `${raw}?${FEED_STAMP_PARAM}=1`;
  }
};

const shouldLogFeed = () => {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    if (typeof window !== 'undefined') {
      const flag = window.localStorage?.getItem('NAVUMI_FEED_DEBUG') || '';
      return ['1', 'true', 'on', 'yes'].includes(flag.toLowerCase());
    }
  } catch { /* noop */ }
  return false;
};

const feedLog = (...args: unknown[]) => {
  if (!shouldLogFeed()) return;
  try { console.debug('[MobilePostFeed]', ...args); } catch { /* noop */ }
};

type FeedIdsResult = { ids: number[]; meta: Record<string, Record<string, unknown>> };

const emptyFeedIdsResult: FeedIdsResult = { ids: [], meta: {} };

const fetchFeedIds = async (apiBase: string, ctx: PostFeedContext, signal?: AbortSignal): Promise<FeedIdsResult> => {
  if (!apiBase) return emptyFeedIdsResult;
  const fetchFromUrls = async (urls: string[], options?: { requireImages?: boolean }): Promise<FeedIdsResult> => {
    const stamped = urls.map((u) => stampFeedUrl(u));
    feedLog('fetchFromUrls start', { urls: stamped, options });
    for (const url of stamped) {
      feedLog('fetchFromUrls try', url);
      // Try with include creds first, then omit; both with api/ toggle fallback on 404
      const data =
        (await tryFetchJsonWithApiToggle(url, 'include', signal, 'feed')) ??
        (await tryFetchJsonWithApiToggle(url, 'omit', signal, 'feed'));
      if (!data) continue;
      const parseIdFromStr = (s: unknown): number | null => {
        if (typeof s !== 'string' || !s) return null;
        const str = s.trim();
        const patterns = [
          /\bpost\/(\d+)(?:\D|$)/i,
          /\bposts\/(\d+)(?:\D|$)/i,
          /\b\/p\/(\d+)(?:\D|$)/i,
        ];
        for (const re of patterns) {
          const m = str.match(re);
          if (m && m[1]) {
            const n = Number(m[1]);
            if (Number.isFinite(n)) return n;
          }
        }
        return null;
      };
      const buildMetaFromRecords = (records: Record<string, unknown>[]) => {
        const meta: Record<string, Record<string, unknown>> = {};
        for (const rec of records) {
          const id = extractPostId(rec);
          if (typeof id === 'number' && Number.isFinite(id) && !(String(id) in meta)) {
            meta[String(id)] = rec;
          }
        }
        return meta;
      };

      // 0) прямые массивы чисел: [1,2,3]
      if (Array.isArray(data) && data.length && data.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        const arr = data as number[];
        feedLog('fetchFromUrls numeric array root', { url, ids: arr.length });
        if (arr.length) return { ids: arr, meta: {} };
      }
      // 0.1) map c полем ids: [1,2,3]
      if (isRecord(data)) {
        const idsField = (data as Record<string, unknown>)['ids'];
        if (Array.isArray(idsField) && idsField.length && idsField.every((x) => typeof x === 'number' && Number.isFinite(x))) {
          const arr = idsField as number[];
          feedLog('fetchFromUrls numeric ids field', { url, ids: arr.length });
          if (arr.length) return { ids: arr, meta: {} };
        }
        // 0.2) массив ссылок/путей
        const urlsField = (data as Record<string, unknown>)['urls'] ?? (data as Record<string, unknown>)['links'];
        if (Array.isArray(urlsField) && urlsField.length && urlsField.every((x) => typeof x === 'string')) {
          const ids = (urlsField as string[]).map(parseIdFromStr).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
          if (ids.length) {
            feedLog('fetchFromUrls string urls field parsed', { url, ids: ids.length });
            return { ids, meta: {} };
          }
        }
      }
      // 0.3) корневой массив ссылок
      if (Array.isArray(data) && data.length && data.every((x) => typeof x === 'string')) {
        const ids = (data as string[]).map(parseIdFromStr).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        if (ids.length) {
          feedLog('fetchFromUrls string array root parsed', { url, ids: ids.length });
          return { ids, meta: {} };
        }
      }

      const records = recordArrayFrom(data);
      const withImages = options?.requireImages ? records.filter((rec) => recordHasImages(rec)) : records;
      // основной путь — с учётом фильтра по изображениям
      const metaFromRecords = buildMetaFromRecords(withImages);
      let idCandidates = withImages.map((rec) => extractPostId(rec));
      let filtered = idCandidates.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
      feedLog('fetchFromUrls result', { url, total: records.length, withImages: withImages.length, ids: filtered.length });
      if (!filtered.length) {
        const imageable = records.filter((rec) => recordHasImages(rec)).length;
        const numericIds = records.map((rec) => extractPostId(rec)).filter((id): id is number => typeof id === 'number' && Number.isFinite(id)).length;
        feedLog('fetchFromUrls diagnostics', { url, imageable, numericIds });
        // fallback: если требование наличия изображений отфильтровало всё — попробуем без фильтра
        if (options?.requireImages) {
          idCandidates = records.map((rec) => extractPostId(rec));
          filtered = idCandidates.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
          if (filtered.length) {
            feedLog('fetchFromUrls fallback-no-image-filter used', { url, ids: filtered.length });
            return { ids: filtered, meta: buildMetaFromRecords(records) };
          }
        }
      }
      if (filtered.length) return { ids: filtered, meta: metaFromRecords };
    }
    feedLog('fetchFromUrls empty', { urls });
    try { console.warn('[MobilePostFeed] feed ids not found from urls', { urls }); } catch { /* noop */ }
    return emptyFeedIdsResult;
  };

  switch (ctx.source) {
    case 'search_photos': {
      if (Array.isArray(ctx.ids) && ctx.ids.length) {
        feedLog('search_photos context reused ids', { count: ctx.ids.length });
        return { ids: ctx.ids.slice(0, MAX_FEED_POSTS), meta: {} };
      }
      const url = buildSearchPhotosUrl(apiBase, ctx.qs); // всегда со слэшем перед '?'
      try { console.debug('[MobilePostFeed] search_photos feed URL', { url }); } catch { /* noop */ }
      return fetchFromUrls([url], { requireImages: true });
    }
    case 'profile_posts':
      return fetchFromUrls([
        apiJoin(apiBase, `api/profile/${ctx.username}/posts/photos/`),
        apiJoin(apiBase, `api/profile/${ctx.username}/posts/`),
      ], { requireImages: true });
    case 'profile_marks':
      return fetchFromUrls([
        apiJoin(apiBase, `api/profile/${ctx.username}/marks/`),
        apiJoin(apiBase, `api/profile/${ctx.username}/tagged-posts/`),
        apiJoin(apiBase, `api/profile/${ctx.username}/with-me/`),
        apiJoin(apiBase, `api/profile/${ctx.username}/mentions/`),
      ], { requireImages: true });
    case 'camp_marks':
      return fetchFromUrls([
        apiJoin(apiBase, `api/camps/${ctx.campId}/marks/`),
        apiJoin(apiBase, `api/camps/${ctx.campId}/tagged-posts/`),
        apiJoin(apiBase, `api/camps/${ctx.campId}/profile-posts/`),
        apiJoin(apiBase, `api/camps/${ctx.campId}/mentions/`),
      ]);
    default:
      return emptyFeedIdsResult;
  }
};

const fetchPostFullById = async (
  apiBase: string,
  id: number | string,
  signal?: AbortSignal,
  meta?: Record<string, unknown>,
): Promise<PostFull | null> => {
  if (!apiBase || id == null) return null;
  const url = apiJoin(apiBase, `api/posts/${encodeURIComponent(String(id))}/`);
  feedLog('fetchPostFullById', { url, id });
  const data =
    (await tryFetchJsonWithApiToggle(url, 'include', signal, 'detail-related')) ??
    (await tryFetchJsonWithApiToggle(url, 'omit', signal, 'detail-related'));
  if (data && typeof data === 'object') {
    const post = data as PostFull;
    if (meta) {
      const metaTotal = extractCommentTotalPreferReplies(meta);
      if (metaTotal != null) {
        (post as Record<string, unknown>)['comments_total'] = metaTotal;
        (post as Record<string, unknown>)['comments_count'] = metaTotal;
      } else if (isRecord(meta.post)) {
        const inner = extractCommentTotalPreferReplies(meta.post as Record<string, unknown>);
        if (inner != null) {
          (post as Record<string, unknown>)['comments_total'] = inner;
          (post as Record<string, unknown>)['comments_count'] = inner;
        }
      }
    }
    if (totalCommentsFromPost(post) == null) {
      const strictTotal = await fetchCommentsTotalStrict(apiBase, id, signal);
      if (strictTotal != null) {
        (post as Record<string, unknown>)['comments_total'] = strictTotal;
        (post as Record<string, unknown>)['comments_count'] = strictTotal;
      }
    }
    return post;
  }
  try { console.warn('[MobilePostFeed] fetchPostFullById empty', { id, url }); } catch { /* noop */ }
  return null;
};

const fetchFeedPosts = async (apiBase: string, ctx: PostFeedContext, currentId: number, signal?: AbortSignal): Promise<PostFull[]> => {
  const { ids, meta } = await fetchFeedIds(apiBase, ctx, signal);
  feedLog('fetchFeedPosts ids', { count: ids.length, ctx });
  if (!ids.length) {
    try { console.warn('[MobilePostFeed] no feed ids', { ctx }); } catch { /* noop */ }
    return [];
  }
  const seen = new Set<string>();
  const filtered: (number | string)[] = [];
  const currentKey = String(currentId);
  for (const id of ids) {
    const key = String(id);
    if (key === currentKey) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(id);
    if (filtered.length >= MAX_FEED_POSTS) break;
  }
  if (!filtered.length) return [];
  const results = await Promise.all(filtered.map((id) => fetchPostFullById(apiBase, id, signal, meta[String(id)])));
  feedLog('fetchFeedPosts summary', { ctx, requested: filtered.length, resolved: results.filter(Boolean).length });
  if (!results.filter(Boolean).length) {
    try { console.warn('[MobilePostFeed] no related posts resolved', { ctx, requested: filtered.length }); } catch { /* noop */ }
  }
  return results.filter((p): p is PostFull => !!p);
};

const cityOnlyFrom = (location?: string | null) => {
  const raw = location?.trim() || '';
  if (!raw) return '';
  return raw.split(',')[0]?.trim() || raw;
};

const buildShareUrl = (author?: string | null, id?: number | null) => {
  if (!author || !id) return null;
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://www.navumi.com');
  return `${origin}/${author}/post/${id}`;
};

type RelatedPostFullCardProps = {
  post: PostFull;
  abs: (url: string | null | undefined) => string | null;
  API_BASE: string;
  activityDict: Record<number, string> | null;
  hashtagDict: Record<number, string> | null;
  onClose: () => void;
  onOpenActions: (post: PostFull) => void;
  onToggleLike: (post: PostFull) => void;
  onOpenComments: (post: PostFull) => void;
  onOpenTags: (post: PostFull, profiles: TaggedProfile[]) => void;
  onOpenLikers: (post: PostFull) => void;
  onShare: (post: PostFull) => void;
  hideCampInfo?: boolean;
  commentsTotalOverride?: number | null;
};

function RelatedPostFullCard({
  post,
  abs,
  API_BASE,
  activityDict,
  hashtagDict,
  onClose,
  onOpenActions,
  onToggleLike,
  onOpenComments,
  onOpenTags,
  onOpenLikers,
  onShare,
  hideCampInfo = false,
  commentsTotalOverride = null,
}: RelatedPostFullCardProps) {
  const openSearchOverlay = useSearchOverlay();
  const { navigateProfile } = useAppNavigation();
  const openProfileOverlay = useProfileOverlay();
  const openCampOverlay = useCampOverlay();
  const [previewComments, setPreviewComments] = React.useState<RootComment[]>([]);
  const images = React.useMemo(() => {
    const urlFrom = (s: string) => abs(s);
    const arr: unknown = (post as unknown as Record<string, unknown> | null)?.['images'];
    const fromArray = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .map((u) => {
          if (typeof u === 'string') return u.trim();
          if (u && typeof u === 'object' && !Array.isArray(u)) {
            const r = u as Record<string, unknown>;
            const cand = r['url'] ?? r['image'] ?? r['src'] ?? r['thumb'] ?? r['thumbnail_url'];
            return typeof cand === 'string' ? cand.trim() : '';
          }
          return '';
        })
        .filter(Boolean)
        .map(urlFrom)
        .filter((s): s is string => typeof s === 'string' && !!s);
    };
    let out: string[] = fromArray(arr);
    if (!out.length) {
      const rec = (post || {}) as Record<string, unknown>;
      const single = (
        rec['first_image_url'] || rec['image'] || rec['photo'] || rec['cover'] || rec['preview'] || rec['thumbnail_url'] || rec['thumb_url']
      );
      if (typeof single === 'string' && single.trim()) out = [urlFrom(single.trim())!].filter((s): s is string => typeof s === 'string' && !!s);
    }
    return out;
  }, [post, abs]);
  const hasImages = images.length > 0;
  const isTextOnly = !hasImages && !!(post.text && post.text.trim());
  const cityOnly = React.useMemo(() => cityOnlyFrom(post.location_name), [post.location_name]);
  const locationForSearch = React.useMemo(() => (post.location_name ?? '').trim(), [post.location_name]);
  const inlineCommentsTotal = React.useMemo(() => totalCommentsFromPost(post), [post]);
  const locationCoords = React.useMemo(() => {
    const toNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim()) { const n = Number(v.trim()); return Number.isFinite(n) ? n : null; }
      return null;
    };
    const pick = (lat?: unknown, lng?: unknown) => {
      const a = toNum(lat); const b = toNum(lng);
      return a != null && b != null ? { lat: a, lng: b } : null;
    };
    return pick(post.latitude ?? null, post.longitude ?? null)
      ?? pick(post.camp_latitude ?? null, post.camp_longitude ?? null);
  }, [post.latitude, post.longitude, post.camp_latitude, post.camp_longitude]);
  const locationSearchTarget = React.useMemo(() => {
    const fromServer = normalizePhotoSearchUrlFromServer(post?.location_search_url);
    if (fromServer) return fromServer;
    if (!locationForSearch) return null;
    return buildPhotoSearchUrl({
      location: locationForSearch,
      latitude: locationCoords?.lat,
      longitude: locationCoords?.lng,
    });
  }, [locationCoords?.lat, locationCoords?.lng, locationForSearch, post?.location_search_url]);
  const activityChips = React.useMemo(() => {
    const src = post.activities ?? [];
    if (!Array.isArray(src)) return [] as Array<{ id: number | null; name: string }>;
    const out: Array<{ id: number | null; name: string }> = [];
    const rev = activityDict ? new Map(Object.entries(activityDict).map(([k, v]) => [String(v), Number(k)])) : null;
    for (const it of src) {
      if (typeof it === 'number') { const nm = activityDict?.[it]; out.push({ id: it, name: nm ?? String(it) }); continue; }
      if (typeof it === 'string') { const id = rev?.get(it) ?? null; out.push({ id, name: it }); continue; }
      if (it && typeof it === 'object') {
        const rec = it as { id?: number; name?: string };
        const id = typeof rec.id === 'number' ? rec.id : null;
        const nm = (rec.name && String(rec.name).trim()) || (id != null ? (activityDict?.[id] ?? String(id)) : '');
        if (!nm) continue;
        out.push({ id, name: nm });
      }
    }
    return out;
  }, [post.activities, activityDict]);
  const hashtagChips = React.useMemo(() => {
    const src = post.hashtags ?? [];
    if (!Array.isArray(src)) return [] as Array<{ id: number | null; name: string }>;
    const out: Array<{ id: number | null; name: string }> = [];
    const rev = hashtagDict ? new Map(Object.entries(hashtagDict).map(([k, v]) => [String(v), Number(k)])) : null;
    for (const it of src) {
      if (typeof it === 'number') { const nm = hashtagDict?.[it]; out.push({ id: it, name: (nm ?? String(it)).replace(/^#/, '') }); continue; }
      if (typeof it === 'string') { const nm = it.replace(/^#/, ''); const id = rev?.get(nm) ?? null; out.push({ id, name: nm }); continue; }
      if (it && typeof it === 'object') {
        const rec = it as { id?: number; name?: string };
        const id = typeof rec.id === 'number' ? rec.id : null;
        const raw = (rec.name && String(rec.name).trim()) || (id != null ? (hashtagDict?.[id] ?? String(id)) : '');
        const nm = raw.replace(/^#/, '');
        if (!nm) continue;
        out.push({ id, name: nm });
      }
    }
    return out;
  }, [post.hashtags, hashtagDict]);
  const tagProfiles = React.useMemo(
    () => (post.profiles ?? []).map(p => ({ id: p.id, username: p.username, avatar_url: p.avatar_url }) as TaggedProfile),
    [post.profiles],
  );

  const hasPhotos = React.useMemo(
    () => Array.isArray(post?.images) && post.images.length > 0,
    [post?.images],
  );

  const goToFilter = React.useCallback((key: 'activities' | 'hashtags', id?: number | string, name?: string) => {
    try { rememberReturn('post'); } catch { /* noop */ }
    const p = new URLSearchParams();
    p.set('tab', hasPhotos ? 'photoposts' : 'articles');
    p.set('collapsed', '1');
    if (key === 'activities' && id != null) {
      p.append('activities', String(id));
    } else if (key === 'hashtags' && id != null) {
      p.append('hashtags', String(id));
    } else if (name) {
      p.set('query', name.replace(/^#/, ''));
    }
    openSearchOverlay(p);
  }, [hasPhotos, openSearchOverlay]);
  const handleLocationClick = React.useCallback(() => {
    if (!locationSearchTarget) return;
    try { rememberReturn('post'); } catch { /* noop */ }
    const withCollapsed = (() => {
      try {
        const url = new URL(locationSearchTarget, 'https://navumi.app');
        url.searchParams.set('collapsed', '1');
        return url.pathname + url.search + url.hash;
      } catch {
        const glue = locationSearchTarget.includes('?') ? '&' : '?';
        return `${locationSearchTarget}${glue}collapsed=1`;
      }
    })();
    openSearchOverlay(withCollapsed);
  }, [locationSearchTarget, openSearchOverlay]);

  React.useEffect(() => {
    if (!post?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const url = apiJoin(API_BASE, `api/posts/${post.id}/comments/list/?with_replies=0&per_page=2`);
        const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const data: unknown = await r.json();
        let arr: ApiComment[] = [];
        if (isApiCommentArray(data)) arr = data;
        else if (hasCommentsArray(data)) arr = data.comments;
        else if (hasResultsArray(data)) arr = data.results;
        const norm: RootComment[] = arr
          .slice(0, 2)
          .map((c) => ({
            id: Number(c.id ?? 0),
            author: normalizeAuthor(c),
            text: getCommentText(c),
            likes_count: Number(c.likes_count ?? c.like_count ?? c.likes ?? 0),
            created_at: String(c.created_at ?? c.timestamp ?? new Date().toISOString()),
            parent_id: null,
            is_root: true,
          }))
          .filter((c) => !!c.text && !!c.author?.username);
        if (!cancelled) setPreviewComments(norm);
      } catch {
        if (!cancelled) setPreviewComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, post?.id]);

  return (
    <article className="py-4">
      <div className="px-5 flex items-center justify-between gap-3 mt-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              const authorUsername = post.author?.username || '';
              if (authorUsername) {
                navigateProfile(e, { username: authorUsername });
              }
            }}
            className="flex-shrink-0"
          >
            <SmartImage
              src={(post.author?.avatar_url && post.author.avatar_url.trim()) ? post.author.avatar_url : ((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg')}
              alt={post.author?.username || 'profile'}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover border border-gray-200"
            />
          </button>
          <div className="min-w-0">
            <Link
              href={`/${post.author?.username || ''}`}
              className="font-semibold text-[16px] block truncate"
              onClick={(e) => {
                const authorUsername = post.author?.username || '';
                if (authorUsername) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Всегда открываем профиль в оверлее
                  const handled = navigateProfile(e, { username: authorUsername });
                  if (!handled) {
                    // Fallback: открываем оверлей напрямую
                    openProfileOverlay({ username: authorUsername });
                  }
                }
              }}
            >
              {post.author?.username || 'profile'}
            </Link>
            {!!cityOnly && (
              <button
                type="button"
                onClick={handleLocationClick}
                className="text-left text-[12px] text-gray-500 truncate bg-transparent border-0 p-0 underline-offset-2 hover:underline"
                title={cityOnly}
              >
                {cityOnly}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[20px] text-gray-700 hover:bg-gray-100 font-bold"
            aria-label="Ещё"
            onClick={() => onOpenActions(post)}
          >
            ⋯
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      {hasImages && (
        <div className="mt-3 bg-black">
          <SwipeCarousel images={images} height={420} />
        </div>
      )}

      {!!post.camp_id && !hideCampInfo && (
        <div className="px-5 py-3 border-b border-gray-100">
          <button
            type="button"
            className="flex items-center gap-2 text-[14px] font-medium w-full text-left"
            onClick={(e) => {
              e.preventDefault();
              // Всегда открываем через оверлей, используя доступные данные о кэмпе
              // Приоритет: camp_id > camp_slug + username > camp_url
              if (post.camp_id) {
                // Если есть camp_id - используем его напрямую (самый надежный способ)
                openCampOverlay({
                  campId: post.camp_id,
                });
              } else if (post.camp_owner_username && post.camp_slug) {
                // Есть username и slug - используем их
                openCampOverlay({
                  username: post.camp_owner_username,
                  campNumber: post.camp_slug,
                });
              } else if (post.camp_url) {
                // Есть только URL - парсим его
                try {
                  const url = new URL(post.camp_url, 'https://dummy.navumi');
                  const pathParts = url.pathname.split('/').filter(Boolean);
                  if (pathParts.length >= 3 && pathParts[1] === 'camp') {
                    // Успешно распарсили путь вида /username/camp/slug
                    openCampOverlay({
                      username: pathParts[0],
                      campNumber: pathParts[2],
                    });
                  } else {
                    // Не удалось распарсить - используем campPath
                    openCampOverlay({
                      campPath: post.camp_url,
                    });
                  }
                } catch {
                  // Ошибка парсинга - используем campPath
                  openCampOverlay({
                    campPath: post.camp_url,
                  });
                }
              }
            }}
          >
            <Calendar className="w-4 h-4 text-blue-600" aria-hidden />
            <span className="truncate">{post.camp_title || 'Кэмп'}</span>
            <span className="ml-auto text-[12px] text-gray-500">{formatCampRange(post.camp_starts_at, post.camp_ends_at)}</span>
          </button>
        </div>
      )}

      <div className="px-5 py-3 text-xs text-gray-600 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggleLike(post)}
            className={["w-9 h-9 flex items-center justify-center transition", post.liked ? 'text-red-500' : 'text-gray-700 hover:text-black'].join(' ')}
            aria-label={post.liked ? 'Убрать лайк' : 'Поставить лайк'}
            aria-pressed={!!post.liked}
          >
            <IconHeart filled={!!post.liked} />
          </button>
          {(post.likes_count ?? 0) > 0 && (
            <button type="button" onClick={() => onOpenLikers(post)} className="text-sm font-semibold text-gray-900">
              {cap99(post.likes_count ?? 0)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenComments(post)}
            className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
            aria-label="Перейти к комментариям"
          >
            <IconComment />
          </button>
          {(() => {
            const total = (commentsTotalOverride ?? inlineCommentsTotal ?? post.comments_count ?? 0) as number;
            return total > 0 ? (
              <button type="button" onClick={() => onOpenComments(post)} className="text-sm font-semibold text-gray-900">
                {cap99(total)}
              </button>
            ) : null;
          })()}
        </div>
        {(post.profiles_count ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenTags(post, tagProfiles)}
              className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
              aria-label="Отмеченные профили"
            >
              <IconUser />
            </button>
            <button
              type="button"
              onClick={() => onOpenTags(post, tagProfiles)}
              className="text-sm font-semibold text-gray-900"
            >
              {cap99(post.profiles_count ?? 0)}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => onShare(post)}
          className="ml-auto w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
          aria-label="Поделиться постом"
        >
          <IconShare />
        </button>
      </div>

      {!!post.text && (
        <div className="px-5">
          <PostTextInline
            author={post.author?.username || 'profile'}
            text={post.text}
            isTextOnly={isTextOnly}
          />
        </div>
      )}

      {previewComments.length > 0 && (
        <div className="px-5 mt-4 space-y-2">
          {previewComments.map((c) => (
            <div key={c.id} className="text-[14px] leading-snug">
              <Link 
                href={`/${c.author?.username || ''}`} 
                className="font-semibold mr-1"
                onClick={(e) => {
                  const authorUsername = c.author?.username || '';
                  if (authorUsername) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Всегда открываем профиль в оверлее
                    const handled = navigateProfile(e, { username: authorUsername });
                    if (!handled) {
                      // Fallback: открываем оверлей напрямую
                      openProfileOverlay({ username: authorUsername });
                    }
                  }
                }}
              >
                {c.author?.username || 'user'}
              </Link>
              <span className="whitespace-pre-wrap break-words">{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {(activityChips.length > 0 || hashtagChips.length > 0) && (
        <div className="px-5 mt-4">
          <PostTagsRow
            activities={activityChips}
            hashtags={hashtagChips}
            onTagClick={(kind, tag) => {
              if (kind === 'activity') goToFilter('activities', tag.id ?? undefined, tag.name);
              else goToFilter('hashtags', tag.id ?? undefined, tag.name);
            }}
          />
        </div>
      )}

      <div className="px-5 pt-4 text-[12px] text-gray-500">
        {dateOnly(post.created_at)}
      </div>
    </article>
  );
}

export default function MobilePostPageClient({ username, postId: postIdStr, initialPost }: MobilePostPageClientProps) {
  const router = useRouter();
  const { isOverlay, close: closeOverlay } = useOverlayEnvironment();
  const openSearchOverlay = useSearchOverlay();
  const { authenticated, profile } = useAuth();
  const me = profile?.username ?? null;
  const { navigateProfile } = useAppNavigation();
  const openProfileOverlay = useProfileOverlay();
  const openCampOverlay = useCampOverlay();
  const { open: openCommentsModal } = useCommentsModal();
  const { open: openLikersModal } = useLikersModal();
  const { open: openTaggedProfilesModal } = useTaggedProfilesModal();
  const { open: openCreatePostOverlay } = useCreatePostProfileOverlay();
  const { openModal, closeModal: closeModalFromStack, clearScreens } = useLayerStack();

  const postId = Number(postIdStr);

  const API_BASE = getBrowserApiBase().replace(/\/+$/, '');
  // CSRF helpers (локально, как в CampFeedTabs*)
  function readCookie(name: string) {
    const re = new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
    const m = typeof document !== 'undefined' ? document.cookie.match(re) : null;
    return m ? decodeURIComponent(m[1]) : '';
  }
  function getCsrf() { return readCookie('csrftoken'); }
  let csrfPromise: Promise<void> | null = null;
  async function ensureCsrf() {
    if (getCsrf()) return;
    if (!API_BASE) return;
    if (!csrfPromise) {
      csrfPromise = fetch(apiJoin(API_BASE, 'api/csrf/'), { credentials: 'include' })
        .then(() => { })
        .finally(() => { csrfPromise = null; });
    }
    await csrfPromise;
  }
  const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');
  // Абсолютный URL для картинок/медиа
  const abs = React.useCallback((url: string | null | undefined) => {
    if (!url) return null;
    const s0 = String(url).trim();
    if (/^(https?:)?\/\//i.test(s0) || s0.startsWith('data:') || s0.startsWith('blob:')) return s0;
    const isMedia = /^\/(media|uploads|static|profile_pictures|avatars?)\//i.test(s0);
    return (isMedia ? MEDIA_BASE : API_BASE) + (s0.startsWith('/') ? s0 : '/' + s0);
  }, [API_BASE, MEDIA_BASE]);

  const [post, setPost] = React.useState<PostFull | null>(initialPost ?? null);
  const postRef = React.useRef<PostFull | null>(null);
  React.useEffect(() => {
    postRef.current = post;
  }, [post]);
  const [loading, setLoading] = React.useState(!initialPost);
  const [error, setError] = React.useState<string | null>(null);
  const locationForSearch = React.useMemo(() => (post?.location_name ?? '').trim(), [post?.location_name]);
  const locationCoords = React.useMemo(() => {
    const toNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim()) { const n = Number(v.trim()); return Number.isFinite(n) ? n : null; }
      return null;
    };
    const pick = (lat?: unknown, lng?: unknown) => {
      const a = toNum(lat); const b = toNum(lng);
      return a != null && b != null ? { lat: a, lng: b } : null;
    };
    return pick(post?.latitude ?? null, post?.longitude ?? null)
      ?? pick(post?.camp_latitude ?? null, post?.camp_longitude ?? null);
  }, [post?.latitude, post?.longitude, post?.camp_latitude, post?.camp_longitude]);
  const locationSearchTarget = React.useMemo(() => {
    const fromServer = normalizePhotoSearchUrlFromServer(post?.location_search_url);
    if (fromServer) return fromServer;
    if (!locationForSearch) return null;
    return buildPhotoSearchUrl({
      location: locationForSearch,
      latitude: locationCoords?.lat,
      longitude: locationCoords?.lng,
    });
  }, [locationCoords?.lat, locationCoords?.lng, locationForSearch, post?.location_search_url]);
  const goToPhotoLocationSearch = React.useCallback(() => {
    if (!locationSearchTarget) return;
    try { rememberReturn('post'); } catch { /* noop */ }
    try {
      if (typeof window !== 'undefined') console.debug('[ProfilePostMobile] goToPhotoLocationSearch', { locationForSearch, target: locationSearchTarget });
    } catch { /* noop */ }
    const appendCollapsed = (input: string) => {
      try {
        const url = new URL(input, 'https://navumi.app');
        url.searchParams.set('collapsed', '1');
        return url.pathname + url.search + url.hash;
      } catch {
        const glue = input.includes('?') ? '&' : '?';
        return `${input}${glue}collapsed=1`;
      }
    };
    const isPhotoPost = Array.isArray(post?.images) && post.images.length > 0;
    if (isPhotoPost) {
      openSearchOverlay(appendCollapsed(locationSearchTarget));
      return;
    }
    const params = new URLSearchParams();
    params.set('tab', 'articles');
    params.set('collapsed', '1');
    params.set('location', locationForSearch || '');
    if (locationCoords?.lat != null && locationCoords?.lng != null) {
      params.set('latitude', String(locationCoords.lat));
      params.set('longitude', String(locationCoords.lng));
    }
    openSearchOverlay(params);
  }, [locationForSearch, locationSearchTarget, openSearchOverlay, post?.images, locationCoords?.lat, locationCoords?.lng]);
  const [rootComments, setRootComments] = React.useState<RootComment[]>([]);
  const [rootCommentsTotal, setRootCommentsTotal] = React.useState<number | null>(null);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [relatedContext, setRelatedContext] = React.useState<PostFeedContext | null>(null);
  const hadStoredFeedContext = React.useRef(false);
  const [relatedPosts, setRelatedPosts] = React.useState<PostFull[]>([]);
  const [relatedLoading, setRelatedLoading] = React.useState(false);
  const [relatedError, setRelatedError] = React.useState<string | null>(null);
  const [relatedCommentsTotals, setRelatedCommentsTotals] = React.useState<Record<number, number>>({});

  const [engagementCommentsTotal, setEngagementCommentsTotal] = React.useState<number | null>(null);
  const [portalNode, setPortalNode] = React.useState<HTMLElement | null>(null);
  const [bottomGapPx, setBottomGapPx] = React.useState(96);
  const bottomInset = React.useMemo(
    () => `calc(env(safe-area-inset-bottom, 0px) + ${Math.max(0, bottomGapPx)}px)`,
    [bottomGapPx]
  );
  const contentPaddingStyle = React.useMemo<React.CSSProperties>(
    () => ({ paddingBottom: bottomInset }),
    [bottomInset]
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    let raf = 0;
    let lookupTimeout: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const readGap = () => {
      const navEl = document.querySelector<HTMLElement>('[data-bottom-nav]');
      if (navEl) {
        const rect = navEl.getBoundingClientRect();
        if (rect.height) return Math.ceil(rect.height);
      }
      const inlineVal = root.style.getPropertyValue('--bottom-gap');
      const inlinePx = parseFloat(inlineVal || '') || 0;
      if (inlinePx > 0) return inlinePx;
      const computedVal = typeof window !== 'undefined'
        ? getComputedStyle(root).getPropertyValue('--bottom-gap')
        : '';
      const computedPx = parseFloat(computedVal || '') || 0;
      return computedPx || 0;
    };

    const updateGap = () => {
      setBottomGapPx(prev => {
        const next = readGap();
        const normalized = Number.isFinite(next) ? Math.max(0, next) : prev;
        return normalized === prev ? prev : normalized;
      });
    };

    const attachObserver = () => {
      const navEl = document.querySelector<HTMLElement>('[data-bottom-nav]');
      if (!navEl || typeof ResizeObserver === 'undefined') return false;
      resizeObserver = new ResizeObserver(updateGap);
      resizeObserver.observe(navEl);
      return true;
    };

    const ensureObserver = () => {
      if (attachObserver()) return;
      lookupTimeout = window.setTimeout(ensureObserver, 200);
    };

    updateGap();
    raf = requestAnimationFrame(updateGap);
    ensureObserver();

    const handleResize = () => updateGap();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (raf) cancelAnimationFrame(raf);
      if (lookupTimeout) clearTimeout(lookupTimeout);
      resizeObserver?.disconnect();
    };
  }, []);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  // НУЖНО ДО ЛЮБЫХ РАННИХ return: хук useMemo должен вызываться стабильно
  const images = React.useMemo(() => {
    const urlFrom = (s: string) => abs(s);
    const arr: unknown = (post as unknown as Record<string, unknown> | null)?.['images'];
    const fromArray = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .map((u) => {
          if (typeof u === 'string') return u.trim();
          if (u && typeof u === 'object' && !Array.isArray(u)) {
            const r = u as Record<string, unknown>;
            const cand = r['url'] ?? r['image'] ?? r['src'] ?? r['thumb'] ?? r['thumbnail_url'];
            return typeof cand === 'string' ? cand.trim() : '';
          }
          return '';
        })
        .filter(Boolean)
        .map(urlFrom)
        .filter((s): s is string => typeof s === 'string' && !!s);
    };
    let out: string[] = fromArray(arr);
    if (!out.length) {
      const rec = (post || {}) as Record<string, unknown>;
      const single = (
        rec['first_image_url'] || rec['image'] || rec['photo'] || rec['cover'] || rec['preview'] || rec['thumbnail_url'] || rec['thumb_url']
      );
      if (typeof single === 'string' && single.trim()) out = [urlFrom(single.trim())!].filter((s): s is string => typeof s === 'string' && !!s);
    }
    return out;
  }, [post, abs]);
  const [reportTarget, setReportTarget] = React.useState<PostFull | null>(null);
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = React.useState<PostFull | null>(null);
  const [confirmUntagOpen, setConfirmUntagOpen] = React.useState(false);
  const [entryOrigin, setEntryOrigin] = React.useState<'camp_marks' | null>(null);
  const [entryReturnPath, setEntryReturnPath] = React.useState<string | null>(null);
  const [entryCampBackPath, setEntryCampBackPath] = React.useState<string | null>(null);
  
  const sharePost = React.useCallback(async (target?: PostFull) => {
    const src = target ?? post;
    if (!src?.id) return;
    const url = buildShareUrl(src.author?.username, src.id);
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard.writeText(url);
    } catch { /* noop */ }
  }, [post]);
  
  const openActionsForPost = React.useCallback((target?: PostFull | null) => {
    if (!target) return;
    // Используем openModal из LayerStackContext для модалки действий
    const currentTarget = target;
    const targetAuthor = currentTarget.author?.username || username;
    const isAuthorOfTarget = !!me && targetAuthor === me;
    const isMainTarget = currentTarget.id === post?.id;
    const actions: { label: string; onClick: () => void; destructive?: boolean }[] = [];
    if (isAuthorOfTarget) {
      actions.push({
        label: 'Редактировать',
        onClick: () => {
          openCreatePostOverlay({ mode: 'edit', postId: currentTarget.id, username: targetAuthor });
        },
      });
      actions.push({
        label: 'Удалить',
        onClick: () => {
          setConfirmDeleteTarget(currentTarget);
          setConfirmDeleteOpen(true);
        },
        destructive: true,
      });
    } else {
      const isTagged = isMainTarget && !!(me && (post?.profiles ?? []).some(p => p.username === me));
      if (isTagged) {
        actions.push({
          label: 'Удалить отметку',
          onClick: () => {
            setConfirmUntagOpen(true);
          },
        });
      }
      actions.push({
        label: 'Пожаловаться',
        onClick: () => {
          if (!authenticated) { setLoginRequiredOpen(true); return; }
          if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
          setReportTarget(currentTarget);
        },
        destructive: true,
      });
    }
    if (actions.length === 0) return;
    
    // Добавляем "Поделиться" если есть функция sharePost
    const shareAction = {
      label: 'Поделиться',
      onClick: () => {
        sharePost(currentTarget);
      },
    };
    const finalActions = [shareAction, ...actions];
    
    let modalId: string | null = null;
    const closeModal = () => {
      if (modalId) {
        closeModalFromStack(modalId);
        modalId = null;
      }
    };
    
    modalId = openModal({
      node: (
        <PostActionSheet
          open={true}
          onClose={closeModal}
          actions={finalActions.map(a => ({
            ...a,
            onClick: () => {
              a.onClick();
              closeModal();
            },
          }))}
        />
      ),
      zIndex: 40000,
      onClose: closeModal,
    });
  }, [post?.profiles, post?.id, me, authenticated, router, username, openModal, closeModalFromStack, sharePost, openCreatePostOverlay]);

  React.useEffect(() => {
    const persisted = consumePostEntryOrigin();
    if (persisted?.origin === 'camp_marks') {
      setEntryOrigin('camp_marks');
      setEntryReturnPath(persisted.returnPath ?? null);
      setEntryCampBackPath(persisted.campBackPath ?? null);
    }
  }, []);

  const ensureEngagementTotal = React.useCallback(async (): Promise<number | null> => {
    if (!post?.id) return null;
    const pid = post.id;
    // 1) быстрый путь: engagement endpoint
    {
      const url = apiJoin(API_BASE, `api/posts/${pid}/engagement/`);
      const dataInc = await tryFetchJson(url, 'include');
      const data = dataInc ?? (await tryFetchJson(url, 'omit'));
      if (data && typeof data === 'object') {
        const root = data as Record<string, unknown>;
        const postField = root['post'];
        const postObj = postField && typeof postField === 'object' ? (postField as Record<string, unknown>) : null;
        const total = extractTotalFromRoot(root) ?? extractTotalFromRoot(postObj ?? {});
        if (total != null) {
          setEngagementCommentsTotal(total);
          return total;
        }
      }
    }
    // 2) дешёвая попытка: пагинация DRF даёт count
    {
      const url = apiJoin(API_BASE, `api/posts/${pid}/comments/list/?with_replies=1&per_page=1`);
      const dataInc = await tryFetchJson(url, 'include');
      const data = dataInc ?? (await tryFetchJson(url, 'omit'));
      if (data && typeof data === 'object') {
        const root = data as Record<string, unknown>;
        const meta = extractTotalFromRoot(root);
        if (meta != null) {
          setEngagementCommentsTotal(meta);
          return meta;
        }
        // если нет меты — попробуем прочитать массив и посчитать (вдруг не режется per_page)
        if (hasResultsArray(root)) {
          const cnt = countFromArrayPossiblyNested(root.results);
          if (cnt != null) { setEngagementCommentsTotal(cnt); return cnt; }
        }
        if (hasCommentsArray(root)) {
          const cnt = countFromArrayPossiblyNested(root.comments);
          if (cnt != null) { setEngagementCommentsTotal(cnt); return cnt; }
        }
      }
    }
    // 3) фолбэк: одна «тяжёлая» страница (плоский/вложенный список), ограничим 300
    {
      const url = apiJoin(API_BASE, `api/posts/${pid}/comments/list/?with_replies=1&per_page=300`);
      const dataInc = await tryFetchJson(url, 'include');
      const data = dataInc ?? (await tryFetchJson(url, 'omit'));
      if (data && typeof data === 'object') {
        const root = data as Record<string, unknown>;
        const meta = extractTotalFromRoot(root);
        if (meta != null) { setEngagementCommentsTotal(meta); return meta; }
        if (hasResultsArray(root)) {
          const cnt = countFromArrayPossiblyNested(root.results);
          if (cnt != null) { setEngagementCommentsTotal(cnt); return cnt; }
        }
        if (hasCommentsArray(root)) {
          const cnt = countFromArrayPossiblyNested(root.comments);
          if (cnt != null) { setEngagementCommentsTotal(cnt); return cnt; }
        }
      }
    }
    return null;
  }, [API_BASE, post?.id]);

  // Переключение версий выполняется на уровне middleware по UA

  React.useEffect(() => {
    if (!Number.isFinite(postId) || postId <= 0) { setError('Некорректный id поста'); setLoading(false); return; }

    const initialId = initialPost ? String(initialPost.id) : null;
    if (initialId && String(postId) === initialId) {
      setPost(initialPost ?? null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const url = apiJoin(API_BASE, `api/posts/${postId}/`);
        const jRaw = (await tryFetchJsonWithApiToggle(url, 'include', undefined, 'detail-main'))
          ?? (await tryFetchJsonWithApiToggle(url, 'omit', undefined, 'detail-main'));
        if (!jRaw || typeof jRaw !== 'object') throw new Error('Контент не найден');
        const j = jRaw as PostFull;
        feedLog('post-detail loaded', { url, id: postId });
        if (!cancelled) setPost(j);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [API_BASE, postId, initialPost]);

  React.useEffect(() => {
    setEngagementCommentsTotal(null);
    void ensureEngagementTotal();
  }, [ensureEngagementTotal]);

  React.useEffect(() => {
    const stored = readPostFeedContext(postIdStr);
    if (stored) {
      hadStoredFeedContext.current = true;
      setRelatedContext(stored);
      try { console.debug('[MobilePostFeed] stored PostFeedContext loaded', { stored, postId: postIdStr }); } catch { /* noop */ }
      return;
    }
    const fallbackAuthor = post?.author?.username;
    const fallbackPostId = post?.id;
    if (fallbackAuthor && fallbackPostId) {
      const fallbackCtx: PostFeedContext = { source: 'profile_posts', username: fallbackAuthor, postId: fallbackPostId };
      setRelatedContext((prev) => prev ?? fallbackCtx);
      try { setPostFeedContext(fallbackCtx); } catch { /* noop */ }
      feedLog('default fallback feed context', fallbackCtx);
    }
  }, [post?.author?.username, post?.id, postIdStr]);

  // На случай, если данных поста ещё нет, а username уже известен из URL — подстрахуем
  React.useEffect(() => {
    if (relatedContext) return;
    if (hadStoredFeedContext.current) return;
    if (!username || !Number.isFinite(postId) || postId <= 0) return;
    const fallbackCtx: PostFeedContext = { source: 'profile_posts', username, postId };
    setRelatedContext(fallbackCtx);
    try { setPostFeedContext(fallbackCtx); } catch { /* noop */ }
    feedLog('url-based fallback feed context', fallbackCtx);
  }, [relatedContext, username, postId]);

  React.useEffect(() => {
    if (!relatedContext || !API_BASE || !Number.isFinite(postId) || postId <= 0) {
      setRelatedPosts([]);
      feedLog('related useEffect skipped', { hasContext: !!relatedContext, API_BASE, postId });
      return;
    }
    let cancelled = false;
    const ac = new AbortController();
    setRelatedLoading(true);
    setRelatedError(null);
    (async () => {
      try {
        feedLog('related useEffect start', { context: relatedContext, postId });
        const posts = await fetchFeedPosts(API_BASE, relatedContext, postId, ac.signal);
        feedLog('related useEffect success', { count: posts.length, context: relatedContext });
        if (!cancelled) {
          if (posts.length > 0) {
            setRelatedPosts(posts);
            const totals: Record<number, number> = {};
            for (const feedPost of posts) {
              const total = totalCommentsFromPost(feedPost);
              if (typeof total === 'number' && Number.isFinite(total)) totals[feedPost.id] = total;
            }
            setRelatedCommentsTotals(totals);
          } else {
            const currentPost = postRef.current;
            const fallbackAuthor = currentPost?.author?.username;
            const fallbackPostId = currentPost?.id;
            const canFallback = relatedContext.source !== 'profile_posts' && relatedContext.source !== 'search_photos';
            if (canFallback && fallbackAuthor && fallbackPostId) {
              const fallbackCtx: PostFeedContext = { source: 'profile_posts', username: fallbackAuthor, postId: fallbackPostId };
              feedLog('related useEffect fallback', fallbackCtx);
              try { setPostFeedContext(fallbackCtx); } catch { /* noop */ }
              const fallbackPosts = await fetchFeedPosts(API_BASE, fallbackCtx, postId, ac.signal);
              feedLog('related fallback result', { count: fallbackPosts.length });
              if (!cancelled) {
                setRelatedContext(fallbackCtx);
                setRelatedPosts(fallbackPosts);
                const totals: Record<number, number> = {};
                for (const feedPost of fallbackPosts) {
                  const total = totalCommentsFromPost(feedPost);
                  if (typeof total === 'number' && Number.isFinite(total)) totals[feedPost.id] = total;
                }
                setRelatedCommentsTotals(totals);
              }
            } else {
              setRelatedPosts(posts);
              setRelatedCommentsTotals({});
              try { console.warn('[MobilePostFeed] related feed empty', { context: relatedContext }); } catch { /* noop */ }
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setRelatedPosts([]);
          const msg = e instanceof Error ? e.message : 'Не удалось загрузить ленту';
          feedLog('related useEffect error', { error: msg });
          setRelatedError(msg);
        }
      } finally {
        feedLog('related useEffect finish');
        if (!cancelled) setRelatedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [API_BASE, relatedContext, postId]);

  // Загружаем суммарные счётчики комментариев (корни + ответы) для связанных постов
  // (поисковая выдача уже содержит comments_total, для неё пропускаем доп. запросы)
  React.useEffect(() => {
    if (!API_BASE || !relatedPosts.length) {
      setRelatedCommentsTotals({});
      return;
    }
    if (relatedContext?.source === 'search_photos') return;
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const ids = Array.from(new Set(relatedPosts.map((p) => p.id).filter((id) => typeof id === 'number' && Number.isFinite(id)))) as number[];
        if (!ids.length) { if (!cancelled) setRelatedCommentsTotals({}); return; }
        const url = apiJoin(API_BASE, `api/posts/engagement/bulk/?ids=${ids.join(',')}`);
        feedLog('engagement bulk start', { url, count: ids.length });
        const dataInc = await tryFetchJson(url, 'include', ac.signal);
        const data = dataInc ?? (await tryFetchJson(url, 'omit', ac.signal));
        const totals: Record<number, number> = {};
        const put = (id: number | null, total: number | null) => { if (id != null && total != null) totals[id] = total; };
        if (Array.isArray(data)) {
          for (const item of data) {
            if (!isRecord(item)) continue;
            const rec = item as Record<string, unknown>;
            const postObj = isRecord(rec.post) ? (rec.post as Record<string, unknown>) : null;
            const id = pickNum(rec, ['post_id', 'postId', 'id', 'pk', 'object_id'] as const) ?? (postObj ? pickNum(postObj, ['id'] as const) : null);
            const total = extractCommentTotalPreferReplies(rec) ?? (postObj ? extractCommentTotalPreferReplies(postObj) : null);
            put(id, total);
          }
        } else if (isRecord(data)) {
          const root = data as Record<string, unknown>;
          for (const [k, v] of Object.entries(root)) {
            const id = Number(k);
            if (!Number.isFinite(id)) continue;
            if (typeof v === 'number') { totals[id] = v; continue; }
            if (isRecord(v)) {
              const t = extractCommentTotalPreferReplies(v as Record<string, unknown>);
              if (t != null) totals[id] = t;
            }
          }
        }
        feedLog('engagement bulk parsed', { found: Object.keys(totals).length });
        if (!cancelled && Object.keys(totals).length) {
          setRelatedCommentsTotals((prev) => ({ ...prev, ...totals }));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        feedLog('engagement bulk error', { error: msg });
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [API_BASE, relatedPosts]);

  // moved earlier

  const patchPostById = React.useCallback((targetId: number, transform: (prev: PostFull) => PostFull) => {
    setPost(prev => (prev && prev.id === targetId ? transform(prev) : prev));
    setRelatedPosts(prev => prev.map(item => (item.id === targetId ? transform(item) : item)));
  }, [setPost, setRelatedPosts]);

  // Создаём портал только когда НЕ в режиме оверлея (standalone страница)
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    // В режиме оверлея рендерим напрямую в LayerStack, портал не нужен
    if (isOverlay) {
      setPortalNode(null);
      return;
    }
    // Для standalone страницы создаём портал
    const el = document.createElement('div');
    el.className = 'mobile-post-overlay-root';
    document.body.appendChild(el);
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.classList.add('mobile-post-overlay-open');
    setPortalNode(el);
    return () => {
      document.documentElement.classList.remove('mobile-post-overlay-open');
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      if (el.parentNode) {
        document.body.removeChild(el);
      }
      setPortalNode(null);
    };
  }, [isOverlay]);

  React.useEffect(() => {
    overlayRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [post?.id]);

  const toggleLikeFor = React.useCallback(async (target: PostFull) => {
    if (!target) return;
    if (!authenticated) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    const desired = !target.liked;
    patchPostById(target.id, (prev) => ({
      ...prev,
      liked: desired,
      likes_count: Math.max(0, (prev.likes_count ?? 0) + (desired ? 1 : -1)),
    }));
    try {
      const r = await fetch(apiJoin(API_BASE, `api/posts/${target.id}/like-toggle/`), { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('Ошибка');
    } catch {
      patchPostById(target.id, (prev) => ({
        ...prev,
        liked: !desired,
        likes_count: Math.max(0, (prev.likes_count ?? 0) + (!desired ? 1 : -1)),
      }));
    }
  }, [API_BASE, authenticated, patchPostById, setLoginRequiredOpen]);

  const handleCommentsCountSync = React.useCallback((targetId: number, nextCount: number) => {
    patchPostById(targetId, (prev) => ({ ...prev, comments_count: nextCount }));
    if (post?.id === targetId) {
      setEngagementCommentsTotal(nextCount);
    }
  }, [patchPostById, post?.id]);

  const campFallback = React.useMemo(() => {
    if (post?.camp_owner_username) {
      const slug = post.camp_slug || post.camp_id;
      if (slug) return `/${post.camp_owner_username}/camp/${slug}`;
    }
    return null;
  }, [post?.camp_owner_username, post?.camp_slug, post?.camp_id]);

  const cameFromCampMarks = entryOrigin === 'camp_marks';

  const safeBack = () => {
    if (isOverlay) {
      closeOverlay();
      return;
    }
    const ctx = consumeReturn('post');
    if (ctx) {
      router.replace(ctx);
      return;
    }
    if (cameFromCampMarks) {
      const target = entryReturnPath || campFallback;
      if (target) {
        try {
          router.replace(target);
        } catch {
          if (typeof window !== 'undefined') window.location.assign(target);
        }
        if (entryCampBackPath) {
          try {
            rememberReturn('camp', entryCampBackPath);
          } catch { /* noop */ }
        }
        return;
      }
    }
    navigateBack(router, { fallback: '/search' });
  };

  const relatedHeading = React.useMemo(() => {
    if (!relatedContext) return 'Другие посты';
    switch (relatedContext.source) {
      case 'search_photos':
        return 'Посты из поиска';
      case 'profile_posts':
        return `Другие посты @${relatedContext.username}`;
      case 'profile_marks':
        return `Посты с отметкой @${relatedContext.username}`;
      case 'camp_marks':
        return 'Посты с отметкой кэмпа';
      default:
        return 'Другие посты';
    }
  }, [relatedContext]);
  const hideCampInfo = cameFromCampMarks;

  React.useEffect(() => {
    if (!post?.id) return;
    let cancelled = false;
    (async () => {
      setCommentsLoading(true);
      try {
        const url = apiJoin(API_BASE, `api/posts/${post.id}/comments/list/?with_replies=0&per_page=300`);
        dbg('fetch', url);
        const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        dbg('status', r.status, r.ok);
        if (!r.ok) throw new Error('comments load failed');
        const data: unknown = await r.json();
        dbg('raw type', Array.isArray(data) ? 'array' : typeof data);
        let arr: ApiComment[] = [];
        if (isApiCommentArray(data)) arr = data;
        else if (hasCommentsArray(data)) arr = data.comments;
        else if (hasResultsArray(data)) arr = data.results;
        dbg('arr length', arr.length);
        if (arr.length) {
          dbg('sample[0]', summarizeDebug(arr[0]));
          dbg('sample[1]', arr[1] ? summarizeDebug(arr[1]) : null);
        }
        // выделяем корни: parent_id|parent|root_id|reply_to или is_root
        const roots = arr.filter((c) => {
          const a = c as ApiCommentLoose;
          const pid = a.parent_id ?? a.parent ?? a.root_id ?? a.reply_to ?? null;
          return !!c && (c.is_root || pid == null || Number(pid) === 0);
        });
        const base = roots.length ? roots : arr;
        const norm: RootComment[] = base.map((c) => {
          const a = c as ApiCommentLoose & { is_deleted?: boolean | null };
          if (a.is_deleted) return null as unknown as RootComment;
          return {
            id: Number(a.id ?? 0),
            author: normalizeAuthor(a),
            text: getCommentText(a),
            likes_count: Number(a.likes_count ?? a.like_count ?? a.likes ?? 0),
            created_at: String(a.created_at ?? a.created ?? a.timestamp ?? new Date().toISOString()),
            parent_id: (() => {
              const pid = a.parent_id ?? a.parent ?? a.root_id ?? a.reply_to ?? null;
              return pid == null ? null : Number(pid);
            })(),
            is_root: !!a.is_root,
          };
        })
          .filter((c): c is RootComment => !!c && typeof c.id === 'number' && c.id > 0);
        dbg('norm sample', norm.slice(0, 3));
        if (!cancelled) {
          setRootComments(norm);
          setRootCommentsTotal(norm.length || null);
        }
      } catch {
        if (!cancelled) {
          setRootComments([]);
          setRootCommentsTotal(null);
        }
      } finally {
        if (!cancelled) setCommentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [API_BASE, post?.id]);

  // Предпросмотр комментариев (см. правила выше)
  const postAuthor = post?.author?.username ?? null;
  const postHasText = !!(post?.text && post.text.trim());
  const previewComments = React.useMemo(() => {
    if (!rootComments.length) return [];
    const withText = rootComments.filter(c => !!(c.text && c.text.trim().length));
    const source = withText.length ? withText : rootComments; // предпочитаем непустые
    const byLikesThenOlder = (a: RootComment, b: RootComment) => {
      if ((b.likes_count | 0) !== (a.likes_count | 0)) return (b.likes_count | 0) - (a.likes_count | 0);
      return time(a.created_at) - time(b.created_at); // старший выше
    };
    const byTimeAsc = (a: RootComment, b: RootComment) => time(a.created_at) - time(b.created_at);


    const viewerIsAuthor = !!(postAuthor && me && postAuthor === me);
    const mine = source.filter(c => c.author?.username === me);
    //return [...source].sort(byTimeAsc).slice(0, 1);

    if (postHasText) {
      if (viewerIsAuthor) {
        return [...source].sort(byTimeAsc).slice(0, 1);
      }
      if (mine.length > 0) {
        return [...mine].sort(byLikesThenOlder).slice(0, 1);
      }
      return [...source].sort(byLikesThenOlder).slice(0, 1);
    } else {
      if (mine.length > 0) return [...mine].sort(byLikesThenOlder).slice(0, 2);
      return [...source].sort(byLikesThenOlder).slice(0, 2);
    }
  }, [rootComments, me, postHasText, postAuthor]);

  // словари для маппинга id -> name (если бэкенд вернул только id)
  const [activityDict, setActivityDict] = React.useState<Record<number, string> | null>(null);
  const [hashtagDict, setHashtagDict] = React.useState<Record<number, string> | null>(null);

  React.useEffect(() => {
    // подгружаем справочники ТОЛЬКО если это действительно нужно
    if (post && needsLookup(post.activities) && !activityDict) {
      (async () => {
        try {
          const r = await fetch(`${API_BASE}/api/activities/`, { credentials: 'include', cache: 'no-store' });
          const j: unknown = await r.json().catch(() => null);
          const root = j as Record<string, unknown> | null;
          const raw = Array.isArray(j)
            ? (j as unknown[])
            : Array.isArray(root?.results)
              ? ((root!.results as unknown[]) ?? [])
              : [];
          const list = raw.filter((x): x is IdName => {
            if (typeof x !== 'object' || x === null) return false;
            const rec = x as Record<string, unknown>;
            return typeof rec.id === 'number' && typeof rec.name === 'string';
          });
          const dict = Object.fromEntries(list.map((x) => [x.id, x.name] as const));
          setActivityDict(dict);
        } catch { /* ignore */ }
      })();
    }
  }, [API_BASE, post, activityDict]);

  React.useEffect(() => {
    if (post && needsLookup(post.hashtags) && !hashtagDict) {
      (async () => {
        try {
          const r = await fetch(`${API_BASE}/api/hashtags/`, { credentials: 'include', cache: 'no-store' });
          const j: unknown = await r.json().catch(() => null);
          const root = j as Record<string, unknown> | null;
          const raw = Array.isArray(j)
            ? (j as unknown[])
            : Array.isArray(root?.results)
              ? ((root!.results as unknown[]) ?? [])
              : [];
          const list = raw.filter((x): x is IdName => {
            if (typeof x !== 'object' || x === null) return false;
            const rec = x as Record<string, unknown>;
            return typeof rec.id === 'number' && typeof rec.name === 'string';
          });
          const dict = Object.fromEntries(list.map((x) => [x.id, x.name] as const));
          setHashtagDict(dict);
        } catch { /* ignore */ }
      })();
    }
  }, [API_BASE, post, hashtagDict]);

  const activityTokens = React.useMemo(
    () => {
      const src = post?.activities ?? [];
      if (!Array.isArray(src)) return [] as Array<{ id: number | null; name: string }>;
      const out: Array<{ id: number | null; name: string }> = [];
      const rev = activityDict ? new Map(Object.entries(activityDict).map(([k, v]) => [String(v), Number(k)])) : null;
      for (const it of src) {
        if (typeof it === 'number') { const nm = activityDict?.[it]; out.push({ id: it, name: nm ?? String(it) }); continue; }
        if (typeof it === 'string') { const id = rev?.get(it) ?? null; out.push({ id, name: it }); continue; }
        if (it && typeof it === 'object') {
          const rec = it as { id?: number; name?: string };
          const id = typeof rec.id === 'number' ? rec.id : null;
          const nm = (rec.name && String(rec.name).trim()) || (id != null ? (activityDict?.[id] ?? String(id)) : '');
          if (!nm) continue;
          out.push({ id, name: nm });
        }
      }
      return out;
    },
    [post?.activities, activityDict],
  );
  const hashtagTokens = React.useMemo(
    () => {
      const src = post?.hashtags ?? [];
      if (!Array.isArray(src)) return [] as Array<{ id: number | null; name: string }>;
      const out: Array<{ id: number | null; name: string }> = [];
      const rev = hashtagDict ? new Map(Object.entries(hashtagDict).map(([k, v]) => [String(v), Number(k)])) : null;
      for (const it of src) {
        if (typeof it === 'number') { const nm = hashtagDict?.[it]; out.push({ id: it, name: (nm ?? String(it)).replace(/^#/, '') }); continue; }
        if (typeof it === 'string') { const nm = it.replace(/^#/, ''); const id = rev?.get(nm) ?? null; out.push({ id, name: nm }); continue; }
        if (it && typeof it === 'object') {
          const rec = it as { id?: number; name?: string };
          const id = typeof rec.id === 'number' ? rec.id : null;
          const raw = (rec.name && String(rec.name).trim()) || (id != null ? (hashtagDict?.[id] ?? String(id)) : '');
          const nm = raw.replace(/^#/, '');
          if (!nm) continue;
          out.push({ id, name: nm });
        }
      }
      return out;
    },
    [post?.hashtags, hashtagDict],
  );

  type PostUpdatedEventDetail = { id?: number; post?: Partial<PostFull> };

  React.useEffect(() => {
    const onUpdated = (e: Event) => {
      const ce = e as CustomEvent<PostUpdatedEventDetail>;
      const det: PostUpdatedEventDetail = ce.detail ?? {};
      const id = Number(det.id ?? det.post?.id ?? NaN);
      if (!Number.isFinite(id)) return;

      const p: Partial<PostFull> = det.post ?? {};
      
      // Обновляем основной пост, если это он
      if (id === postId) {
        setPost(prev => {
          if (!prev) return { ...(p as PostFull) };
          return {
            ...prev,
            ...p,
            text: p.text ?? prev.text,
            images: p.images ?? prev.images,
            activities: p.activities ?? prev.activities,
            hashtags: p.hashtags ?? prev.hashtags,
            location_name: p.location_name ?? prev.location_name,
            profiles: p.profiles ?? prev.profiles,
            profiles_count: p.profiles_count ?? prev.profiles_count,
            camp_id: p.camp_id ?? prev.camp_id,
            camp_title: p.camp_title ?? prev.camp_title,
            camp_slug: p.camp_slug ?? prev.camp_slug,
            camp_owner_username: p.camp_owner_username ?? prev.camp_owner_username,
            camp_url: p.camp_url ?? prev.camp_url,
            camp_starts_at: p.camp_starts_at ?? prev.camp_starts_at,
            camp_ends_at: p.camp_ends_at ?? prev.camp_ends_at,
          };
        });
      }
      
      // Обновляем пост в ленте, если он там есть
      setRelatedPosts(prev => {
        const idx = prev.findIndex(item => item.id === id);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          ...p,
          text: p.text ?? updated[idx].text,
          images: p.images ?? updated[idx].images,
          activities: p.activities ?? updated[idx].activities,
          hashtags: p.hashtags ?? updated[idx].hashtags,
          location_name: p.location_name ?? updated[idx].location_name,
          profiles: p.profiles ?? updated[idx].profiles,
          profiles_count: p.profiles_count ?? updated[idx].profiles_count,
          camp_id: p.camp_id ?? updated[idx].camp_id,
          camp_title: p.camp_title ?? updated[idx].camp_title,
          camp_slug: p.camp_slug ?? updated[idx].camp_slug,
          camp_owner_username: p.camp_owner_username ?? updated[idx].camp_owner_username,
          camp_url: p.camp_url ?? updated[idx].camp_url,
          camp_starts_at: p.camp_starts_at ?? updated[idx].camp_starts_at,
          camp_ends_at: p.camp_ends_at ?? updated[idx].camp_ends_at,
        };
        return updated;
      });
    };

    window.addEventListener('profile_post_updated', onUpdated as EventListener, { passive: true });
    return () => window.removeEventListener('profile_post_updated', onUpdated as EventListener);
  }, [postId, setPost, setRelatedPosts]);


  const deletePost = React.useCallback(async (target: PostFull | null) => {
    if (!target) return;
    try {
      const r = await fetch(apiJoin(API_BASE, `api/posts/${target.id}/delete/`), { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('Не удалось удалить пост');
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('profile_post_deleted', {
              detail: { id: target.id },
            }),
          );
        }
      } catch {
        /* noop */
      }
      setConfirmDeleteOpen(false);
      setConfirmDeleteTarget(null);
      if (target.id === post?.id) {
        try { router.back(); } catch { location.href = `/${username}`; }
      } else {
        setRelatedPosts(prev => prev.filter(p => p.id !== target.id));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  }, [API_BASE, post?.id, router, username]);

  const cityOnly = React.useMemo(() => {
    const raw = post?.location_name?.trim() || '';
    if (!raw) return '';
    return raw.split(',')[0]?.trim() || raw;
  }, [post?.location_name]);

  const tagProfiles: TaggedProfile[] = React.useMemo(() => (post?.profiles ?? []).map(p => ({ id: p.id, username: p.username, avatar_url: p.avatar_url })), [post?.profiles]);

  // Placeholder for future feed logic; we only scaffold here without modifying other files.

  // Скрыть глобальный Header только на этой странице, но оставить нижний навбар
  React.useEffect(() => {
    const root = document.documentElement;
    let prevHeaderHeight = '';
    try {
      prevHeaderHeight = root.style.getPropertyValue('--header-h');
      root.style.setProperty('--header-h', '0px');
    } catch { /* noop */ }
    
    // eslint-disable-next-line no-console
    console.log('[ProfilePostMobilePage] mount - acquiring hide-header', {
      username,
      postId,
      isOverlay,
      hadHideHeaderBefore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
    });
    
    acquireHideHeader();
    
    // eslint-disable-next-line no-console
    console.log('[ProfilePostMobilePage] mount - hide-header acquired', {
      username,
      postId,
      hasHideHeaderAfter: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
    });
    
    return () => {
      // eslint-disable-next-line no-console
      console.log('[ProfilePostMobilePage] unmount - releasing hide-header', {
        username,
        postId,
        hasHideHeaderBefore: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
      });
      
      try {
        if (prevHeaderHeight) root.style.setProperty('--header-h', prevHeaderHeight);
        else root.style.removeProperty('--header-h');
      } catch { /* noop */ }
      releaseHideHeader();
      
      // eslint-disable-next-line no-console
      console.log('[ProfilePostMobilePage] unmount - hide-header released', {
        username,
        postId,
        hasHideHeaderAfter: typeof document !== 'undefined' && document.body.classList.contains('hide-header'),
      });
    };
  }, [username, postId, isOverlay]);

  // Применяем стили для скрытия скроллбара - упрощенная версия без тяжелых операций
  React.useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    
    // Применяем стили напрямую
    el.style.setProperty('-ms-overflow-style', 'none', 'important');
    el.style.setProperty('scrollbar-width', 'none', 'important');
    el.classList.add('hide-scrollbar');
  }, [isOverlay, portalNode]);

  // Callback ref для немедленного применения стилей при монтировании
  const overlayRefCallback = React.useCallback((el: HTMLDivElement | null) => {
    overlayRef.current = el;
    if (el) {
      // Применяем стили сразу при монтировании элемента
      el.style.setProperty('-ms-overflow-style', 'none', 'important');
      el.style.setProperty('scrollbar-width', 'none', 'important');
      el.classList.add('hide-scrollbar');
    }
  }, []);

  const renderInOverlay = (children: React.ReactNode) => {
    // В режиме оверлея рендерим напрямую (без портала), чтобы работал LayerStack
    if (isOverlay) {
      return (
      <div
        ref={overlayRefCallback}
        className="absolute inset-0 bg-white overflow-y-auto hide-scrollbar"
        style={{ 
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          // Дополнительно для мобильных браузеров
          ...(typeof window !== 'undefined' && window.innerWidth <= 768 ? {
            WebkitAppearance: 'none',
          } : {}),
        } as React.CSSProperties}
      >
          {children}
        </div>
      );
    }
    // Для standalone страницы используем портал
    if (!portalNode) return null;
    return createPortal(
      <div
        ref={overlayRefCallback}
        // z‑index ниже стека LayerStack (3100+), чтобы
        // глобальные оверлеи (комментарии, лайки, теги и т.п.)
        // корректно отображались поверх standalone‑страницы поста.
        className="fixed inset-x-0 top-0 z-[2900] bg-white overflow-y-auto hide-scrollbar"
        style={{ 
          overscrollBehavior: 'contain', 
          bottom: bottomInset,
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          // Дополнительно для мобильных браузеров
          ...(typeof window !== 'undefined' && window.innerWidth <= 768 ? {
            WebkitAppearance: 'none',
          } : {}),
        } as React.CSSProperties}
      >
        {children}
      </div>,
      portalNode
    );
  };

  if (loading) {
    return renderInOverlay(
      <div className="min-h-screen bg-white" style={contentPaddingStyle}>
        <div className="p-4">Загрузка…</div>
      </div>,
    );
  }
  if (error) {
    return renderInOverlay(
      <div className="min-h-screen bg-white" style={contentPaddingStyle}>
        <div className="p-4 text-red-600">{error}</div>
      </div>,
    );
  }
  if (!post) return renderInOverlay(null);

  // images уже вычислен выше (см. до ранних return)
  const hasImages = images.length > 0;
  const isTextOnly = !hasImages && !!(post.text && post.text.trim());

  return renderInOverlay(
    <div className="min-h-screen bg-white overflow-x-hidden page-mobile-post" style={contentPaddingStyle}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white">
        <div className="h-[54px] flex items-center justify-between px-5 mt-3 mb-1">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                const authorUsername = post.author?.username || username;
                if (authorUsername) {
                  e.preventDefault();
                  e.stopPropagation();
                  // Всегда открываем профиль в оверлее
                  const handled = navigateProfile(e, { username: authorUsername });
                  if (!handled) {
                    // Fallback: открываем оверлей напрямую
                    openProfileOverlay({ username: authorUsername });
                  }
                }
              }}
              className="flex-shrink-0"
            >
              <SmartImage
                src={(post.author?.avatar_url && post.author.avatar_url.trim()) ? post.author.avatar_url : ((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg')}
                alt={post.author?.username || username}
                width={40}
                height={40}
                className="w-10 h-10 rounded-full object-cover border border-gray-200"
              />
            </button>
            <div className="min-w-0">
              <Link 
                href={`/${post.author?.username || username}`} 
                className="min-w-0"
                onClick={(e) => {
                  const authorUsername = post.author?.username || username;
                  if (authorUsername) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Всегда открываем профиль в оверлее
                    const handled = navigateProfile(e, { username: authorUsername });
                    if (!handled) {
                      // Fallback: открываем оверлей напрямую
                      openProfileOverlay({ username: authorUsername });
                    }
                  }
                }}
              >
                <span className="text-[16px] font-semibold truncate block max-w-[60vw]">
                  {post.author?.username || username}
                </span>
              </Link>
              {!!cityOnly && (
                <button
                  type="button"
                  onClick={goToPhotoLocationSearch}
                  className="text-left text-[12px] text-gray-500 truncate block max-w-[60vw] bg-transparent border-0 p-0 underline-offset-2 hover:underline"
                  title={cityOnly}
                >
                  {cityOnly}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-[20px] font-bold leading-none"
              aria-label="Ещё"
              onClick={() => openActionsForPost(post)}
            >
              ⋯
            </button>
            <button className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" aria-label="Закрыть" onClick={safeBack}>
              <CloseIcon />
            </button>
          </div>
        </div>
        {/* Тонкая линия под шапкой только если нет фото и указана локация */}
        {(!hasImages && !!cityOnly) && (
          <div className="h-px bg-gray-200" />
        )}
      </div>

      {/* Images */}
      {hasImages && (
        <div className="bg-black">
          <SwipeCarousel images={images} height={420} />
        </div>
      )}

      {/* Tagged camp */}
      {!!post.camp_id && !hideCampInfo && (
        <div className="px-3 py-2 border-b">
          <button
            type="button"
            className="block w-full text-left"
            onClick={(e) => {
              e.preventDefault();
              // Всегда открываем через оверлей, используя доступные данные о кэмпе
              // Приоритет: camp_id > camp_slug + username > camp_url
              if (post.camp_id) {
                // Если есть camp_id - используем его напрямую (самый надежный способ)
                openCampOverlay({
                  campId: post.camp_id,
                });
              } else if (post.camp_owner_username && post.camp_slug) {
                // Есть username и slug - используем их
                openCampOverlay({
                  username: post.camp_owner_username,
                  campNumber: post.camp_slug,
                });
              } else if (post.camp_url) {
                // Есть только URL - парсим его
                try {
                  const url = new URL(post.camp_url, 'https://dummy.navumi');
                  const pathParts = url.pathname.split('/').filter(Boolean);
                  if (pathParts.length >= 3 && pathParts[1] === 'camp') {
                    // Успешно распарсили путь вида /username/camp/slug
                    openCampOverlay({
                      username: pathParts[0],
                      campNumber: pathParts[2],
                    });
                  } else {
                    // Не удалось распарсить - используем campPath
                    openCampOverlay({
                      campPath: post.camp_url,
                    });
                  }
                } catch {
                  // Ошибка парсинга - используем campPath
                  openCampOverlay({
                    campPath: post.camp_url,
                  });
                }
              }
            }}
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="shrink-0 text-[13px] text-gray-500">{formatCampRange(post.camp_starts_at, post.camp_ends_at)}</span>
              <span className="text-[14px] font-medium inline-flex items-center gap-2 pr-5 min-w-0">
                <Calendar className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
                <span className="truncate">{post.camp_title || 'Кэмп'}</span>
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Actions row */}
      <div className="px-3 py-2 text-xs text-gray-600 flex items-center gap-3">
        {/* Лайк */}
        <div className="flex items-center gap-1">
          <button onClick={() => toggleLikeFor(post)} className={["w-9 h-9 flex items-center justify-center transition", post.liked ? 'text-red-500' : 'text-gray-700 hover:text-black'].join(' ')} aria-label={post.liked ? 'Убрать лайк' : 'Поставить лайк'} aria-pressed={!!post.liked}>
            <IconHeart filled={!!post.liked} />
          </button>
          {(post.likes_count ?? 0) > 0 && (
            <button type="button" onClick={() => openLikersModal({ postId: post.id })} className="text-sm font-semibold text-gray-900" aria-label="Список лайкнувших">
              {(post.likes_count ?? 0) >= 100 ? '99+' : String(post.likes_count ?? 0)}
            </button>
          )}
        </div>

        {/* Комментарии */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              try {
                // eslint-disable-next-line no-console
                console.info('[PostMobilePage] openComments from actions row', {
                  postId: post.id,
                  location: typeof window !== 'undefined' ? window.location.href : null,
                });
              } catch {
                /* noop */
              }
              openCommentsModal({
                postId: post.id,
                onSyncCommentsCount: (count) => handleCommentsCountSync(post.id, count),
              });
            }}
            className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
            aria-label="Перейти к комментариям"
          >
            <IconComment />
          </button>
          {(() => {
            // Показываем ТОЛЬКО сумму (корни + ответы): ранний engagement total или то, что уже синхронизировал оверлей
            const total = (engagementCommentsTotal ?? rootCommentsTotal ?? post.comments_count ?? 0);
              return total > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      // eslint-disable-next-line no-console
                      console.info('[PostMobilePage] openComments from total counter', {
                        postId: post.id,
                        total,
                        location: typeof window !== 'undefined' ? window.location.href : null,
                      });
                    } catch {
                      /* noop */
                    }
                    openCommentsModal({
                      postId: post.id,
                      onSyncCommentsCount: (count) => handleCommentsCountSync(post.id, count),
                    });
                  }}
                  className="text-sm font-semibold text-gray-900"
                >
                  {cap99(total)}
                </button>
              ) : null;
          })()}
        </div>

        {/* Отмеченные профили */}
        {(post.profiles_count ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => openTaggedProfilesModal({ items: tagProfiles, onRequestUntagSelf: post.id === post?.id ? () => { setConfirmUntagOpen(true); } : undefined })} className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black" aria-label="Отмеченные профили">
              <IconUser />
            </button>
            <button type="button" onClick={() => openTaggedProfilesModal({ items: tagProfiles, onRequestUntagSelf: post.id === post?.id ? () => { setConfirmUntagOpen(true); } : undefined })} className="text-sm font-semibold text-gray-900" aria-label="Отмеченные профили">
              {(post.profiles_count ?? 0) >= 100 ? '99+' : String(post.profiles_count ?? 0)}
            </button>
          </div>
        )}

        {/* Поделиться вправо */}
        <button type="button" onClick={() => sharePost(post)} className="ml-auto w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black" aria-label="Поделиться">
          <IconShare />
        </button>
      </div>
      {/* Если текста нет — показываем теги сразу под экшн-рядом */}


      {!!post.text && (
        <div className="px-5">
          <PostTextInline
            author={post.author?.username || username}
            text={post.text}
            isTextOnly={isTextOnly}
          />
        </div>
      )}


      {commentsLoading && (
        <div className="px-3 pt-2 text-[13px] text-gray-500">Загружаем комментарии…</div>
      )}

      {/* предпросмотр до 2 корневых комментов под текстом поста */}
      {previewComments.length > 0 && (
        <div className="px-5 mt-4 space-y-2" aria-label="Предпросмотр комментариев">
          {previewComments.map((c) => (
            <div key={c.id} className="text-[14px] leading-snug">
              <Link 
                href={`/${c.author?.username || ''}`} 
                className="font-semibold mr-1"
                onClick={(e) => {
                  const authorUsername = c.author?.username || '';
                  if (authorUsername) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Всегда открываем профиль в оверлее
                    const handled = navigateProfile(e, { username: authorUsername });
                    if (!handled) {
                      // Fallback: открываем оверлей напрямую
                      openProfileOverlay({ username: authorUsername });
                    }
                  }
                }}
              >
                {c.author?.username || 'user'}
              </Link>
              <span className="whitespace-pre-wrap break-words">{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {(activityTokens.length > 0 || hashtagTokens.length > 0) && (
        <div className="px-5">
          <PostTagsRow
            activities={activityTokens}
            hashtags={hashtagTokens}
            onTagClick={(kind, tag) => {
              const params = new URLSearchParams();
              // Определяем вкладку в зависимости от наличия фото
              const isPhotoPost = images.length > 0;
              params.set('tab', isPhotoPost ? 'photoposts' : 'articles');
              params.set('collapsed', '1');
              if (kind === 'activity' && tag.id != null) {
                params.append('activities', String(tag.id));
              } else if (kind === 'hashtag' && tag.id != null) {
                params.append('hashtags', String(tag.id));
              } else if (tag.name) {
                params.set('query', tag.name.replace(/^#/, ''));
              }
              openSearchOverlay(params);
            }}
          />
        </div>
      )}

      <div className="px-5 pt-5 pb-2 text-[12px] leading-none text-gray-500/70">
        {dateOnly(post.created_at)}
      </div>

      <section className="mt-4">
        <div className="px-5 py-1 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{relatedHeading}</h2>
          {relatedContext?.source === 'search_photos' && (
            <span className="text-[12px] text-gray-500 whitespace-nowrap">фильтры поиска</span>
          )}
          {relatedContext?.source === 'camp_marks' && (
            <span className="text-[12px] text-gray-500 whitespace-nowrap">отметки кэмпа</span>
          )}
        </div>
        {relatedLoading && (
          <div className="px-5 pb-4 text-sm text-gray-500">Загружаем похожие посты…</div>
        )}
        {relatedError && (
          <div className="px-5 pb-4 text-sm text-red-600">{relatedError}</div>
        )}
        {!relatedLoading && !relatedError && relatedPosts.length === 0 && (
          <div className="px-5 pb-6 text-sm text-gray-400">Здесь пока нет других постов.</div>
        )}
        <div>
          {relatedPosts.map((feedPost) => (
            <RelatedPostFullCard
              key={feedPost.id}
              post={feedPost}
              abs={abs}
              activityDict={activityDict}
              hashtagDict={hashtagDict}
              API_BASE={API_BASE}
              onClose={safeBack}
              onOpenActions={openActionsForPost}
              onToggleLike={toggleLikeFor}
              onOpenComments={(p) => {
                try {
                  // eslint-disable-next-line no-console
                  console.info('[PostMobilePage] onOpenComments from suggestion', {
                    postId: p.id,
                    location: typeof window !== 'undefined' ? window.location.href : null,
                  });
                } catch {
                  /* noop */
                }
                openCommentsModal({
                  postId: p.id,
                  onSyncCommentsCount: (count) => handleCommentsCountSync(p.id, count),
                });
              }}
              onOpenTags={(p, items) => openTaggedProfilesModal({ items, onRequestUntagSelf: p.id === post?.id ? () => { setConfirmUntagOpen(true); } : undefined })}
              onOpenLikers={(p) => openLikersModal({ postId: p.id })}
              onShare={sharePost}
              hideCampInfo={hideCampInfo}
              commentsTotalOverride={relatedCommentsTotals[feedPost.id] ?? null}
            />
          ))}
        </div>
      </section>

      {/* Sheets/Overlays - PostActionSheet теперь открывается через openModal в openActionsForPost */}

      <ConfirmModal
        open={confirmUntagOpen}
        onCancel={() => setConfirmUntagOpen(false)}
        onConfirm={async () => {
          if (!post) return;
          try {
            await ensureCsrf();
            const r = await fetch(apiJoin(API_BASE, `api/posts/${post.id}/untag-self/`), {
              method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': getCsrf() },
            });
            if (!r.ok) throw new Error('Не удалось удалить отметку');
            let srvCount: number | undefined;
            try {
              const j = await r.json();
              if (j && typeof j.profiles_count === 'number') srvCount = j.profiles_count as number;
            } catch { /* ignore */ }
            setConfirmUntagOpen(false);
            setPost(prev => {
              if (!prev) return prev;
              const nextProfiles = (prev.profiles ?? []).filter(p => p.username !== me);
              const prevCount = (prev.profiles_count ?? (prev.profiles?.length ?? 0));
              const nextCount = (typeof srvCount === 'number') ? srvCount : Math.max(0, prevCount - 1);
              return { ...prev, profiles: nextProfiles, profiles_count: nextCount };
            });
          } catch (e) {
            alert(e instanceof Error ? e.message : 'Ошибка');
          }
        }}
        title="Удалить отметку?"
        message="Уверены, что хотите удалить отметку своего профиля из данного поста?"
        cancelLabel="Отмена"
        confirmLabel="Удалить"
        destructive
      />

      <ReportModal
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        kind={reportTarget?.camp_id ? 'camp_post' : 'profile_post'}
        targetId={reportTarget?.id ?? 0}
        linkHint={
          reportTarget
            ? `${typeof window !== 'undefined' ? location.origin : ''}/${reportTarget.author?.username || username}/post/${reportTarget.id}`
            : undefined
        }
      />

      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={() => {
          setLoginRequiredOpen(false);
          clearScreens();
          setTimeout(() => {
            try { router.push('/auth/login'); } catch { location.href = '/auth/login'; }
          }, 150);
        }}
        title="Данное действие доступно только авторизованным пользователям"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onCancel={() => { setConfirmDeleteOpen(false); setConfirmDeleteTarget(null); }}
        onConfirm={() => deletePost(confirmDeleteTarget)}
        title="Удалить пост?"
        message="Действие нельзя будет отменить."
        confirmLabel="Да, удалить"
        destructive
      />


      {/* Скрыть глобальный Header только на этой странице */}
      <style jsx global>{`
        header.app-global-header { display: none !important; }
        html, body { overflow-x: hidden; }
        /* скрываем бегунки, но оставляем скролл; свайпы карусели не ломаем */
        body, .page-mobile-post { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        body::-webkit-scrollbar, .page-mobile-post::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        /* скрываем бегунок на контейнерах с overflow-y-auto - применяем с !important для гарантии */
        .hide-scrollbar { 
          -ms-overflow-style: none !important; 
          scrollbar-width: none !important; 
        }
        .hide-scrollbar::-webkit-scrollbar { 
          display: none !important; 
          width: 0 !important; 
          height: 0 !important; 
          background: transparent !important;
        }
        .hide-scrollbar::-webkit-scrollbar-track {
          display: none !important;
          background: transparent !important;
        }
        .hide-scrollbar::-webkit-scrollbar-thumb {
          display: none !important;
          background: transparent !important;
        }
      `}</style>
    </div>
  );
}
