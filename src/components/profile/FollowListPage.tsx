'use client';

import React from 'react';
import SmartImage from '@/components/SmartImage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useLayerStack } from '@/context/LayerStackContext';
import { navigateBack } from '@/lib/navBack';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { acquireHideHeader, releaseHideHeader } from '@/lib/headerVisibility';
import { getBrowserApiBase } from '@/lib/apiBase';
import { startTelegramLinkFlow } from '@/lib/telegramNotifications';

type Mode = 'followers' | 'following';

type UserMini = {
  id: number;
  username: string;
  full_name?: string | null;
  club_name?: string | null;
  profile_picture?: string | null;
  avatar_url?: string | null;
  is_following?: boolean;          // target followed by me
  followed_by_me?: boolean;        // aliases we might get
  i_follow?: boolean;
};

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.split('; ').find(x => x.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : '';
}

export default function FollowListPage({ username, mode }: { username: string; mode: Mode }) {
  const API = getBrowserApiBase();
  const router = useRouter();
  const title = mode === 'followers' ? 'Подписчики' : 'Подписки';
  const { profile, authenticated, telegramNotificationsEnabled } = useAuth();
  const me = profile?.username || null;
  const [loginRequiredOpen, setLoginRequiredOpen] = React.useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = React.useState(false);
  const [telegramPromptOpen, setTelegramPromptOpen] = React.useState(false);
  const { isOverlay, close: closeOverlay } = useOverlayEnvironment();
  const { clearScreens } = useLayerStack();
  const { navigateProfile } = useAppNavigation();

  const [items, setItems] = React.useState<UserMini[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const abs = React.useCallback((u?: string | null) => (u ? (u.startsWith('http') ? u : `${API}${u}`) : null), [API]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const candidates = mode === 'followers'
          ? [
              `${API}/api/profile/${username}/followers/`,
              `${API}/api/profile/${username}/followers/list/`,
              `${API}/api/profile/${username}/subscribers/`,
              `${API}/api/followers/?username=${encodeURIComponent(username)}`,
            ]
          : [
              `${API}/api/profile/${username}/following/`,
              `${API}/api/profile/${username}/following/list/`,
              `${API}/api/profile/${username}/subscriptions/`,
              `${API}/api/following/?username=${encodeURIComponent(username)}`,
            ];

        type UnknownRecord = Record<string, unknown>;
        let list: UserMini[] = [];
        for (const url of candidates) {
          let r: Response | null = null;
          const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
          try { r = await tryFetch('include'); if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error('auth'); } catch { try { r = await tryFetch('omit'); } catch { /* noop */ } }
          if (!r || !r.ok) continue;
          const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
          const root = j as { users?: unknown; results?: unknown; followers?: unknown; following?: unknown; items?: unknown };
          const arr = (Array.isArray(root.users) ? root.users
            : Array.isArray(root.results) ? root.results
            : Array.isArray(root.followers) ? root.followers
            : Array.isArray(root.following) ? root.following
            : Array.isArray(root.items) ? root.items
            : []) as UnknownRecord[];
          if (arr.length) {
            list = arr.map((u) => ({
              id: Number(u.id),
              username: String(u.username),
              full_name: (u.full_name as string | null | undefined) ?? null,
              club_name: (u.club_name as string | null | undefined) ?? null,
              // prefer avatar_url; fallback to profile_picture
              avatar_url: (u.avatar_url as string | null | undefined) ?? (u.profile_picture as string | null | undefined) ?? null,
              profile_picture: (u.profile_picture as string | null | undefined) ?? (u.avatar_url as string | null | undefined) ?? null,
              is_following: typeof u.is_following === 'boolean' ? (u.is_following as boolean)
                : typeof u.followed_by_me === 'boolean' ? (u.followed_by_me as boolean)
                : typeof u.i_follow === 'boolean' ? (u.i_follow as boolean)
                : undefined,
              // passthrough display_name if provided (used when rendering second line)
              display_name: (u.display_name as string | undefined) as unknown as never,
            } as UserMini & { display_name?: string }));
            break;
          }
        }
        if (alive) setItems(list);
      } catch {
        if (alive) setError('Не удалось загрузить список');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [API, username, mode]);

  // Скрыть глобальный хедер на страницах подписчиков/подписок (как на профиле)
  React.useEffect(() => {
    acquireHideHeader();
    return () => {
      releaseHideHeader();
    };
  }, []);

  // Доп. проверка для страницы «Подписчики»: если бэк не прислал флаг
  // is_following, подгрузим мой список подписок и расставим кнопки
  const [myFollowingSet, setMyFollowingSet] = React.useState<Set<string> | null>(null);
  React.useEffect(() => {
    if (!authenticated || !me || mode !== 'followers') return;
    let alive = true;
    (async () => {
      try {
        const candidates = [
          `${API}/api/profile/${me}/following/`,
          `${API}/api/profile/${me}/following/list/`,
          `${API}/api/profile/${me}/subscriptions/`,
          `${API}/api/following/?username=${encodeURIComponent(me)}`,
        ];
        type UnknownRecord = Record<string, unknown>;
        let names: string[] = [];
        for (const url of candidates) {
          let r: Response | null = null;
          const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
          try { r = await tryFetch('include'); if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error('auth'); } catch { try { r = await tryFetch('omit'); } catch { /* noop */ } }
          if (!r || !r.ok) continue;
          const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
          const root = j as { users?: unknown; results?: unknown; following?: unknown; items?: unknown };
          const arr = (Array.isArray(root.users) ? root.users
            : Array.isArray(root.results) ? root.results
            : Array.isArray(root.following) ? root.following
            : Array.isArray(root.items) ? root.items
            : []) as UnknownRecord[];
          if (arr.length) { names = arr.map(u => String(u.username)); break; }
        }
        if (alive) setMyFollowingSet(new Set(names.map(s => s.toLowerCase())));
      } catch { if (alive) setMyFollowingSet(new Set()); }
    })();
    return () => { alive = false; };
  }, [API, authenticated, me, mode]);

  React.useEffect(() => {
    if (mode !== 'followers' || !myFollowingSet) return;
    setItems(prev => prev.map(u => (
      u.is_following === undefined
        ? { ...u, is_following: myFollowingSet.has(u.username.toLowerCase()) }
        : u
    )));
  }, [mode, myFollowingSet]);

  const toggle = async (target: string) => {
    if (!authenticated) { setLoginRequiredOpen(true); return; }
    if (hasTemporaryToken()) { setCompleteProfileModalOpen(true); return; }
    try {
      const r = await fetch(`${API}/api/profile/${target}/follow-toggle/`, {
        method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': getCookie('csrftoken') },
      });
      const j = await r.json().catch(() => ({}));
      const following = typeof j.following === 'boolean' ? j.following : undefined;
      setItems(prev => prev.map(u => u.username === target ? { ...u, is_following: following ?? !u.is_following } : u));
      if ((following ?? true) && !telegramNotificationsEnabled) {
        setTelegramPromptOpen(true);
      }
    } catch { /* noop */ }
  };

  const close = () => {
    if (isOverlay) {
      closeOverlay();
      return;
    }
    navigateBack(router, { fallback: `/${username}` });
  };

  const handleProfileClick = (uname: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    navigateProfile(event, { username: uname });
    // Профиль всегда открывается как оверлей поверх текущего списка.
    // Сами страницы подписчиков/подписок остаются в стэке под ним.
  };

  return (
    <>
    <section className="bg-white min-h-[100dvh]">
      {/* Fixed header pinned to viewport, list scrolls under it */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-200">
        <div className="max-w-4xl mx-auto">
          <div className="h-12 flex items-center justify-between px-4">
            <div className="text-base font-semibold">{title}</div>
            <button className="h-10 px-3 rounded-full text-gray-600 hover:bg-gray-100" onClick={close} aria-label="Закрыть">×</button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="pt-12">
        <div className="max-w-4xl mx-auto">
          <div className="py-2">
          {loading && <div className="py-4 text-sm text-gray-500 text-center">Загружаем…</div>}
          {error && <div className="py-4 text-sm text-red-600 text-center">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-500">Список пуст</div>
          )}

          <ul className="divide-y divide-gray-100">
            {items.map(u => {
              // first line must be username
              const primary = u.username;
              // second line: prefer full/club name, else @username
              const displayName = (u as unknown as { display_name?: string })?.display_name;
              const secondary = (u.full_name || u.club_name || (displayName && displayName !== primary ? displayName : `@${u.username}`));
              const avatar = abs(u.profile_picture || u.avatar_url) || '/avatars/question.jpg';
              const following = !!u.is_following;
              const isMe = !!me && u.username.toLowerCase() === me.toLowerCase();
              const isOwner = !!me && me.toLowerCase() === username.toLowerCase();
              const cta = following
                ? 'Вы подписаны'
                : (authenticated && isOwner && mode === 'followers' ? 'Подписаться в ответ' : 'Подписаться');
              return (
                <li key={u.id}>
                  <div className="flex items-center justify-between gap-3 py-2 px-4">
                    <Link
                      href={`/${u.username}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                      onClick={handleProfileClick(u.username)}
                    >
                      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 border">
                        <SmartImage src={avatar} alt="" fill className="object-cover" sizes="40px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{primary}</div>
                        <div className="text-xs text-gray-500 truncate">{secondary}</div>
                      </div>
                    </Link>
                  {!isMe && (
                    <Button
                      variant="neutral"
                      onClick={() => toggle(u.username)}
                      className={[
                        'shrink-0 w-[22ch] justify-center hover:text-black',
                        following
                          ? 'text-gray-800 border-gray-300 hover:bg-gray-50'
                          : 'text-black border-gray-400 hover:bg-black/10',
                      ].join(' ')}
                    >
                      {cta}
                    </Button>
                  )}
                  </div>
                </li>
              );
            })}
          </ul>
          </div>
        </div>
      </div>
    </section>
    <ConfirmModal
      open={loginRequiredOpen}
      onCancel={() => setLoginRequiredOpen(false)}
      onConfirm={() => {
        setLoginRequiredOpen(false);
        clearScreens();
        setTimeout(() => {
          try { location.assign('/auth/login'); } catch {}
        }, 150);
      }}
      title="Это действие доступно только авторизованным пользователям"
      cancelLabel="Отмена"
      confirmLabel="Войти"
      variant="simple"
    />
    <CompleteProfileActionModal
      open={completeProfileModalOpen}
      onClose={() => setCompleteProfileModalOpen(false)}
    />
    {telegramPromptOpen && (
      <ConfirmModal
        open={telegramPromptOpen}
        title="Уведомления в Telegram"
        message="Хотите получать уведомления об обновлениях этого профиля в Telegram?"
        cancelLabel="Нет"
        confirmLabel="Да"
        onCancel={() => setTelegramPromptOpen(false)}
        onConfirm={async () => {
          setTelegramPromptOpen(false);
          await startTelegramLinkFlow();
        }}
      />
    )}
    </>
  );
}
