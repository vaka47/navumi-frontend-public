'use client';

import React from 'react';
import PostCardProfile from '@/components/post/PostCardProfile';
import { getBrowserApiBase } from '@/lib/apiBase';

type PostSummary = { id: number | string; text?: string | null; images?: string[]; author?: string };

export default function PostWithMeTab({ username }: { username: string }) {
  const API_BASE = getBrowserApiBase();
  const [posts, setPosts] = React.useState<PostSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

        const urls = [
          `${API_BASE}/api/profile/${username}/marks/`,
          `${API_BASE}/api/profile/${username}/tagged-posts/`,
          `${API_BASE}/api/profile/${username}/with-me/`,
          `${API_BASE}/api/profile/${username}/mentions/`,
        ];

        let loaded: PostSummary[] = [];
        type UnknownRecord = Record<string, unknown>;
        for (const u of urls) {
          const r = await fetchWithCreds(u);
          if (!r || !r.ok) continue;
          const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
          const root = j as { posts?: unknown; results?: unknown };
          const arr = Array.isArray(root.posts)
            ? (root.posts as PostSummary[])
            : Array.isArray(root.results)
              ? (root.results as PostSummary[])
              : [];
          if (arr.length) { loaded = arr; break; }
        }

        if (!cancelled) setPosts(loaded);
      } catch {
        if (!cancelled) setError('Не удалось загрузить отметки');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [API_BASE, username]);

  const abs = React.useCallback((u?: string | null) => (u ? (u.startsWith('http') ? u : `${API_BASE}${u}`) : null), [API_BASE]);

  if (loading) return <div className="px-2 py-4 text-sm text-gray-500 text-center">Загружаем отметки…</div>;
  if (error) return <div className="px-2 py-4 text-sm text-red-600 text-center">{error}</div>;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-[1px] bg-white">
      {posts.length === 0 ? (
        <div className="col-span-full px-2 py-6 text-center text-sm text-gray-500">профиль пока нигде не упомянут</div>
      ) : (
        posts
          .filter((p) => (p.images?.length ?? 0) > 0)
          .map((p) => (
            <PostCardProfile
              key={p.id}
              variant="compact"
              showTextOverlay={false}
              feedSource={{ source: 'profile_marks', username }}
              href={`/${p.author || username}/post/${p.id}`}
              post={{
                id: p.id,
                authorUsername: p.author || username,
                firstImageUrl: abs(p.images?.[0] ?? null) ?? undefined,
                imagesCount: p.images?.length ?? 0,
              }}
            />
          ))
      )}
    </div>
  );
}
