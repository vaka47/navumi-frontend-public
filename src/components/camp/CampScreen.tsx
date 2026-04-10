'use client';

import React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import CampInfoSwitcher, { type Camp } from './CampInfoSwitcher';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type CampScreenProps = {
  username?: string;
  campNumber?: string | number | null;
  campId?: string | number | null;
  initialCamp?: Camp | null;
};

const API_BASE = getBrowserApiBase();

export default function CampScreen({ username, campNumber, campId, initialCamp }: CampScreenProps) {
  const [camp, setCamp] = React.useState<Camp | null>(initialCamp ?? null);
  const [loading, setLoading] = React.useState(!initialCamp);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const overlayEnv = useOverlayEnvironment();

  React.useEffect(() => {
    // Внутри оверлеев URL синхронизируем только виртуально через AppScreenBridge,
    // не трогаем реальный window.location, чтобы не ломать базовый layout (/search, /feed и т.п.).
    if (overlayEnv.isOverlay) return;
    if (typeof window === 'undefined') return;
    const search = searchParams?.toString() ?? '';
    const target = search ? `${pathname}?${search}` : pathname;
    const current = window.location.pathname + window.location.search;
    if (!target || current === target) return;
    try {
      window.history.replaceState(window.history.state, '', target);
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[CampScreen] sync URL', {
          isOverlay: overlayEnv.isOverlay,
          target,
          current,
        });
      }
    } catch {
      /* noop */
    }
  }, [pathname, searchParams, overlayEnv.isOverlay]);

  React.useEffect(() => {
    if (initialCamp) {
      setCamp(initialCamp);
      setLoading(false);
      setError(null);
    }
  }, [initialCamp, username, campNumber]);

  React.useEffect(() => {
    if (initialCamp) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const owner = (username || '').replace(/^@+/, '').trim();
        const slug = typeof campNumber === 'number' || typeof campNumber === 'string'
          ? String(campNumber).trim()
          : '';
        const id = campId != null ? String(campId).trim() : '';

        try {
          console.info('[CampScreen] load', {
            owner,
            slug,
            campId: id || null,
            from: 'props',
          });
        } catch {
          /* noop */
        }

        let data: Camp | null = null;

        // 1. Если есть campId — всегда пробуем загрузить по ID.
        if (id) {
          const url = `${API_BASE}/api/camps/${id}/`;
          try {
            console.info('[CampScreen] fetch by id', { url });
          } catch {
            /* noop */
          }
          const res = await fetch(url, {
            credentials: 'include',
            cache: 'no-store',
          });
          try {
            console.info('[CampScreen] fetch by id status', { status: res.status, ok: res.ok });
          } catch {
            /* noop */
          }
          if (!res.ok) throw new Error('Не удалось загрузить кэмп');
          data = await res.json() as Camp;
        } else if (owner && slug) {
          // 2. Фоллбек: загрузка по owner + slug.
          const url = `${API_BASE}/api/camps/${owner}/${slug}/`;
          try {
            console.info('[CampScreen] fetch by slug', { url });
          } catch {
            /* noop */
          }
          const res = await fetch(url, {
            credentials: 'include',
            cache: 'no-store',
          });
          try {
            console.info('[CampScreen] fetch by slug status', { status: res.status, ok: res.ok });
          } catch {
            /* noop */
          }
          if (!res.ok) throw new Error('Не удалось загрузить кэмп');
          data = await res.json() as Camp;
        } else {
          throw new Error('Недостаточно данных для загрузки кэмпа');
        }
        if (!cancelled) {
          setCamp(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          try {
            console.error('[CampScreen] load failed', err);
          } catch {
            /* noop */
          }
          setError(err instanceof Error ? err.message : 'Не удалось загрузить кэмп');
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [username, campNumber, campId, reloadToken, initialCamp]);

  if (loading && !camp) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-gray-500">
        Загружаем кэмп…
      </div>
    );
  }

  if (!camp) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center text-sm text-gray-600">
        <p>{error ?? 'Кэмп недоступен.'}</p>
        <button
          type="button"
          onClick={() => setReloadToken((t) => t + 1)}
          className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Повторить попытку
        </button>
      </div>
    );
  }

  return <CampInfoSwitcher camp={camp} />;
}
