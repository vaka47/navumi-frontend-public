'use client';

import React from 'react';
import ProfileTextPost from '@/components/profile/ProfileTextPost';
import { campPathFrom } from '@/components/post/helpers/campPath';
// ⬇️ тип для тегнутых профилей
import type { TaggedProfile } from '@/components/post/mobile/TaggedProfilesOverlay';
import CreatePostModal from '@/components/post/CreatePostModal';
import { useCreatePostProfileOverlay } from '@/hooks/useCreatePostProfileOverlay';
import { Button } from '@/components/ui/button';
import { useCommentsModal } from '@/hooks/useCommentsModal';
// ⬇️ новые хуки модалок
import { useLikersModal } from '@/hooks/useLikersModal';
import { useTaggedProfilesModal } from '@/hooks/useTaggedProfilesModal';
import { useAuth } from '@/context/AuthContext';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useLayerStack } from '@/context/LayerStackContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type UnknownRecord = Record<string, unknown>;

type LikeToggleResponse = {
  liked?: boolean;
  likes_count?: number;
  error?: string;
};

type NavigatorWithShare = Navigator & { share?: (data: ShareData) => Promise<void> };
type NavigatorWithClipboard = Navigator & { clipboard?: { writeText?: (data: string) => Promise<void> } };

type TextPost = {
  id: number | string;
  text: string;
  created_at?: string | null;
  avatar_url?: string | null;
  likes?: number;
  comments?: number;
  marks?: number;
  liked?: boolean;
  location_name?: string | null;
  activities?: Array<{ id: number | string; name: string }>;
  hashtags?: Array<{ id: number | string; name: string }>;
  camp_owner_username?: string | null;
  camp_number?: number | string | null;
  camp_url?: string | null;
  camp_start_date?: string | null;
  camp_end_date?: string | null;
  camp_title?: string | null;
};

type TextEditInitial = {
  postId: number;
  text?: string;
  images?: string[];
  camp?: { id: number; title: string; start_date?: string; end_date?: string } | null;
  taggedProfiles?: Array<{ id: number; username: string; avatar_url?: string }>;
  activityIds?: string[];
  hashtagIds?: string[];
  location_name?: string;
  latitude?: string;
  longitude?: string;
};

type PostDetails = {
  id: number;
  text?: string;
  images?: string[];
  camp_id?: number | null;
  camp_title?: string | null;
  camp_starts_at?: string | null;
  camp_ends_at?: string | null;
  profiles?: Array<{ id: number; username: string; avatar_url?: string | null }>;
  activities?: Array<{ id: number | string }>;
  hashtags?: Array<{ id: number | string }>;
  location_name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type EngagementCounts = {
  likes: number | null;
  comments: number | null;
  profiles: number | null;
  liked?: boolean;
};

const DEBUG_TEXT_TAB =
  process.env.NODE_ENV !== 'production' ||
  ((process.env.NEXT_PUBLIC_PROFILE_DEBUG ?? '0').toString() === '1');

const EMPTY_COUNTS: EngagementCounts = {
  likes: null,
  comments: null,
  profiles: null,
  liked: undefined,
};

export default function TextTab({
  username,
  isOwner = false,
  profileAvatarUrl,
}: {
  username: string;
  isOwner?: boolean;
  profileAvatarUrl?: string | null;
}) {
  const API_BASE = getBrowserApiBase();
  const shouldLog = () => {
    if (DEBUG_TEXT_TAB) return true;
    try {
      if (typeof window !== 'undefined') {
        // можно включить логирование без релиза: window.__NAVUMI_PROFILE_DEBUG = true
        // или localStorage.setItem('NAVUMI_PROFILE_DEBUG','1')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        if (w.__NAVUMI_PROFILE_DEBUG) return true;
        const v = window.localStorage?.getItem('NAVUMI_PROFILE_DEBUG') || '';
        return ['1', 'true', 'on', 'yes'].includes(v.toLowerCase());
      }
    } catch {}
    return false;
  };
  const dbg = (...a: unknown[]) => {
    if (!shouldLog()) return;
    try {
      if (typeof window !== 'undefined') console.debug('[TextTab]', ...a);
    } catch {
      /* noop */
    }
  };

  const [posts, setPosts] = React.useState<TextPost[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [engagement, setEngagement] = React.useState<Record<string, EngagementCounts>>({});

  // комменты — через общий модальный стек
  const commentsModal = useCommentsModal();
  // лайки / отметки — тоже через LayerStack
  const likersModal = useLikersModal();
  const taggedProfilesModal = useTaggedProfilesModal();

  const [, setLoadingTagsFor] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editInitial, setEditInitial] = React.useState<TextEditInitial | undefined>(undefined);
  const [createOpen, setCreateOpen] = React.useState(false);
  const { authenticated } = useAuth();
  const { open: openCreatePostProfileOverlay } = useCreatePostProfileOverlay();
  const { clearScreens } = useLayerStack();
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);

  const stableCommentsRef = React.useRef<Record<string, number>>({});
  const stableProfilesRef = React.useRef<Record<string, number>>({});
  const likedTouchedRef = React.useRef<Record<string, true>>({});

  // simple media query hook to detect mobile
  const useIsMobile = (query = '(max-width: 767px)') => {
    const [is, setIs] = React.useState(false);
    React.useEffect(() => {
      if (typeof window === 'undefined') return;
      const m = window.matchMedia(query);
      const on = () => setIs(m.matches);
      on();
      m.addEventListener('change', on);
      return () => m.removeEventListener('change', on);
    }, [query]);
    return is;
  };
  const isMobile = useIsMobile();

  const buildPostUrl = (id: number | string) => `/${username}/post/${id}`;

  const pickString = (o: UnknownRecord | null | undefined, keys: string[]) => {
    if (!o) return undefined;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return undefined;
  };
  const pickNumber = (o: UnknownRecord | null | undefined, keys: string[]) => {
    if (!o) return undefined;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) return Number(v);
    }
    return undefined;
  };
  const hasImages = (rec: UnknownRecord): boolean => {
    const arrays = ['images', 'photos', 'media', 'attachments'] as const;
    for (const key of arrays) {
      const val = rec[key];
      if (Array.isArray(val) && val.length > 0) return true;
    }
    const singles = ['image', 'photo', 'picture', 'thumbnail'] as const;
    for (const key of singles) {
      const v = rec[key];
      if (typeof v === 'string' && v.trim()) return true;
    }
    return false;
  };
  const toAbsUrl = React.useCallback(
    (url?: string | null): string | null => {
      if (!url) return null;
      const s = String(url).trim();
      if (!s) return null;
      if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
      const base = API_BASE || '';
      return s.startsWith('/') ? `${base}${s}` : `${base}/${s}`;
    },
    [API_BASE],
  );

  function saveMainScroll() {
    try {
      const y = typeof window !== 'undefined' ? window.scrollY : 0;
      sessionStorage.setItem('profile:texts:scrollTop', String(y));
    } catch {
      /* noop */
    }
  }

  function sharePost(postId: number | string) {
    const path = buildPostUrl(postId);
    const url =
      typeof window !== 'undefined'
        ? new URL(path, window.location.origin).toString()
        : String(path);
    const title = `${username}: пост`;
    const text = `Посмотри этот пост на Navumi: ${url}`;
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as NavigatorWithShare & NavigatorWithClipboard)
        : undefined;

    const copyUrl = () => {
      if (nav?.clipboard?.writeText) {
        nav.clipboard.writeText(url).then(
          () => alert('Ссылка скопирована'),
          () => window.prompt('Скопируйте ссылку:', url),
        );
      } else {
        window.prompt('Скопируйте ссылку:', url);
      }
    };

    if (nav?.share) {
      nav.share({ title, text, url }).catch(() => copyUrl());
      return;
    }
    copyUrl();
  }

  async function openTaggedProfiles(postId: string) {
    if (!API_BASE) return;
    try {
      setLoadingTagsFor(postId);
      let r = await fetch(`${API_BASE}/api/posts/${postId}/`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok)
        r = await fetch(`${API_BASE}/api/posts/${postId}/`, {
          credentials: 'omit',
          cache: 'no-store',
        });
      if (!r.ok) throw new Error('failed');

      const j = (await r.json()) as {
        profiles?: Array<{ id: number; username: string; avatar_url?: string | null }>;
      };

      const items: TaggedProfile[] = (j.profiles ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url ?? null,
      }));

      // синхронизируем счётчик отметок
      const cnt = items.length;
      setEngagement((prev) => ({
        ...prev,
        [postId]: { ...(prev[postId] ?? EMPTY_COUNTS), profiles: cnt },
      }));

      // открываем через общий стек
      taggedProfilesModal.open({
        items,
        centered: !isMobile,
        onRequestUntagSelf: () => {
          // для текстовых пока no-op, как и раньше
        },
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingTagsFor(null);
    }
  }

  async function openEditDesktop(postId: string) {
    if (!API_BASE) return;
    try {
      let r = await fetch(`${API_BASE}/api/posts/${postId}/`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok)
        r = await fetch(`${API_BASE}/api/posts/${postId}/`, {
          credentials: 'omit',
          cache: 'no-store',
        });
      if (!r.ok) throw new Error('failed');
      const j: PostDetails = await r.json();
      const images: string[] = Array.isArray(j.images)
        ? j.images.map((u: string) => {
            const s = String(u || '').trim();
            if (!s) return s;
            return /^(https?:)?\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')
              ? s
              : `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}`;
          })
        : [];
      const initial: TextEditInitial = {
        postId: Number(postId),
        text: j.text ?? '',
        images,
        camp: j.camp_id
          ? {
              id: j.camp_id,
              title: j.camp_title ?? '',
              start_date: j.camp_starts_at ?? undefined,
              end_date: j.camp_ends_at ?? undefined,
            }
          : null,
        taggedProfiles: Array.isArray(j.profiles)
          ? j.profiles.map((p) => ({
              id: p.id,
              username: p.username,
              avatar_url: (p.avatar_url ?? undefined) as string | undefined,
            }))
          : [],
        activityIds: Array.isArray(j.activities)
          ? j.activities.map((a) => String(a.id))
          : [],
        hashtagIds: Array.isArray(j.hashtags)
          ? j.hashtags.map((h) => String(h.id))
          : [],
        location_name: j.location_name ?? '',
        latitude: j.latitude != null ? String(j.latitude) : '',
        longitude: j.longitude != null ? String(j.longitude) : '',
      };
      setEditInitial(initial);
      setEditOpen(true);
    } catch {
      try {
        location.assign(`/${username}/post/${postId}/edit`);
      } catch {}
    }
  }

  // ==== загрузка списка текстовых постов ====
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!API_BASE || !username) return;
      setLoading(true);
      setError(null);
      dbg('fetch:start', { API_BASE, username });
      try {
        async function fetchWithCreds(url: string) {
          const base: RequestInit = { cache: 'no-store' };
          let resp: Response | null = null;
          try {
            resp = await fetch(url, { ...base, credentials: 'include' });
            if (!resp.ok && (resp.status === 401 || resp.status === 403))
              throw new Error('auth');
          } catch {
            try {
              resp = await fetch(url, { ...base, credentials: 'omit' });
            } catch {
              /* noop */
            }
          }
          return resp;
        }

        let arr: UnknownRecord[] = [];
        const primary = await fetchWithCreds(
          `${API_BASE}/api/profile/${username}/posts/texts/`,
        );
        if (primary && primary.ok) {
          const j = (await primary.json()) as UnknownRecord;
          const from = Array.isArray(j['posts'])
            ? (j['posts'] as UnknownRecord[])
            : Array.isArray(j)
            ? (j as UnknownRecord[])
            : [];
          arr = from;
        }
        dbg('fetch:primary.len', arr.length);
        if (!arr.length) {
          const r = await fetchWithCreds(
            `${API_BASE}/api/profile/${username}/posts/`,
          );
          if (r && r.ok) {
            const j2 = (await r.json()) as UnknownRecord;
            const from2 = Array.isArray(j2['posts'])
              ? (j2['posts'] as UnknownRecord[])
              : Array.isArray(j2)
              ? (j2 as UnknownRecord[])
              : [];
            arr = from2.filter((rec) => !hasImages(rec));
          }
        }

        const norm: TextPost[] = arr
          .map((rec) => {
            const recPost =
              typeof rec['post'] === 'object' && rec['post']
                ? (rec['post'] as UnknownRecord)
                : undefined;
            const author =
              typeof rec['author'] === 'object' && rec['author']
                ? (rec['author'] as UnknownRecord)
                : undefined;
            const stats =
              typeof rec['stats'] === 'object' && rec['stats']
                ? (rec['stats'] as UnknownRecord)
                : undefined;

            const id =
              pickNumber(rec, ['id', 'pk', 'post_id', 'postId']) ??
              (recPost ? pickNumber(recPost, ['id', 'pk']) : undefined) ??
              0;

            const text =
              pickString(rec, ['text', 'content', 'body', 'caption', 'description']) ??
              (recPost
                ? pickString(recPost, ['text', 'content', 'body', 'caption', 'description'])
                : '') ??
              '';

            const created_at =
              pickString(rec, ['created_at', 'createdAt', 'date', 'timestamp']) ??
              (recPost
                ? pickString(recPost, ['created_at', 'date', 'timestamp'])
                : undefined) ??
              null;

            const avatar_raw =
              pickString(rec, [
                'avatar',
                'avatar_url',
                'profile_picture',
                'author_avatar',
                'author_avatar_url',
                'user_avatar',
                'user_avatar_url',
              ]) ??
              (author
                ? pickString(author, ['avatar_url', 'avatar'])
                : undefined) ??
              (recPost
                ? pickString(recPost, [
                    'avatar',
                    'avatar_url',
                    'profile_picture',
                    'author_avatar',
                    'author_avatar_url',
                    'user_avatar',
                    'user_avatar_url',
                  ])
                : undefined) ??
              null;
            const avatar_url = toAbsUrl(avatar_raw);

            const likes =
              pickNumber(rec, ['likes_count', 'like_count', 'likes']) ??
              (stats
                ? pickNumber(stats, ['likes_count', 'like_count', 'likes'])
                : undefined) ??
              (recPost
                ? pickNumber(recPost, ['likes_count', 'like_count', 'likes'])
                : undefined) ??
              0;

            const comments =
              pickNumber(rec, [
                'comments_total',
                'comments_count',
                'comment_count',
                'comments',
              ]) ??
              (stats
                ? pickNumber(stats, [
                    'comments_total',
                    'comments_count',
                    'comment_count',
                    'comments',
                  ])
                : undefined) ??
              (recPost
                ? pickNumber(recPost, [
                    'comments_total',
                    'comments_count',
                    'comment_count',
                    'comments',
                  ])
                : undefined) ??
              0;

            const arrLen = (o: UnknownRecord | undefined, key: string) => {
              if (!o) return undefined;
              const v = o[key];
              return Array.isArray(v) ? v.length : undefined;
            };

            const marks =
              pickNumber(rec, [
                'profiles_count',
                'marks_count',
                'mentions_count',
                'tagged_users_count',
                'tags_count',
                'marks',
              ]) ??
              (stats
                ? pickNumber(stats, [
                    'profiles_count',
                    'marks_count',
                    'mentions_count',
                    'tagged_users_count',
                    'tags_count',
                    'marks',
                  ])
                : undefined) ??
              (recPost
                ? pickNumber(recPost, [
                    'profiles_count',
                    'marks_count',
                    'mentions_count',
                    'tagged_users_count',
                    'tags_count',
                    'marks',
                  ])
                : undefined) ??
              arrLen(rec, 'profiles') ??
              arrLen(recPost, 'profiles') ??
              0;

            const liked =
              typeof (rec['liked'] ?? recPost?.['liked']) === 'boolean'
                ? Boolean(rec['liked'] ?? recPost?.['liked'])
                : undefined;

            const parseNamed = (
              val: unknown,
            ): Array<{ id: number | string; name: string }> | undefined => {
              if (!Array.isArray(val)) return undefined;
              const out: Array<{ id: number | string; name: string }> = [];
              for (const it of val) {
                if (it && typeof it === 'object') {
                  const o = it as Record<string, unknown>;
                  const name =
                    typeof o['name'] === 'string' ? o['name'] : undefined;
                  const idv =
                    typeof o['id'] === 'number' || typeof o['id'] === 'string'
                      ? (o['id'] as number | string)
                      : undefined;
                  if (name && idv !== undefined) out.push({ id: idv, name });
                }
              }
              return out.length ? out : undefined;
            };

            const activities =
              parseNamed((rec as UnknownRecord)['activities']) ??
              (recPost
                ? parseNamed((recPost as UnknownRecord)['activities'])
                : undefined);

            const hashtags =
              parseNamed((rec as UnknownRecord)['hashtags']) ??
              (recPost
                ? parseNamed((recPost as UnknownRecord)['hashtags'])
                : undefined);

            const location_name =
              pickString(rec, ['location_name', 'location']) ??
              (recPost
                ? pickString(recPost, ['location_name', 'location'])
                : undefined) ??
              null;

            const camp_owner_username =
              pickString(rec, [
                'camp_owner_username',
                'organizer_username',
                'owner',
              ]) ??
              (recPost
                ? pickString(recPost, [
                    'camp_owner_username',
                    'organizer_username',
                    'owner',
                  ])
                : undefined) ??
              null;

            const camp_number =
              pickNumber(rec, ['camp_number', 'number']) ??
              (recPost ? pickNumber(recPost, ['camp_number', 'number']) : undefined) ??
              null;

            let camp_url =
              pickString(rec, ['camp_url', 'url']) ??
              (recPost
                ? pickString(recPost, ['camp_url', 'url'])
                : undefined) ??
              null;

            const camp_start_date =
              pickString(rec, [
                'camp_start_date',
                'camp_starts_at',
                'start_date',
                'starts_at',
                'from',
              ]) ??
              (recPost
                ? pickString(recPost, [
                    'camp_start_date',
                    'camp_starts_at',
                    'start_date',
                    'starts_at',
                    'from',
                  ])
                : undefined) ??
              null;

            const camp_end_date =
              pickString(rec, [
                'camp_end_date',
                'camp_ends_at',
                'end_date',
                'ends_at',
                'to',
              ]) ??
              (recPost
                ? pickString(recPost, [
                    'camp_end_date',
                    'camp_ends_at',
                    'end_date',
                    'ends_at',
                    'to',
                  ])
                : undefined) ??
              null;

            const camp_title =
              pickString(rec, ['camp_title', 'camp_name', 'title', 'name']) ??
              (recPost
                ? pickString(recPost, ['camp_title', 'camp_name', 'title', 'name'])
                : undefined) ??
              null;

            if (!camp_url && camp_owner_username) {
              const slug =
                pickString(rec, ['camp_slug']) ||
                (recPost ? pickString(recPost, ['camp_slug']) : undefined);
              const public_key =
                pickString(rec, [
                  'camp_public_key',
                  'public_key',
                  'key',
                  'pk',
                ]) ||
                (recPost
                  ? pickString(recPost, [
                      'camp_public_key',
                      'public_key',
                      'key',
                      'pk',
                    ])
                  : undefined);
              const built = campPathFrom(camp_owner_username || undefined, {
                camp_number: camp_number ?? undefined,
                slug: slug ?? undefined,
                public_key: public_key ?? undefined,
              });
              if (built) camp_url = built;
            }

            return {
              id: String(id || rec['id'] || ''),
              text,
              created_at,
              avatar_url,
              likes,
              comments,
              marks,
              liked,
              activities,
              hashtags,
              location_name,
              camp_owner_username,
              camp_number,
              camp_url,
              camp_start_date,
              camp_end_date,
              camp_title,
            };
          })
          .filter((p) => p.id && p.text.trim());

        dbg('normalize:done', { count: norm.length, sample: norm[0] });
        if (!cancelled) setPosts(norm);
      } catch {
        dbg('fetch:error');
        if (!cancelled) setError('Не удалось загрузить посты');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, username, toAbsUrl, reloadToken]);

  // ==== hydrate постов деталями ====
  const hydratedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    let cancelled = false;
    const API = API_BASE;
    if (!API || posts.length === 0) return;

    const needHydrate = posts
      .filter((p) => {
        const missingDate = typeof p.created_at === 'undefined';
        const missingLoc = typeof p.location_name === 'undefined';
        const missingAvatar = typeof p.avatar_url === 'undefined';
        const missingCamp = [p.camp_title, p.camp_url, p.camp_start_date, p.camp_end_date, p.camp_number].every(
          (v) => typeof v === 'undefined',
        );
        return missingDate || missingLoc || missingAvatar || missingCamp;
      })
      .map((p) => String(p.id))
      .filter((id) => !hydratedRef.current.has(id));
    if (!needHydrate.length) return;
    dbg('hydrate:need', needHydrate);

    (async () => {
      const chunkSize = 4;
      const ids = needHydrate;
      for (let i = 0; i < ids.length && !cancelled; i += chunkSize) {
        const slice = ids.slice(i, i + chunkSize);
        await Promise.all(
          slice.map(async (sid) => {
            const url = `${API}/api/posts/${sid}/`;
            try {
              let r = await fetch(url, {
                credentials: 'include',
                cache: 'no-store',
              });
              if (!r.ok && (r.status === 401 || r.status === 403)) {
                r = await fetch(url, {
                  credentials: 'omit',
                  cache: 'no-store',
                });
              }
              if (!r.ok) return;
              const j = (await r.json()) as Record<string, unknown>;
              const author =
                typeof j['author'] === 'object' && j['author']
                  ? (j['author'] as Record<string, unknown>)
                  : undefined;
              const avatar_raw =
                author && typeof author['avatar_url'] === 'string'
                  ? (author['avatar_url'] as string)
                  : undefined;
              const patch: Partial<TextPost> = {
                created_at:
                  typeof j['created_at'] === 'string'
                    ? (j['created_at'] as string)
                    : undefined,
                location_name:
                  typeof j['location_name'] === 'string'
                    ? (j['location_name'] as string)
                    : undefined,
                avatar_url: toAbsUrl(avatar_raw || undefined) || undefined,
                camp_title:
                  typeof j['camp_title'] === 'string'
                    ? (j['camp_title'] as string)
                    : undefined,
                camp_url:
                  typeof j['camp_url'] === 'string'
                    ? (j['camp_url'] as string)
                    : undefined,
                camp_start_date:
                  typeof j['camp_starts_at'] === 'string'
                    ? (j['camp_starts_at'] as string)
                    : typeof j['camp_start_date'] === 'string'
                    ? (j['camp_start_date'] as string)
                    : undefined,
                camp_end_date:
                  typeof j['camp_ends_at'] === 'string'
                    ? (j['camp_ends_at'] as string)
                    : typeof j['camp_end_date'] === 'string'
                    ? (j['camp_end_date'] as string)
                    : undefined,
                camp_owner_username:
                  typeof j['camp_owner_username'] === 'string'
                    ? (j['camp_owner_username'] as string)
                    : undefined,
                camp_number:
                  typeof j['camp_number'] === 'number' ||
                  typeof j['camp_number'] === 'string'
                    ? (j['camp_number'] as number | string)
                    : undefined,
              };
              const likes =
                typeof j['likes_count'] === 'number'
                  ? (j['likes_count'] as number)
                  : undefined;
              const comments =
                typeof j['comments_count'] === 'number' ||
                typeof j['comments_total'] === 'number'
                  ? Number(j['comments_count'] ?? j['comments_total'])
                  : undefined;
              const profiles =
                typeof j['profiles_count'] === 'number'
                  ? (j['profiles_count'] as number)
                  : undefined;
              const liked =
                typeof j['liked'] === 'boolean'
                  ? (j['liked'] as boolean)
                  : undefined;

              if (!cancelled) {
                const touched = !!likedTouchedRef.current[sid];
                setPosts((prev) =>
                  prev.map((x) => {
                    if (String(x.id) !== sid) return x;
                    const base: TextPost = {
                      ...(x as TextPost),
                      ...patch,
                      likes:
                        typeof likes === 'number'
                          ? likes
                          : x.likes,
                      comments:
                        typeof comments === 'number'
                          ? comments
                          : x.comments,
                      marks:
                        typeof profiles === 'number'
                          ? profiles
                          : x.marks,
                    };
                    if (!touched && typeof liked === 'boolean') {
                      return { ...base, liked } as TextPost;
                    }
                    return base;
                  }),
                );

                setEngagement((prev) => {
                  const cur = prev[sid] ?? EMPTY_COUNTS;
                  const nextLikes =
                    !touched && typeof likes === 'number' ? likes : cur.likes;
                  const nextComments =
                    typeof comments === 'number'
                      ? comments
                      : cur.comments;
                  const nextProfiles =
                    typeof profiles === 'number'
                      ? profiles
                      : cur.profiles;
                  const nextLiked =
                    !touched && typeof liked === 'boolean' ? liked : cur.liked;
                  return {
                    ...prev,
                    [sid]: {
                      likes: nextLikes,
                      comments: nextComments,
                      profiles: nextProfiles,
                      liked: nextLiked,
                    },
                  };
                });
              }
            } catch {
              /* ignore */
            } finally {
              hydratedRef.current.add(sid);
            }
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [API_BASE, posts, toAbsUrl]);

  // ==== engagement bulk ====
  const postsIdsKey = React.useMemo(
    () => posts.map((p) => String(p.id)).join(','),
    [posts],
  );

  React.useEffect(() => {
    let cancelled = false;
    const API = API_BASE;
    if (!API) return;

    const normalizeUsers = (j: unknown): unknown[] => {
      const root = (j ?? {}) as Record<string, unknown>;
      if (Array.isArray(j)) return j as unknown[];
      if (Array.isArray(root.results)) return root.results as unknown[];
      if (Array.isArray(root.users)) return root.users as unknown[];
      if (Array.isArray(root.likers)) return root.likers as unknown[];
      if (Array.isArray(root.data)) return root.data as unknown[];
      if (Array.isArray((root as Record<string, unknown>)['likes'] as unknown[]))
        return (root as Record<string, unknown>)['likes'] as unknown[];
      if (Array.isArray((root as Record<string, unknown>)['items'] as unknown[]))
        return (root as Record<string, unknown>)['items'] as unknown[];
      if (Array.isArray((root as Record<string, unknown>)['list'] as unknown[]))
        return (root as Record<string, unknown>)['list'] as unknown[];
      return [];
    };

    const pickNumberLoose = (
      o: Record<string, unknown> | null | undefined,
      keys: string[],
    ): number | null => {
      if (!o) return null;
      for (const k of keys) {
        const v = o[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() && !isNaN(Number(v)))
          return Number(v);
      }
      return null;
    };

    const extractCounts = (json: unknown): EngagementCounts => {
      const root = (json ?? {}) as Record<string, unknown>;
      const postObj: Record<string, unknown> | null =
        typeof root['post'] === 'object' && root['post']
          ? (root['post'] as Record<string, unknown>)
          : null;

      const likeCandidates: unknown[] = [
        root['post_likers'],
        root['post_likes'],
        root['liked_by'],
        postObj ? postObj['likers'] : undefined,
        postObj ? postObj['likes'] : undefined,
      ].filter(Boolean);

      let likes: number | null = null;
      for (const c of likeCandidates) {
        const arr = normalizeUsers(c);
        if (arr.length) {
          likes = arr.length;
          break;
        }
      }
      if (likes === null) {
        const numericLikes =
          pickNumberLoose(root, ['likes_count', 'likes']) ??
          pickNumberLoose(postObj, ['likes_count', 'likes']);
        if (numericLikes !== null) likes = numericLikes;
      }

      const commentsTotal =
        pickNumberLoose(root, [
          'total_comments',
          'comments_total',
          'comments_count',
          'comments',
        ]) ??
        pickNumberLoose(postObj, [
          'total_comments',
          'comments_total',
          'comments_count',
          'comments',
        ]) ??
        null;

      const rootProfiles = root['profiles'];
      const postProfiles = postObj ? postObj['profiles'] : undefined;
      const profilesCount =
        pickNumberLoose(root, ['profiles_count', 'tags_count', 'marks_count']) ??
        pickNumberLoose(postObj, ['profiles_count', 'tags_count', 'marks_count']) ??
        (Array.isArray(rootProfiles) ? rootProfiles.length : null) ??
        (Array.isArray(postProfiles) ? postProfiles.length : null) ??
        null;

      let liked: boolean | undefined =
        (typeof root['liked'] === 'boolean'
          ? (root['liked'] as boolean)
          : undefined) ??
        (typeof root['liked_by_me'] === 'boolean'
          ? (root['liked_by_me'] as boolean)
          : undefined) ??
        (typeof postObj?.['liked'] === 'boolean'
          ? (postObj!['liked'] as boolean)
          : undefined) ??
        (typeof postObj?.['liked_by_me'] === 'boolean'
          ? (postObj!['liked_by_me'] as boolean)
          : undefined);

      if (liked === undefined) {
        const raw = root['liked'] ?? postObj?.['liked'];
        if (typeof raw === 'number') liked = raw > 0;
        if (typeof raw === 'string')
          liked = ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
      }

      return { likes, comments: commentsTotal, profiles: profilesCount, liked };
    };

    const loadOne = async (postId: string) => {
      const url = `${API}/api/posts/${postId}/engagement/`;
      try {
        let r = await fetch(url, {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!r.ok && (r.status === 401 || r.status === 403)) {
          r = await fetch(url, {
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
        }
        if (!r.ok) return;
        const j = await r.json();
        const cnt = extractCounts(j);
        dbg('engagement', postId, cnt);
        if (!cancelled) {
          const touched = !!likedTouchedRef.current[postId];
          setEngagement((prev) => {
            const cur = prev[postId] ?? EMPTY_COUNTS;
            return {
              ...prev,
              [postId]: {
                likes:
                  !touched && typeof cnt.likes === 'number'
                    ? cnt.likes
                    : cur.likes,
                comments: cnt.comments ?? cur.comments,
                profiles: cnt.profiles ?? cur.profiles,
                liked:
                  !touched && typeof cnt.liked === 'boolean'
                    ? cnt.liked
                    : cur.liked,
              },
            };
          });
          if (!touched && typeof cnt.liked === 'boolean') {
            setPosts((prev) =>
              prev.map((x) =>
                String(x.id) === postId ? { ...x, liked: cnt.liked } : x,
              ),
            );
          }
        }
      } catch {
        /* ignore */
      }
    };

    (async () => {
      const ids = posts.map((p) => String(p.id)).filter(Boolean);
      if (!ids.length) return;
      const { requestEngagementBulk } = await import(
        '@/lib/engagementBulkClient'
      );
      const map = await requestEngagementBulk(API, ids);
      if (cancelled) return;
      const merge: Record<string, EngagementCounts> = {};
      const likedPatch: Record<string, boolean> = {};
      for (const [id, it] of Object.entries(map)) {
        const likes =
          pickNumber(it as UnknownRecord, ['likes_count', 'likes']) ?? null;
        const comments =
          pickNumber(it as UnknownRecord, ['comments_total', 'comments']) ??
          null;
        const profiles =
          pickNumber(it as UnknownRecord, ['profiles_count', 'profiles']) ??
          null;
        const likedVal =
          typeof (it as UnknownRecord)['liked'] === 'boolean'
            ? ((it as UnknownRecord)['liked'] as boolean)
            : undefined;
        merge[id] = { likes, comments, profiles, liked: likedVal };
        if (!likedTouchedRef.current[id] && typeof likedVal === 'boolean') {
          likedPatch[id] = likedVal;
        }
      }
      if (Object.keys(merge).length) {
        setEngagement((prev) => {
          const next: Record<string, EngagementCounts> = { ...prev };
          for (const [id, cnt] of Object.entries(merge)) {
            const cur = prev[id] ?? EMPTY_COUNTS;
            next[id] = {
              likes:
                !likedTouchedRef.current[id] && typeof cnt.likes === 'number'
                  ? cnt.likes
                  : cur.likes,
              comments: cnt.comments ?? cur.comments,
              profiles: cnt.profiles ?? cur.profiles,
              liked:
                !likedTouchedRef.current[id] && typeof cnt.liked === 'boolean'
                  ? cnt.liked
                  : cur.liked,
            };
          }
          return next;
        });
        if (Object.keys(likedPatch).length) {
          setPosts((prev) =>
            prev.map((p) => {
              const key = String(p.id);
              const val = likedPatch[key];
              return val === undefined ? p : ({ ...p, liked: val } as TextPost);
            }),
          );
        }
      }
      const missing = ids.filter((id) => !(id in map));
      missing.forEach((pid) => loadOne(pid));
    })();

    return () => {
      cancelled = true;
    };
  }, [API_BASE, postsIdsKey]);

  // Глобальные события: создание/удаление текстовых постов
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCreated = () => {
      setReloadToken((t) => t + 1);
    };

    const handleDeleted = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number | string }>).detail;
      const rawId = detail?.id;
      if (rawId == null) return;
      setPosts((prev) =>
        prev.filter((p) => {
          if (typeof rawId === 'number') return Number(p.id) !== rawId;
          return String(p.id) !== String(rawId);
        }),
      );
      setEngagement((prev) => {
        const cp = { ...prev };
        const key = typeof rawId === 'number' ? String(rawId) : String(rawId);
        delete cp[key];
        return cp;
      });
    };

    window.addEventListener('profile_post_created', handleCreated as EventListener);
    window.addEventListener('profile_post_deleted', handleDeleted as EventListener);
    return () => {
      window.removeEventListener('profile_post_created', handleCreated as EventListener);
      window.removeEventListener('profile_post_deleted', handleDeleted as EventListener);
    };
  }, []);

  // ==== лайк ====
  const toggleLike = async (p: TextPost) => {
    if (!API_BASE) return;
    if (!authenticated) {
      setLoginRequiredOpen(true);
      return;
    }
    if (hasTemporaryToken()) {
      setCompleteProfileModalOpen(true);
      return;
    }
    const id = String(p.id);
    likedTouchedRef.current[id] = true;

    setPosts((prev: TextPost[]) =>
      prev.map((x) => (String(x.id) === id ? { ...x, liked: !x.liked } : x)),
    );

    setEngagement((prev: Record<string, EngagementCounts>) => {
      const cur: EngagementCounts =
        prev[id] ?? { ...EMPTY_COUNTS, likes: p.likes ?? 0, comments: p.comments ?? null };
      const wasLiked = typeof p.liked === 'boolean' ? p.liked : !!cur.liked;
      const nextLikes = (cur.likes ?? 0) + (wasLiked ? -1 : 1);
      return {
        ...prev,
        [id]: { ...cur, likes: Math.max(0, nextLikes) },
      };
    });

    try {
      const r = await fetch(`${API_BASE}/api/posts/${id}/like-toggle/`, {
        method: 'POST',
        credentials: 'include',
      });

      let j: LikeToggleResponse = {};
      try {
        j = await r.json();
      } catch {
        /* ignore */
      }

      if (!r.ok) {
        const msg =
          typeof j.error === 'string' ? j.error : 'Ошибка лайка';
        throw new Error(msg);
      }

      const srvLiked =
        typeof j.liked === 'boolean' ? j.liked : !!p.liked;
      const srvLikes =
        typeof j.likes_count === 'number' ? j.likes_count : undefined;

      setPosts((prev: TextPost[]) =>
        prev.map((x) =>
          String(x.id) === id ? { ...x, liked: srvLiked } : x,
        ),
      );

      if (typeof srvLikes === 'number') {
        setEngagement((prev: Record<string, EngagementCounts>) => ({
          ...prev,
          [id]: { ...(prev[id] ?? EMPTY_COUNTS), likes: srvLikes },
        }));
      }
    } catch {
      setPosts((prev: TextPost[]) =>
        prev.map((x) =>
          String(x.id) === id ? { ...x, liked: p.liked } : x,
        ),
      );
      setEngagement((prev: Record<string, EngagementCounts>) => ({
        ...prev,
        [id]:
          prev[id] ??
          {
            ...EMPTY_COUNTS,
            likes: p.likes ?? 0,
            comments: p.comments ?? null,
          },
      }));
    }
  };

  const isMobilePlain =
    typeof window !== 'undefined' && window.innerWidth < 768;
  const onCreateArticle = () => {
    if (isMobilePlain) openCreatePostProfileOverlay({ mode: 'create' });
    else setCreateOpen(true);
  };

  if (loading)
    return (
      <div className="px-3 sm:px-4 py-4 text-sm text-gray-500 text-center">
        Загружаем посты…
      </div>
    );
  if (error)
    return (
      <div className="px-3 sm:px-4 py-4 text-sm text-red-600 text-center">
        {error}
      </div>
    );

  return (
    <>
      {posts.length === 0 && !loading && !error ? (
        <div className="px-4 py-10 text-center">
          {isOwner ? (
            <>
              <div className="mb-4">
                <Button
                  variant="neutral"
                  className="min-w-[18ch] justify-center"
                  onClick={onCreateArticle}
                >
                  Добавить статью
                </Button>
              </div>
              <div className="text-sm text-gray-500">
                просто опубликуйте пост без фотографий
              </div>
              {!isMobilePlain && (
                <CreatePostModal
                  open={createOpen}
                  onClose={() => setCreateOpen(false)}
                />
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500">
              Статьи пока не написаны
            </div>
          )}
        </div>
      ) : null}

      <ul className="divide-y divide-gray-100">
        {posts.map((p: TextPost) => {
          const id = String(p.id);
          const e = engagement[id];
          const likesCount = e?.likes ?? p.likes ?? 0;

          const gotComments = e?.comments ?? p.comments;
          if (typeof gotComments === 'number' && gotComments >= 0) {
            const prev = stableCommentsRef.current[id];
            if (prev === undefined || gotComments > prev)
              stableCommentsRef.current[id] = gotComments;
          }
          const commentsCount = stableCommentsRef.current[id] ?? 0;

          const gotProfiles = e?.profiles ?? p.marks;
          if (typeof gotProfiles === 'number' && gotProfiles >= 0) {
            const prev = stableProfilesRef.current[id];
            if (prev === undefined || gotProfiles > prev)
              stableProfilesRef.current[id] = gotProfiles;
          }
          const marksCount = stableProfilesRef.current[id] ?? 0;

          dbg('render:item', {
            id,
            liked: p.liked,
            likesCount,
            commentsCount,
            marksCount,
            hasLoc: !!p.location_name,
            hasCampUrl: !!p.camp_url,
            hasCampNumber: p.camp_number != null,
            campTitle: p.camp_title || null,
            avatar: (p.avatar_url || '').slice(0, 60) || null,
          });

          const openComments = () => {
            saveMainScroll();
            commentsModal.open({
              postId: Number(id),
              centered: !isMobile,
              onSyncCommentsCount: (n) => {
                setEngagement((prev: Record<string, EngagementCounts>) => {
                  const base = prev[id] ?? EMPTY_COUNTS;
                  return { ...prev, [id]: { ...base, comments: n } };
                });
              },
            });
          };

          return (
            <li key={id}>
              <ProfileTextPost
                postId={p.id}
                username={username}
                avatarUrl={p.avatar_url || undefined}
                fallbackAvatarUrl={profileAvatarUrl || undefined}
                text={p.text}
                createdAt={p.created_at}
                locationName={p.location_name || undefined}
                activities={p.activities}
                hashtags={p.hashtags}
                filterTargetTab="articles"
                camp={
                  p.camp_owner_username ||
                  p.camp_number ||
                  p.camp_url ||
                  p.camp_title ||
                  p.camp_start_date ||
                  p.camp_end_date
                    ? {
                        organizerUsername: p.camp_owner_username || undefined,
                        campNumber: p.camp_number || undefined,
                        url: p.camp_url || undefined,
                        start_date: p.camp_start_date || undefined,
                        end_date: p.camp_end_date || undefined,
                        title: p.camp_title || undefined,
                      }
                    : null
                }
                liked={p.liked}
                likesCount={likesCount}
                commentsCount={commentsCount}
                marksCount={marksCount}
                onToggleLike={() => toggleLike(p)}
                onOpenComments={openComments}
                onCommentPreviewClick={openComments}
                onOpenLikers={() => {
                  saveMainScroll();
                  likersModal.open({
                    postId: Number(id),
                    centered: !isMobile,
                  });
                }}
                onOpenTags={() => {
                  saveMainScroll();
                  void openTaggedProfiles(id);
                }}
                onShare={() => sharePost(p.id)}
                onNavigateAway={() => saveMainScroll()}
                onDeleted={(deletedId) => {
                  const key = String(deletedId);
                  setPosts((prev: TextPost[]) =>
                    prev.filter((x) => String(x.id) !== key),
                  );
                  setEngagement((prev: Record<string, EngagementCounts>) => {
                    const cp = { ...prev };
                    delete cp[key];
                    return cp;
                  });
                }}
                onRequestEdit={
                  !isMobile ? () => openEditDesktop(id) : undefined
                }
              />
            </li>
          );
        })}
      </ul>

      {/* Модалка редактирования поста — только для десктопа */}
      {!isMobile && (
        <CreatePostModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          initial={editInitial}
          onSaved={(updated) => {
            setEditOpen(false);
            if (updated && typeof updated === 'object') {
              type UpdatedPostPartial = {
                id?: number | string;
                text?: string;
                location_name?: string | null;
                camp_title?: string | null;
                camp_starts_at?: string | null;
                camp_ends_at?: string | null;
                camp_url?: string | null;
              };
              const u = updated as UpdatedPostPartial;
              const id = String(u.id ?? editInitial?.postId);
              setPosts((prev) =>
                prev.map((x) => {
                  if (String(x.id) !== id) return x;
                  return {
                    ...x,
                    text: (u.text ?? x.text) as string,
                    location_name: (u.location_name ?? x.location_name) as
                      | string
                      | null,
                    camp_title: (u.camp_title ?? x.camp_title) as
                      | string
                      | null,
                    camp_start_date: (u.camp_starts_at ?? x.camp_start_date) as
                      | string
                      | null,
                    camp_end_date: (u.camp_ends_at ?? x.camp_end_date) as
                      | string
                      | null,
                    camp_url: (u.camp_url ?? x.camp_url) as string | null,
                  } as TextPost;
                }),
              );
            }
          }}
        />
      )}
      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={() => {
          setLoginRequiredOpen(false);
          clearScreens();
          setTimeout(() => {
            try {
              location.assign('/auth/login');
            } catch {
              // ignore
            }
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
    </>
  );
}
