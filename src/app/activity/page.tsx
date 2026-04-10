"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOverlayEnvironment } from "@/context/OverlayEnvironmentContext";
import { useAppNavigation } from "@/hooks/useAppNavigation";
import { FeedItem } from "./types";
import ActivityFeedItem from "./ActivityFeedItem";
import { campPathFrom } from "@/components/post/helpers/campPath";
import { getBrowserApiBase } from "@/lib/apiBase";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { startTelegramLinkFlow } from "@/lib/telegramNotifications";

// Utility functions
const parseNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

const shouldHidePriceDrop = (it: FeedItem): boolean => {
  if (it.type !== 'camp_price_drop') return false;
  const campTarget = it.target && it.target.kind === 'camp' ? it.target : undefined;
  const before = parseNumber(it.payload?.price_before);
  const after = parseNumber(it.payload?.price_after ?? (campTarget as { hot_deal_price?: number | string | null } | undefined)?.hot_deal_price ?? (campTarget as { price?: number | string | null } | undefined)?.price);
  const hide = (before !== null && after !== null && after >= before);
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Activity] camp_price_drop/visibility', {
        id: it.id,
        before,
        after,
        hide,
        payload: it.payload,
        target: campTarget,
      });
    }
  } catch { /* noop */ }
  // Скрываем только явное повышение/откат цены; при отсутствии данных не фильтруем
  return hide;
};

const debugActivityItems = (items: FeedItem[], label: string) => {
  if (process.env.NODE_ENV === 'production') return;
  try {
    const summary = items.reduce<Record<string, number>>((acc, it) => {
      acc[it.type] = (acc[it.type] || 0) + 1;
      return acc;
    }, {});
    // показываем первые элементы для дебага типов
    const sample = items.slice(0, 5).map((it) => ({ id: it.id, type: it.type, payload: it.payload, target: it.target }));
    console.log(`[Activity] fetched (${label})`, { count: items.length, summary, sample });

    // Дополнительный лог по событиям кэмпов, чтобы понять, приходят ли sold out / места / цена
    const campRelated = items.filter((it) =>
      it.type === 'camp_sold_out' ||
      it.type === 'camp_spots_opened' ||
      it.type === 'camp_price_drop' ||
      it.type === 'camp_new_post'
    );
    const byType = campRelated.reduce<Record<string, number>>((acc, it) => {
      acc[it.type] = (acc[it.type] || 0) + 1;
      return acc;
    }, {});
    const details = campRelated.slice(0, 20).map((it) => {
      const t = it.target && it.target.kind === 'camp' ? it.target : undefined;
      return {
        id: it.id,
        type: it.type,
        created_at: it.created_at,
        camp_id: t?.camp_id,
        organizer: t?.organizer,
        camp_number: t?.camp_number,
        title: t?.title,
        is_sold_out: t?.is_sold_out,
        payload: it.payload,
      };
    });
    console.log(`[Activity] camp-related (${label})`, {
      count: campRelated.length,
      byType,
      details,
    });
  } catch { /* noop */ }
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-6">
    <div className="mb-3 px-2 text-[13px] uppercase tracking-wide text-gray-500">{title}</div>
    <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {children}
    </div>
  </div>
);

export default function ActivityPage() {
  // Базовый URL API:
  // - в проде обычно абсолютный: https://api.navumi.com
  // - локально/через прокси может быть относительный: /api/navumi
  const apiBase = getBrowserApiBase().replace(/\/+$/, "");
  const apiUrl = useCallback((path: string) => {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${apiBase}${p}`;
  }, [apiBase]);
  const router = useRouter();
  const { profile, telegramNotificationsEnabled } = useAuth();
  const overlayEnv = useOverlayEnvironment();
  const { navigateCamp, navigatePost, navigateProfile } = useAppNavigation();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [telegramPromptOpen, setTelegramPromptOpen] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const [myFollowing, setMyFollowing] = useState<Set<string> | null>(null);
  

  // local cookie reader for CSRF
  function getCookie(name: string): string {
    if (typeof document === 'undefined') return '';
    const m = document.cookie.split('; ').find((x) => x.startsWith(name + '='));
    return m ? decodeURIComponent(m.split('=')[1]) : '';
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const u = apiUrl('/api/activity/?limit=30');
        const r = await fetch(u, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) throw new Error('failed');
        const j = await r.json() as { items?: FeedItem[]; next_cursor?: string | null };
        const arr = Array.isArray(j.items) ? j.items : [];
        debugActivityItems(arr, 'initial');
        if (!cancelled) {
          setItems(arr);
          setNextCursor(j.next_cursor ?? null);
          setHasMore(Boolean(j.next_cursor && arr.length > 0));
        }
      } catch (err) {
        console.error('[Activity] failed to load initial', err);
        if (!cancelled) {
          setItems([]);
          setNextCursor(null);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // загрузка моего списка подписок (для статуса кнопки follow)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = (profile?.username || '').trim();
        if (!me) {
          if (!cancelled) setMyFollowing(new Set());
          return;
        }
        const candidates = [
          apiUrl(`/api/profile/${me}/following/`),
          apiUrl(`/api/profile/${me}/following/list/`),
          apiUrl(`/api/following/?username=${encodeURIComponent(me)}`),
        ];
        let names: string[] = [];
        for (const u of candidates) {
          if (cancelled) break;
          try {
            const r = await fetch(u, { credentials: 'include', cache: 'no-store' });
            if (!r.ok) continue;
            const j = await r.json().catch(() => ({}));
            const arr = Array.isArray(j?.users) ? j.users
              : Array.isArray(j?.results) ? j.results
              : Array.isArray(j?.following) ? j.following
              : Array.isArray(j?.items) ? j.items
              : Array.isArray(j) ? j
              : [];
            if (arr.length) {
              const toUsernameLower = (o: unknown): string => {
                if (typeof o === 'string') return o.toLowerCase();
                if (o && typeof o === 'object') {
                  const rec = o as Record<string, unknown>;
                  const v = rec['username'];
                  if (typeof v === 'string') return v.toLowerCase();
                }
                return '';
              };
              // TS: avoid implicit any on type predicate parameter; we already
              // know the array is string[], so just filter empty strings.
              names = arr.map(toUsernameLower).filter((s: string) => s.length > 0);
              break;
            }
          } catch { /* noop */ }
        }
        if (!cancelled) setMyFollowing(new Set(names));
      } catch {
        if (!cancelled) setMyFollowing(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [apiUrl, profile?.username]);

  // mark feed as seen on open
  useEffect(() => {
    const url = apiUrl('/api/activity/seen');
    (async () => {
      if (!profile) return; // не бьём в seen, если профиля нет
      try {
        const csrf = getCookie('csrftoken');
        const body = '{}';
        await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRFToken': csrf } : {}),
          },
          body,
        });
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[Activity] seen POST', { url, body });
          }
        } catch { /* noop */ }
      } catch {}
    })();
  }, [apiUrl, profile]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const url = apiUrl(`/api/activity/?limit=30&cursor=${encodeURIComponent(nextCursor)}`);
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json() as { items?: FeedItem[]; next_cursor?: string | null };
      const arr = Array.isArray(j.items) ? j.items : [];
      debugActivityItems(arr, 'loadMore');
      setItems((prev) => [...prev, ...arr]);
      setNextCursor(j.next_cursor ?? null);
      setHasMore(Boolean(j.next_cursor && arr.length > 0));
    } catch (err) {
      console.error('[Activity] loadMore error', err);
    } finally {
      setLoadingMore(false);
    }
  }, [apiUrl, nextCursor, loadingMore]);

  // Infinite scroll via IntersectionObserver
  // Используем ref для защиты от слишком частых вызовов на мобильном
  const lastLoadTimeRef = useRef(0);
  
  useEffect(() => {
    if (!loaderRef.current || !hasMore) return;
    const el = loaderRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting || loadingMore) return;
        
        // Защита от слишком частых вызовов (минимум 500ms между загрузками)
        const now = Date.now();
        if (now - lastLoadTimeRef.current < 500) return;
        lastLoadTimeRef.current = now;
        
        void loadMore();
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadingMore]);

  const handleOpenTarget = useCallback((it: FeedItem) => {
    const t = it.target;
    if (!t) return;

    if (t.kind === "post" || t.kind === "article") {
      const hash = t.kind === "post" && t.commentId ? `#comment-${t.commentId}` : "";
      if (overlayEnv.isOverlay) {
        navigatePost(null, { username: t.author, postId: t.postId });
      } else {
        router.push(`/${t.author}/post/${t.postId}${hash}`);
      }
      return;
    }

    if (t.kind === "camp") {
      const href = campPathFrom(t.organizer, { camp_number: (t.camp_number ?? undefined), url: (t.url ?? undefined) });
      if (!href) return;
      const postId = (t as { camp_post_id?: number | string | null }).camp_post_id;
      const hash = postId != null ? `#post-${postId}` : "";

      if (overlayEnv.isOverlay) {
        const campId = (t as { camp_id?: number | string | null }).camp_id;
        navigateCamp(null, {
          username: t.organizer || undefined,
          campNumber: t.camp_number ?? null,
          campPath: href || t.url || undefined,
          campId: campId ?? undefined,
        });
      } else {
        router.push(`${href}${hash}`);
      }
      return;
    }

    if (t.kind === "profile") {
      const username = (t.username || "").trim();
      if (!username) return;
      if (overlayEnv.isOverlay) {
        navigateProfile(null, { username });
      } else {
        router.push(`/${username}`);
      }
    }
  }, [overlayEnv.isOverlay, navigatePost, navigateCamp, navigateProfile, router]);

  const handleActorClick = useCallback((username: string) => {
    const u = (username || "").trim();
    if (!u) return;
    if (overlayEnv.isOverlay) {
      navigateProfile(null, { username: u });
    } else {
      router.push(`/${u}`);
    }
  }, [overlayEnv.isOverlay, navigateProfile, router]);

  const handleFollowToggle = useCallback(async (actor: string) => {
    const amFollowing = !!(myFollowing && myFollowing.has(actor));
    try {
        const csrf = getCookie('csrftoken');
        const r = await fetch(apiUrl(`/api/profile/${actor}/follow-toggle/`), {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRFToken': csrf } : {}) },
          body: '{}'
        });
        const j = await r.json().catch(() => ({}));
        const following = typeof j.following === 'boolean' ? j.following : !amFollowing;
        if (following && !telegramNotificationsEnabled) {
          setTelegramPromptOpen(true);
        }
        setMyFollowing((prev) => {
          const set = new Set(prev ?? []);
          if (following) set.add(actor); else set.delete(actor);
          return set;
        });
      } catch { /* noop */ }
  }, [myFollowing, apiUrl, telegramNotificationsEnabled]);


  const me = (profile?.username || '').toLowerCase();

  // Фильтруем и группируем элементы только один раз при изменении items
  const filteredItems = useMemo(() => {
    return items
      .filter((it) => !it.actors?.some(a => (a.username || '').toLowerCase() === me))
      .filter((it) => !shouldHidePriceDrop(it));
  }, [items, me]);

  // Стабильные ссылки на массивы для предотвращения ререндеров
  const emptyArrays = useMemo(() => ({ today: [] as FeedItem[], yesterday: [] as FeedItem[], week: [] as FeedItem[] }), []);
  
  const grouped = useMemo(() => {
    if (filteredItems.length === 0) {
      return emptyArrays;
    }
    
    const now = Date.now();
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
    const sections: Record<string, FeedItem[]> = { today: [], yesterday: [], week: [] };
    
    filteredItems.forEach((it) => {
      const t = new Date(it.created_at || now).getTime();
      if (t >= startOfToday.getTime()) sections.today.push(it);
      else if (t >= startOfToday.getTime() - 24*60*60*1000) sections.yesterday.push(it);
      else sections.week.push(it);
    });
    return sections;
  }, [filteredItems, emptyArrays]);

  const close = () => {
    if (overlayEnv.isOverlay) {
      overlayEnv.close();
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch { /* noop */ }
    router.push('/search');
  };


  return (
    <>
      <div
        className="max-w-4xl mx-auto px-2 sm:px-4 py-4"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + var(--bottom-gap, 96px))',
          overflowAnchor: 'none',
        }}
      >
        <div className="flex items-center justify-between px-2">
          <h1 className="text-xl font-semibold">Активность</h1>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              close();
            }}
            aria-label="Закрыть"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && <div className="px-2 py-6 text-sm text-gray-500">Загружаем…</div>}

        {!loading && items.length === 0 && (
          <div className="px-2 py-10 text-sm text-gray-500">Пока нет активности</div>
        )}

        {!loading && items.length > 0 && (
          <>
            {grouped.today.length > 0 && (
              <Section title="Сегодня">
                {grouped.today.map((it) => (
                  <ActivityFeedItem
                      key={it.id}
                      item={it}
                      onOpenTarget={handleOpenTarget}
                      onActorClick={handleActorClick}
                      onFollowToggle={handleFollowToggle}
                      isFollowing={it.actors?.[0]?.username ? myFollowing?.has(it.actors[0].username.toLowerCase()) : false}
                  />
                ))}
              </Section>
            )}

            {grouped.yesterday.length > 0 && (
              <Section title="Вчера">
                {grouped.yesterday.map((it) => (
                  <ActivityFeedItem
                      key={it.id}
                      item={it}
                      onOpenTarget={handleOpenTarget}
                      onActorClick={handleActorClick}
                      onFollowToggle={handleFollowToggle}
                      isFollowing={it.actors?.[0]?.username ? myFollowing?.has(it.actors[0].username.toLowerCase()) : false}
                  />
                ))}
              </Section>
            )}

            {grouped.week.length > 0 && (
              <Section title="Последние 7 дней">
                {grouped.week.map((it) => (
                  <ActivityFeedItem
                      key={it.id}
                      item={it}
                      onOpenTarget={handleOpenTarget}
                      onActorClick={handleActorClick}
                      onFollowToggle={handleFollowToggle}
                      isFollowing={it.actors?.[0]?.username ? myFollowing?.has(it.actors[0].username.toLowerCase()) : false}
                  />
                ))}
              </Section>
            )}

            {hasMore && (
              <div className="mt-6 flex flex-col items-center gap-3 text-sm text-gray-500">
                <div ref={loaderRef} className="h-1 w-full" />
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingMore ? "Загружаем…" : "Показать ещё"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
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
