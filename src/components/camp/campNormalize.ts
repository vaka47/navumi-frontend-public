'use client';

import type { CampCardData } from '@/components/camp/CampCard';

type UnknownRecord = Record<string, unknown>;

export const pickString = (o: UnknownRecord, keys: string[], def: string | null = null) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return def;
};

export const pickNumber = (o: UnknownRecord, keys: string[], def: number | null = null) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return def;
};

export const pickBool = (o: UnknownRecord, keys: string[], def = false) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(s)) return true;
      if (['false', '0', 'no', 'off', 'null', 'none', ''].includes(s)) return false;
    }
  }
  return def;
};

export const pickStringArray = (o: UnknownRecord, keys: string[]): string[] => {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      return (v as unknown[])
        .map((it) => typeof it === 'string' ? it : (it && typeof it === 'object' && typeof (it as UnknownRecord)['name'] === 'string')
          ? String((it as UnknownRecord)['name'])
          : null)
        .filter((x): x is string => !!x && x.trim().length > 0)
        .map((s) => s.trim());
    }
    if (typeof v === 'string' && v.trim()) return [v.trim()];
  }
  return [];
};

export const pickImageArray = (o: UnknownRecord, keys: string[]): string[] => {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      const mapped = (v as unknown[])
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            const rec = item as UnknownRecord;
            const candidate = rec['url'] || rec['image'] || rec['image_url'] || rec['src'] || rec['thumbnail'];
            return typeof candidate === 'string' ? candidate : null;
          }
          return null;
        })
        .map((s) => absUrl(s) || '')
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
      if (mapped.length) return mapped;
    }
  }
  return [];
};

export function absUrl(url?: string | null): string | null {
  if (!url) return null;
  const s0 = String(url).trim();
  if (!s0 || s0.toLowerCase() === 'null' || s0.toLowerCase() === 'undefined') return null;

  // gs://bucket/object → https://storage.googleapis.com/bucket/object (or custom media base)
  if (/^gs:\/\//i.test(s0)) {
    const m = s0.match(/^gs:\/\/([^/]+)\/(.+)$/i);
    if (!m) return null;
    const bucket = m[1]; const object = m[2];
    const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');
    return mediaBase ? `${mediaBase}/${object}` : `https://storage.googleapis.com/${bucket}/${object}`;
  }

  // storage.cloud.google.com → storage.googleapis.com
  if (/^https?:\/\/storage\.cloud\.google\.com\//i.test(s0)) {
    return s0.replace(/^https?:\/\/storage\.cloud\.google\.com\//i, 'https://storage.googleapis.com/');
  }

  // absolute http(s) URL
  if (/^(https?:)?\/\//i.test(s0)) {
    try {
      const u = new URL(s0, 'https://dummy.local');

      // If it's a GCS URL and contains signed query (X-Goog-*), drop the query for public buckets.
      const host = u.hostname.toLowerCase();
      const isGcsHost = host === 'storage.googleapis.com' || host.endsWith('.storage.googleapis.com');
      if (isGcsHost) {
        const hasSignedParams = Array.from(u.searchParams.keys()).some(k => {
          const kk = k.toLowerCase();
          return kk.startsWith('x-goog-') || kk === 'googleaccessid' || kk === 'expires' || kk === 'signature';
        });
        if (hasSignedParams) {
          u.search = '';
        }
        // Normalize bucket host form to storage.googleapis.com/bucket/...
        if (host.endsWith('.storage.googleapis.com')) {
          const bucket = host.replace(/\.storage\.googleapis\.com$/i, '');
          return `https://storage.googleapis.com/${bucket}${u.pathname}${u.search}${u.hash}`;
        }
        return u.toString();
      }

      // Do not rewrite if the URL already points to our API host
      try {
        const apiBaseRaw = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
        if (apiBaseRaw) {
          const apiUrl = new URL(apiBaseRaw, 'https://dummy.local');
          const apiHost = apiUrl.hostname.toLowerCase();
          if (u.hostname.toLowerCase() === apiHost) {
            // keep API-hosted media as-is to avoid broken links in environments
            return s0;
          }
        }
      } catch { /* noop */ }

      // Rewrite media-like paths on other hosts to MEDIA_BASE if present
      const p = u.pathname || '/';
      if (/^\/(media|uploads|profile_pictures|avatars?)\//i.test(p)) {
        const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '')
          || 'https://storage.googleapis.com/navumi-media';
        return mediaBase + p;
      }
    } catch { /* keep original */ }
    return s0;
  }

  // data/blob URLs as is
  if (s0.startsWith('data:') || s0.startsWith('blob:')) return s0;

  // relative paths
  const path = s0.startsWith('/') ? s0 : '/' + s0;

  // Keep local static placeholders in /public/avatars — do NOT rewrite
  // These are bundled assets (e.g. /avatars/question.jpg, /avatars/question3.jpg)
  // support optional base path prefix (e.g., /app/avatars/question3.jpg)
  if (/^(?:\/[A-Za-z0-9._-]+)?\/avatars\/question(\d+)?\.jpg$/i.test(path)) {
    return path;
  }
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '').replace(/\/+$/, '');
  const isMedia = /^\/(media|uploads|profile_pictures|avatars?)\//i.test(path);
  if (isMedia) {
    const fallbackMedia = 'https://storage.googleapis.com/navumi-media';
    const base = mediaBase || fallbackMedia;
    return base.replace(/\/+$/, '') + path;
  }
  return apiBase ? apiBase + path : path;
}

export const deriveCampNumber = (o: UnknownRecord): number | string | null => {
  const url = pickString(o, ['camp_url', 'url']);
  if (url) {
    try {
      const u = new URL(url, 'https://dummy.local');
      const m = u.pathname.match(/\/camp\/(\w+)\/?$/);
      if (m) {
        const n = m[1];
        if (!Number.isNaN(Number(n))) return Number(n);
        return n;
      }
    } catch { /* noop */ }
  }

  const explicitNumber = pickNumber(o, ['camp_number']);
  if (explicitNumber !== null) return explicitNumber;

  const publicNumber = pickNumber(o, ['camp_public_key', 'public_key', 'key', 'pk']);
  if (publicNumber !== null) return publicNumber;

  const slugFallback = pickString(o, ['camp_slug', 'slug', 'camp_public_key', 'public_key', 'key', 'pk']);
  if (slugFallback) return slugFallback;

  return null;
};

export const getOwnerUsername = (o: UnknownRecord): string | null => {
  const fromStrKeys = (
    ['camp_owner_username', 'owner_username', 'club_username', 'organizer_username', 'organizerUsername', 'owner', 'organizer'] as const
  ).map(k => o[k]).find(v => typeof v === 'string' && v.trim());
  if (typeof fromStrKeys === 'string') return fromStrKeys.replace(/^@+/, '').trim();
  const nestedKeys = ['organizer', 'owner', 'club', 'user', 'profile'] as const;
  for (const k of nestedKeys) {
    const v = o[k];
    if (v && typeof v === 'object' && typeof (v as UnknownRecord)['username'] === 'string') {
      const u = ((v as UnknownRecord)['username'] as string).trim();
      if (u) return u.replace(/^@+/, '');
    }
  }
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

export function normalizeCampToCardData(o: UnknownRecord, opts?: { fallbackOwner?: string | null }): CampCardData {
  const campId = pickNumber(o, ['id']);
  const title = pickString(o, ['title', 'name'], '') || '';
  const title_image = pickString(
    o,
    [
      'title_image', 'imageUrl', 'image_url', 'image', 'cover', 'cover_url', 'titleImage', 'titleImageUrl', 'photo', 'photo_url', 'picture'
    ]
  );
  const location_name = pickString(o, ['location_name', 'locationName', 'location', 'place', 'city'], '') || '';
  const start_date = pickString(o, ['start_date', 'startDate', 'start', 'begin', 'date_from', 'from', 'start_at'], '') || '';
  const end_date = pickString(o, ['end_date', 'endDate', 'end', 'finish', 'date_to', 'to', 'end_at'], '') || '';
  // base price shown by card; if only original_price is present, we'll treat it as base too
  const priceBase = pickNumber(o, ['price', 'amount', 'price_value', 'base_price', 'original_price', 'old_price'], null);
  const hot_deal_price = pickNumber(
    o,
    [
      'hot_deal_price', 'discount_price', 'promo_price',
      'hot_price', 'sale_price', 'new_price',
      'hotPrice', 'salePrice', 'newPrice', 'price_hot'
    ],
    null
  );
  // some endpoints return current price in price, and original in original_price
  const original_price = pickNumber(o, ['original_price', 'old_price', 'price_original', 'priceOld', 'price_old'], null);
  const currency = pickString(o, ['currency', 'currency_code'], 'RUB') || 'RUB';
  const is_hot_deal = pickBool(
    o,
    ['is_hot_deal', 'hot_deal', 'isPromo', 'promo', 'isHotDeal', 'hot', 'sale', 'has_discount'],
    false
  );
  const is_sold_out = pickBool(
    o,
    ['is_sold_out', 'sold_out', 'soldOut', 'isSoldOut', 'sold', 'is_sold', 'sold_out_flag', 'soldOutFlag'],
    false
  );
  // additional sold-out derivation from availability/status
  const available = pickNumber(o, [
    'available', 'available_places', 'available_seats', 'available_slots', 'free_places', 'free_seats',
    'places_left', 'seats_left', 'slots_left', 'spots_left', 'remaining', 'left'
  ], null);
  const capacity = pickNumber(o, ['capacity', 'total_places', 'total_seats', 'max_seats', 'max_slots'], null);
  const booked = pickNumber(o, ['booked', 'occupied', 'sold_count', 'taken', 'reserved'], null);
  const statusRaw = pickString(o, ['status', 'availability', 'state', 'sold_out_status'], null);
  const statusSold = typeof statusRaw === 'string'
    ? /sold\s*out|нет\s*мест|full|заполн/i.test(statusRaw)
    : false;
  const derivedSoldOut = !!is_sold_out
    || (available !== null && Number.isFinite(available) && available <= 0)
    || (capacity !== null && booked !== null && Number.isFinite(capacity) && Number.isFinite(booked) && booked >= capacity)
    || statusSold;
  // additional hot derivation: if only original_price > price, or explicit hot price is present
  const derivedHot = !!is_hot_deal
    || (hot_deal_price !== null && Number.isFinite(hot_deal_price))
    || (original_price !== null && priceBase !== null && Number.isFinite(original_price) && Number.isFinite(priceBase) && original_price > priceBase);
  const campNumber = deriveCampNumber(o);
  const camp_url = pickString(o, ['camp_url', 'url'], undefined as unknown as string) || undefined;
  const activities = pickStringArray(o, ['activities', 'activity_names', 'activity', 'tags']);
  const gallery_images = pickImageArray(o, ['gallery_images', 'gallery', 'images', 'photos', 'media', 'galleryImages', 'gallery_photos']);
  const organizerUsername = getOwnerUsername(o) || (opts?.fallbackOwner || undefined) || undefined;

  return {
    campId: campId ?? undefined,
    organizerUsername,
    campNumber: campNumber ?? undefined,
    camp_url,
    title,
    title_image: absUrl(title_image),
    location_name,
    start_date,
    end_date,
    price: (priceBase ?? undefined),
    currency,
    is_sold_out: !!derivedSoldOut,
    // оставляем флаг как есть — даже если нет отдельного hot_deal_price,
    // чтобы можно было подсветить цену и показать плашку
    is_hot_deal: !!derivedHot,
    hot_deal_price: hot_deal_price ?? undefined,
    activities,
    gallery_images: gallery_images.length ? gallery_images : undefined,
  };
}
