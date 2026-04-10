'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import { saveMainScroll } from '@/lib/scrollRestoration';
import { rememberReturn } from '@/lib/navBack';
import { useProfileOverlay } from '@/hooks/useProfileOverlay';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type UnknownRecord = Record<string, unknown>;
const API_BASE = getBrowserApiBase();
const AVATAR_PLACEHOLDER = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';

interface ProfileItem {
  username: string;
  avatar_url?: string | null;
  role?: string | null;
  followers_count?: number | null;
  distance_km?: number | null;
  matched_camps_count?: number | null;
  matched_posts_count?: number | null;
}

const pickNumber = (o: UnknownRecord | null | undefined, keys: string[]): number | undefined => {
  if (!o) return undefined;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
};

export default function ProfilesTab({ qs, active = true }: { qs: string; active?: boolean }) {
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openProfileOverlay = useProfileOverlay();
  const { isOverlay } = useOverlayEnvironment();

  const debug = useCallback((...args: unknown[]) => {
    if (!isOverlay) return;
    try {
      // eslint-disable-next-line no-console
      console.debug('[ProfilesTab]', ...args);
    } catch {
      /* noop */
    }
  }, [isOverlay]);

  useEffect(() => {
    debug('effect:start', { active, qs });
    if (!active) return;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    const url = `${API_BASE}/api/search/profiles/?${qs}`;
    debug('fetch:start', { url });
    fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal })
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        const root = (j && typeof j === 'object') ? (j as UnknownRecord) : {};
        const raw: UnknownRecord[] = Array.isArray(root['profiles'])
          ? (root['profiles'] as UnknownRecord[])
          : Array.isArray(j as unknown[])
            ? (j as unknown[] as UnknownRecord[])
            : [];
        const mapped: ProfileItem[] = raw.map((u) => {
          const rec = u as UnknownRecord;
          return {
            username: String(rec['username'] ?? ''),
            avatar_url: (() => {
              const raw = rec['avatar_url'] as string | null | undefined;
              const u = typeof raw === 'string' ? (absUrl(raw) || raw) : raw;
              return u;
            })(),
            role: rec['role'] as string | null | undefined,
            followers_count: pickNumber(rec, ['followers_count', 'followers_total', 'followersTotal', 'followers', 'score']),
            distance_km: (() => {
              const v = rec['distance_km'] ?? rec['distance'] ?? rec['distanceKm'];
              if (typeof v === 'number' && Number.isFinite(v)) return v;
              if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
              return undefined;
            })(),
            matched_camps_count: pickNumber(rec, ['matched_camps_count']) ?? null,
            matched_posts_count: pickNumber(rec, ['matched_posts_count']) ?? null,
          };
        });
        debug('fetch:resolved', { count: mapped.length });
        setItems(mapped);
      })
      .catch((err) => {
        debug('fetch:error', { message: err instanceof Error ? err.message : String(err) });
        if (!cancelled) setError('Не удалось загрузить профили');
      })
      .finally(() => {
        debug('effect:finally', { cancelled });
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [qs, active, debug]);

  if (loading) return <div className="text-sm text-gray-500 py-6">Загрузка…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;
  if (!items.length) return <div className="text-sm text-gray-500 py-6">Пока ничего не нашли.</div>;

  const handleOpen = (username: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    saveMainScroll();
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      try { rememberReturn('profile'); } catch { /* noop */ }
      return;
    }
    event.preventDefault();
    openProfileOverlay({ username });
  };

  return (
    <ul className="divide-y divide-gray-200">
      {items.map(u => (
        <li key={u.username}>
          <Link
            href={`/${u.username}`}
            className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50 transition"
            onClick={handleOpen(u.username)}
          >
            <div className="relative w-8 h-8 rounded-full overflow-hidden border bg-gray-100 shrink-0 aspect-square">
              <SmartImage
                src={u.avatar_url || AVATAR_PLACEHOLDER}
                alt={`Аватар @${u.username}`}
                fill
                sizes="32px"
                className="object-contain"
                noFade
                noSkeleton
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <div className="text-sm truncate">{u.username}</div>
                {typeof u.followers_count === 'number' && (
                  <div className="text-[11px] text-gray-500 whitespace-nowrap">{u.followers_count} подписчиков</div>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {u.role && <span className="truncate">{u.role}</span>}
                {typeof u.distance_km === 'number' && (
                  <span className="whitespace-nowrap">~{u.distance_km.toFixed(1)} км</span>
                )}
                {typeof u.matched_camps_count === 'number' && u.matched_camps_count > 0 && (
                  <span className="whitespace-nowrap">кэмпы: {u.matched_camps_count}</span>
                )}
                {typeof u.matched_posts_count === 'number' && u.matched_posts_count > 0 && (
                  <span className="whitespace-nowrap">посты: {u.matched_posts_count}</span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
