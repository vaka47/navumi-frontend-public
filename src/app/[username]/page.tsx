import type { Metadata } from 'next';
import ProfilePageClient from './ProfilePageClient';
import type { Profile } from '@/components/profile/UserProfilePage';

type RouteParams = { username: string };

type ProfileMeta = Profile & {
  is_public?: boolean;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'https://api.navumi.com').replace(/\/+$/, '');
const APP_BASE = (process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://navumi.com').replace(/\/+$/, '');
const normalizeUsername = (value?: string | null): string =>
  (value || '').replace(/^@+/, '').trim();

const toSnippet = (value?: string | null, maxLen = 160): string => {
  const clean = (value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
};

const toAbsoluteUrl = (value?: string | null): string | null => {
  const raw = (value || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw, `${APP_BASE}/`).toString();
  } catch {
    return null;
  }
};

const buildProfileMeta = (profile: ProfileMeta | null, params: RouteParams): Metadata => {
  const canonicalUsername = normalizeUsername(profile?.username) || normalizeUsername(params.username);
  const role = profile?.role === 'club' ? 'Клуб' : 'Профиль';
  const name =
    (profile?.role === 'club' ? profile?.club_name : profile?.full_name) ||
    profile?.username ||
    params.username;
  const title = `${name} — ${role} на Navumi`;
  const description = toSnippet(profile?.description) || `${role} на платформе Navumi`;
  const image = profile?.profile_picture || null;
  const canonical = `/${canonicalUsername}`;

  return {
    title,
    description,
    keywords: [profile?.role === 'club' ? 'спортивный клуб' : 'спортсмен', 'кэмпы', 'тренировки'].filter(Boolean),
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'profile',
      url: canonical,
      images: image ? [{ url: new URL(image, `${APP_BASE}/`).toString() }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [new URL(image, `${APP_BASE}/`).toString()] : undefined,
    },
  };
};

const fetchProfile = async (username: string): Promise<ProfileMeta | null> => {
  const trimmed = String(username || '').trim().replace(/^@+/, '');
  if (!trimmed) return null;
  try {
    const res = await fetch(`${API_BASE}/api/profile/${encodeURIComponent(trimmed)}/`, {
      next: { revalidate: 300 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as ProfileMeta;
    if (data && data.is_public === false) return null;
    return data;
  } catch {
    return null;
  }
};

const buildProfileStructuredData = (profile: ProfileMeta | null, params: RouteParams) => {
  if (!profile) return null;
  const canonicalUsername = normalizeUsername(profile.username) || normalizeUsername(params.username);
  const isClub = profile.role === 'club';
  const name =
    (isClub ? profile.club_name : profile.full_name) ||
    profile.username ||
    params.username;
  const description = toSnippet(profile.description, 220);
  const image = toAbsoluteUrl(profile.profile_picture);
  const url = new URL(`/${canonicalUsername}`, `${APP_BASE}/`).toString();

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': isClub ? 'Organization' : 'Person',
    name,
    url,
  };

  if (description) data.description = description;
  if (image) data.image = image;
  return data;
};

const buildProfileBreadcrumbs = (profile: ProfileMeta | null, params: RouteParams) => {
  const canonicalUsername = normalizeUsername(profile?.username) || normalizeUsername(params.username);
  const name =
    (profile?.role === 'club' ? profile?.club_name : profile?.full_name) ||
    profile?.username ||
    params.username;
  const base = APP_BASE.replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Navumi',
        item: base,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: `${base}/${canonicalUsername}`,
      },
    ],
  };
};

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  return buildProfileMeta(profile, { username });
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const { username } = await params;
  const initialProfile = await fetchProfile(username);
  const structuredData = buildProfileStructuredData(initialProfile, { username });
  const breadcrumbs = buildProfileBreadcrumbs(initialProfile, { username });

  return (
    <>
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <ProfilePageClient username={username} initialProfile={initialProfile} />
    </>
  );
}
