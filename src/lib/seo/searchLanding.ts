import type { Metadata } from "next";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "https://api.navumi.com").replace(/\/+$/, "");
const APP_BASE = (process.env.NEXT_PUBLIC_APP_BASE_URL || "https://navumi.com").replace(/\/+$/, "");

export type ActivitySeoItem = {
  id?: number | string | null;
  name?: string | null;
  slug?: string | null;
};

const normalizeSlug = (value: string) => value.toLowerCase().trim();
const normalizeLookupKey = (value: string) =>
  slugify(value).replace(/-/g, "").replace(/ё/g, "е");

const slugify = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  return trimmed
    .replace(/&/g, " and ")
    .replace(/[\u0400-\u04FF]+/g, (m) => m) // keep Cyrillic intact
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const humanizeSlug = (value: string) => {
  const decoded = decodeURIComponent(value.replace(/\+/g, " ")).trim();
  if (!decoded) return "";
  const withSpaces = decoded.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
};

const normalizeActivity = (item: ActivitySeoItem) => {
  const name = (item.name || "").trim();
  const slugSource = (item.slug || name || "").trim();
  const slug = slugify(slugSource);
  return {
    id: item.id != null ? String(item.id).trim() : "",
    name,
    slug,
    keyFromSlug: normalizeLookupKey(slug),
    keyFromName: normalizeLookupKey(name),
  };
};

export const activityToSlug = (item: ActivitySeoItem) => normalizeActivity(item).slug;

type ActivitySynonymGroup = {
  tokens: string[];
};

const ACTIVITY_SYNONYM_GROUPS: ActivitySynonymGroup[] = [
  { tokens: ["музыка", "музыке", "музыку", "музыкой", "музыкальный", "музыкальная", "музыкальные", "музыкальному", "музыкальным", "муз", "music", "musical"] },
  { tokens: ["танцы", "танцевальный", "танцевальная", "танцевальные", "танцевальному", "танцевальным", "танцам", "танец", "танцу", "танцем", "танцев", "dance", "dancing"] },
  { tokens: ["шахматы", "шахматам", "шахматами", "шахматный", "шахматная", "шахматные", "chess", "cheess"] },
  { tokens: ["хоккей", "хоккею", "хоккеем", "хоккее", "hockey", "icehockey", "ice-hockey"] },
  { tokens: ["футбол", "футболу", "футбола", "футболом", "футболе", "футбольный", "футбольная", "футбольные", "football", "soccer"] },
  { tokens: ["фехтование", "фехтованию", "фехтованием", "fencing"] },
  { tokens: ["настольный теннис", "настольному теннису", "настольным теннисом", "пинг-понг", "пингпонг", "pingpong", "ping-pong", "tabletennis", "table-tennis"] },
  { tokens: ["киберспорт", "киберспорта", "киберспорту", "киберспортом", "киберспорте", "esports", "e-sports", "cybersport"] },
  { tokens: ["гольф", "гольфа", "гольфу", "гольфом", "гольфе", "golf"] },
  { tokens: ["волейбол", "волейболу", "волейбола", "волейболом", "волейболе", "волейбольный", "волейбольная", "волейбольные", "volleyball", "beachvolleyball", "beach-volleyball"] },
  { tokens: ["баскетбол", "баскетболу", "баскетбола", "баскетболом", "баскетболе", "баскетбольный", "баскетбольная", "баскетбольные", "basketball"] },
  { tokens: ["бадминтон", "бадминтону", "бадминтона", "бадминтоном", "бадминтоне", "badminton"] },
  { tokens: ["академическая гребля", "академической гребле", "академическую греблю", "гребля", "гребле", "греблей", "rowing", "crew"] },
  { tokens: ["теннис", "теннису", "тенниса", "теннисом", "теннисе", "tennis"] },
  { tokens: ["триатлон", "триатлону", "триатлона", "триатлоном", "триатлоне", "triathlon"] },
  { tokens: ["трейлраннинг", "трейл раннинг", "трейлраннингу", "трейлраннингом", "trailrunning", "trail running", "trail-run", "trailrun"] },
  { tokens: ["скалолазание", "скалолазанье", "скалолазанию", "скалолазанием", "climbing", "rockclimbing", "rock-climbing"] },
  { tokens: ["хайкинг", "хайкингу", "хайкингом", "hiking", "trekking", "trek"] },
  { tokens: ["сноуборд", "сноуборду", "сноуборда", "сноубордом", "сноуборде", "snowboard", "snowboarding"] },
  { tokens: ["виндсёрфинг", "виндсерфинг", "виндсёрфингу", "виндсёрфингом", "windsurfing", "windsurf"] },
  { tokens: ["кайтсёрфинг", "кайтсерфинг", "кайтсёрфингу", "кайтсёрфингом", "kitesurfing", "kitesurf", "kiteboarding", "kite"] },
  { tokens: ["дайвинг", "дайвингу", "дайвингом", "diving", "scubadiving", "scuba", "scuba-diving"] },
  { tokens: ["рафтинг", "рафтингу", "рафтингом", "rafting", "whitewater", "white-water"] },
  { tokens: ["биатлон", "биатлону", "биатлона", "биатлоном", "биатлоне", "biathlon"] },
  { tokens: ["лыжный спорт", "лыжному спорту", "лыжным спортом", "лыжи", "лыжам", "лыжах", "лыжный", "лыжные гонки", "лыжным гонкам", "беговые лыжи", "ski", "skiing", "cross-country ski", "cross-country skiing", "x-ski", "x-skiing", "ski spot"] },
  { tokens: ["фитнес", "фитнесу", "фитнесом", "fitness"] },
  { tokens: ["парусный спорт", "парусному спорту", "парусным спортом", "парусный", "парусная", "парусные", "sailing", "sail"] },
  { tokens: ["горные лыжи", "горным лыжам", "горными лыжами", "горнолыжный", "горнолыжные", "alpine ski", "alpine skiing", "downhill ski", "downhill skiing"] },
  { tokens: ["альпинизм", "альпинизму", "альпинизмом", "mountaineering", "alpinism"] },
  { tokens: ["плавание", "плаванию", "плаванием", "swimming", "swim"] },
  { tokens: ["йога", "йоге", "йогу", "йогой", "yoga"] },
  { tokens: ["сёрфинг", "серфинг", "серф", "сёрфингу", "серфингу", "сёрфингом", "surfing", "surf"] },
  { tokens: ["велоспорт", "велоспорту", "велоспортом", "велосипед", "велосипеду", "велосипедом", "велосипедный", "cycling", "biking", "bike"] },
  { tokens: ["рыбалка", "рыбалке", "рыбалку", "рыбалкой", "fishing", "angling"] },
  { tokens: ["бег", "бегу", "бега", "бегом", "беге", "running", "run", "jogging", "jog"] },
];

const pickArray = (payload: unknown): ActivitySeoItem[] => {
  if (Array.isArray(payload)) return payload as ActivitySeoItem[];
  if (payload && typeof payload === "object") {
    const source = payload as Record<string, unknown>;
    for (const key of ["results", "items", "data"]) {
      const candidate = source[key];
      if (Array.isArray(candidate)) return candidate as ActivitySeoItem[];
    }
  }
  return [];
};

export const fetchActivities = async (): Promise<ActivitySeoItem[]> => {
  const res = await fetch(`${API_BASE}/api/activities/`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  return pickArray(data);
};

export const resolveActivityBySlug = async (slug: string) => {
  const normalized = normalizeSlug(slug);
  const lookupKey = normalizeLookupKey(slug);
  const list = (await fetchActivities()).map(normalizeActivity);
  const direct = list.find((item) => item.slug && normalizeSlug(item.slug) === normalized);
  if (direct) return direct;
  const loose = list.find((item) => item.keyFromSlug === lookupKey || item.keyFromName === lookupKey);
  if (loose) return loose;
  for (const group of ACTIVITY_SYNONYM_GROUPS) {
    const groupKeys = group.tokens.map(normalizeLookupKey);
    if (!groupKeys.includes(lookupKey)) continue;
    const candidate = list.find((item) => groupKeys.includes(item.keyFromSlug) || groupKeys.includes(item.keyFromName));
    if (candidate) return candidate;
  }
  return null;
};

export const buildSearchQueryString = (opts: { activityId?: string; location?: string }) => {
  const params = new URLSearchParams();
  if (opts.activityId) params.append("activities", opts.activityId);
  if (opts.location) params.append("location", opts.location);
  return params.toString();
};

const buildTitleParts = (activity?: string, location?: string) => {
  if (activity && location) return `${activity} в ${location} — кэмпы и туры`;
  if (activity) return `${activity} кэмпы, туры и клубы`;
  if (location) return `Кэмпы и туры в ${location}`;
  return "Поиск кэмпов и клубов";
};

const buildDescriptionText = (activity?: string, location?: string) => {
  if (activity && location) {
    return `Подбор кэмпов, клубов и туров по активности "${activity}" в ${location}. Фильтры, даты и отзывы на Navumi.`;
  }
  if (activity) {
    return `Найдите кэмпы, клубы и туры по активности "${activity}" на Navumi.`;
  }
  if (location) {
    return `Найдите кэмпы, клубы и туры в ${location} на Navumi.`;
  }
  return "Поиск спортивных кэмпов, клубов и туров по активности и локации.";
};

export const buildSearchLandingContent = (opts: { activity?: string; location?: string }) => {
  const title = buildTitleParts(opts.activity, opts.location);
  const description = buildDescriptionText(opts.activity, opts.location);
  return { title, description };
};

export const buildSearchLandingMetadata = (opts: {
  pathname: string;
  activity?: string;
  location?: string;
}): Metadata => {
  const { title, description } = buildSearchLandingContent({
    activity: opts.activity,
    location: opts.location,
  });
  const canonical = new URL(opts.pathname, `${APP_BASE}/`).toString();
  return {
    title: `${title} | Navumi`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | Navumi`,
      description,
      url: canonical,
      siteName: "Navumi",
    },
  };
};

export const formatLocationFromSlug = (slug: string) => humanizeSlug(slug);

export const buildSearchWebSiteStructuredData = () => {
  const base = APP_BASE.replace(/\/+$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Navumi",
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: `${base}/search?query={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
};

export const buildSearchBreadcrumbs = (opts: {
  activityLabel?: string;
  locationLabel?: string;
  activitySlug?: string;
  locationSlug?: string;
}) => {
  const base = APP_BASE.replace(/\/+$/, "");
  const items: Array<Record<string, unknown>> = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Navumi",
      item: base,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Поиск",
      item: `${base}/search`,
    },
  ];

  let pos = 3;
  if (opts.activitySlug) {
    items.push({
      "@type": "ListItem",
      position: pos,
      name: opts.activityLabel || opts.activitySlug,
      item: `${base}/search/activity/${opts.activitySlug}`,
    });
    pos += 1;
  }
  if (opts.locationSlug) {
    const locationPath = opts.activitySlug
      ? `/search/activity/${opts.activitySlug}/location/${opts.locationSlug}`
      : `/search/location/${opts.locationSlug}`;
    items.push({
      "@type": "ListItem",
      position: pos,
      name: opts.locationLabel || opts.locationSlug,
      item: `${base}${locationPath}`,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
};
