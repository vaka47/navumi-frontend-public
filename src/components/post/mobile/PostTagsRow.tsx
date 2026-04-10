'use client';

import React from 'react';
import { rememberReturn } from '@/lib/navBack';
import { PHOTO_SEARCH_TAB_PARAM } from '@/lib/photoSearchParams';
import { useSearchOverlay } from '@/hooks/useSearchOverlay';

type Tag = { id: number | null; name: string };

type PostTagsRowProps = {
  activities: Tag[];
  hashtags: Tag[];
  onTagClick?: (kind: 'activity' | 'hashtag', tag: Tag) => void;
};

/**
 * Pills row for activities and hashtags that mimics the mobile profile feed appearance.
 */
export default function PostTagsRow({ activities, hashtags, onTagClick }: PostTagsRowProps) {
  const openSearchOverlay = useSearchOverlay();
  const goToPhotoFilter = (key: 'activities' | 'hashtags', id: number | null, name?: string) => {
    try {
      rememberReturn('post');
    } catch {
      /* noop */
    }
    const p = new URLSearchParams();
    p.set('tab', PHOTO_SEARCH_TAB_PARAM);
    p.set('collapsed', '1');
    if (key === 'activities' && id != null) p.append('activities', String(id));
    else if (key === 'hashtags' && id != null) p.append('hashtags', String(id));
    else if (name) p.set('query', name.replace(/^#/, ''));
    openSearchOverlay(p);
  };

  if (!activities.length && !hashtags.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {activities.map((t) => (
        <span
          key={`act-${t.id ?? t.name}`}
          role="link"
          tabIndex={0}
          onClick={() => {
            if (onTagClick) onTagClick('activity', t);
            else goToPhotoFilter('activities', t.id, t.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (onTagClick) onTagClick('activity', t);
              else goToPhotoFilter('activities', t.id, t.name);
            }
          }}
          className="px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-[12px] text-gray-700 cursor-pointer hover:bg-gray-100"
          title={`Показать фотопосты по активности: ${t.name}`}
        >
          {t.name}
        </span>
      ))}
      {hashtags.map((t) => (
        <span
          key={`tag-${t.id ?? t.name}`}
          role="link"
          tabIndex={0}
          onClick={() => {
            if (onTagClick) onTagClick('hashtag', t);
            else goToPhotoFilter('hashtags', t.id, t.name);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (onTagClick) onTagClick('hashtag', t);
              else goToPhotoFilter('hashtags', t.id, t.name);
            }
          }}
          className="px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-[12px] text-gray-700 cursor-pointer hover:bg-gray-100"
          title={`Показать фотопосты по тегу: #${t.name}`}
        >
          #{t.name}
        </span>
      ))}
    </div>
  );
}
