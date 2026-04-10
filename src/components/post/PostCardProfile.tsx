'use client';

import Link from 'next/link';
import SmartImage from '@/components/SmartImage';
import * as React from 'react';
import clsx from 'clsx';
import { setPostFeedContext, type PostFeedSource } from '@/lib/postFeedContext';
import { useAppNavigation } from '@/hooks/useAppNavigation';

export type PostCardProfileProps = {
  className?: string;
  // Режимы: 'default' (старый вид) и 'compact' (как в инсте)
  variant?: 'default' | 'compact';
  // Показывать ли текстовую подпись внизу
  showTextOverlay?: boolean;
  feedSource?: PostFeedSource;
  post: {
    id: number | string;
    authorUsername: string;
    firstImageUrl?: string | null;
    imagesCount?: number;
    text?: string | null;
    createdAt?: string;
  };
  href?: string;
};

function cut(text = '', max = 80) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

export default function PostCardProfile({
  className,
  post,
  href,
  variant = 'default',
  showTextOverlay = true,
  feedSource,
}: PostCardProfileProps) {
  const link = href ?? `/${post.authorUsername}/post/${post.id}`;
  const showImage = Boolean(post.firstImageUrl);
  const { navigatePost } = useAppNavigation();

  const containerCls = clsx(
    'group relative block aspect-square w-full overflow-hidden',
    variant === 'compact'
      ? // Инстаграм-плитка: без скруглений/бордеров/тени
        'rounded-none border-0 bg-white focus:outline-none focus:ring-0'
      : 'rounded-xl bg-gray-100 border border-gray-200 transition hover:shadow-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/10',
    className
  );

  const extraCount = (post.imagesCount ?? 0) > 1 ? (post.imagesCount! - 1) : 0;

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (feedSource) {
      setPostFeedContext({ ...feedSource, postId: post.id });
    }
    navigatePost(event, { username: post.authorUsername, postId: post.id });
  };

  return (
    <Link href={link} scroll={false} onClick={handleClick} className={containerCls}>
      {/* Только обложка без текста в компактном режиме */}
      {showImage ? (
        <SmartImage
          src={post.firstImageUrl!}
          alt="Обложка поста"
          fill
          sizes="(max-width: 640px) 33vw, 200px"
          className="object-cover"
        />
      ) : (
        // Фолбэк почти не нужен на фото-вкладках, но оставим для универсальности
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-gray-50 to-gray-200">
          <div className="px-3 text-center">
            <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-white/70 border">
              <span className="text-lg">✍️</span>
            </div>
            <p className="text-[13px] leading-snug text-gray-700 line-clamp-3">
              {post.text?.trim() ? cut(post.text, 90) : 'Текстовый пост'}
            </p>
          </div>
        </div>
      )}

      {/* Текстовая подложка снизу — выключаем на фото-вкладках */}
      {showTextOverlay && post.text && variant !== 'compact' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
          <div className="rounded-lg bg-gradient-to-t from-black/55 to-transparent px-2 py-1">
            <p className="text-[12px] leading-tight text-white/90 line-clamp-2">
              {cut(post.text, 80)}
            </p>
          </div>
        </div>
      )}

      {/* Бейдж количества дополнительных фото: +N */}
      {extraCount > 0 && (
        <div className="absolute right-2 top-2 select-none rounded-full bg-black/70 px-2 py-[2px] text-[11px] font-medium text-white">
          +{extraCount}
        </div>
      )}
    </Link>
  );
}
