import type { Metadata } from 'next';
import MobilePostPageClient, { type PostFull } from './MobilePostPageClient';

type RouteParams = { username: string; postId: string };

type PostMeta = PostFull & {
  image?: string | null;
  type?: string | null;
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

const extractNames = (
  items?: Array<{ name?: string | null } | string | number | null> | null,
): string[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
      if (typeof item === 'object' && typeof item.name === 'string') return item.name.trim();
      return null;
    })
    .filter((name): name is string => Boolean(name));
};

const buildPostMeta = (post: PostMeta | null, params: RouteParams): Metadata => {
  const canonicalUsername = normalizeUsername(post?.author?.username) || normalizeUsername(params.username);
  const author = post?.author?.username || params.username;
  const typeLabel = post?.type === 'article' ? 'Статья' : 'Пост';
  const textSnippet = toSnippet(post?.text, 90);
  const title = textSnippet
    ? `${textSnippet} — ${author}`
    : `${typeLabel} — ${author}`;

  const hashtags = extractNames(post?.hashtags);
  const activities = extractNames(post?.activities);
  const tagLine = [...hashtags.map((tag) => `#${tag}`), ...activities].join(' ');
  const descriptionBase = toSnippet(post?.text) || toSnippet(tagLine) || `${typeLabel} на платформе Navumi`;
  const description = tagLine && descriptionBase.length < 140
    ? `${descriptionBase} ${tagLine}`.trim()
    : descriptionBase;

  const image = post?.image || post?.images?.[0] || null;
  const canonical = `/${canonicalUsername}/post/${params.postId}`;

  return {
    title,
    description,
    keywords: [...hashtags, ...activities].slice(0, 20),
    alternates: { canonical },
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    },
    openGraph: {
      title,
      description,
      type: 'article',
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

const normalizePost = (post: PostMeta | null): PostFull | null => {
  if (!post) return null;
  return {
    ...post,
    author: post.author ?? null,
    images: Array.isArray(post.images) ? post.images : (post.image ? [post.image] : post.images),
  };
};

const fetchPost = async (postId: string): Promise<PostMeta | null> => {
  const trimmed = String(postId || '').trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(`${API_BASE}/api/posts/${encodeURIComponent(trimmed)}/`, {
      next: { revalidate: 300 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json() as PostMeta;
    if (data && data.is_public === false) return null;
    return data;
  } catch {
    return null;
  }
};

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { username, postId } = await params;
  const post = await fetchPost(postId);
  return buildPostMeta(post, { username, postId });
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const { username, postId } = await params;
  const initialPost = normalizePost(await fetchPost(postId));

  return (
    <MobilePostPageClient username={username} postId={postId} initialPost={initialPost} />
  );
}
