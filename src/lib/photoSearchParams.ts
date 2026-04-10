const DEFAULT_RADIUS_KM = 200;
const DEFAULT_SORT = 'likes_desc';
const PHOTO_TAB_PARAM = 'photoposts';
const PHOTO_TAB_ALIASES = new Set(['photoposts', 'photo_posts', 'photopost', 'photo-posts', 'photos']);

const resolveAppOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://www.navumi.com';
};

const formatRelativeUrl = (url: URL, query: string): string => {
  const search = query ? `?${query}` : '';
  const hash = url.hash || '';
  const rel = `${url.pathname}${search}${hash}`;
  return rel || '/search';
};

const normalizeNumberInput = (value?: number | string | null): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed.toString();
  }
  return null;
};

type BuildParamsArgs = {
  location: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  radiusKm?: number | string | null;
};

export const buildPhotoSearchParams = ({
  location,
  latitude,
  longitude,
  radiusKm = DEFAULT_RADIUS_KM,
}: BuildParamsArgs): URLSearchParams => {
  const params = new URLSearchParams();
  const trimmedLocation = location?.trim();
  params.set('tab', PHOTO_TAB_PARAM);
  if (trimmedLocation) params.set('location', trimmedLocation);

  const lat = normalizeNumberInput(latitude);
  const lng = normalizeNumberInput(longitude);

  if (lat && lng) {
    params.set('latitude', lat);
    params.set('longitude', lng);
    const radius = normalizeNumberInput(radiusKm);
    if (radius) params.set('radius_km', radius);
  }

  return params;
};

export const DEFAULT_PHOTO_SEARCH_RADIUS_KM = DEFAULT_RADIUS_KM;
export const DEFAULT_PHOTO_SEARCH_SORT = DEFAULT_SORT;
export const PHOTO_SEARCH_TAB_PARAM = PHOTO_TAB_PARAM;

export const normalizePhotosTabValue = (value?: string | null): string => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (PHOTO_TAB_ALIASES.has(normalized)) return 'photos';
  return normalized;
};

type BuildPhotoSearchUrlArgs = BuildParamsArgs & {
  sort?: string | null;
  basePath?: string;
};

export const buildPhotoSearchUrl = ({
  sort = DEFAULT_SORT,
  basePath = '/search',
  ...rest
}: BuildPhotoSearchUrlArgs): string => {
  const params = buildPhotoSearchParams(rest);
  const normalizedSort = (sort || '').trim();
  if (normalizedSort) params.set('sort', normalizedSort);
  else params.delete('sort');
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
};

export const normalizePhotoSearchUrlFromServer = (raw?: string | null): string | null => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const origin = resolveAppOrigin();
    const parsed = new URL(trimmed, origin);
    const params = new URLSearchParams(parsed.search);
    const tabRaw = params.get('tab');
    const normalizedTab = normalizePhotosTabValue(tabRaw);
    if (normalizedTab === 'photos') {
      params.set('tab', PHOTO_TAB_PARAM);
    } else if (!tabRaw) {
      params.set('tab', PHOTO_TAB_PARAM);
    }
    const sort = (params.get('sort') || '').trim();
    if (!sort) params.set('sort', DEFAULT_SORT);
    const query = params.toString();
    const relative = formatRelativeUrl(parsed, query);
    if (typeof window === 'undefined') return relative;
    if (parsed.origin === window.location.origin) return relative;
    const base = parsed.origin || origin;
    return `${base}${relative}`;
  } catch {
    return trimmed;
  }
};
