'use client';

import React, { useEffect, useRef, useState } from 'react';
import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';
import { saveMainScroll } from '@/lib/scrollRestoration';
import { setPostFeedContext } from '@/lib/postFeedContext';
import { usePostOverlay } from '@/hooks/usePostOverlay';
import { useProfilePostOverlay } from '@/hooks/useProfilePostOverlay';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { getBrowserApiBase } from '@/lib/apiBase';

type UnknownRecord = Record<string, unknown>;
const API_BASE = getBrowserApiBase();
const DEBUG =
  process.env.NODE_ENV !== 'production' ||
  ((process.env.NEXT_PUBLIC_ENABLE_PHOTO_DEBUG ?? '1').toLowerCase() !== '0');

const log = (...args: unknown[]) => {
  try {
    if (DEBUG && typeof window !== 'undefined') console.info('[PhotosTab]', ...args);
  } catch {
    /* noop */
  }
};

interface PhotoItem { id: number; images: string[]; author?: string | null; location?: string | null }

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeRecordArray = (value: unknown): UnknownRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
};

const extractRecords = (payload: unknown): UnknownRecord[] => {
  if (Array.isArray(payload)) return normalizeRecordArray(payload);
  if (!isRecord(payload)) return [];

  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();
  const arrayKeys = ['posts', 'results', 'items', 'entries', 'photos', 'data', 'payload'];

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      const arr = normalizeRecordArray(current);
      if (arr.length) return arr;
      continue;
    }

    if (!isRecord(current)) continue;

    for (const key of arrayKeys) {
      if (!(key in current)) continue;
      const next = current[key];
      if (Array.isArray(next)) {
        const arr = normalizeRecordArray(next);
        if (arr.length) return arr;
      } else if (isRecord(next)) {
        queue.push(next);
      }
    }
  }

  return [];
};

const normalizeImages = (value: unknown): string[] => {
  const fromArray = (arr: unknown[]): string[] =>
    arr
      .map((item) => {
        if (typeof item === 'string') {
          const u = absUrl(item);
          return u || item;
        }
        if (isRecord(item)) {
          const candidate = item['url'] ?? item['image'] ?? item['src'] ?? item['thumb'];
          if (typeof candidate === 'string') {
            const u = absUrl(candidate);
            return u || candidate;
          }
          return null;
        }
        return null;
      })
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  if (!value) return [];
  if (Array.isArray(value)) return fromArray(value);
  if (typeof value === 'string' && value.trim().length > 0) return [absUrl(value) || value];
  if (isRecord(value)) {
    const arrayLikeKeys = ['images', 'photos', 'media', 'attachments'];
    for (const key of arrayLikeKeys) {
      const nested = value[key];
      if (Array.isArray(nested)) {
        const arr = fromArray(nested);
        if (arr.length) return arr;
      }
    }
    const single = (
      value['url'] ||
      value['image'] ||
      value['src'] ||
      value['thumb'] ||
      value['picture'] ||
      value['first_image'] ||
      value['first_image_url'] ||
      value['cover'] ||
      value['preview'] ||
      value['thumbnail_url'] ||
      value['thumb_url']
    );
    return typeof single === 'string' && single.trim().length > 0 ? [absUrl(single) || single] : [];
  }
  return [];
};

const extractId = (rec: UnknownRecord): number => {
  const candidates = [
    rec['post_id'],
    rec['postId'],
    rec['id'],
    (isRecord(rec['post']) ? rec['post']['id'] : undefined),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string' && candidate.trim() && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }
  }
  return 0;
};

const extractAuthor = (rec: UnknownRecord): string | undefined => {
  const direct = rec['author'] ?? rec['author_username'] ?? rec['username'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const authorObj = isRecord(rec['author']) ? rec['author'] : null;
  const nested = authorObj?.['username'] ?? authorObj?.['name'];
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return undefined;
};

const extractLocation = (rec: UnknownRecord): string | undefined => {
  const direct = rec['location_name'] ?? rec['location'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const postRecord = isRecord(rec['post']) ? (rec['post'] as UnknownRecord) : null;
  const nested = postRecord ? (postRecord['location_name'] ?? postRecord['location']) : undefined;
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  return undefined;
};

// сервер теперь сам делает фоллбэк по строке локации, нам не нужны клиентские «варианты»

export default function PhotosTab({ qs, active = true }: { qs: string; active?: boolean }) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugMeta, setDebugMeta] = useState<Record<string, unknown> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const openPostOverlay = usePostOverlay();
  const openProfilePostOverlay = useProfilePostOverlay();
  const isMobile = useIsMobile();
  useEffect(() => {
    log('qs-change', { qs });
  }, [qs]);

  useEffect(() => {
    if (!active) return;
    const key = `${qs}::${reloadToken}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);

    const addDebug = (s: string) => {
      if (!DEBUG) return s;
      const u = new URLSearchParams(s || '');
      if (!u.has('debug')) u.set('debug', '1');
      return u.toString();
    };

    const doFetch = async (qsIn: string, note?: string) => {
      const qsWithDebug = addDebug(qsIn);
      const url = qsWithDebug ? `${API_BASE}/api/search/photoposts/?${qsWithDebug}` : `${API_BASE}/api/search/photoposts/`;
      log('request', { url, note });
      const resp = await fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal });
      log('response', { status: resp.status, note });
      const data = await resp.json().catch(() => ({} as unknown));
      const raw = extractRecords(data);
      const mapped: PhotoItem[] = raw
        .map((p) => {
          const rec = p as UnknownRecord;
          return {
            id: extractId(rec),
            images: normalizeImages(rec),
            author: extractAuthor(rec),
            location: extractLocation(rec) ?? null,
          };
        })
        .filter((item) => item.id > 0 && item.images.length > 0);
      const dbg = (data as Record<string, unknown>)?.['_debug'] as UnknownRecord | undefined;
      log('result', {
        rawCount: raw.length,
        mappedCount: mapped.length,
        sample: mapped.slice(0, 3).map((i) => ({ id: i.id, location: i.location })),
        debug: dbg,
        note,
      });
      return { mapped, dbg } as const;
    };

    (async () => {
      try {
        const first = await doFetch(qs);
    if (!cancelled) {
      setDebugMeta(first.dbg ?? null);
      setItems(first.mapped);
    }
    if (cancelled) return;

    const sp = new URLSearchParams(qs || '');
    const hasCoords = sp.has('latitude') && sp.has('longitude');
    const fbTag = sp.get('client_fallback') || '';
    const loc = (sp.get('location') || '').trim();
    const city = loc.split(',')[0]?.trim() || '';

    const runTextFallback = async (base: URLSearchParams, note: string) => {
      const fb = new URLSearchParams(base.toString());
      fb.delete('location');
      fb.set('query', city);
      fb.set('client_fallback', '1');
      const res = await doFetch(fb.toString(), note);
      if (!cancelled) {
        setDebugMeta(res.dbg ?? null);
        setItems(res.mapped);
      }
      return res;
    };

    if (hasCoords && !first.mapped.length && city && fbTag !== 'coords') {
      const fb = new URLSearchParams(sp.toString());
      fb.delete('latitude');
      fb.delete('longitude');
      fb.delete('radius_km');
      fb.set('client_fallback', 'coords');
      const dropped = await doFetch(fb.toString(), 'client-fallback:drop-coords');
      if (!cancelled) {
        setDebugMeta(dropped.dbg ?? null);
        setItems(dropped.mapped);
      }
      if (cancelled) return;
      if (dropped.mapped.length) return;
      if (city) {
        await runTextFallback(fb, 'client-fallback:query-city-after-drop');
      }
      return;
    }

    if (!hasCoords && !first.mapped.length && city && fbTag !== '1') {
      await runTextFallback(sp, 'client-fallback:query-city');
    }
  } catch (err) {
        try { if (typeof window !== 'undefined') console.warn('[PhotosTab] fetch error', err); } catch { /* noop */ }
        if (!cancelled) setError('Не удалось загрузить фотопосты');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ac.abort(); };
  }, [qs, active, reloadToken]);

  const currentOrder = React.useMemo(
    () => items.map((item) => item.id).filter((id) => typeof id === 'number' && Number.isFinite(id)),
    [items],
  );

  // Глобальные события: создание/удаление постов
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCreated = () => {
      // проще всего перезагрузить список с теми же параметрами
      setReloadToken((t) => t + 1);
    };

    const handleDeleted = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number | string }>).detail;
      const rawId = detail?.id;
      if (rawId == null) return;
      setItems((prev) =>
        prev.filter((p) => {
          const pid = p.id;
          if (typeof rawId === 'number') return pid !== rawId;
          return String(pid) !== String(rawId);
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

  if (loading) return <div className="text-sm text-gray-500 py-6">Загрузка…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;
  if (!items.length) return <div className="text-sm text-gray-500 py-6">Пока ничего не нашли.</div>;

  return (
    <div>
      {debugMeta && (debugMeta['used_location_fallback'] ? (
        <div className="mb-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Показано по названию локации (нет результатов по радиусу)
        </div>
      ) : null)}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-1">
      {items.map((p, idx) => (
        <button
          key={p.id}
          type="button"
          className="relative aspect-square bg-gray-100 overflow-hidden group"
          onClick={() => {
            if (!p.author) return;
            setPostFeedContext({ source: 'search_photos', postId: p.id, qs, ids: currentOrder });
            saveMainScroll();
            // Для мобильных устройств используем useProfilePostOverlay
            if (isMobile) {
              openProfilePostOverlay({ username: p.author, postId: p.id });
            } else {
              openPostOverlay({ username: p.author, postId: p.id });
            }
          }}
          title={p.author ? `@${p.author}` : 'Открыть пост'}
        >
          {p.images?.[0] ? (
            <SmartImage
              src={p.images[0]}
              alt=""
              fill
              className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 33vw, 200px"
              priority={idx < 4}
              quality={70}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-xs text-gray-500">нет фото</div>
          )}
        </button>
      ))}
      </div>
    </div>
  );
}
