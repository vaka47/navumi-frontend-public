'use client';

import React from 'react';
import { campPathFrom } from '@/components/post/helpers/campPath';
import CampCard from '@/components/camp/CampCard';
import { normalizeCampToCardData } from '@/components/camp/campNormalize';
import { getBrowserApiBase } from '@/lib/apiBase';

type SavedCamp = {
  id: number;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  title_image?: string | null;
  camp_number?: number | string | null;
  organizer_username?: string | null;
  organizerUsername?: string | null; // на случай другого поля
  camp_url?: string | null;
  // карточка требует того же, что и на вкладке кэмпов
  location_name?: string | null;
  price?: number | null;
  currency?: string | null;
  is_hot_deal?: boolean | null;
  hot_deal_price?: number | null;
  is_sold_out?: boolean | null;
  activities?: string[] | null;
};

export default function SavedTab({ username }: { username: string }) {
  const API = getBrowserApiBase();
  const [items, setItems] = React.useState<SavedCamp[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const enrichedRef = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API}/api/profile/${username}/saved/camps/`;
        const tryFetch = async (cred: RequestCredentials) => fetch(url, { credentials: cred, cache: 'no-store' });
        let r: Response | null = null;
        try { r = await tryFetch('include'); if (!r.ok && (r.status === 401 || r.status === 403)) throw new Error('auth'); } catch { try { r = await tryFetch('omit'); } catch { /* noop */ } }
        if (!r || !r.ok) throw new Error('Не удалось загрузить сохранённые кэмпы');
        type UnknownRecord = Record<string, unknown>;
        const pickString = (o: UnknownRecord, keys: string[]): string | null => {
          for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
          return null;
        };
        const pickNumber = (o: UnknownRecord, keys: string[]): number | null => {
          for (const k of keys) {
            const v = o[k];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
          }
          return null;
        };
        const pickBool = (o: UnknownRecord, keys: string[]): boolean | null => {
          for (const k of keys) {
            const v = o[k];
            if (typeof v === 'boolean') return v;
            if (typeof v === 'string') { if (v === 'true') return true; if (v === 'false') return false; }
            if (typeof v === 'number') return v !== 0;
          }
          return null;
        };
        const pickStringArray = (o: UnknownRecord, keys: string[]): string[] | null => {
          for (const k of keys) {
            const v = o[k];
            if (Array.isArray(v)) {
              const arr = (v as unknown[])
                .map((it) => typeof it === 'string' ? it : (it && typeof it === 'object' && typeof (it as Record<string, unknown>)['name'] === 'string')
                  ? String((it as Record<string, unknown>)['name'])
                  : null)
                .filter((x): x is string => !!x && x.trim().length > 0)
                .map((s) => s.trim());
              return arr;
            }
          }
          return null;
        };
        const j: UnknownRecord = await r.json().catch(() => ({} as UnknownRecord));
        const root = j as { camps?: unknown };
        const arrRaw: UnknownRecord[] = Array.isArray(root.camps) ? (root.camps as UnknownRecord[]) : [];
        console.debug('[SavedTab] fetched saved list count:', arrRaw.length);
        const norm: SavedCamp[] = arrRaw.map((o) => ({
          id: Number(o['id']),
          title: String(o['title'] ?? ''),
          start_date: (o['start_date'] as string | null | undefined) ?? null,
          end_date: (o['end_date'] as string | null | undefined) ?? null,
          title_image: (o['title_image'] as string | null | undefined) ?? null,
          camp_number: (o['camp_number'] as number | string | null | undefined) ?? null,
          organizer_username: (o['organizer_username'] as string | null | undefined) ?? (o['organizerUsername'] as string | null | undefined) ?? null,
          organizerUsername: (o['organizerUsername'] as string | null | undefined) ?? null,
          camp_url: (o['camp_url'] as string | null | undefined) ?? null,
          // доп. поля как в CampTab
          location_name: pickString(o, ['location_name', 'locationName', 'location', 'place', 'city']),
          price: pickNumber(o, ['hot_deal_price', 'price', 'amount', 'price_value']),
          currency: pickString(o, ['currency', 'currency_code']),
          is_hot_deal: pickBool(o, ['is_hot_deal', 'hot_deal', 'isPromo', 'promo']),
          hot_deal_price: pickNumber(o, ['hot_deal_price', 'discount_price', 'promo_price']),
          is_sold_out: pickBool(o, ['is_sold_out', 'sold_out', 'soldOut', 'isSoldOut', 'sold']),
          activities: pickStringArray(o, ['activities', 'activity_names', 'activity', 'tags']) ?? undefined,
        }));
        if (!cancelled) {
          console.debug('[SavedTab] normalized saved sample:', norm.slice(0, 3));
          setItems(norm);
        }
      } catch {
        if (!cancelled) setError('Не удалось загрузить сохранённые кэмпы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [API, username]);

  // ——— Enrich missing fields (price/location/currency) via camp details
  React.useEffect(() => {
    if (!items.length) return;
    const need = items.filter((it) => !enrichedRef.current.has(it.id) && (!it.location_name || it.price == null || !it.currency));
    if (!need.length) return;
    console.debug('[SavedTab] enrichment needed for ids:', need.map((x) => x.id));
    const ac = new AbortController();
    (async () => {
      for (const it of need) {
        try {
          const url = `${API}/api/camps/${it.id}/`;
          console.debug('[SavedTab] enrich fetch', { id: it.id, url });
          const r = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ac.signal });
          if (!r.ok) { console.warn('[SavedTab] enrich failed', it.id, r.status); continue; }
          const raw: Record<string, unknown> = await r.json();
          const data = normalizeCampToCardData(raw);
          console.debug('[SavedTab] enrich got', it.id, {
            loc: data.location_name,
            price: data.price,
            hot: data.hot_deal_price,
            curr: data.currency,
          });
          enrichedRef.current.add(it.id);
          setItems((prev) => prev.map((c) => c.id === it.id
            ? ({
                ...c,
                location_name: data.location_name ?? c.location_name ?? null,
                price: (data.price as number | undefined) ?? c.price ?? null,
                currency: (data.currency as string | null | undefined) ?? c.currency ?? null,
                is_hot_deal: (data.is_hot_deal as boolean | null | undefined) ?? c.is_hot_deal ?? null,
                hot_deal_price: (data.hot_deal_price as number | null | undefined) ?? c.hot_deal_price ?? null,
              })
            : c));
        } catch (e) {
          console.warn('[SavedTab] enrich error', it.id, String(e));
        }
      }
    })();
    return () => ac.abort();
  }, [API, items]);

  // No local absUrl — CampCard normalizer handles media URLs

  if (loading) return <div className="px-2 py-4 text-sm text-gray-500 text-center">Загружаем сохранённые кэмпы…</div>;
  if (error) return <div className="px-2 py-4 text-sm text-red-600 text-center">{error}</div>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.length === 0 ? (
        <div className="col-span-full px-2 py-6 text-center text-sm text-gray-500">вы пока не подписались на кэмпы</div>
      ) : (
        items.map((c, idx) => {
          const data = normalizeCampToCardData(c as unknown as Record<string, unknown>);
          if (idx < 5) console.debug('[SavedTab] render card', { raw: c, norm: data });
          const numForPath =
            typeof data.campNumber === 'number'
              ? (data.campNumber > 0 ? data.campNumber : undefined)
              : (typeof data.campNumber === 'string' && data.campNumber ? data.campNumber : undefined);
          const href = campPathFrom(
            data.organizerUsername || undefined,
            { camp_number: numForPath, url: data.camp_url || undefined }
          );
          const handleCardClick = () => {
            try {
              if (typeof window !== 'undefined') {
                window.sessionStorage?.setItem(`profile:${username}:tab`, 'saved');
              }
            } catch { /* noop */ }
          };
          return (
            <CampCard
              key={String((c.id ?? data.campNumber) ?? `${data.title}:${data.campNumber}`)}
              showActivity={false}
              href={href || undefined}
              onClick={handleCardClick}
              camp={data}
            />
          );
        })
      )}
    </div>
  );
}

// local fmtRange removed — CampCard formats date range itself
