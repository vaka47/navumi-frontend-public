import type { MetadataRoute } from 'next';
import { activityToSlug, fetchActivities } from '@/lib/seo/searchLanding';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'https://api.navumi.com').replace(/\/+$/, '');
const APP_BASE = (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://navumi.com').replace(/\/+$/, '');

type CampListItem = {
  camp_number?: number | string | null;
  organizer?: { username?: string | null } | string | null;
  created_at?: string | null;
};

type CampListResponse = CampListItem[] | { results?: CampListItem[]; next?: string | null };

type SitemapPostItem = {
  id?: number | string | null;
  author?: { username?: string | null } | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_public?: boolean | null;
};

type SitemapProfileItem = {
  username?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_public?: boolean | null;
};

const normalizeUsername = (organizer: CampListItem['organizer']): string | null => {
  if (!organizer) return null;
  if (typeof organizer === 'string') return organizer.trim() || null;
  const name = organizer.username || '';
  return name.trim() || null;
};

const buildAbsoluteUrl = (path: string): string => new URL(path, `${APP_BASE}/`).toString();

const normalizeNextUrl = (next: string | null): string | null => {
  if (!next) return null;
  try {
    return new URL(next, `${API_BASE}/`).toString();
  } catch {
    return null;
  }
};

const fetchPaginated = async <T,>(initialUrl: string): Promise<T[]> => {
  const items: T[] = [];
  let url: string | null = initialUrl;

  for (let i = 0; i < 40 && url; i += 1) {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) break;
    const data = await res.json() as T[] | { results?: T[]; next?: string | null };
    if (Array.isArray(data)) {
      items.push(...data);
      break;
    }
    if (data && typeof data === 'object') {
      const batch = Array.isArray(data.results) ? data.results : [];
      items.push(...batch);
      url = normalizeNextUrl(typeof data.next === 'string' ? data.next : null);
      if (!url) break;
    } else {
      break;
    }
  }

  return items;
};

const fetchAllCamps = async (): Promise<CampListItem[]> => {
  const items: CampListItem[] = [];
  let url: string | null = `${API_BASE}/api/camps/`;

  for (let i = 0; i < 20 && url; i += 1) {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) break;
    const data = await res.json() as CampListResponse;
    if (Array.isArray(data)) {
      items.push(...data);
      break;
    }
    if (data && typeof data === 'object') {
      const batch = Array.isArray(data.results) ? data.results : [];
      items.push(...batch);
      url = normalizeNextUrl(typeof data.next === 'string' ? data.next : null);
      if (!url) break;
    } else {
      break;
    }
  }

  return items;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [camps, posts, profiles, activities] = await Promise.all([
    fetchAllCamps(),
    fetchPaginated<SitemapPostItem>(`${API_BASE}/api/sitemap/posts/`),
    fetchPaginated<SitemapProfileItem>(`${API_BASE}/api/sitemap/profiles/`),
    fetchActivities(),
  ]);

  const staticUrls: MetadataRoute.Sitemap = [
    { url: buildAbsoluteUrl('/search'), changeFrequency: 'daily', priority: 0.8 },
    { url: buildAbsoluteUrl('/feed'), changeFrequency: 'daily', priority: 0.6 },
    { url: buildAbsoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.4 },
    { url: buildAbsoluteUrl('/contacts'), changeFrequency: 'monthly', priority: 0.4 },
    { url: buildAbsoluteUrl('/support'), changeFrequency: 'monthly', priority: 0.4 },
  ];

  const campUrls = camps
    .map((camp) => {
      const username = normalizeUsername(camp.organizer);
      const campNumber = camp.camp_number != null ? String(camp.camp_number).trim() : '';
      if (!username || !campNumber) return null;
      const url = buildAbsoluteUrl(`/${username}/camp/${campNumber}`);
      const entry: MetadataRoute.Sitemap[number] = {
        url,
        changeFrequency: 'weekly',
        priority: 0.6,
        lastModified: camp.created_at || undefined,
      };
      return entry;
    })
    .filter(Boolean) as MetadataRoute.Sitemap;

  const postUrls = posts
    .map((post) => {
      if (post.is_public === false) return null;
      const id = post.id != null ? String(post.id).trim() : '';
      const authorRaw =
        (typeof post.author === 'string' ? post.author : post.author?.username) ||
        '';
      const author = authorRaw.replace(/^@+/, '').trim();
      if (!id || !author) return null;
      const url = buildAbsoluteUrl(`/${author}/post/${id}`);
      const entry: MetadataRoute.Sitemap[number] = {
        url,
        changeFrequency: 'weekly',
        priority: 0.6,
        lastModified: post.updated_at || post.created_at || undefined,
      };
      return entry;
    })
    .filter(Boolean) as MetadataRoute.Sitemap;

  const profileUrls = profiles
    .map((profile) => {
      if (profile.is_public === false) return null;
      const username = (profile.username || '').replace(/^@+/, '').trim();
      if (!username) return null;
      const url = buildAbsoluteUrl(`/${username}`);
      const entry: MetadataRoute.Sitemap[number] = {
        url,
        changeFrequency: 'weekly',
        priority: 0.5,
        lastModified: profile.updated_at || profile.created_at || undefined,
      };
      return entry;
    })
    .filter(Boolean) as MetadataRoute.Sitemap;

  const activityUrls = activities
    .map((activity) => {
      const slug = activityToSlug(activity);
      if (!slug) return null;
      const url = buildAbsoluteUrl(`/search/activity/${slug}`);
      const entry: MetadataRoute.Sitemap[number] = {
        url,
        changeFrequency: 'weekly',
        priority: 0.5,
      };
      return entry;
    })
    .filter(Boolean) as MetadataRoute.Sitemap;

  return [...staticUrls, ...activityUrls, ...campUrls, ...postUrls, ...profileUrls];
}
