'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import { Button } from '@/components/ui/button';
import { Phone, Send, Instagram, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { useFollowListOverlay } from '@/hooks/useFollowListOverlay';
import { hasTemporaryToken } from '@/lib/checkTemporaryToken';
import CompleteProfileActionModal from '@/components/CompleteProfileActionModal';
import { useLayerStack } from '@/context/LayerStackContext';
import { getBrowserApiBase } from '@/lib/apiBase';
import { startTelegramLinkFlow } from '@/lib/telegramNotifications';

type Role = 'club' | 'client';

type ProfileIntroData = {
  id?: number;
  username: string;
  role: 'club' | 'client';
  profile_picture?: string | null;
  club_name?: string | null;
  full_name?: string | null;
  description?: string | null;
  telegram?: string | null;
  telegram_username?: string | null;
  phone_number?: string | null;
  website?: string | null;
  instagram?: string | null;
  instagram_username?: string | null;
  followers_count?: number;
  subscribers_count?: number;
  following_count?: number;
  subscriptions_count?: number;
};

type Props = { profile: ProfileIntroData; isOwner: boolean };

export default function ProfileIntro({ profile, isOwner }: Props) {
  const API = getBrowserApiBase();
  const role: Role = profile?.role ?? 'client';
  const username: string = profile?.username ?? '';
  const { authenticated, profile: meProfile, telegramNotificationsEnabled } = useAuth();
  const me = meProfile?.username || '';
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);
  const followListOverlay = useFollowListOverlay();
  const { clearScreens } = useLayerStack();

  // avatar
  const avatar = useMemo(() => {
    const raw = profile?.profile_picture ?? null;
    if (!raw) return '/avatars/question.jpg';
    const abs = (typeof raw === 'string' && raw.startsWith('http')) ? raw : `${API}${raw}`;
    return absUrl(abs) || abs;
  }, [API, profile?.profile_picture]);

  // Counters
  const [postsCount, setPostsCount] = useState<number | null>(null);
  const [campsCount, setCampsCount] = useState<number | null>(null);
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [telegramPromptOpen, setTelegramPromptOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${API}/api/profile/${username}/posts/`;
        let r: Response | null = null;
        try { r = await fetch(url, { credentials: 'omit', cache: 'no-store' }); } catch { r = null; }
        if (!r || !r.ok) { try { r = await fetch(url, { credentials: 'include', cache: 'no-store' }); } catch { r = null; } }
        if (r && r.ok) {
          const j = await r.json().catch(() => ({}));
          const arr = Array.isArray(j?.posts) ? j.posts : [];
          if (!cancelled) setPostsCount(arr.length);
        } else { if (!cancelled) setPostsCount(0); }
      } catch { if (!cancelled) setPostsCount(0); }
    })();
    return () => { cancelled = true; };
  }, [API, username]);

  useEffect(() => {
    if (role !== 'club') { setCampsCount(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const urls = [
          `${API}/api/clubs/${username}/camps/`,
          `${API}/api/profile/${username}/camps/`,
          `${API}/api/camps/`, // общий список — отфильтруем по владельцу
          `${API}/api/clubs/${username}/camps/suggest/?q=`,
        ];
        console.info('[ProfileIntro] count camps for', { username, urls });
        let bestCount = 0;
        for (const u of urls) {
          let r: Response | null = null;
          try { console.debug('[ProfileIntro] fetch omit', u); r = await fetch(u, { credentials: 'omit', cache: 'no-store' }); } catch { r = null; }
          if (!r || !r.ok) { try { console.debug('[ProfileIntro] fetch include', u, { status: r?.status }); r = await fetch(u, { credentials: 'include', cache: 'no-store' }); } catch { r = null; } }
          if (!r || !r.ok) continue;
          const j: unknown = await r.json().catch(() => ({}));
          const toArray = (val: unknown): unknown[] => {
            if (Array.isArray(val)) return val;
            if (val && typeof val === 'object') {
              const o = val as Record<string, unknown>;
              if (Array.isArray(o.camps)) return o.camps as unknown[];
              if (Array.isArray(o.results)) return o.results as unknown[];
              if (Array.isArray(o.items)) return o.items as unknown[];
              const d = o.data && typeof o.data === 'object' ? (o.data as Record<string, unknown>) : null;
              if (d) {
                if (Array.isArray(d.camps)) return d.camps as unknown[];
                if (Array.isArray(d.results)) return d.results as unknown[];
              }
            }
            return [];
          };
          let arr = toArray(j);
          // Если источник — общий список/подсказки, отфильтруем по владельцу
          if ((/\/api\/camps\//.test(u) && !/\/api\/clubs\//.test(u)) || /\/camps\/suggest\//.test(u)) {
            const getOwner = (o: Record<string, unknown>): string | null => {
              const str = ['camp_owner_username', 'owner_username', 'club_username', 'organizer_username', 'owner', 'organizer']
                .map(k => o[k]).find(v => typeof v === 'string' && (v as string).trim());
              if (typeof str === 'string') return str.replace(/^@+/, '').trim();
              for (const k of ['organizer', 'owner', 'club', 'user', 'profile']) {
                const v = o[k];
                if (v && typeof v === 'object') {
                  const u2 = (v as Record<string, unknown>).username;
                  if (typeof u2 === 'string' && u2.trim()) return u2.replace(/^@+/, '').trim();
                }
              }
              const urlRaw = (o['camp_url'] as unknown) ?? (o['url'] as unknown);
              if (typeof urlRaw === 'string' && urlRaw) {
                try { const u3 = new URL(urlRaw, 'https://dummy.local'); const m = u3.pathname.match(/^\/(.+?)\/camp\//); if (m && m[1]) return m[1]; } catch {}
              }
              return null;
            };
            const ownerNorm = username.toLowerCase();
            arr = arr.filter(el => (el && typeof el === 'object' ? (getOwner(el as Record<string, unknown>) || '').toLowerCase() === ownerNorm : false));
          }
          bestCount = Math.max(bestCount, arr.length);
          console.debug('[ProfileIntro] response shape', { url: u, status: r.status, count: arr.length });
        }
        if (!cancelled) setCampsCount(bestCount);
      } catch { if (!cancelled) setCampsCount(0); }
    })();
    return () => { cancelled = true; };
  }, [API, username, role]);

  // Счётчики/флаги из нового API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${API}/api/profile/${username}/follow-stats/`;
        const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
        let r: Response | null = null;
        try { r = await tryFetch('include'); if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error('auth'); } catch { try { r = await tryFetch('omit'); } catch { /* noop */ } }
        if (r && r.ok) {
          type Stats = { followers_count?: number; following_count?: number; is_owner?: boolean; is_following?: boolean };
          const j: unknown = await r.json().catch(() => ({}));
          const s = (j as Stats) || {};
          const followers = typeof s.followers_count === 'number' ? s.followers_count : null;
          const following = typeof s.following_count === 'number' ? s.following_count : null;
          const is_owner = Boolean(s.is_owner);
          const is_following = typeof s.is_following === 'boolean' ? s.is_following : null;
          if (!cancelled) {
            if (followers !== null) setFollowersCount(followers);
            if (following !== null) setFollowingCount(following);
            if (is_following !== null) setIsFollowing(is_following);
            if (is_owner) {/* и так узнаем это выше — оставим для совместимости */}
          }
        } else {
          // fallback: попробуем взять из профиля, если есть
          const raw = profile ?? ({} as ProfileIntroData);
          const followers = typeof raw.followers_count === 'number' ? raw.followers_count : typeof raw.subscribers_count === 'number' ? raw.subscribers_count : null;
          const following = typeof raw.following_count === 'number' ? raw.following_count : typeof raw.subscriptions_count === 'number' ? raw.subscriptions_count : null;
          if (!cancelled) {
            if (followers !== null) setFollowersCount(followers);
            if (following !== null) setFollowingCount(following);
          }
        }
      } catch {
        // молча: используем значения, что уже есть из профиля
      }
    })();
    return () => { cancelled = true; };
  }, [API, username, profile]);

  const publications = (postsCount ?? 0) + (role === 'club' ? (campsCount ?? 0) : 0);

  // Contacts
  const telegram = profile?.telegram ?? profile?.telegram_username ?? null;
  const phone = profile?.phone_number ?? null;
  const website = profile?.website ?? null;
  const instagram = profile?.instagram ?? profile?.instagram_username ?? null;

  // Follow state (новые эндпоинты)
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  useEffect(() => { setIsSubscribed(isFollowing); }, [isFollowing]);

  // Флаг «этот профиль подписан на меня?» — чтобы показывать «Подписаться в ответ»
  const [followsMe, setFollowsMe] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ targetUsername?: string; removedProfileIds?: unknown[] }>;
      const detail = custom.detail || {};
      if (!detail.targetUsername || detail.targetUsername !== username) return;
      if (detail.removedProfileIds && profile?.id != null) {
        const removed = detail.removedProfileIds.map((id) => String(id));
        if (!removed.includes(String(profile.id))) return;
      }
      setFollowingCount((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : prev));
      setFollowsMe(false);
    };
    window.addEventListener('navumi:remove-follower', handler as EventListener);
    return () => window.removeEventListener('navumi:remove-follower', handler as EventListener);
  }, [profile?.id, username]);
  useEffect(() => {
    if (isOwner || !authenticated || !me || !username || me === username) { setFollowsMe(null); return; }
    // Если уже подписан — нет смысла вычислять «в ответ»
    if (isSubscribed) { setFollowsMe(false); return; }
    let alive = true;
    (async () => {
      try {
        const candidates = [
          `${API}/api/profile/${me}/followers/`,
          `${API}/api/profile/${me}/followers/list/`,
          `${API}/api/profile/${me}/subscribers/`,
          `${API}/api/followers/?username=${encodeURIComponent(me)}`,
        ];
        type UnknownRecord = Record<string, unknown>;
        let found = false;
        for (const url of candidates) {
          let r: Response | null = null;
          const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
          try { r = await tryFetch('include'); if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error('auth'); } catch { try { r = await tryFetch('omit'); } catch { /* noop */ } }
          if (!r || !r.ok) continue;
          const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
          const root = j as { users?: unknown; results?: unknown; followers?: unknown; items?: unknown };
          const arr = (Array.isArray(root.users) ? root.users
            : Array.isArray(root.results) ? root.results
            : Array.isArray(root.followers) ? root.followers
            : Array.isArray(root.items) ? root.items
            : []) as UnknownRecord[];
          if (arr.length) {
            found = arr.some(u => String((u as UnknownRecord)['username']).toLowerCase() === username.toLowerCase());
            break;
          }
        }
        if (alive) setFollowsMe(found);
      } catch { if (alive) setFollowsMe(null); }
    })();
    return () => { alive = false; };
  }, [API, isOwner, authenticated, me, username, isSubscribed]);

  const toggleSubscribe = async () => {
    if (!authenticated) {
      setLoginRequiredOpen(true);
      return;
    }
    if (hasTemporaryToken()) {
      setCompleteProfileModalOpen(true);
      return;
    }
    try {
      const getCookie = (name: string) => {
        if (typeof document === 'undefined') return '';
        const m = document.cookie.split('; ').find(x => x.startsWith(name + '='));
        return m ? decodeURIComponent(m.split('=')[1]) : '';
      };
      const headers: Record<string, string> = { 'X-CSRFToken': getCookie('csrftoken') };
      const r = await fetch(`${API}/api/profile/${username}/follow-toggle/`, { method: 'POST', credentials: 'include', headers });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const following = typeof j.following === 'boolean' ? j.following : null;
        const followers = typeof j.followers_count === 'number' ? j.followers_count : null;
        if (following !== null) {
          setIsSubscribed(following);
          if (following && !telegramNotificationsEnabled) {
            setTelegramPromptOpen(true);
          }
        }
        if (followers !== null) setFollowersCount(followers);
      } else {
        // Fallback: попробуем старые эндпоинты, если новые недоступны
        if (role === 'club' && profile?.id) {
          const r2 = await fetch(`${API}/subscribe/club/${profile.id}/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'toggle' }) });
          const j2 = await r2.json().catch(() => ({}));
          setIsSubscribed(Boolean(j2?.subscribed));
        } else {
          const r3 = await fetch(`/subscribe/client/${username}/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'toggle' }) });
          const j3 = await r3.json().catch(() => ({}));
          setIsSubscribed(Boolean(j3?.subscribed));
        }
      }
    } catch { /* noop */ }
  };

  const share = async () => {
    const url = `${location.origin}/${username}`;
    try {
      if (navigator.share) await navigator.share({ url, title: username });
      else {
        await navigator.clipboard.writeText(url);
        alert('Ссылка на профиль скопирована');
      }
    } catch { /* cancelled */ }
  };

  const displayName = role === 'club' ? (profile?.club_name || username) : (profile?.full_name || username);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Description: clamp to 4 lines with "Развернуть"
  const description = profile?.description ?? '';
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionCanExpand, setDescriptionCanExpand] = useState(false);
  const descriptionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!descriptionRef.current || !description || descriptionExpanded) {
      if (!description) setDescriptionCanExpand(false);
      return;
    }
    const el = descriptionRef.current;
    const can = el.scrollHeight > el.clientHeight + 1;
    setDescriptionCanExpand(can);
  }, [description, descriptionExpanded]);

  const openFollowList = (mode: 'followers' | 'following') => {
    if (!authenticated) {
      setLoginRequiredOpen(true);
      return;
    }
    followListOverlay.open({ username, mode });
  };

  return (
    <>
    <section className="bg-white">
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-2 overflow-hidden">
        {/* top row: avatar + name + counters */}
        <div className="grid grid-cols-[96px,1fr] max-[440px]:grid-cols-[92px,1fr] max-[420px]:grid-cols-[84px,1fr] max-[400px]:grid-cols-[76px,1fr] max-[380px]:grid-cols-[68px,1fr] max-[360px]:grid-cols-[60px,1fr] max-[340px]:grid-cols-[56px,1fr] max-[320px]:grid-cols-[52px,1fr] gap-5 max-[420px]:gap-4 max-[360px]:gap-3 items-center">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            aria-label="Открыть аватар"
            className="relative w-[96px] h-[96px] max-[440px]:w-[92px] max-[440px]:h-[92px] max-[420px]:w-[84px] max-[420px]:h-[84px] max-[400px]:w-[76px] max-[400px]:h-[76px] max-[380px]:w-[68px] max-[380px]:h-[68px] max-[360px]:w-[60px] max-[360px]:h-[60px] max-[340px]:w-[56px] max-[340px]:h-[56px] max-[320px]:w-[52px] max-[320px]:h-[52px] rounded-full overflow-hidden border focus:outline-none focus:ring-2 focus:ring-black/20"
          >
            <SmartImage src={avatar} alt="Аватар" fill sizes="96px" className="rounded-full object-cover" />
          </button>

          <div className="min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1
                className="font-semibold leading-tight truncate text-xl sm:text-2xl max-[440px]:text-[19px] max-[400px]:text-[18px] max-[360px]:text-[16px] max-[320px]:text-[15px]"
                style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                title={displayName}
              >
                {displayName}
              </h1>
            </div>
            {/* counters: mobile (base) number above label, left aligned; prevent wrap by shrinking gaps/fonts on very narrow screens */}
            <div className="mt-2 flex flex-nowrap gap-x-6 max-[440px]:gap-x-5 max-[400px]:gap-x-4 max-[360px]:gap-x-3 max-[340px]:gap-x-2 text-sm max-[400px]:text-[13px] max-[360px]:text-[12px] max-[320px]:text-[11px]">
              <div className="flex flex-col items-start sm:flex-row sm:items-baseline gap-2">
                <span className="font-semibold leading-none">{publications}</span>
                <span className="leading-tight">публикации</span>
              </div>
              <button
                type="button"
                onClick={() => openFollowList('followers')}
                className="flex flex-col items-start sm:flex-row sm:items-baseline gap-2 text-left hover:underline focus:outline-none"
                title="Открыть подписчиков"
              >
                <span className="font-semibold leading-none">{followersCount ?? '—'}</span>
                <span className="leading-tight">подписчики</span>
              </button>
              <button
                type="button"
                onClick={() => openFollowList('following')}
                className="flex flex-col items-start sm:flex-row sm:items-baseline gap-2 text-left hover:underline focus:outline-none"
                title="Открыть подписки"
              >
                <span className="font-semibold leading-none">{followingCount ?? '—'}</span>
                <span className="leading-tight">подписки</span>
              </button>
            </div>
          </div>
        </div>

        {/* meta */}
        <div className="mt-3 text-sm text-gray-500">{role === 'club' ? 'Клуб' : 'Клиент'}</div>
        {description && (
          <div className="mt-1">
            <div
              ref={descriptionRef}
              className="whitespace-pre-wrap text-[15px] leading-snug"
              style={
                descriptionExpanded
                  ? undefined
                  : {
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }
              }
            >
              {description}
            </div>
            {descriptionCanExpand && (
              <button
                type="button"
                className="mt-1 text-sm text-gray-400 hover:text-gray-600"
                onClick={() => setDescriptionExpanded((v) => !v)}
              >
                {descriptionExpanded ? 'Свернуть' : 'Развернуть'}
              </button>
            )}
          </div>
        )}

        <div className="mt-2 space-y-0.5 text-sm">
          {website && (
            <div>
              <a href={`https://${website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                {website}
              </a>
            </div>
          )}
          {/* Убрали текстовую строку Instagram — оставляем только иконку в блоке действий */}
        </div>

        {/* action row */}
        <div className="mt-3 flex items-center gap-3">
          {isOwner ? (
            <Button
              variant="neutral"
              onClick={share}
              className="w-[22ch] justify-center"
            >
              Поделиться профилем
            </Button>
          ) : (
            <Button
              onClick={toggleSubscribe}
              variant="neutral"
              className={[
                'w-[22ch] justify-center',
                isSubscribed
                  ? 'text-gray-800 border-gray-300'
                  : 'text-black border-gray-400 hover:bg-black/10',
              ].join(' ')}
            >
              {isSubscribed ? 'Вы подписаны' : (followsMe ? 'Подписаться в ответ' : 'Подписаться')}
            </Button>
          )}

          {telegram && (
            <a
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border hover:bg-gray-50"
              href={`https://t.me/${telegram}`} target="_blank" aria-label="Telegram"
            >
              <Send className="w-4 h-4" />
            </a>
          )}
          {phone && (
            <a
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border hover:bg-gray-50"
              href={`tel:${phone}`} aria-label="Телефон"
            >
              <Phone className="w-4 h-4" />
            </a>
          )}
          {instagram && (
            <a
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border hover:bg-gray-50"
              href={`https://instagram.com/${instagram}`} target="_blank" aria-label="Instagram"
            >
              <Instagram className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
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
    </section>
    {avatarOpen && (
      <div className="fixed inset-0 z-[200]">
        <div className="absolute inset-0 bg-black/70" onClick={() => setAvatarOpen(false)} />
        <button
          type="button"
          aria-label="Закрыть"
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white grid place-items-center ring-1 ring-white/50"
          onClick={() => setAvatarOpen(false)}
        >
          <X className="w-6 h-6" />
        </button>
        <div className="absolute inset-0 flex items-center justify-center p-6" onClick={() => setAvatarOpen(false)}>
          <div
            className="relative w-[min(84vw,84vh)] max-w-[520px] aspect-square rounded-full overflow-hidden ring-2 ring-white"
            onClick={(e) => e.stopPropagation()}
          >
            <SmartImage src={avatar} alt="Аватар крупно" fill sizes="(max-width:768px) 84vw, 520px" className="object-cover" />
          </div>
        </div>
      </div>
    )}
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
