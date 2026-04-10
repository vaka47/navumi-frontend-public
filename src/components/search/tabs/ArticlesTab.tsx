'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProfileTextPost from '@/components/profile/ProfileTextPost';
import type { TaggedProfile } from '@/components/post/mobile/TaggedProfilesOverlay';
import { campPathFrom } from '@/components/post/helpers/campPath';
import { saveMainScroll } from '@/lib/scrollRestoration';
import { useCommentsModal } from '@/hooks/useCommentsModal';
import { useLikersModal } from '@/hooks/useLikersModal';
import { useTaggedProfilesModal } from '@/hooks/useTaggedProfilesModal';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useAuth } from '@/context/AuthContext';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { getBrowserApiBase } from '@/lib/apiBase';

type UnknownRecord = Record<string, unknown>;

const API_BASE = getBrowserApiBase();

type TextPost = {
  id: string;
  username: string;
  text: string;
  created_at?: string | null;
  avatar_url?: string | null;
  likes?: number | null;
  comments?: number | null;
  marks?: number | null;
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

type EngagementCounts = {
  likes: number | null;
  comments: number | null;
  profiles: number | null;
  liked?: boolean;
};

const EMPTY_COUNTS: EngagementCounts = { likes: null, comments: null, profiles: null, liked: undefined };

type LikeToggleResponse = { liked?: boolean; likes_count?: number; error?: string };

type NavigatorWithShare = Navigator & { share?: (data: ShareData) => Promise<void> };
type NavigatorWithClipboard = Navigator & { clipboard?: { writeText?: (data: string) => Promise<void> } };

const pickString = (o: UnknownRecord | null | undefined, keys: string[]) => {
  if (!o) return undefined;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
};

const pickNumber = (o: UnknownRecord | null | undefined, keys: string[]) => {
  if (!o) return undefined;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
};

const parseNamedArray = (val: unknown): Array<{ id: number | string; name: string }> | undefined => {
  if (!Array.isArray(val)) return undefined;
  const out: Array<{ id: number | string; name: string }> = [];
  for (const it of val) {
    if (it && typeof it === 'object') {
      const obj = it as UnknownRecord;
      const name = typeof obj.name === 'string' ? obj.name : undefined;
      const id = (typeof obj.id === 'number' || typeof obj.id === 'string') ? obj.id : undefined;
      if (name && id !== undefined) out.push({ id, name });
    }
  }
  return out.length ? out : undefined;
};

const hasImages = (rec: UnknownRecord): boolean => {
  const arrays = ['images', 'photos', 'media', 'attachments'] as const;
  for (const key of arrays) {
    const val = rec[key];
    if (Array.isArray(val) && val.length > 0) return true;
  }
  const singles = ['image', 'photo', 'picture', 'thumbnail'] as const;
  for (const key of singles) {
    const val = rec[key];
    if (typeof val === 'string' && val.trim()) return true;
  }
  return false;
};

const useIsMobile = (query = '(max-width: 767px)') => {
  const [is, setIs] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia(query);
    const onChange = () => setIs(m.matches);
    onChange();
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [query]);
  return is;
};

// Sorting and filtering are now performed on the server,
// the client renders in the received order for parity with PhotosTab.

export default function ArticlesTab({ qs, active = true }: { qs: string; active?: boolean }) {
  const { authenticated } = useAuth();
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);
  const [posts, setPosts] = useState<TextPost[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [engagement, setEngagement] = useState<Record<string, EngagementCounts>>({});
  const stableCommentsRef = useRef<Record<string, number>>({});
  const stableProfilesRef = useRef<Record<string, number>>({});
  const likedTouchedRef = useRef<Record<string, true>>({});

  const [, setLoadingTagsFor] = useState<string | null>(null);

  const { isOverlay } = useOverlayEnvironment();

  const debug = useCallback((...args: unknown[]) => {
    if (!isOverlay) return;
    try {
      // eslint-disable-next-line no-console
      console.debug('[ArticlesTab]', ...args);
    } catch {
      /* noop */
    }
  }, [isOverlay]);

  const isMobile = useIsMobile();
  const commentsModal = useCommentsModal();
  const likersModal = useLikersModal();
  const taggedProfilesModal = useTaggedProfilesModal();

  // No client-side filter parsing required; keep URL changes minimal

  const toAbsUrl = useCallback((url?: string | null): string | null => {
    if (!url) return null;
    const trimmed = String(url).trim();
    if (!trimmed) return null;
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
    return trimmed.startsWith('/') ? `${API_BASE}${trimmed}` : `${API_BASE}/${trimmed}`;
  }, []);

  const buildPostUrl = useCallback((username: string, postId: number | string) => `/${username}/post/${postId}`, []);

  const sharePost = useCallback((post: TextPost) => {
    const path = buildPostUrl(post.username, post.id);
    const url = typeof window !== 'undefined' ? new URL(path, window.location.origin).toString() : path;
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithShare & NavigatorWithClipboard) : undefined;
    const title = `${post.username}: пост`;
    const text = `Посмотри этот пост на Navumi: ${url}`;

    const copyUrl = () => {
      if (nav?.clipboard?.writeText) {
        nav.clipboard.writeText(url).then(() => alert('Ссылка скопирована'), () => window.prompt('Скопируйте ссылку:', url));
      } else {
        window.prompt('Скопируйте ссылку:', url);
      }
    };

    if (nav?.share) {
      nav.share({ title, text, url }).catch(() => copyUrl());
      return;
    }
    copyUrl();
  }, [buildPostUrl]);

  const saveArticleScroll = () => {
    try {
      const y = typeof window !== 'undefined' ? window.scrollY : 0;
      sessionStorage.setItem('search:articles:scrollTop', String(y));
    } catch { /* noop */ }
  };

  const openTaggedProfiles = useCallback(async (postId: string) => {
    if (!API_BASE) return;
    try {
      setLoadingTagsFor(postId);
      let r = await fetch(`${API_BASE}/api/posts/${postId}/`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) r = await fetch(`${API_BASE}/api/posts/${postId}/`, { credentials: 'omit', cache: 'no-store' });
      if (!r.ok) throw new Error('failed');
      const j = (await r.json()) as { profiles?: Array<{ id: number; username: string; avatar_url?: string | null }> };
      const items: TaggedProfile[] = (j.profiles ?? []).map(p => ({ id: p.id, username: p.username, avatar_url: p.avatar_url ?? null }));
      taggedProfilesModal.open({
        items,
        centered: !isMobile,
      });
      setEngagement(prev => ({ ...prev, [postId]: { ...(prev[postId] ?? EMPTY_COUNTS), profiles: items.length } }));
    } catch {
      /* noop */
    } finally {
      setLoadingTagsFor(null);
    }
  }, [API_BASE, isMobile, taggedProfilesModal]);

  const normalizeArticle = useCallback((rec: UnknownRecord): TextPost | null => {
    const recPost = (typeof rec.post === 'object' && rec.post) ? (rec.post as UnknownRecord) : undefined;
    const author = (typeof rec.author === 'object' && rec.author) ? (rec.author as UnknownRecord) : undefined;
    const stats = (typeof rec.stats === 'object' && rec.stats) ? (rec.stats as UnknownRecord) : undefined;

    const id =
      pickNumber(rec, ['id', 'pk', 'post_id']) ??
      (recPost ? pickNumber(recPost, ['id', 'pk']) : undefined);
    const username =
      pickString(rec, ['author_username', 'username', 'user', 'owner']) ||
      pickString(author ?? null, ['username', 'name']) ||
      '';
    const text =
      pickString(rec, ['text', 'content', 'body', 'title']) ??
      (recPost ? pickString(recPost, ['text', 'content', 'body', 'title']) : '') ??
      '';
    if (!id || !username || !text.trim()) return null;
    if (hasImages(rec) || (recPost && hasImages(recPost))) return null;

    const created_at =
      pickString(rec, ['created_at', 'createdAt', 'date']) ??
      (recPost ? pickString(recPost, ['created_at', 'createdAt', 'date']) : null) ??
      null;

    const avatar_raw =
      pickString(rec, ['avatar', 'avatar_url', 'profile_picture', 'author_avatar', 'author_avatar_url']) ??
      (author ? pickString(author, ['avatar_url', 'avatar']) : undefined) ??
      (recPost ? pickString(recPost, ['avatar', 'avatar_url', 'profile_picture']) : undefined) ??
      null;
    const avatar_url = toAbsUrl(avatar_raw);

    const likes =
      pickNumber(rec, ['likes_count', 'like_count', 'likes']) ??
      (stats ? pickNumber(stats, ['likes_count', 'like_count', 'likes']) : undefined) ??
      (recPost ? pickNumber(recPost, ['likes_count', 'like_count', 'likes']) : undefined) ??
      0;

    const comments =
      pickNumber(rec, ['comments_total', 'comments_count', 'comment_count', 'comments']) ??
      (stats ? pickNumber(stats, ['comments_total', 'comments_count', 'comment_count', 'comments']) : undefined) ??
      (recPost ? pickNumber(recPost, ['comments_total', 'comments_count', 'comment_count', 'comments']) : undefined) ??
      0;

    const arrLen = (obj: UnknownRecord | undefined, key: string): number | undefined => {
      if (!obj) return undefined;
      const v = obj[key];
      return Array.isArray(v) ? v.length : undefined;
    };

    const marks =
      pickNumber(rec, ['profiles_count', 'marks_count', 'mentions_count', 'tagged_users_count', 'tags_count', 'marks']) ??
      (stats ? pickNumber(stats, ['profiles_count', 'marks_count', 'mentions_count', 'tagged_users_count', 'tags_count', 'marks']) : undefined) ??
      (recPost ? pickNumber(recPost, ['profiles_count', 'marks_count', 'mentions_count', 'tagged_users_count', 'tags_count', 'marks']) : undefined) ??
      arrLen(rec, 'profiles') ??
      arrLen(recPost, 'profiles') ??
      0;

    const liked =
      (typeof (rec.liked ?? recPost?.liked) === 'boolean')
        ? Boolean(rec.liked ?? recPost?.liked)
        : undefined;

    const activities =
      parseNamedArray(rec.activities) ??
      (recPost ? parseNamedArray(recPost.activities as unknown) : undefined);
    const hashtags =
      parseNamedArray(rec.hashtags) ??
      (recPost ? parseNamedArray(recPost.hashtags as unknown) : undefined);

    const location_name =
      pickString(rec, ['location_name', 'location']) ??
      (recPost ? pickString(recPost, ['location_name', 'location']) : null) ??
      null;

    const camp_owner_username =
      pickString(rec, ['camp_owner_username', 'organizer_username', 'owner']) ??
      (recPost ? pickString(recPost, ['camp_owner_username', 'organizer_username', 'owner']) : undefined) ??
      null;
    const camp_number =
      pickNumber(rec, ['camp_number', 'number']) ??
      (recPost ? pickNumber(recPost, ['camp_number', 'number']) : undefined) ??
      null;
    let camp_url =
      pickString(rec, ['camp_url', 'url']) ??
      (recPost ? pickString(recPost, ['camp_url', 'url']) : undefined) ??
      null;
    const camp_start_date =
      pickString(rec, ['camp_start_date', 'camp_starts_at', 'start_date', 'starts_at', 'from']) ??
      (recPost ? pickString(recPost, ['camp_start_date', 'camp_starts_at', 'start_date', 'starts_at', 'from']) : undefined) ??
      null;
    const camp_end_date =
      pickString(rec, ['camp_end_date', 'camp_ends_at', 'end_date', 'ends_at', 'to']) ??
      (recPost ? pickString(recPost, ['camp_end_date', 'camp_ends_at', 'end_date', 'ends_at', 'to']) : undefined) ??
      null;
    // Для поиска статей не подтягиваем camp_title из общих полей "title"/"name",
    // чтобы не получать фальшивую «отметку кэмпа» с первой строкой статьи.
    const camp_title =
      pickString(rec, ['camp_title', 'camp_name']) ??
      (recPost ? pickString(recPost, ['camp_title', 'camp_name']) : undefined) ??
      null;

    if (!camp_url && camp_owner_username) {
      const slug = pickString(rec, ['camp_slug']) ?? (recPost ? pickString(recPost, ['camp_slug']) : undefined);
      const public_key = pickString(rec, ['camp_public_key', 'public_key', 'key', 'pk']) ??
        (recPost ? pickString(recPost, ['camp_public_key', 'public_key', 'key', 'pk']) : undefined);
      const built = campPathFrom(camp_owner_username || undefined, {
        camp_number: camp_number ?? undefined,
        slug: slug ?? undefined,
        public_key: public_key ?? undefined,
      });
      if (built) camp_url = built;
    }

    return {
      id: String(id),
      username,
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
  }, [toAbsUrl]);

  useEffect(() => {
    debug('effect:start', { active, qs, reloadToken });
    if (!active) return;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setPosts([]);
    setEngagement({});
    stableCommentsRef.current = {};
    stableProfilesRef.current = {};

    const url = `${API_BASE}/api/search/articles/?${qs}`;
    debug('fetch:start', { url });
    fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const raw: UnknownRecord[] = Array.isArray((data as UnknownRecord).articles)
          ? ((data as UnknownRecord).articles as UnknownRecord[])
          : (Array.isArray(data) ? (data as UnknownRecord[]) : []);
        const normalized = raw
          .map(rec => normalizeArticle(rec))
          .filter((p): p is TextPost => !!p);
        debug('fetch:resolved', { totalRaw: raw.length, normalized: normalized.length });
        if (!cancelled) setPosts(normalized);
      })
      .catch((err) => {
        debug('fetch:error', { message: err instanceof Error ? err.message : String(err) });
        if (!cancelled) setError('Не удалось загрузить статьи');
      })
      .finally(() => {
        debug('effect:finally', { cancelled });
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; ac.abort(); };
  }, [qs, normalizeArticle, active, debug, reloadToken]);

  // hydrate missing details
  useEffect(() => {
    if (!API_BASE || posts.length === 0) return;
    const needHydrate = posts.filter((p) => {
      const missingDate = !p.created_at;
      const missingLoc = !p.location_name;
      const missingAvatar = !p.avatar_url;
      const missingCamp = !p.camp_title && !p.camp_url && !p.camp_start_date && !p.camp_end_date && !p.camp_number;
      return missingDate || missingLoc || missingAvatar || missingCamp;
    });
    if (!needHydrate.length) return;

    let cancelled = false;
    (async () => {
      const chunkSize = 4;
      for (let i = 0; i < needHydrate.length && !cancelled; i += chunkSize) {
        const slice = needHydrate.slice(i, i + chunkSize);
        await Promise.all(slice.map(async (post) => {
          const sid = String(post.id);
          let r = await fetch(`${API_BASE}/api/posts/${sid}/`, { credentials: 'include', cache: 'no-store' });
          if (!r.ok) r = await fetch(`${API_BASE}/api/posts/${sid}/`, { credentials: 'omit', cache: 'no-store' });
          if (!r.ok) return;
          const j = await r.json() as UnknownRecord;
          const author = (typeof j.author === 'object' && j.author) ? (j.author as UnknownRecord) : undefined;
          const avatar_raw = pickString(author ?? null, ['avatar_url', 'avatar']) ?? pickString(j, ['avatar_url', 'avatar']);
          const patch: Partial<TextPost> = {
            created_at: typeof j.created_at === 'string' ? j.created_at : undefined,
            location_name: typeof j.location_name === 'string' ? j.location_name : undefined,
            avatar_url: toAbsUrl(avatar_raw || undefined) || undefined,
            camp_title: typeof j.camp_title === 'string' ? j.camp_title : undefined,
            camp_url: typeof j.camp_url === 'string' ? j.camp_url : undefined,
            camp_start_date: typeof (j.camp_starts_at ?? j.camp_start_date) === 'string' ? (j.camp_starts_at ?? j.camp_start_date) as string : undefined,
            camp_end_date: typeof (j.camp_ends_at ?? j.camp_end_date) === 'string' ? (j.camp_ends_at ?? j.camp_end_date) as string : undefined,
            camp_owner_username: typeof j.camp_owner_username === 'string' ? j.camp_owner_username : undefined,
            camp_number: (typeof j.camp_number === 'number' || typeof j.camp_number === 'string') ? j.camp_number as number | string : undefined,
          };
          const likes = typeof j.likes_count === 'number' ? j.likes_count : undefined;
          const comments = typeof (j.comments_count ?? j.comments_total) === 'number'
            ? Number(j.comments_count ?? j.comments_total)
            : undefined;
          const profiles = typeof j.profiles_count === 'number' ? j.profiles_count : undefined;
          const liked = typeof j.liked === 'boolean' ? j.liked : undefined;

          if (cancelled) return;
          const touched = !!likedTouchedRef.current[sid];
          setPosts(prev =>
            prev.map(x => {
              if (String(x.id) !== sid) return x;
              const base: TextPost = {
                ...x,
                ...patch,
                likes: likes ?? x.likes ?? null,
                comments: comments ?? x.comments ?? null,
                marks: profiles ?? x.marks ?? null,
              };
              if (!touched && typeof liked === 'boolean') {
                return { ...base, liked } as TextPost;
              }
              return base;
            }),
          );
          setEngagement(prev => {
            const cur = prev[sid] ?? EMPTY_COUNTS;
            return {
              ...prev,
              [sid]: {
                likes: !touched && typeof likes === 'number' ? likes : cur.likes,
                comments: typeof comments === 'number' ? comments : cur.comments,
                profiles: typeof profiles === 'number' ? profiles : cur.profiles,
                liked: !touched && typeof liked === 'boolean' ? liked : cur.liked,
              },
            };
          });
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [posts, toAbsUrl]);

  // engagement bulk load (debounced + кэш)
  const postsIdsKey = useMemo(
    () => posts.map((p) => String(p.id)).join(','),
    [posts],
  );

  useEffect(() => {
    if (!API_BASE || posts.length === 0) return;
    const ids = posts.map(p => String(p.id));
    if (!ids.length) return;
    let cancelled = false;

    const pickNumberLoose = (o: UnknownRecord | null | undefined, keys: string[]): number | null => {
      if (!o) return null;
      for (const key of keys) {
        const v = o[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
      }
      return null;
    };

    const loadOne = async (postId: string) => {
      if (cancelled) return;
      try {
        let r = await fetch(`${API_BASE}/api/posts/${postId}/engagement/`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) r = await fetch(`${API_BASE}/api/posts/${postId}/engagement/`, { credentials: 'omit', cache: 'no-store' });
        if (!r.ok) return;
        const root = await r.json() as UnknownRecord;
        const postObj = (typeof root.post === 'object' && root.post) ? (root.post as UnknownRecord) : undefined;
        const likes = pickNumberLoose(root, ['likes_count', 'likes']) ?? pickNumberLoose(postObj, ['likes_count', 'likes']);
        const comments = pickNumberLoose(root, ['total_comments', 'comments_total', 'comments_count', 'comments']) ??
          pickNumberLoose(postObj, ['total_comments', 'comments_total', 'comments_count', 'comments']);
        const profiles = pickNumberLoose(root, ['profiles_count', 'tags_count', 'marks_count']) ??
          pickNumberLoose(postObj, ['profiles_count', 'tags_count', 'marks_count']);
        const liked = typeof root.liked === 'boolean' ? root.liked : undefined;

        if (cancelled) return;
        const touched = !!likedTouchedRef.current[postId];
        setEngagement(prev => ({
          ...prev,
          [postId]: {
            likes: !touched && typeof likes === 'number' ? likes : (prev[postId]?.likes ?? null),
            comments: comments ?? prev[postId]?.comments ?? null,
            profiles: profiles ?? prev[postId]?.profiles ?? null,
            liked: !touched && typeof liked === 'boolean' ? liked : prev[postId]?.liked,
          },
        }));
      } catch { /* noop */ }
    };

    (async () => {
      const { requestEngagementBulk } = await import('@/lib/engagementBulkClient');
      const map = await requestEngagementBulk(API_BASE, ids);
      if (cancelled) return;
      for (const pid of ids) {
        const entry = map[pid];
        if (!entry) continue;
        const likes = pickNumber(entry as UnknownRecord, ['likes_count', 'likes']);
        const comments = pickNumber(entry as UnknownRecord, ['comments_total', 'comments']);
        const profiles = pickNumber(entry as UnknownRecord, ['profiles_count', 'profiles']);
        const touched = !!likedTouchedRef.current[pid];
        setEngagement(prev => ({
          ...prev,
          [pid]: {
            likes: !touched && typeof likes === 'number' ? likes : (prev[pid]?.likes ?? null),
            comments: comments ?? prev[pid]?.comments ?? null,
            profiles: profiles ?? prev[pid]?.profiles ?? null,
            liked: prev[pid]?.liked,
          },
        }));
      }
      const missing = ids.filter(id => !(id in map));
      missing.forEach(pid => { void loadOne(pid); });
    })();

    return () => { cancelled = true; };
  }, [API_BASE, postsIdsKey]);

  const toggleLike = useCallback(async (post: TextPost) => {
    if (!API_BASE) return;
    if (!authenticated) {
      setLoginRequiredOpen(true);
      return;
    }
    if (hasTemporaryToken()) {
      setCompleteProfileModalOpen(true);
      return;
    }
    const id = String(post.id);
    likedTouchedRef.current[id] = true;
    setPosts(prev => prev.map(x => (String(x.id) === id ? { ...x, liked: !x.liked } : x)));
    setEngagement(prev => {
      const cur = prev[id] ?? { ...EMPTY_COUNTS, likes: post.likes ?? 0 };
      const wasLiked = typeof post.liked === 'boolean' ? post.liked : !!cur.liked;
      const nextLikes = (cur.likes ?? 0) + (wasLiked ? -1 : 1);
      return { ...prev, [id]: { ...cur, likes: Math.max(0, nextLikes) } };
    });
    try {
      const res = await fetch(`${API_BASE}/api/posts/${id}/like-toggle/`, { method: 'POST', credentials: 'include' });
      let body: LikeToggleResponse = {};
      try { body = await res.json(); } catch { /* ignore */ }
      if (!res.ok) throw new Error(body.error || 'Ошибка лайка');
      const srvLiked = typeof body.liked === 'boolean' ? body.liked : post.liked;
      const srvLikes = typeof body.likes_count === 'number' ? body.likes_count : undefined;
      setPosts(prev => prev.map(x => (String(x.id) === id ? { ...x, liked: srvLiked } : x)));
      if (typeof srvLikes === 'number') {
        setEngagement(prev => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_COUNTS), likes: srvLikes } }));
      }
    } catch {
      setPosts(prev => prev.map(x => (String(x.id) === id ? { ...x, liked: post.liked } : x)));
    }
  }, []);

  // Keep server ordering (already includes filters/sorting like Photos tab)
  const postsToRender = useMemo(() => posts, [posts]);

  // Глобальные события: создание/удаление постов
  useEffect(() => {
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
    };

    window.addEventListener('profile_post_created', handleCreated as EventListener);
    window.addEventListener('profile_post_deleted', handleDeleted as EventListener);
    return () => {
      window.removeEventListener('profile_post_created', handleCreated as EventListener);
      window.removeEventListener('profile_post_deleted', handleDeleted as EventListener);
    };
  }, []);

  // Диагностика скролла: логируем отрыв от низа, если появляется скролл у контейнера вкладки
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // ищем ближайший скролл-контейнер ленты (вкладки)
    const scrollHost = root.closest<HTMLElement>('[data-search-scroll]') || root.closest<HTMLElement>('[data-scroll-root]');
    if (!scrollHost) {
      try { console.warn('[ArticlesTab][scroll-log] scroll host not found'); } catch {}
      return;
    }
    let loggedDetach = false;
    const logState = (label: string) => {
      try {
        console.warn('[ArticlesTab][scroll-log]', label, {
          scrollTop: scrollHost.scrollTop,
          clientHeight: scrollHost.clientHeight,
          scrollHeight: scrollHost.scrollHeight,
          atBottom: Math.abs(scrollHost.scrollHeight - scrollHost.clientHeight - scrollHost.scrollTop) < 2,
        });
      } catch {}
    };
    logState('mount');
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e.isIntersecting) {
        logState('bottom-intersect');
      }
    }, { root: scrollHost, threshold: 1 });
    const bottom = bottomRef.current;
    if (bottom) io.observe(bottom);
    const onScroll = () => {
      const delta = scrollHost.scrollHeight - scrollHost.clientHeight - scrollHost.scrollTop;
      if (!loggedDetach && delta < 0) {
        loggedDetach = true;
        logState('detached');
      }
      if (delta < 2) {
        logState('at-bottom');
      }
    };
    scrollHost.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollHost.removeEventListener('scroll', onScroll);
      io.disconnect();
    };
  }, []);

  const touchScrollStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!isMobile) return undefined;
    return {
      touchAction: 'pan-y',
      msTouchAction: 'pan-y',
      overscrollBehaviorX: 'none',
    };
  }, [isMobile]);

  if (loading) return <div className="text-sm text-gray-500 py-6">Загрузка…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;
  if (!postsToRender.length) return <div className="text-sm text-gray-500 py-6">Пока ничего не нашли.</div>;

  return (
    <div ref={rootRef} className="min-h-full flex flex-col overflow-x-hidden" style={touchScrollStyle}>
      <ul className="divide-y divide-gray-100">
        {postsToRender.map((p) => {
          const id = String(p.id);
          const e = engagement[id];
          const likesCount = e?.likes ?? p.likes ?? 0;

          const gotComments = e?.comments ?? p.comments;
          if (typeof gotComments === 'number' && gotComments >= 0) {
            const prev = stableCommentsRef.current[id];
            if (prev === undefined || gotComments > prev) stableCommentsRef.current[id] = gotComments;
          }
          const commentsCount = stableCommentsRef.current[id] ?? 0;

          const gotProfiles = e?.profiles ?? p.marks;
          if (typeof gotProfiles === 'number' && gotProfiles >= 0) {
            const prev = stableProfilesRef.current[id];
            if (prev === undefined || gotProfiles > prev) stableProfilesRef.current[id] = gotProfiles;
          }
          const marksCount = stableProfilesRef.current[id] ?? 0;

          const openComments = () => {
            saveArticleScroll();
            commentsModal.open({
              postId: Number(id),
              centered: !isMobile,
              onSyncCommentsCount: (n) => {
                setEngagement(prev => ({
                  ...prev,
                  [id]: { ...(prev[id] ?? EMPTY_COUNTS), comments: n },
                }));
              },
            });
          };

          return (
            <li key={id}>
              <ProfileTextPost
                postId={p.id}
                username={p.username}
                avatarUrl={p.avatar_url || undefined}
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
                onOpenLikers={() => {
                  saveArticleScroll();
                  likersModal.open({
                    postId: Number(id),
                    centered: !isMobile,
                  });
                }}
                onOpenTags={() => {
                  saveArticleScroll();
                  void openTaggedProfiles(id);
                }}
                onNavigateAway={saveMainScroll}
                onShare={() => sharePost(p)}
              />
            </li>
          );
        })}
      </ul>

      <div ref={bottomRef} aria-hidden className="h-[1px]" />
      <ConfirmModal
        open={loginRequiredOpen}
        onCancel={() => setLoginRequiredOpen(false)}
        onConfirm={() => {
          setLoginRequiredOpen(false);
          try {
            location.assign('/auth/login');
          } catch {
            // ignore
          }
        }}
        title="Данное действие доступно только авторизованным пользователям"
        cancelLabel="Отмена"
        confirmLabel="Войти"
      />
      <CompleteProfileActionModal
        open={completeProfileModalOpen}
        onClose={() => setCompleteProfileModalOpen(false)}
      />
    </div>
  );
}
