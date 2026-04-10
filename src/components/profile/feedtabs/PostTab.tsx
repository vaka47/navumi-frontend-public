'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import CreatePostModal from '@/components/post/CreatePostModal';
import PostCardProfile from '@/components/post/PostCardProfile';
import { useCreatePostProfileOverlay } from '@/hooks/useCreatePostProfileOverlay';
import { getBrowserApiBase } from '@/lib/apiBase';

type PostSummary = { id: number | string; text?: string | null; images?: string[] };

export default function PostTab({ username, isOwner = false }: { username: string; isOwner?: boolean }) {
  const API_BASE = getBrowserApiBase();
  const [posts, setPosts] = React.useState<PostSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const { open: openCreatePostProfileOverlay } = useCreatePostProfileOverlay();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        async function fetchWithCreds(url: string) {
          const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
          let resp: Response | null = null;
          try { resp = await tryFetch('include'); if (!resp.ok && (resp.status === 401 || resp.status === 403)) throw new Error('auth'); }
          catch { try { resp = await tryFetch('omit'); } catch { /* noop */ } }
          return resp;
        }

        // 1) Фото-посты
        const url = `${API_BASE}/api/profile/${username}/posts/photos/`;
        let r = await fetchWithCreds(url);
        type UnknownRecord = Record<string, unknown>;
        let arr: PostSummary[] = [];
        if (r && r.ok) {
          const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
          const root = j as { posts?: unknown };
          arr = Array.isArray(root.posts) ? (root.posts as PostSummary[]) : [];
        }

        // 2) Фолбэк на общий список
        if (!arr.length) {
          r = await fetchWithCreds(`${API_BASE}/api/profile/${username}/posts/`);
          if (r && r.ok) {
            const j2: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
            const root2 = j2 as { posts?: unknown };
            const all = Array.isArray(root2.posts) ? (root2.posts as PostSummary[]) : [];
            arr = all.filter(p => (p.images?.length ?? 0) > 0);
          }
        }

        if (!cancelled) setPosts(arr);
      } catch {
        if (!cancelled) setError('Не удалось загрузить посты');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [API_BASE, username, reloadToken]);

  const withImages = React.useMemo(() => posts.filter(p => (p.images?.length ?? 0) > 0), [posts]);
  const abs = React.useCallback((u?: string | null) => (u ? (u.startsWith('http') ? u : `${API_BASE}${u}`) : null), [API_BASE]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const onCreateClick = () => {
    if (isMobile) openCreatePostProfileOverlay({ mode: 'create' });
    else setCreateOpen(true);
  };

  // Глобальные события: создание/удаление постов профиля
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
    };

    window.addEventListener('profile_post_created', handleCreated as EventListener);
    window.addEventListener('profile_post_deleted', handleDeleted as EventListener);
    return () => {
      window.removeEventListener('profile_post_created', handleCreated as EventListener);
      window.removeEventListener('profile_post_deleted', handleDeleted as EventListener);
    };
  }, []);

  if (loading) return <div className="px-2 py-4 text-sm text-gray-500 text-center">Загружаем посты…</div>;
  if (error) return <div className="px-2 py-4 text-sm text-red-600 text-center">{error}</div>;

  return (
    // Плотная сетка: 1px-гаттер, без внешних полей у карточек
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-[1px] bg-white">
      {withImages.length === 0 ? (
        isOwner ? (
          <div className="col-span-full px-4 py-8 text-center">
            <Button
              variant="neutral"
              className="min-w-[18ch] justify-center"
              onClick={onCreateClick}
            >
              Опубликовать пост
            </Button>
            {!isMobile && (
              <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} />
            )}
          </div>
        ) : (
          <div className="col-span-full px-2 py-6 text-center text-sm text-gray-500">Фотографии пока не опубликованы</div>
        )
      ) : (
        withImages.map((p) => (
          <PostCardProfile
            key={p.id}
            variant="compact"
            showTextOverlay={false}
            feedSource={{ source: 'profile_posts', username }}
            post={{
              id: p.id,
              authorUsername: username,
              firstImageUrl: abs(p.images?.[0] ?? null) ?? undefined,
              imagesCount: p.images?.length ?? 0,
              // текст вообще не используем на плитке
            }}
          />
        ))
      )}
    </div>
  );
}
