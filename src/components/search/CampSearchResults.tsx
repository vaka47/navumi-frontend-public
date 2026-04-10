'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CampCard from '@/components/camp/CampCard';
import { normalizeCampToCardData, pickNumber } from '@/components/camp/campNormalize';
import { useOverlayEnvironment } from '@/context/OverlayEnvironmentContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type UnknownRecord = Record<string, unknown>;

const API_BASE = getBrowserApiBase();

function extractArray(data: unknown): UnknownRecord[] {
  // Accept a variety of shapes: array, {results}, {camps}, {items}, nested in {data}, or nested lists inside those keys
  const fromData = (v: unknown): UnknownRecord | null => (v && typeof v === 'object' ? (v as UnknownRecord) : null);

  if (Array.isArray(data)) return data as UnknownRecord[];
  const root = fromData(data) || {};

  const candidates: unknown[] = [
    root['camps'],
    root['results'],
    root['items'],
    (fromData(root['data'])?.['camps']),
    (fromData(root['data'])?.['results']),
    (fromData(root['data'])?.['items']),
    // handle nested { camps: { results|items } }
    (fromData(root['camps'])?.['results']),
    (fromData(root['camps'])?.['items']),
  ].filter(Boolean);

  for (const c of candidates) {
    if (Array.isArray(c)) return c as UnknownRecord[];
  }
  return [];
}

function readCampId(o: UnknownRecord): number | null {
  const direct = pickNumber(o, ['id', 'camp_id', 'campId'], null);
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  const raw = o['camp_url'] || o['url'];
  if (typeof raw === 'string' && raw.trim() !== '') {
    const m = raw.match(/\/camps\/(\d+)/) || raw.match(/\/camp\/(\d+)/);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function fetchWithFallback(urls: string[], signal?: AbortSignal): Promise<UnknownRecord[]> {
  for (const url of urls) {
    // prefer include to respect per-user filters (blocked profiles, etc.)
    try {
      const r1 = await fetch(url, { credentials: 'include', cache: 'no-store', signal });
      if (r1.ok) {
        const j = await r1.json().catch(() => ({}));
        const arr = extractArray(j);
        if (arr.length || r1.ok) return arr;
      }
    } catch { /* omit errors, try next */ }

    // fallback without credentials (public access)
    try {
      const r2 = await fetch(url, { credentials: 'omit', cache: 'no-store', signal });
      if (r2.ok) {
        const j = await r2.json().catch(() => ({}));
        const arr = extractArray(j);
        if (arr.length || r2.ok) return arr;
      }
    } catch { /* next */ }
  }
  return [];
}

export default function CampSearchResults({ qs, active = true }: { qs?: string; active?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname() || '/search';
  const sp = useSearchParams();
  const { isOverlay } = useOverlayEnvironment();

  const qsString = qs ?? (sp?.toString() || '');
  const sortParam = (qs ? (new URLSearchParams(qs).get('sort') || 'relevance') : (sp?.get('sort') || 'relevance'));
  const hasLocation = (() => {
    if (qs) {
      const p = new URLSearchParams(qs);
      return !!(p.get('location') || (p.get('latitude') && p.get('longitude')));
    }
    return !!(sp?.get('location') || (sp?.get('latitude') && sp?.get('longitude')));
  })();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<UnknownRecord[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const deletedIdsRef = useRef<Set<number>>(new Set());
  const enriched = useRef<Set<number>>(new Set());

  const readDeletedIds = () => {
    if (typeof window === 'undefined') return new Set<number>();
    try {
      const raw = window.sessionStorage.getItem('navumi:deleted-camps');
      const list = raw ? (JSON.parse(raw) as number[]) : [];
      return new Set(list.filter((v) => typeof v === 'number' && Number.isFinite(v)));
    } catch {
      return new Set<number>();
    }
  };

  const persistDeletedId = (id: number) => {
    if (typeof window === 'undefined') return;
    try {
      const current = readDeletedIds();
      current.add(id);
      const arr = Array.from(current);
      window.sessionStorage.setItem('navumi:deleted-camps', JSON.stringify(arr.slice(-50)));
      deletedIdsRef.current = new Set(arr);
    } catch {
      // ignore
    }
  };

  const fetchUrls = useMemo(() => {
    const p = new URLSearchParams(qsString);
    if (!p.has('limit') && !p.has('page_size')) p.set('limit', '100');
    const baseQs = `?${p.toString()}`;
    // Prefer endpoints that include hot-deal fields (filter/club lists), then search, then generic fallback
    return [
      `${API_BASE}/api/camps/filter/${baseQs}`,
      `${API_BASE}/api/camps/search/${baseQs}`,
      `${API_BASE}/api/camps/${baseQs}`,
    ];
  }, [qsString]);

  const debug = useCallback((...args: unknown[]) => {
    if (!isOverlay) return;
    try {
      // eslint-disable-next-line no-console
      console.debug('[CampSearchResults]', ...args);
    } catch {
      /* noop */
    }
  }, [isOverlay]);

  const trace = useCallback((...args: unknown[]) => {
    try {
      // eslint-disable-next-line no-console
      console.info('[CampSearchResults][delete-sync]', ...args);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    deletedIdsRef.current = readDeletedIds();
    trace('init:deleted-ids', Array.from(deletedIdsRef.current));
    if (!deletedIdsRef.current.size) return;
    setItems((prev) =>
      prev.filter((o) => {
        const id = readCampId(o as UnknownRecord);
        if (id && deletedIdsRef.current.has(id)) {
          trace('init:filter:remove', { id, itemId: (o as UnknownRecord)['id'], campId: (o as UnknownRecord)['camp_id'], url: (o as UnknownRecord)['camp_url'] || (o as UnknownRecord)['url'] });
        }
        return !(id && deletedIdsRef.current.has(id));
      })
    );
  }, []);

  useEffect(() => {
    if (!items.length || deletedIdsRef.current.size === 0) return;
    const next = items.filter((o) => {
      const id = readCampId(o as UnknownRecord);
      if (id && deletedIdsRef.current.has(id)) {
        trace('items:filter:remove', { id, itemId: (o as UnknownRecord)['id'], campId: (o as UnknownRecord)['camp_id'], url: (o as UnknownRecord)['camp_url'] || (o as UnknownRecord)['url'] });
      }
      return !(id && deletedIdsRef.current.has(id));
    });
    if (next.length !== items.length) setItems(next);
  }, [items, trace]);

  useEffect(() => {
    debug('effect:start', {
      active,
      qsProp: qs ?? null,
      qsString,
    });
    if (!active) return;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);

    fetchWithFallback(fetchUrls, ac.signal)
      .then((arr) => {
        debug('fetch:resolved', { count: Array.isArray(arr) ? arr.length : null });
        if (cancelled) return;
        // Client-side guard: if hot_deals filter requested, keep only hot items
        const p = new URLSearchParams(qsString);
        const wantHot = ['1','true','on'].includes((p.get('hot_deals') || '').toLowerCase());
        let filtered = wantHot
          ? (arr || []).filter((o: UnknownRecord) => {
              const a: UnknownRecord = o as UnknownRecord;
              const isHot = (typeof a['is_hot_deal'] === 'boolean' && a['is_hot_deal']) || (typeof a['isHotDeal'] === 'boolean' && a['isHotDeal']);
              const hasHotPrice = (() => {
                const v = a['hot_deal_price'];
                if (typeof v === 'number') return Number.isFinite(v);
                if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return true;
                return false;
              })();
              return isHot || hasHotPrice;
            })
          : arr;
        const deletedIds = deletedIdsRef.current;
        if (deletedIds.size > 0) {
          filtered = (filtered || []).filter((o: UnknownRecord) => {
            const id = readCampId(o);
            return !(id && deletedIds.has(id));
          });
        }
        setItems(filtered);
      })
      .catch((err) => {
        debug('fetch:error', { message: err instanceof Error ? err.message : String(err) });
        if (!cancelled) setError('Не удалось загрузить результаты поиска');
      })
      .finally(() => {
        debug('effect:finally', { cancelled });
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; ac.abort(); };
  }, [fetchUrls, qs, qsString, active, debug, reloadToken]);

  // helpers to avoid `any`
  const getId = (o: UnknownRecord): number | null => {
    const v = o['id'];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const isHot = (o: UnknownRecord): boolean => {
    const a = o['is_hot_deal'];
    const b = o['isHotDeal'];
    return (typeof a === 'boolean' ? a : false) || (typeof b === 'boolean' ? b : false);
  };
  const hasHotPrice = (o: UnknownRecord): boolean => {
    const v = o['hot_deal_price'];
    if (typeof v === 'number' && Number.isFinite(v)) return true;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return true;
    return false;
  };

  // Enrich hot price for items where is_hot_deal=true but hot_deal_price отсутствует (на /filter/ его нет)
  useEffect(() => {
    if (!items.length) return;
    const ac = new AbortController();
    (async () => {
      for (const o of items) {
        try {
          const id = getId(o);
          const hot = isHot(o);
          const hasHot = hasHotPrice(o);
          if (!id || !hot || hasHot || enriched.current.has(id)) continue;
          const url = `${API_BASE}/api/camps/${id}/`;
          const r = await fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal });
          if (!r.ok) continue;
          const d = await r.json() as UnknownRecord;
          setItems(prev => prev.map((it) => (getId(it as UnknownRecord) === id ? { ...it, ...d } : it)) as UnknownRecord[]);
          enriched.current.add(id);
        } catch { /* noop */ }
      }
    })();
    return () => ac.abort();
  }, [items]);

  // Динамическое появление нового кэмпа после создания
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setReloadToken((t) => t + 1);
    };
    window.addEventListener('navumi:camp-created', handler as EventListener);
    return () => window.removeEventListener('navumi:camp-created', handler as EventListener);
  }, []);

  // Удаляем кэмп из результатов сразу после успешного удаления (без перезагрузки страницы)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const ce = event as CustomEvent<{ id?: number }>;
      const rawId = ce.detail?.id;
      const deletedId = typeof rawId === 'number' ? rawId : (typeof rawId === 'string' ? Number(rawId) : null);
      if (deletedId && !Number.isFinite(deletedId)) return;
      if (!deletedId) return;
      trace('event:camp-deleted', {
        deletedId,
        rawId,
        itemsCount: items.length,
        sampleIds: items.slice(0, 20).map((o) => readCampId(o as UnknownRecord)),
      });
      persistDeletedId(deletedId);
      setItems(prev =>
        prev.filter((o) => {
          const id = readCampId(o as UnknownRecord);
          if (id && id === deletedId) {
            trace('event:filter:remove', { id, itemId: (o as UnknownRecord)['id'], campId: (o as UnknownRecord)['camp_id'], url: (o as UnknownRecord)['camp_url'] || (o as UnknownRecord)['url'] });
          }
          return !(id && id === deletedId);
        })
      );
      setReloadToken((t) => t + 1);
    };
    window.addEventListener('navumi:camp-deleted', handler as EventListener);
    return () => window.removeEventListener('navumi:camp-deleted', handler as EventListener);
  }, [items]);

  const setSort = useCallback((next: string) => {
    const params = new URLSearchParams(qsString);
    if (next) params.set('sort', next); else params.delete('sort');
    const nextUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, qsString, router]);

  const showSort = items.length > 0;
  const sortValue = sortParam || 'date';

  const sortOptions = useMemo(() => {
    const base = [
      { value: 'relevance', label: 'По совпадениям' },
      { value: 'date', label: 'По дате' },
      { value: 'popularity', label: 'Популярные' },
      { value: 'price_asc', label: 'Цена ↑' },
      { value: 'price_desc', label: 'Цена ↓' },
      { value: 'duration_asc', label: 'Длительность ↑' },
      { value: 'duration_desc', label: 'Длительность ↓' },
    ];
    return hasLocation ? [{ value: 'distance', label: 'Ближе' }, ...base] : base;
  }, [hasLocation]);

  // mobile detection for bottom sheet
  const [isMobile, setIsMobile] = useState<boolean>(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  useEffect(() => {
    const on = () => setIsMobile(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      if (btnRef.current && btnRef.current.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const onPickSort = (value: string) => {
    setSort(value);
    closeMenu();
  };

  // Derived, sorted view
  const sortedView = useMemo(() => {
    const p = new URLSearchParams(qsString);
    const origin = {
      lat: Number(p.get('latitude') || NaN),
      lng: Number(p.get('longitude') || NaN),
    };
    const hasOrigin = Number.isFinite(origin.lat) && Number.isFinite(origin.lng);

    const toTs = (s?: string | null) => {
      if (!s) return Number.POSITIVE_INFINITY;
      const t = Date.parse(s);
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };
    const daysBetween = (a?: string | null, b?: string | null) => {
      const ta = Date.parse(a || '');
      const tb = Date.parse(b || '');
      if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
      const d = Math.max(0, Math.round((tb - ta) / (1000 * 60 * 60 * 24)));
      return d;
    };
    const priceOf = (o: UnknownRecord, d: ReturnType<typeof normalizeCampToCardData>) => {
      const hot = d.hot_deal_price;
      const base = d.price;
      if (typeof hot === 'number' && Number.isFinite(hot)) return hot;
      if (typeof base === 'number' && Number.isFinite(base)) return base;
      const v = pickNumber(o, ['hot_deal_price', 'price']);
      return (v ?? Number.POSITIVE_INFINITY) as number;
    };
    const getLatLng = (o: UnknownRecord) => {
      const lat = pickNumber(o, ['latitude', 'lat', 'geo_lat', 'lat_deg']);
      const lng = pickNumber(o, ['longitude', 'lng', 'lon', 'geo_lng', 'long', 'lon_deg']);
      return (lat != null && lng != null) ? { lat, lng } : null;
    };
    const haversine = (la1: number, lo1: number, la2: number, lo2: number) => {
      const toRad = (x: number) => x * Math.PI / 180;
      const R = 6371; // km
      const dLat = toRad(la2 - la1);
      const dLon = toRad(lo2 - lo1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin(dLon/2)**2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    };

    const view = (items || []).map((o, idx) => {
      const data = normalizeCampToCardData(o);
      const coords = getLatLng(o);
      const distance = hasOrigin && coords ? haversine(origin.lat, origin.lng, coords.lat as number, coords.lng as number) : Number.POSITIVE_INFINITY;
      return { idx, raw: o, data, distance };
    });

    const s = (sortValue || 'relevance').toLowerCase();
    const arr = [...view];
    switch (s) {
      case 'date':
        arr.sort((a, b) => toTs(a.data.start_date) - toTs(b.data.start_date) || a.idx - b.idx);
        break;
      case 'price_asc':
        arr.sort((a, b) => priceOf(a.raw, a.data) - priceOf(b.raw, b.data) || a.idx - b.idx);
        break;
      case 'price_desc':
        arr.sort((a, b) => priceOf(b.raw, b.data) - priceOf(a.raw, a.data) || a.idx - b.idx);
        break;
      case 'duration_asc':
        arr.sort((a, b) => daysBetween(a.data.start_date, a.data.end_date) - daysBetween(b.data.start_date, b.data.end_date) || a.idx - b.idx);
        break;
      case 'duration_desc':
        arr.sort((a, b) => daysBetween(b.data.start_date, b.data.end_date) - daysBetween(a.data.start_date, a.data.end_date) || a.idx - b.idx);
        break;
      case 'distance':
        if (hasOrigin) {
          arr.sort((a, b) => (a.distance - b.distance) || a.idx - b.idx);
        }
        break;
      case 'popularity': {
        const val = (o: UnknownRecord) => {
          const v = pickNumber(o, ['popularity', 'likes', 'favorites', 'views', 'rating']);
          return (v ?? -Infinity) as number;
        };
        arr.sort((a, b) => val(b.raw) - val(a.raw) || a.idx - b.idx);
        break; }
      case 'relevance':
      default:
        // keep API order
        break;
    }
    return arr;
  }, [items, sortValue, qsString]);

  return (
    <div className="w-full mt-0">
      {loading && (
        <div className="text-center text-sm text-gray-500 py-6">Загружаем результаты…</div>
      )}
      {error && (
        <div className="text-center text-sm text-red-600 py-6">{error}</div>
      )}

      {!loading && !error && (
        <>
          {showSort && (
            <div className="flex items-center justify-between mb-3 px-0">
              <div className="relative">
                <button
                  ref={btnRef}
                  type="button"
                  onClick={openMenu}
                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 hover:underline"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span>Сортировать</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {/* Desktop dropdown */}
                {!isMobile && menuOpen && (
                  <div
                    ref={menuRef}
                    className="absolute left-full ml-2 mt-2 w-56 rounded-lg border bg-white shadow-lg z-40 overflow-hidden"
                    role="menu"
                  >
                    {sortOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${sortValue === o.value ? 'font-medium text-gray-900' : 'text-gray-700'}`}
                        onClick={() => onPickSort(o.value)}
                        role="menuitem"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-500 pr-3">Найдено: {items.length}</div>
            </div>
          )}

          {(sortedView.length === 0) ? (
            <div className="text-center text-sm text-gray-500 py-8">Ничего не нашли. Попробуйте изменить фильтры.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sortedView.map((it, idx) => {
                const data = it.data;
                const key = String(data.campNumber ?? data.camp_url ?? it.idx ?? idx);
                return (
                  <CampCard
                    key={key}
                    className="w-full"
                    showActivity={true}
                    activityPlacement="over-image"
                    camp={data}
                  />
                );
              })}
            </div>
          )}
          {/* Mobile bottom sheet */}
          {menuOpen && isMobile && (
            <div className="fixed inset-0 z-[6000]" aria-modal="true" role="dialog" onClick={closeMenu}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl border-t shadow-xl p-2 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]"
                   onClick={(e) => e.stopPropagation()}>
                <div className="mx-auto h-1 w-10 rounded bg-gray-300 mb-2" />
                {sortOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`w-full text-left px-4 py-3 text-[15px] ${sortValue === o.value ? 'font-semibold text-gray-900' : 'text-gray-800'} hover:bg-gray-50`}
                    onClick={() => onPickSort(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
