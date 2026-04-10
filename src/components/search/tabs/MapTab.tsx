'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeCampToCardData, pickNumber } from '@/components/camp/campNormalize';
import { campPathFrom } from '@/components/post/helpers/campPath';
import { saveMainScroll } from '@/lib/scrollRestoration';
import { useCampOverlay } from '@/hooks/useCampOverlay';
import { useLayerStack } from '@/context/LayerStackContext';
import { getBrowserApiBase } from '@/lib/apiBase';

type UnknownRecord = Record<string, unknown>;
type VisualViewportLike = {
  height: number;
  addEventListener?: (type: 'resize' | 'scroll', listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: 'resize' | 'scroll', listener: EventListenerOrEventListenerObject) => void;
};

const API_BASE = getBrowserApiBase();
const SINGLE_POINT_ZOOM = 7; // показываем хотя бы область, а не уровень улиц

interface CampPoint { id: number; title: string; latitude: number; longitude: number }
interface CampPopupData {
  id: number;
  title: string;
  activity?: string;
  extraActivities: number;
  dateRange?: string;
  image?: string | null;
  href: string;
  owner?: string | null;
  campNumber?: string | number | null;
}

type CampSummaryItem = {
  id: number;
  title?: string | null;
  location_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  activities?: Array<{ id: number; name: string }>;
  price?: number | null;
  hot_deal_price?: number | null;
  currency?: string | null;
};

function extractCampArray(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) return data as UnknownRecord[];
  const root = (data && typeof data === 'object') ? (data as UnknownRecord) : {};
  const asObj = (v: unknown): UnknownRecord | null => (v && typeof v === 'object') ? (v as UnknownRecord) : null;

  const candidates: unknown[] = [
    root['camps'],
    root['results'],
    root['items'],
    asObj(root['data'])?.['camps'],
    asObj(root['data'])?.['results'],
    asObj(root['data'])?.['items'],
    asObj(root['camps'])?.['results'],
    asObj(root['camps'])?.['items'],
  ].filter(Boolean);

  for (const c of candidates) {
    if (Array.isArray(c)) return c as UnknownRecord[];
  }
  return [];
}

function mapToPoints(raw: UnknownRecord[]): CampPoint[] {
  return raw.map((it) => {
    const id = pickNumber(it, ['id']) ?? 0;
    const titleRaw = it['title'];
    const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : '';
    const lat = pickNumber(it, ['latitude', 'lat', 'geo_lat', 'lat_deg']);
    const lng = pickNumber(it, ['longitude', 'lng', 'lon', 'geo_lng', 'long', 'lon_deg']);
    return {
      id: Number(id),
      title,
      latitude: lat ?? NaN,
      longitude: lng ?? NaN,
    };
  }).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.id > 0);
}

export default function MapTab(
  {
    qs,
    active = true,
    filtersCollapsed,
    layoutEpoch,
  }: {
    qs: string;
    active?: boolean;
    filtersCollapsed?: boolean;
    layoutEpoch?: number;
  },
) {
  const [points, setPoints] = useState<CampPoint[]>([]);
  const lastQsRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = React.useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const popupCache = useRef(new Map<number, CampPopupData>());
  const lastOpenedIdRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapHeight, setMapHeight] = useState(420);
  const openCampOverlay = useCampOverlay();
  const { pushScreen, closeTopScreen } = useLayerStack();

  const openCampFromPopup = useCallback((data: CampPopupData | null) => {
    if (!data) return;
    saveMainScroll();
    openCampOverlay({
      username: data.owner || undefined,
      campNumber: data.campNumber ?? undefined,
      campPath: data.href,
    });
  }, [openCampOverlay]);

  const openClusterOverlay = useCallback((ids: number[]) => {
    if (!ids.length) return;
    const uniqueIds = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))));
    if (!uniqueIds.length) return;

    const node = (
      <CampClusterScreen
        ids={uniqueIds}
        onClose={closeTopScreen}
      />
    );

    pushScreen({
      node,
      className: 'bg-transparent flex flex-col',
      backdrop: 'dim',
      dismissible: true,
      blockScroll: true,
      ariaLabel: 'Кэмпы в этой локации',
    });
  }, [pushScreen, closeTopScreen]);

  useEffect(() => {
    if (!active) return;
    if (lastQsRef.current === qs && points.length > 0) return;
    lastQsRef.current = qs;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setPoints([]);

    const loadPoints = async () => {
      let mapped: CampPoint[] = [];
      try {
        const urlPoints = `${API_BASE}/api/camps/points/?${qs}`;
        const r = await fetch(urlPoints, { credentials: 'include', cache: 'no-store', signal: ac.signal });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (cancelled) return;
          const raw = extractCampArray(j);
          mapped = mapToPoints(raw);
        }
      } catch {
        // ignore here, we'll try fallback below
      }

      if (!mapped.length) {
        try {
          const urlFilter = `${API_BASE}/api/camps/filter/?${qs}`;
          const r2 = await fetch(urlFilter, { credentials: 'include', cache: 'no-store', signal: ac.signal });
          if (r2.ok) {
            const j2 = await r2.json().catch(() => ({}));
            if (cancelled) return;
            const raw2 = extractCampArray(j2);
            mapped = mapToPoints(raw2);
          }
        } catch {
          // both endpoints failed or returned nothing
        }
      }

      if (!cancelled) {
        if (!mapped.length) {
          setPoints([]);
        } else {
          setPoints(mapped);
        }
      }
    };

    void loadPoints().catch(() => {
      if (!cancelled) setError('Не удалось загрузить точки');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [qs, active, points.length]);

  const fetchPopupData = useCallback(async (id: number): Promise<CampPopupData | null> => {
    if (popupCache.current.has(id)) return popupCache.current.get(id)!;
    const endpoints = [
      `${API_BASE}/api/camps/${id}/`,
      `${API_BASE}/api/camps/${id}`,
    ];
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) continue;
        const raw = await res.json().catch(() => null);
        if (!raw) continue;
        const normalized = normalizeCampToCardData(raw as UnknownRecord);
        const acts = Array.isArray(normalized.activities) ? normalized.activities.filter(Boolean) as string[] : [];
        const href = resolveCampHref(normalized, raw as UnknownRecord, id);
        const snippet: CampPopupData = {
          id,
          title: normalized.title || String((raw as UnknownRecord)['title'] ?? ''),
          activity: acts[0],
          extraActivities: Math.max(0, acts.length - 1),
          dateRange: formatCompactDateRange(normalized.start_date, normalized.end_date),
          image: normalized.title_image || null,
          href,
          owner: normalized.organizerUsername || null,
          campNumber: normalized.campNumber ?? null,
        };
        popupCache.current.set(id, snippet);
        return snippet;
      } catch {
        continue;
      }
    }
    return null;
  }, []);

  // init google map (multiple markers + fitBounds)
  const handleZoom = useCallback((delta: number) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const current = map.getZoom() ?? 0;
    map.setZoom(current + delta);
  }, []);

  const recomputeMapHeight = useCallback(() => {
    if (typeof window === 'undefined') return;
    const wrapper = mapContainerRef.current;
    if (!wrapper) return;

    const vvp = (window as Window & { visualViewport?: VisualViewportLike }).visualViewport;
    const viewportH = vvp?.height ?? window.innerHeight;

    const rect = wrapper.getBoundingClientRect();

    // высота нижнего навбара (если есть)
    const nav = document.querySelector<HTMLElement>('[data-bottom-nav="true"]');
    const navH = nav?.getBoundingClientRect().height ?? 0;

    // safe-area снизу (iOS)
    const safe = vvp ? Math.max(vvp.height - window.innerHeight, 0) : 0;

    // небольшой зазор между картой и навбаром
    const extraBottom = 12;

    // вписываем карту строго между своей верхней границей и верхом навбара
    const available = viewportH - rect.top - navH - safe - extraBottom;

    const minH = 280;
    const maxH = Math.max(minH, Math.round(viewportH * 0.94));
    const next = Math.max(minH, Math.min(available, maxH));
    setMapHeight((prev) => (Number.isFinite(next) ? next : prev));
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    let markersCleanup: (() => void) | null = null;

    const init = () => {
      if (!mapRef.current || !window.google?.maps) return;
      markersCleanup?.();
      const first = points[0];
      const center = first ? { lat: first.latitude, lng: first.longitude } : { lat: 55.751244, lng: 37.618423 };
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: points.length ? 6 : 3,
        disableDefaultUI: true,
        zoomControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy',
        mapTypeId: 'roadmap',
      });
      mapInstanceRef.current = map;
      setMapReady(true);

      const infoWindow = new window.google.maps.InfoWindow();
      const markers: google.maps.Marker[] = [];

      const handleMarkerClick = async (marker: google.maps.Marker, point: CampPoint) => {
        lastOpenedIdRef.current = point.id;
        infoWindow.close();
        const loadingNode = createInfoMessage('Загрузка…');
        infoWindow.setContent(loadingNode);
        infoWindow.open({ anchor: marker, map });

        const data = await fetchPopupData(point.id);
        if (lastOpenedIdRef.current !== point.id) return;
        if (!data) {
          infoWindow.setContent(createInfoMessage('Не удалось показать кэмп'));
          return;
        }
        const contentNode = createInfoContent(
          data,
          () => openCampFromPopup(data),
          () => {
            lastOpenedIdRef.current = null;
            infoWindow.close();
          }
        );
        infoWindow.setContent(contentNode);
        infoWindow.open({ anchor: marker, map });
      };

      const renderForZoom = (initial: boolean) => {
        markers.forEach((m) => m.setMap(null));
        markers.length = 0;

        const zoom = map.getZoom() ?? 6;
        const groups = clusterPoints(points, zoom);

        const bounds = initial ? new window.google.maps.LatLngBounds() : null;

        groups.forEach((group) => {
          const pos = { lat: group.latitude, lng: group.longitude };
          const count = group.points.length;
          const marker = new window.google.maps.Marker({
            position: pos,
            map,
            title: count === 1 ? group.points[0].title : `${count} кэмпов`,
            label: count > 1 ? {
              text: count > 99 ? '99+' : String(count),
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '600',
            } : undefined,
          });
          if (count === 1) {
            const p = group.points[0];
            marker.addListener('click', () => handleMarkerClick(marker, p));
          } else {
            const idsForCluster = group.points.map((p) => p.id);
            marker.addListener('click', () => openClusterOverlay(idsForCluster));
          }
          markers.push(marker);
          if (bounds) bounds.extend(pos);
        });

        if (initial && bounds && !bounds.isEmpty()) {
          if (groups.length === 1) {
            const single = groups[0];
            map.setCenter({ lat: single.latitude, lng: single.longitude });
            map.setZoom(SINGLE_POINT_ZOOM);
          } else {
            map.fitBounds(bounds);
          }
        }
      };

      renderForZoom(true);
      const clickListener = map.addListener('click', () => infoWindow.close());
      const zoomListener = map.addListener('zoom_changed', () => renderForZoom(false));

      markersCleanup = () => {
        infoWindow.close();
        clickListener.remove();
        zoomListener.remove();
        markers.forEach((marker) => marker.setMap(null));
        if (mapInstanceRef.current === map) {
          mapInstanceRef.current = null;
        }
        setMapReady(false);
      };
    };

    if (window.google?.maps) {
      init();
    } else {
      const scriptId = 'gmaps';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      const onLoad = () => {
        init();
        script?.removeEventListener('load', onLoad);
      };
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&v=weekly&language=ru`;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', onLoad);
      return () => {
        script?.removeEventListener('load', onLoad);
        markersCleanup?.();
      };
    }

    return () => { markersCleanup?.(); };
  }, [points, fetchPopupData, openCampFromPopup, openClusterOverlay]);

  useEffect(() => {
    if (!active) return;

    // первичный расчёт сразу после маунта
    recomputeMapHeight();

    // дополнительный расчёт чуть позже — когда BottomNavBar успеет измериться
    const t = window.setTimeout(() => recomputeMapHeight(), 120);
    // ещё один пересчёт чуть позже — на случай,
    // если сначала сворачивается форма поиска, а затем
    // меняются CSS‑переменные высоты.
    const t2 = window.setTimeout(() => recomputeMapHeight(), 260);

    const onResize = () => recomputeMapHeight();
    const vvp = (window as Window & { visualViewport?: VisualViewportLike }).visualViewport;
    window.addEventListener('resize', onResize);
    vvp?.addEventListener?.('resize', onResize);
    vvp?.addEventListener?.('scroll', onResize);

    // изменения высоты скролл-области (сворачивание формы поиска и т.п.)
    const wrapper = mapContainerRef.current;
    const scrollRoot = wrapper?.closest('[data-search-scroll]') as HTMLElement | null;
    const ro = typeof ResizeObserver !== 'undefined' && scrollRoot
      ? new ResizeObserver(() => recomputeMapHeight())
      : null;
    if (scrollRoot && ro) ro.observe(scrollRoot);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.removeEventListener('resize', onResize);
      vvp?.removeEventListener?.('resize', onResize);
      vvp?.removeEventListener?.('scroll', onResize);
      ro?.disconnect();
    };
  }, [active, filtersCollapsed, layoutEpoch, recomputeMapHeight]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    try {
      const map = mapInstanceRef.current;
      const center = map.getCenter();
      window.google?.maps?.event?.trigger(map, 'resize');
      if (center) map.setCenter(center);
    } catch { /* ignore */ }
  }, [mapReady, mapHeight]);

  if (loading) return <div className="text-sm text-gray-500 py-6">Загрузка карты…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;

  return (
    <div
      ref={mapContainerRef}
      className="relative w-full min-h-0 rounded-xl overflow-hidden border border-gray-200"
      style={{ height: `${Math.max(280, mapHeight)}px` }}
    >
      <div ref={mapRef} className="absolute inset-0" />
      {mapReady && (
        <div className="absolute z-20 top-3 right-3 flex flex-col rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => handleZoom(1)}
            className="px-3 py-2 text-xl text-gray-800 hover:bg-gray-100 focus:outline-none"
            aria-label="Приблизить карту"
          >
            +
          </button>
          <div className="h-px bg-gray-200" />
          <button
            type="button"
            onClick={() => handleZoom(-1)}
            className="px-3 py-2 text-xl text-gray-800 hover:bg-gray-100 focus:outline-none"
            aria-label="Отдалить карту"
          >
            –
          </button>
        </div>
      )}
    </div>
  );
}

function clusterPoints(points: CampPoint[], zoom: number): Array<{ latitude: number; longitude: number; points: CampPoint[] }> {
  if (!points.length) return [];

  const RADIUS_PX = 44; // радиус, при котором маркеры считаем «слипающимися»
  const scale = 256 * Math.pow(2, zoom);

  const project = (lat: number, lng: number) => {
    const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    const x = (lng + 180) / 360 * scale;
    const y = (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * scale;
    return { x, y };
  };

  const clusters: Array<{ latitude: number; longitude: number; points: CampPoint[] }> = [];
  const used = new Set<number>();

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const base = points[i];
    const basePx = project(base.latitude, base.longitude);
    const members: CampPoint[] = [base];
    used.add(i);

    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const other = points[j];
      const otherPx = project(other.latitude, other.longitude);
      const dx = basePx.x - otherPx.x;
      const dy = basePx.y - otherPx.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= RADIUS_PX) {
        members.push(other);
        used.add(j);
      }
    }

    const lat = members.reduce((sum, p) => sum + p.latitude, 0) / members.length;
    const lng = members.reduce((sum, p) => sum + p.longitude, 0) / members.length;
    clusters.push({ latitude: lat, longitude: lng, points: members });
  }

  return clusters;
}

function CampClusterScreen({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const [items, setItems] = React.useState<CampSummaryItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const openCampOverlay = useCampOverlay();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set('ids', ids.join(','));
        const url = `${API_BASE}/api/camps/summary/bulk/?${params.toString()}`;
        let r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) {
          r = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        }

        let list: CampSummaryItem[] = [];

        if (r.ok) {
          const j = await r.json().catch(() => ({} as { items?: CampSummaryItem[] }));
          list = Array.isArray((j as { items?: unknown }).items)
            ? ((j as { items?: CampSummaryItem[] }).items ?? [])
            : [];
        }

        // Фолбэк: если bulk-эндпоинт недоступен или вернул пусто,
        // пробуем подтянуть данные по каждому кэмпу отдельно.
        if (!list.length) {
          const toNumber = (v: unknown): number | null => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim() !== '') {
              const n = Number(v);
              return Number.isFinite(n) ? n : null;
            }
            return null;
          };

          const collected: CampSummaryItem[] = [];
          for (const id of ids) {
            try {
              const detailUrl = `${API_BASE}/api/camps/${id}/`;
              let dr = await fetch(detailUrl, { credentials: 'include', cache: 'no-store' });
              if (!dr.ok) {
                dr = await fetch(detailUrl, { credentials: 'omit', cache: 'no-store' });
              }
              if (!dr.ok) continue;
              const raw = (await dr.json().catch(() => null)) as UnknownRecord | null;
              if (!raw) continue;
              const normalized = normalizeCampToCardData(raw);
              const acts = Array.isArray(normalized.activities)
                ? (normalized.activities.filter(Boolean) as string[])
                : [];
              const activities = acts.map((name, idx) => ({
                id: idx + 1,
                name,
              }));

              const price = toNumber(normalized.price);
              const hot = toNumber(normalized.hot_deal_price);

              const item: CampSummaryItem = {
                id,
                title: normalized.title,
                location_name: normalized.location_name,
                start_date: normalized.start_date,
                end_date: normalized.end_date,
                activities,
                price,
                hot_deal_price: hot,
                currency: normalized.currency ?? 'RUB',
              };
              collected.push(item);
            } catch {
              // ignore this id
            }
          }
          list = collected;
        }

        const parseDate = (v?: string | null) => {
          if (!v) return Number.POSITIVE_INFINITY;
          const t = Date.parse(v);
          return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
        };
        list = list
          .slice()
          .sort((a, b) => parseDate(a.start_date) - parseDate(b.start_date));

        if (!cancelled) {
          setItems(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : 'Ошибка загрузки');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const handleSelect = React.useCallback(
    (id: number) => {
      saveMainScroll();
      openCampOverlay({ campId: id });
    },
    [openCampOverlay],
  );

  const renderBody = () => {
    if (items === null) {
      return <div className="py-6 text-sm text-gray-500 text-center">Загружаем кэмпы…</div>;
    }
    if (error) {
      return <div className="py-6 text-sm text-red-600 text-center px-4">{error}</div>;
    }
    if (!items.length) {
      return <div className="py-6 text-sm text-gray-500 text-center px-4">Кэмпы в этой локации не найдены.</div>;
    }
    return (
      <ul className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
        {items.map((item) => {
          const range = formatCompactDateRange(item.start_date ?? null, item.end_date ?? null);
          const activityLabel = formatActivityLabel(item.activities);
          const priceLabel = formatPriceLabel(item.price, item.hot_deal_price, item.currency);
          return (
            <li key={item.id}>
              <button
                type="button"
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50"
                onClick={() => handleSelect(item.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-gray-900 truncate">
                    {activityLabel || (item.title || 'Кэмп')}
                  </div>
                  <div className="mt-0.5 text-[13px] text-gray-500 truncate">
                    {range || 'Даты уточняются'}
                  </div>
                </div>
                {priceLabel && (
                  <div className="ml-2 text-[14px] font-semibold text-gray-900 whitespace-nowrap">
                    {priceLabel}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div
      className="flex-1 flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-[15px] font-semibold">Кэмпы в этой локации</div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        {renderBody()}
      </div>
    </div>
  );
}


function formatCompactDateRange(start?: string | null, end?: string | null): string {
  const parse = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(+d) ? null : d;
  };
  const s = parse(start);
  const e = parse(end);
  if (s && e) {
    const sameYear = s.getFullYear() === e.getFullYear();
    const rightYear = e.getFullYear();
    const left = `${s.getDate()} ${monthShort(s)}`;
    const right = `${e.getDate()} ${monthShort(e)}${sameYear ? '' : ` ${rightYear}`}`;
    return `${left} — ${right}${sameYear ? ` ${rightYear}` : ''}`;
  }
  const d = s || e;
  return d ? `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}` : '';
}

function monthShort(d: Date): string {
  try {
    const fmt = d.toLocaleDateString('ru-RU', { month: 'short' });
    return fmt;
  } catch {
    const months = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
    return months[d.getMonth()] || '';
  }
}

function resolveCampHref(normalized: ReturnType<typeof normalizeCampToCardData>, raw: UnknownRecord, id: number): string {
  const fromHelper = campPathFrom(
    normalized.organizerUsername || undefined,
    { camp_number: normalized.campNumber ?? undefined, url: normalized.camp_url ?? undefined }
  );
  if (fromHelper) return fromHelper;
  const rawUrl = (() => {
    const candidates = ['camp_url', 'url', 'detail_url'];
    for (const key of candidates) {
      const v = raw[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  })();
  if (rawUrl.startsWith('http')) return rawUrl;
  if (rawUrl.startsWith('/')) return rawUrl;
  return `/camp/${id}`;
}

function createInfoMessage(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.fontSize = '13px';
  el.style.color = '#4b5563';
  el.style.padding = '4px';
  el.style.maxWidth = '240px';
  return el;
}

function createInfoContent(data: CampPopupData, onNavigate: () => void, onClose?: () => void): HTMLElement {
  const root = document.createElement('div');
  root.style.position = 'relative';
  root.style.width = '260px';
  root.style.height = '160px';
  root.style.borderRadius = '20px';
  root.style.overflow = 'hidden';
  root.style.cursor = 'pointer';
  root.style.fontFamily = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  root.addEventListener('click', onNavigate);

  if (data.image) {
    const img = document.createElement('img');
    img.src = data.image;
    img.alt = data.title || 'Кэмп';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    root.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Нет фото';
    placeholder.style.width = '100%';
    placeholder.style.height = '100%';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.color = '#6b7280';
    placeholder.style.fontSize = '13px';
    placeholder.style.background = '#f3f4f6';
    root.appendChild(placeholder);
  }

  if (data.activity) {
    const pill = document.createElement('div');
    pill.textContent = data.extraActivities > 0
      ? `${data.activity} +${data.extraActivities}`
      : data.activity;
    pill.style.position = 'absolute';
    pill.style.top = '8px';
    pill.style.left = '8px';
    pill.style.background = 'rgba(17,24,39,0.9)';
    pill.style.color = '#fff';
    pill.style.borderRadius = '999px';
    pill.style.fontSize = '12px';
    pill.style.padding = '4px 10px';
    pill.style.maxWidth = '80%';
    pill.style.whiteSpace = 'nowrap';
    pill.style.overflow = 'hidden';
    pill.style.textOverflow = 'ellipsis';
    root.appendChild(pill);
  }

  const dateOverlay = document.createElement('div');
  dateOverlay.textContent = data.dateRange || 'Даты';
  dateOverlay.style.position = 'absolute';
  dateOverlay.style.left = '8px';
  dateOverlay.style.bottom = '8px';
  dateOverlay.style.background = 'rgba(17,24,39,0.85)';
  dateOverlay.style.color = '#fff';
  dateOverlay.style.borderRadius = '12px';
  dateOverlay.style.fontSize = '12px';
  dateOverlay.style.padding = '4px 10px';
  root.appendChild(dateOverlay);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '6px';
  closeBtn.style.right = '6px';
  closeBtn.style.width = '24px';
  closeBtn.style.height = '24px';
  closeBtn.style.border = 'none';
  closeBtn.style.borderRadius = '999px';
  closeBtn.style.background = 'rgba(0,0,0,0.6)';
  closeBtn.style.color = '#fff';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.display = 'flex';
  closeBtn.style.alignItems = 'center';
  closeBtn.style.justifyContent = 'center';
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    onClose?.();
  });
  root.appendChild(closeBtn);

  return root;
}

function formatActivityLabel(activities?: Array<{ id: number; name: string }>): string {
  if (!Array.isArray(activities) || !activities.length) return '';
  const names = activities
    .map((a) => (a && typeof a.name === 'string' ? a.name.trim() : ''))
    .filter(Boolean);
  if (!names.length) return '';
  const first = names[0];
  const extra = Math.max(0, names.length - 1);
  return extra > 0 ? `${first} +${extra}` : first;
}

function formatPriceLabel(price?: number | null, hot?: number | null, currency?: string | null): string {
  const raw = typeof hot === 'number' && hot > 0 ? hot : price ?? null;
  if (raw == null || !Number.isFinite(raw)) return '';
  try {
    const formatted = new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits: 0,
    }).format(raw);
    const cur = (currency || 'RUB').toUpperCase();
    const suffix = cur === 'RUB' || cur === 'RUR' ? '₽' : cur;
    return `${formatted} ${suffix}`;
  } catch {
    return String(raw);
  }
}
