'use client';

import React from 'react';
import Link from 'next/link';
import SmartImage from '@/components/SmartImage';
import SwipeCarousel from '@/components/ui/SwipeCarousel';
import { Calendar } from 'lucide-react';
import PostTextInline from '@/components/post/mobile/PostTextInline';
import PostTagsRow from '@/components/post/mobile/PostTagsRow';
import { campPathFrom } from '@/components/post/helpers/campPath';
import clsx from 'clsx';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';
import { rememberReturn } from '@/lib/navBack';
import { PHOTO_SEARCH_TAB_PARAM } from '@/lib/photoSearchParams';

type Activity = { id?: number | string | null; name?: string | null };
type Hashtag = { id?: number | string | null; name?: string | null };

export type FeedPostCardData = {
  kind: "photo_post" | "article";
  id: number | string;
  username: string;
  avatarUrl?: string | null;
  text: string;
  createdAt?: string | null;
  locationName?: string | null;
  activities?: Activity[];
  hashtags?: Hashtag[];
  camp?: {
    organizerUsername?: string | null;
    campNumber?: number | string | null;
    url?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    title?: string | null;
  } | null;
  images: string[];
  liked?: boolean;
  likesCount?: number | null;
  commentsCount?: number | null;
  commentsTotal?: number | null;
  marksCount?: number | null;
  commentPreview?: {
    id?: number | string;
    text?: string | null;
    authorUsername?: string | null;
    authorDisplayName?: string | null;
    avatarUrl?: string | null;
  } | null;
};

export type FeedPostCardProps = {
  post: FeedPostCardData;
  onToggleLike: () => void;
  onOpenComments: () => void;
  onOpenLikers: () => void;
  onOpenTags: () => void;
  onShare: () => void;
  onOpenActions: () => void;
  onCommentPreviewClick?: () => void;
  showOpenPostButton?: boolean;
};

const fallbackAvatar = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/avatars/question3.jpg';

export default function FeedPostCard({
  post,
  onToggleLike,
  onOpenComments,
  onOpenLikers,
  onOpenTags,
  onShare,
  onOpenActions,
  onCommentPreviewClick,
  showOpenPostButton: showOpenPostButtonProp,
}: FeedPostCardProps) {
  const { navigatePost, navigateProfile, navigateCamp } = useAppNavigation();
  const openSearchOverlay = useSearchOverlay();
  const images = Array.isArray(post.images) ? post.images.filter(Boolean) : [];
  const hasImages = images.length > 0;
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const isTextOnly = !hasImages && !!post.text?.trim();
  const isArticle = post.kind === 'article';
  const location = (post.locationName || '').trim();

  const activityChips = React.useMemo(() => {
    if (!Array.isArray(post.activities)) return [];
    return post.activities
      .map((item) => ({
        id: normalizeId(item.id as number | string | undefined),
        name: (item.name || '').trim(),
      }))
      .filter((item) => !!item.name);
  }, [post.activities]);

  const hashtagChips = React.useMemo(() => {
    if (!Array.isArray(post.hashtags)) return [];
    return post.hashtags
      .map((item) => ({
        id: normalizeId(item.id as number | string | undefined),
        name: (item.name || '').replace(/^#/, '').trim(),
      }))
      .filter((item) => !!item.name);
  }, [post.hashtags]);

  const previewComments = React.useMemo(() => {
    const preview = post.commentPreview;
    if (!preview || !preview.text) return [];
    return [
      {
        id: preview.id ?? 0,
        username: (preview.authorUsername || '').replace(/^@+/, '').trim(),
        display: preview.authorDisplayName || preview.authorUsername || 'user',
        text: preview.text,
      },
    ];
  }, [post.commentPreview]);

  const handleLocationClick = React.useCallback(() => {
    if (!location) return;
    try {
      rememberReturn('post');
    } catch {
      /* noop */
    }
    const params = new URLSearchParams();
    params.set('tab', PHOTO_SEARCH_TAB_PARAM);
    params.set('location', location);
    openSearchOverlay(params);
  }, [location, openSearchOverlay]);

  const campHref = React.useMemo(() => {
    if (!post.camp) return '';
    const owner = (post.camp.organizerUsername || post.username || '').replace(/^@+/, '').trim();
    const cfg: Parameters<typeof campPathFrom>[1] = {};
    if (post.camp.campNumber != null && `${post.camp.campNumber}`.trim() !== '') cfg.camp_number = post.camp.campNumber;
    if (post.camp.url) cfg.url = post.camp.url;
    const resolved = campPathFrom(owner || undefined, cfg);
    return resolved || post.camp.url || '';
  }, [post.camp, post.username]);

  const commentsTotal = post.commentsTotal ?? post.commentsCount ?? 0;
  const marksCount = post.marksCount ?? 0;
  const showOpenPostButton = showOpenPostButtonProp !== false;

  React.useEffect(() => {
    setCarouselIndex(0);
  }, [images.length]);

  const goPrevImage = React.useCallback(() => {
    setCarouselIndex((prev) => {
      const count = images.length;
      if (count <= 0) return 0;
      return (prev - 1 + count) % count;
    });
  }, [images.length]);

  const goNextImage = React.useCallback(() => {
    setCarouselIndex((prev) => {
      const count = images.length;
      if (count <= 0) return 0;
      return (prev + 1) % count;
    });
  }, [images.length]);

  const handleOpenPost = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    navigatePost(event, { username: post.username, postId: post.id });
  }, [navigatePost, post.username, post.id]);

  const handleAvatarClick = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    navigateProfile(event, { username: post.username });
  }, [navigateProfile, post.username]);

  const handleProfileLinkClick = React.useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    navigateProfile(event, { username: post.username });
  }, [navigateProfile, post.username]);

  const actionsRow = (
    <div className="px-1 py-3 text-xs text-gray-600 flex items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleLike}
          className={['w-9 h-9 flex items-center justify-center transition', post.liked ? 'text-red-500' : 'text-gray-700 hover:text-black'].join(' ')}
          aria-label={post.liked ? 'Убрать лайк' : 'Поставить лайк'}
          aria-pressed={!!post.liked}
        >
          <IconHeart filled={!!post.liked} />
        </button>
        {(post.likesCount ?? 0) > 0 && (
          <button type="button" onClick={onOpenLikers} className="text-sm font-semibold text-gray-900">
            {cap99(post.likesCount ?? 0)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenComments}
          className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
          aria-label="Перейти к комментариям"
        >
          <IconComment />
        </button>
        {commentsTotal > 0 ? (
          <button type="button" onClick={onOpenComments} className="text-sm font-semibold text-gray-900">
            {cap99(commentsTotal)}
          </button>
        ) : null}
      </div>
      {marksCount > 0 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenTags}
            className="w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
            aria-label="Отмеченные профили"
          >
            <IconUser />
          </button>
          <button type="button" onClick={onOpenTags} className="text-sm font-semibold text-gray-900">
            {cap99(marksCount)}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onShare}
        className="ml-auto w-9 h-9 flex items-center justify-center text-gray-700 hover:text-black"
        aria-label="Поделиться постом"
      >
        <IconShare />
      </button>
    </div>
  );

  const avatarImage = (
    <SmartImage
      src={post.avatarUrl || fallbackAvatar}
      alt={post.username}
      width={40}
      height={40}
      className="w-10 h-10 rounded-full object-cover border border-gray-200"
    />
  );

  return (
    <article>
      <div className="px-1 pt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={(e) => handleAvatarClick(e)}
            className="w-10 h-10 rounded-full border border-gray-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`Открыть профиль ${post.username}`}
          >
            {avatarImage}
          </button>
          <div className="min-w-0">
            <Link
              href={`/${post.username}`}
              className="font-semibold text-[16px] block truncate"
              onClick={handleProfileLinkClick}
            >
              {post.username}
            </Link>
            {!!location && (
              <button
                type="button"
                onClick={handleLocationClick}
                className="text-left text-[12px] text-gray-500 truncate bg-transparent border-0 p-0 underline-offset-2 hover:underline"
                title={location}
              >
                {location}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showOpenPostButton && (
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[16px] text-gray-700 hover:bg-gray-100"
              aria-label="Открыть пост"
              onClick={(e) => handleOpenPost(e)}
            >
              ↗
            </button>
          )}
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[20px] text-gray-700 hover:bg-gray-100 font-bold"
            aria-label="Ещё"
            onClick={onOpenActions}
          >
            ⋯
          </button>
        </div>
      </div>

      {hasImages && (
        <div
          className={clsx('-mx-3 mt-3 bg-black relative sm:mx-0', showOpenPostButton && 'cursor-pointer')}
          onClick={showOpenPostButton ? handleOpenPost : undefined}
        >
          <SwipeCarousel images={images} height={420} index={carouselIndex} onIndexChange={setCarouselIndex} />
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
                onClick={(event) => {
                  event.stopPropagation();
                  goPrevImage();
                }}
                aria-label="Предыдущее фото"
              >
                <ArrowLeftIcon />
              </button>
              <button
                type="button"
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
                onClick={(event) => {
                  event.stopPropagation();
                  goNextImage();
                }}
                aria-label="Следующее фото"
              >
                <ArrowRightIcon />
              </button>
            </>
          )}
        </div>
      )}

      {!!post.camp && (
        <div className="px-5 py-3 border-b border-gray-100">
          <Link
            href={campHref || '#'}
            className="flex items-center gap-2 text-[14px] font-medium min-w-0"
            onClick={(e) => navigateCamp(e, {
              username: post.camp?.organizerUsername || post.username,
              campNumber: post.camp?.campNumber ?? null,
              campPath: campHref || undefined,
            })}
          >
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-words line-clamp-2">{post.camp?.title || 'Кэмп'}</span>
          </Link>
        </div>
      )}

      {!isArticle && actionsRow}

      {!!post.text && (
        <div
          className={['px-1', isArticle ? 'mt-4' : ''].join(' ').trim()}
        >
          <PostTextInline
            author={post.username}
            text={post.text}
            isTextOnly={isTextOnly}
            showAuthor={false}
          />
        </div>
      )}

      {isArticle && actionsRow}

      {previewComments.length > 0 && (
        <button
          type="button"
          onClick={onCommentPreviewClick ?? onOpenComments}
          className="px-1 mt-4 space-y-2 text-left w-full"
          aria-label="Открыть комментарии"
        >
          {previewComments.map((c) => (
            <div key={c.id} className="text-[14px] leading-snug">
              <Link href={`/${c.username || post.username}`} className="font-semibold mr-1">
                {c.username || post.username}
              </Link>
              <span className="whitespace-pre-wrap break-words">{c.text}</span>
            </div>
          ))}
        </button>
      )}

      {(activityChips.length > 0 || hashtagChips.length > 0) && (
        <div className="px-1 mt-4">
          <PostTagsRow activities={activityChips} hashtags={hashtagChips} />
        </div>
      )}

      <div className="px-1 pt-4 pb-5 text-[12px] text-gray-500">
        {dateOnly(post.createdAt)}
      </div>
    </article>
  );
}

function cap99(n?: number | null) {
  const v = Math.max(0, Number(n ?? 0));
  return v >= 100 ? '99+' : String(v);
}

const postDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function dateOnly(s?: string | null) {
  if (!s) return '';
  try {
    const raw = postDateFormatter.format(new Date(s));
    return raw.replace(/[\s\u00A0\u202F]?г\.?$/i, '');
  } catch {
    return s;
  }
}

function normalizeId(value?: number | string | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function IconHeart({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s-6.716-4.35-9.333-7.2C.778 11.87 1.2 8.8 3.6 7.2 6 5.6 8.4 6.4 12 9.2c3.6-2.8 6-3.6 8.4-2 2.4 1.6 2.822 4.67.933 6.6C18.716 16.65 12 21 12 21z" fill="currentColor" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M20.84 4.61c-1.54-1.28-3.77-1.28-5.31 0L12 7.09 8.47 4.61c-1.54-1.28-3.77-1.28-5.31 0-1.73 1.44-1.9 4.02-.39 5.64C5.12 13 12 19 12 19s6.88-6 9.23-8.75c1.51-1.62 1.34-4.2-.39-5.64z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconComment() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M21 12a8 8 0 1 1-3.3-6.5L21 6v6z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="12" cy="11.5" r="0.8" fill="currentColor" />
      <circle cx="15" cy="11.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
