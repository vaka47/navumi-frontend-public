'use client';

import React from 'react';
import CampCard from '@/components/camp/CampCard';
import { normalizeCampToCardData } from '@/components/camp/campNormalize';
import { Button } from '@/components/ui/button';
import { useCreateCampOverlay } from '@/hooks/useCreateCampOverlay';
import CreateCampModal from '@/components/camp/CreateCampModal';
import { getBrowserApiBase } from '@/lib/apiBase';

// Новый упрощённый ответ: camps_by_club_username
type CampFromClubApi = {
  id: number;
  camp_number?: number | string | null;
  title: string;
  start_date?: string | null;  // YYYY-MM-DD
  end_date?: string | null;    // YYYY-MM-DD
  camp_url?: string | null;
  // расширенные поля для карточки (бэк добавил)
  title_image?: string | null;
  location_name?: string | null;
  price?: number | null;
  currency?: string | null;
  is_hot_deal?: boolean;
  hot_deal_price?: number | null;
  is_sold_out?: boolean;
};

type CampTabProps = {
  username: string;
  isOwner?: boolean;
  initialCamps?: CampFromClubApi[] | Record<string, unknown>[] | null;
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

const normalizeInitialCamp = (camp: Record<string, unknown>, idx: number): CampFromClubApi => {
  const id = coerceNumber(camp['id']) ?? idx;
  const camp_number = camp['camp_number'] as (number | string | null | undefined);
  const title = typeof camp['title'] === 'string' ? camp['title'] : '';
  const start_date = typeof camp['start_date'] === 'string' ? camp['start_date'] : null;
  const end_date = typeof camp['end_date'] === 'string' ? camp['end_date'] : null;
  const title_image = typeof camp['title_image'] === 'string' ? camp['title_image'] : null;
  const location_name = typeof camp['location_name'] === 'string' ? camp['location_name'] : null;
  const price = coerceNumber(camp['price']);
  const currency = typeof camp['currency'] === 'string' ? camp['currency'] : null;
  const is_hot_deal = typeof camp['is_hot_deal'] === 'boolean' ? camp['is_hot_deal'] : undefined;
  const rawHotPrice = camp['hot_deal_price'];
  const hot_deal_price = rawHotPrice == null ? null : coerceNumber(rawHotPrice);
  const is_sold_out = typeof camp['is_sold_out'] === 'boolean' ? camp['is_sold_out'] : undefined;
  return {
    id,
    camp_number: camp_number ?? null,
    title,
    start_date,
    end_date,
    camp_url: typeof camp['camp_url'] === 'string' ? camp['camp_url'] : null,
    title_image,
    location_name,
    price,
    currency,
    is_hot_deal,
    hot_deal_price: hot_deal_price ?? null,
    is_sold_out,
  };
};

export default function CampTab({ username, isOwner = false, initialCamps }: CampTabProps) {
  const API_BASE = getBrowserApiBase();
  const initialFromProfile = React.useMemo<CampFromClubApi[]>(() => {
    if (!Array.isArray(initialCamps) || !initialCamps.length) return [];
    return initialCamps.map((camp, idx) => {
      if (camp && typeof camp === 'object' && 'id' in camp && 'title' in camp) {
        const casted = camp as CampFromClubApi;
        return {
          ...casted,
          id: typeof casted.id === 'number' ? casted.id : (coerceNumber((camp as Record<string, unknown>)['id']) ?? idx),
          hot_deal_price: typeof casted.hot_deal_price === 'number'
            ? casted.hot_deal_price
            : casted.hot_deal_price == null
              ? null
              : coerceNumber((casted as unknown as Record<string, unknown>)['hot_deal_price']),
        };
      }
      return normalizeInitialCamp(camp as Record<string, unknown>, idx);
    }).filter((c) => typeof c.id === 'number');
  }, [initialCamps]);
  const initialById = React.useMemo(() => {
    const map = new Map<number, CampFromClubApi>();
    for (const camp of initialFromProfile) {
      if (typeof camp.id === 'number') map.set(camp.id, camp);
    }
    return map;
  }, [initialFromProfile]);

  const [items, setItems] = React.useState<CampFromClubApi[]>(() => initialFromProfile);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const enrichedRef = React.useRef<Set<number>>(new Set());
  const { open: openCreateCampOverlay } = useCreateCampOverlay();
  const [desktopCampModalOpen, setDesktopCampModalOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  React.useEffect(() => {
    if (!initialFromProfile.length) return;
    setItems((prev) => (prev.length ? prev : initialFromProfile));
  }, [initialFromProfile]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Вернули прежний набор источников, чтобы охват был шире
        // Важно: сначала берём профильный эндпоинт — он уже содержит is_sold_out, is_hot_deal, hot_deal_price
        const endpoints = [
          `${API_BASE}/api/profile/${encodeURIComponent(username)}/camps/`,
          `${API_BASE}/api/clubs/${encodeURIComponent(username)}/camps/`,
          // общий список без фильтра по параметру — отфильтруем по владельцу клиент‑сайд
          `${API_BASE}/api/camps/`,
          // подсказки — используются в пикере, дадут доп. покрытие, если нужно
          `${API_BASE}/api/clubs/${encodeURIComponent(username)}/camps/suggest/?q=`,
        ];
        type UnknownRecord = Record<string, unknown>;
        let loaded: UnknownRecord[] | null = null;
        let loadedFromUrl: string | null = null;
        console.info('[CampTab] load for', { username, API_BASE, endpoints });
        for (const url of endpoints) {
          let r: Response | null = null;
          // Без cookies — чтобы анонимам точно работало (CORS/credentials не требуются)
          try {
            console.debug('[CampTab] fetch omit', url);
            r = await fetch(url, { credentials: 'omit', cache: 'no-store' });
          } catch (e) {
            console.warn('[CampTab] fetch omit failed', { url, error: String(e) });
            r = null;
          }
          // На всякий случай попробуем с include, если omit не дал ok
          if ((!r || !r.ok)) {
            try {
              console.debug('[CampTab] fetch include', url, { status: r?.status });
              r = await fetch(url, { credentials: 'include', cache: 'no-store' });
            } catch (e) {
              console.warn('[CampTab] fetch include failed', { url, prevStatus: r?.status, error: String(e) });
            }
          }
          if (r && r.ok) {
            const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
            const root = j as { camps?: unknown; results?: unknown; items?: unknown; data?: unknown; club?: unknown };
            const fromData = (v: unknown): UnknownRecord | null => (v && typeof v === 'object' ? (v as UnknownRecord) : null);
            const dataObj = fromData(root.data);
            const candidates: unknown[] = [
              // простые варианты
              root.camps,
              root.results,
              root.items,
              Array.isArray(j) ? (j as unknown[]) : null,
              dataObj && Array.isArray(dataObj['camps']) ? (dataObj['camps'] as unknown[]) : null,
              dataObj && Array.isArray(dataObj['results']) ? (dataObj['results'] as unknown[]) : null,
              // вложенные внутри camps: { results: [...] } или camps: { items: [...] }
              (fromData(root.camps) && Array.isArray((fromData(root.camps) as UnknownRecord)['results']))
                ? ((fromData(root.camps) as UnknownRecord)['results'] as unknown[])
                : null,
              (fromData(root.camps) && Array.isArray((fromData(root.camps) as UnknownRecord)['items']))
                ? ((fromData(root.camps) as UnknownRecord)['items'] as unknown[])
                : null,
              // data.camps: { results: [...] }
              (dataObj && fromData(dataObj['camps']) && Array.isArray((fromData(dataObj['camps']) as UnknownRecord)['results']))
                ? ((fromData(dataObj['camps']) as UnknownRecord)['results'] as unknown[])
                : null,
              (dataObj && fromData(dataObj['camps']) && Array.isArray((fromData(dataObj['camps']) as UnknownRecord)['items']))
                ? ((fromData(dataObj['camps']) as UnknownRecord)['items'] as unknown[])
                : null,
            ].filter(Boolean) as unknown[];
            // дополнительная эвристика: поищем массивы на первом уровне по ключам, похожим на список кэмпов
            if (!candidates.length && j && typeof j === 'object') {
              try {
                for (const [k, v] of Object.entries(j)) {
                  if (Array.isArray(v) && /(camp|result|item|list)/i.test(k)) {
                    candidates.push(v as unknown[]);
                    break;
                  }
                }
              } catch { /* noop */ }
            }
            const firstArr = candidates.find((x) => Array.isArray(x)) as UnknownRecord[] | undefined;
            console.debug('[CampTab] response shape', {
              url,
              status: r.status,
              hasCamps: Array.isArray(root.camps),
              hasResults: Array.isArray(root.results),
              hasItems: Array.isArray(root.items),
              isArrayRoot: Array.isArray(j),
              hasDataCamps: !!(dataObj && Array.isArray(dataObj['camps'])),
              hasDataResults: !!(dataObj && Array.isArray(dataObj['results'])),
              count: Array.isArray(firstArr) ? firstArr.length : 0,
            });
            if (firstArr && Array.isArray(firstArr)) {
              loaded = firstArr as UnknownRecord[];
              loadedFromUrl = url;
              break;
            }
          }
        }

        // строгая фильтрация: если брали из общего списка /api/camps/ — оставляем только кэмпы этого клуба
        const norm = (arr: UnknownRecord[] | null): CampFromClubApi[] => {
          if (!arr) return [];

          const getOwner = (o: UnknownRecord): string | null => {
            const fromStrKeys = (
              ['camp_owner_username', 'owner_username', 'club_username', 'organizer_username', 'owner', 'organizer'] as const
            ).map(k => o[k]).find(v => typeof v === 'string' && v.trim());
            if (typeof fromStrKeys === 'string') return fromStrKeys.replace(/^@+/, '').trim();

            // nested objects
            const nestedKeys = ['organizer', 'owner', 'club', 'user', 'profile'] as const;
            for (const k of nestedKeys) {
              const v = o[k];
              if (v && typeof v === 'object' && typeof (v as UnknownRecord)['username'] === 'string') {
                const u = ((v as UnknownRecord)['username'] as string).trim();
                if (u) return u.replace(/^@+/, '');
              }
            }

            // parse from url
            const url = (typeof o['camp_url'] === 'string' && o['camp_url']) || (typeof o['url'] === 'string' && o['url']) || null;
            if (url) {
              try {
                const u = new URL(url, 'https://dummy.local');
                const m = u.pathname.match(/^\/(.+?)\/camp\//);
                if (m && m[1]) return m[1];
              } catch { /* noop */ }
            }
            return null;
          };

          const shouldFilterByOwner = !!(loadedFromUrl && /\/api\/camps(\/|\?|$)/.test(loadedFromUrl) && !/\/api\/clubs\//.test(loadedFromUrl));
          const ownerNorm = username.toLowerCase();

          const filtered = shouldFilterByOwner
            ? arr.filter((o) => {
                const own = (getOwner(o) || '').toLowerCase();
                return own === ownerNorm;
              })
            : arr;

          // приведём тип
          return filtered as unknown as CampFromClubApi[];
        };

        if (!cancelled) {
          if (loaded) {
            const normalized = norm(loaded);
            const merged = normalized.map((camp) => {
              const id = typeof camp.id === 'number' ? camp.id : coerceNumber((camp as unknown as Record<string, unknown>)['id']);
              const base = (typeof id === 'number' && initialById.size) ? initialById.get(id) : undefined;
              if (!base) return camp;
              const next = { ...base, ...camp } as CampFromClubApi;
              if (typeof camp.is_hot_deal === 'undefined') next.is_hot_deal = base.is_hot_deal;
              if (typeof camp.is_sold_out === 'undefined') next.is_sold_out = base.is_sold_out;
              if (typeof camp.hot_deal_price === 'undefined') next.hot_deal_price = base.hot_deal_price;
              return next;
            });
            setItems(merged);
          }
          else throw new Error('bad response');
        }
      } catch {
        console.error('[CampTab] failed to load camps', { username, API_BASE });
        if (!cancelled) setError('Не удалось загрузить кэмпы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [API_BASE, username, initialById, reloadToken]);

  // Enrich hot price/sold-out for items lacking these flags (если вдруг взяли не тот эндпоинт)
  React.useEffect(() => {
    if (!items.length) return;
    const ac = new AbortController();
    const hasHotPrice = (o: Record<string, unknown>): boolean => {
      const v = o['hot_deal_price'];
      return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));
    };
    const isHot = (o: Record<string, unknown>): boolean => {
      const v = o['is_hot_deal'];
      return typeof v === 'boolean' ? v : false;
    };
    (async () => {
      for (const it of items) {
        const id = typeof it.id === 'number' ? it.id : null;
        const rec = it as unknown as Record<string, unknown>;
        const hasFlags = rec['is_hot_deal'] != null || rec['is_sold_out'] != null;
        const needHotPrice = isHot(rec) && !hasHotPrice(rec);
        if (!id || (hasFlags && !needHotPrice) || enrichedRef.current.has(id)) continue;
        try {
          const url = `${API_BASE}/api/camps/${id}/`;
          const r = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ac.signal });
          if (!r.ok) continue;
          const d = await r.json() as Record<string, unknown>;
          enrichedRef.current.add(id);
          setItems(prev => prev.map(x => x.id === id ? ({ ...x, ...d }) as unknown as CampFromClubApi : x));
        } catch { /* noop */ }
      }
    })();
    return () => ac.abort();
  }, [API_BASE, items]);

  // Удаляем кэмп из списка вкладки сразу после успешного удаления
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const ce = event as CustomEvent<{ id?: number }>;
      const deletedId = ce.detail?.id;
      if (!deletedId) return;
      setItems(prev =>
        prev.filter((camp) => {
          const v = (camp as unknown as Record<string, unknown>)['id'];
          return !(typeof v === 'number' && Number.isFinite(v) && v === deletedId);
        })
      );
    };
    window.addEventListener('navumi:camp-deleted', handler as EventListener);
    return () => window.removeEventListener('navumi:camp-deleted', handler as EventListener);
  }, []);

  // Перезагружаем список кэмпов, когда пользователь создал новый кэмп
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setReloadToken((t) => t + 1);
    };
    window.addEventListener('navumi:camp-created', handler as EventListener);
    return () => window.removeEventListener('navumi:camp-created', handler as EventListener);
  }, []);

  // Debug: покажем, что прилетает до/после обогащения и как нормализуется
  React.useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const sample = items.slice(0, 5).map((it) => {
        const o = it as unknown as Record<string, unknown>;
        const norm = normalizeCampToCardData(o, { fallbackOwner: username });
        return {
          id: it.id,
          raw: {
            sold_out: o['is_sold_out'],
            hot_deal: o['is_hot_deal'],
            hot_price: o['hot_deal_price'],
            price: o['price'],
          },
          norm: {
            sold_out: norm.is_sold_out,
            hot_deal: norm.is_hot_deal,
            hot_price: norm.hot_deal_price,
            price: norm.price,
          },
        };
      });
      console.debug('[CampTab] sample flags', sample);
    } catch { /* noop */ }
  }, [items, username]);

  // Сортировка: поздние выше. Правило = по end_date DESC, затем по start_date DESC.
  // Совпадает с серверной сортировкой, чтобы не было «дёрганий» порядка.
  const sortedItems = React.useMemo(() => {
    const parse = (d?: string | null): number => {
      if (!d || typeof d !== 'string') return -1;
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return -1;
      return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
    };
    const k = (it: CampFromClubApi): number => {
      const norm = normalizeCampToCardData(it as unknown as Record<string, unknown>, { fallbackOwner: username });
      const e = parse(norm.end_date || null);
      const s = parse(norm.start_date || null);
      return (e >= 0 ? e : -1) * 100000 + (s >= 0 ? s : -1);
    };
    return [...items].sort((a, b) => k(b) - k(a));
  }, [items, username]);

  if (loading) return <div className="px-2 py-4 text-sm text-gray-500 text-center">Загружаем кэмпы…</div>;
  if (error) return <div className="px-2 py-4 text-sm text-red-600 text-center">{error}</div>;

  const pickNumber = (o: Record<string, unknown>, keys: string[], def: number | null = null) => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    }
    return def;
  };
  // removed unused helpers: pickBool, pickStringArray, absUrl, deriveCampNumber

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.length === 0 ? (
        isOwner ? (
          <div className="col-span-full px-4 py-8 text-center">
            <Button
              variant="neutral"
              className="min-w-[18ch] justify-center"
              onClick={() => {
                if (isMobile) {
                  openCreateCampOverlay();
                } else {
                  setDesktopCampModalOpen(true);
                }
              }}
            >
              Добавить кэмп
            </Button>
            {!isMobile && (
              <CreateCampModal
                open={desktopCampModalOpen}
                onClose={() => setDesktopCampModalOpen(false)}
              />
            )}
          </div>
        ) : (
          <div className="col-span-full px-2 py-6 text-center text-sm text-gray-500">Клуб пока не опубликовал анонсы кэмпов</div>
        )
      ) : (
        sortedItems.map((raw, idx) => {
          const o = raw as unknown as Record<string, unknown>;
          const data = normalizeCampToCardData(o, { fallbackOwner: username });
          const idMaybe = pickNumber(o, ['id'], null);
          const key = String(idMaybe ?? (typeof data.campNumber === 'number' ? data.campNumber : Number(data.campNumber ?? 0)) ?? idx);
          return (
            <CampCard
              key={key}
              className="w-full"
              showActivity={false}
              camp={data}
            />
          );
        })
      )}
    </div>
  );
}
